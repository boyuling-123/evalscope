# Copyright (c) Alibaba, Inc. and its affiliates.
"""Registry and initial actions for the AI evaluation workbench."""

from dataclasses import dataclass
from threading import RLock
from typing import Any, Callable, Dict, Literal, Optional, Type

from pydantic import BaseModel, ValidationError

from evalscope.utils.logger import get_logger

from .contracts import (
    ActionDescriptor,
    ActionErrorDetail,
    ActionFieldError,
    ActionRequest,
    ActionResponse,
    ActionResult,
    WorkbenchModel,
)
from .errors import WorkbenchActionError
from .persistence import ActionStateStore
from .projects import ProjectCreatePayload, ProjectGetPayload, ProjectListPayload, ProjectStore

logger = get_logger()


class CapabilityDiscoverPayload(WorkbenchModel):
    query: Optional[str] = None


@dataclass(frozen=True)
class HandlerResult:
    verdict: Literal['ready', 'completed', 'blocked']
    data: Dict[str, Any]
    next_action: Optional[str] = None
    blocking_reasons: tuple[str, ...] = ()
    warnings: tuple[str, ...] = ()


@dataclass(frozen=True)
class ActionExecutionContext:
    request: ActionRequest
    operation_id: Optional[str]


ActionHandler = Callable[[BaseModel, ActionExecutionContext], HandlerResult]


@dataclass(frozen=True)
class RegisteredAction:
    descriptor: ActionDescriptor
    payload_model: Type[BaseModel]
    handler: ActionHandler


class ActionRegistry:
    def __init__(self, workspace_root: str):
        self.workspace_root = workspace_root
        self.state = ActionStateStore(workspace_root)
        self._actions: dict[tuple[str, str], RegisteredAction] = {}
        self._write_lock = RLock()

    def register(self, descriptor: ActionDescriptor, payload_model: Type[BaseModel], handler: ActionHandler) -> None:
        key = (descriptor.name, descriptor.version)
        if key in self._actions:
            raise ValueError(f'action already registered: {descriptor.name}@{descriptor.version}')
        self._actions[key] = RegisteredAction(descriptor, payload_model, handler)

    def descriptors(self) -> list[ActionDescriptor]:
        return [entry.descriptor for _, entry in sorted(self._actions.items())]

    def execute(self, raw_request: Any) -> ActionResponse:
        try:
            request = ActionRequest.model_validate(raw_request)
        except ValidationError as error:
            request_id = raw_request.get('request_id') if isinstance(raw_request, dict) else None
            return self._validation_failure(request_id, error)

        fingerprint = self.state.request_fingerprint(request)
        try:
            registered = self._actions.get((request.action, request.action_version))
            if registered is None:
                raise WorkbenchActionError(
                    code='ACTION_NOT_FOUND',
                    message='未找到指定 Action，请先调用 capabilities.discover。',
                    status_code=404,
                    details={'available_actions': [descriptor.name for descriptor in self.descriptors()]},
                )
            descriptor = registered.descriptor
            if request.dry_run and not descriptor.supports_dry_run:
                raise WorkbenchActionError(
                    code='DRY_RUN_NOT_SUPPORTED',
                    message='该 Action 不支持 dry_run。',
                    details={'action': request.action},
                )
            if descriptor.requires_idempotency and not request.dry_run and not request.idempotency_key:
                raise WorkbenchActionError(
                    code='IDEMPOTENCY_KEY_REQUIRED',
                    message='该写操作需要 idempotency_key，以防止 Agent 重复提交。',
                    details={'action': request.action},
                )
            payload = registered.payload_model.model_validate(request.payload)
            if descriptor.access == 'write' and not request.dry_run:
                with self._write_lock:
                    return self._execute_registered(request, fingerprint, descriptor, registered, payload)
            return self._execute_registered(request, fingerprint, descriptor, registered, payload)
        except ValidationError as error:
            return self._failure(request, fingerprint, self._payload_validation_error(error))
        except WorkbenchActionError as error:
            return self._failure(request, fingerprint, error)
        except Exception as error:  # Keep arbitrary handler/storage failures out of the API response.
            logger.error(
                'Workbench action failed: action=%s request_id=%s error_type=%s',
                request.action,
                request.request_id,
                type(error).__name__,
            )
            return self._failure(
                request,
                fingerprint,
                WorkbenchActionError(
                    code='INTERNAL_ERROR',
                    message='操作执行失败，请检查本地服务状态后重试。',
                    status_code=500,
                    retryable=False,
                ),
            )

    def _execute_registered(
        self,
        request: ActionRequest,
        fingerprint: str,
        descriptor: ActionDescriptor,
        registered: RegisteredAction,
        payload: BaseModel,
    ) -> ActionResponse:
        if descriptor.requires_idempotency and not request.dry_run:
            replay = self.state.replay(request, fingerprint)
            if replay is not None:
                audit_id = self.state.audit(request, 'replayed', fingerprint)
                return replay.model_copy(
                    update={
                        'audit_event_id': audit_id,
                        'warnings': [*replay.warnings, '检测到重复提交，已返回原操作结果。'],
                    }
                )

        confirmation_path = None
        if descriptor.requires_confirmation and not request.dry_run:
            confirmation_path = self.state.validate_confirmation(request, fingerprint)

        started_id = self.state.audit(request, 'started', fingerprint)
        handler_result = registered.handler(
            payload,
            ActionExecutionContext(request=request, operation_id=self.state.operation_id(request)),
        )
        result_data = dict(handler_result.data)
        if descriptor.requires_confirmation and request.dry_run:
            result_data['confirmation'] = self.state.issue_confirmation(request, fingerprint)
        if confirmation_path is not None:
            self.state.consume_confirmation(confirmation_path)

        completed_id = self.state.audit(request, 'completed', fingerprint, parent_event_id=started_id)
        response = ActionResponse(
            ok=True,
            request_id=request.request_id,
            result=ActionResult(
                verdict=handler_result.verdict,
                blocking_reasons=list(handler_result.blocking_reasons),
                next_action=handler_result.next_action,
                data=result_data,
            ),
            warnings=list(handler_result.warnings),
            audit_event_id=completed_id,
        )
        if descriptor.requires_idempotency and not request.dry_run:
            self.state.remember(request, fingerprint, response)
        return response

    @staticmethod
    def _payload_validation_error(error: ValidationError) -> WorkbenchActionError:
        field_errors = [
            {
                'field': '.'.join(str(part) for part in item['loc']),
                'message': item['msg'],
                'type': item['type'],
            }
            for item in error.errors(include_input=False, include_url=False)
        ]
        return WorkbenchActionError(
            code='VALIDATION_FAILED',
            message='Action 参数校验失败，请按 field_errors 修正后重试。',
            field_errors=field_errors,
        )

    def _failure(
        self,
        request: ActionRequest,
        fingerprint: str,
        error: WorkbenchActionError,
    ) -> ActionResponse:
        try:
            audit_id = self.state.audit(request, 'rejected', fingerprint, error_code=error.code)
        except Exception:
            audit_id = None
        return ActionResponse(
            ok=False,
            request_id=request.request_id,
            error=ActionErrorDetail(
                code=error.code,
                message=error.message,
                field_errors=[ActionFieldError.model_validate(item) for item in error.field_errors],
                retryable=error.retryable,
                details=error.details,
            ),
            audit_event_id=audit_id,
        )

    def _validation_failure(self, request_id: Any, error: ValidationError) -> ActionResponse:
        safe_request_id = request_id if isinstance(request_id, str) and 5 <= len(request_id) <= 128 else 'req_invalid'
        action_error = self._payload_validation_error(error)
        return ActionResponse(
            ok=False,
            request_id=safe_request_id,
            error=ActionErrorDetail(
                code=action_error.code,
                message='Action 请求信封校验失败，请按 field_errors 修正后重试。',
                field_errors=[ActionFieldError.model_validate(item) for item in action_error.field_errors],
            ),
        )


def action_http_status(response: ActionResponse) -> int:
    if response.ok:
        return 200
    code = response.error.code if response.error else 'INTERNAL_ERROR'
    if code in {'ACTION_NOT_FOUND', 'PROJECT_NOT_FOUND'}:
        return 404
    if code in {
        'IDEMPOTENCY_CONFLICT',
        'CONFIRMATION_REQUIRED',
        'CONFIRMATION_INVALID',
        'CONFIRMATION_ALREADY_USED',
        'CONFIRMATION_EXPIRED',
    }:
        return 409
    if code in {'STORAGE_CORRUPTED', 'INTERNAL_ERROR'}:
        return 500
    return 400


def create_default_registry(workspace_root: str) -> ActionRegistry:
    registry = ActionRegistry(workspace_root)
    projects = ProjectStore(workspace_root)

    def discover(payload: CapabilityDiscoverPayload, _: ActionExecutionContext) -> HandlerResult:
        query = payload.query.strip().lower() if payload.query else None
        descriptors = registry.descriptors()
        if query:
            descriptors = [
                descriptor
                for descriptor in descriptors
                if query in descriptor.name.lower() or query in descriptor.description.lower()
            ]
        return HandlerResult(
            verdict='completed',
            data={
                'actions': [descriptor.model_dump(mode='json') for descriptor in descriptors],
                'count': len(descriptors),
            },
            next_action='project.list',
        )

    def create_project(payload: ProjectCreatePayload, context: ActionExecutionContext) -> HandlerResult:
        if context.request.dry_run:
            return HandlerResult(
                verdict='ready',
                data={
                    'preview': {
                        'name': payload.name,
                        'description': payload.description,
                        'writes': ['project.json'],
                    }
                },
                next_action='project.create',
            )
        if context.operation_id is None:
            raise WorkbenchActionError(
                code='IDEMPOTENCY_KEY_REQUIRED',
                message='创建项目需要幂等键。',
            )
        project = projects.create(payload, context.operation_id)
        return HandlerResult(
            verdict='completed',
            data={'project': project.model_dump(mode='json', exclude_none=True)},
            next_action='project.get',
        )

    def list_projects(payload: ProjectListPayload, _: ActionExecutionContext) -> HandlerResult:
        records, warnings = projects.list(payload)
        return HandlerResult(
            verdict='completed',
            data={
                'projects': [record.model_dump(mode='json', exclude_none=True) for record in records],
                'count': len(records),
            },
            next_action='project.create' if not records else 'project.get',
            warnings=tuple(warnings),
        )

    def get_project(payload: ProjectGetPayload, _: ActionExecutionContext) -> HandlerResult:
        project = projects.get(payload.project_id)
        return HandlerResult(
            verdict='completed',
            data={'project': project.model_dump(mode='json', exclude_none=True)},
            next_action='project.list',
        )

    definitions = [
        (
            ActionDescriptor(
                name='capabilities.discover',
                version='1.0',
                access='read',
                description='发现当前平台真实可用的 Action 及输入 Schema；不会执行评测。',
                when_to_use='Agent 不确定平台能力或准备规划下一步时首先调用。',
                prerequisites=[],
                next_action='project.list',
                supports_dry_run=False,
                requires_idempotency=False,
                requires_confirmation=False,
                input_schema=CapabilityDiscoverPayload.model_json_schema(),
            ),
            CapabilityDiscoverPayload,
            discover,
        ),
        (
            ActionDescriptor(
                name='project.create',
                version='1.0',
                access='write',
                description='在本地工作区创建一个可迁移项目清单，不触发模型调用。',
                when_to_use='用户已经确认项目名称，且需要开始管理评测资产时调用。',
                prerequisites=['明确项目名称', '正式写入时提供稳定幂等键'],
                next_action='project.get',
                supports_dry_run=True,
                requires_idempotency=True,
                requires_confirmation=True,
                input_schema=ProjectCreatePayload.model_json_schema(),
            ),
            ProjectCreatePayload,
            create_project,
        ),
        (
            ActionDescriptor(
                name='project.get',
                version='1.0',
                access='read',
                description='按稳定项目 ID 读取本地项目清单和路径。',
                when_to_use='已经选定项目，需要继续创建数据集、对象或评测配置时调用。',
                prerequisites=['有效 project_id'],
                next_action='project.list',
                supports_dry_run=False,
                requires_idempotency=False,
                requires_confirmation=False,
                input_schema=ProjectGetPayload.model_json_schema(),
            ),
            ProjectGetPayload,
            get_project,
        ),
        (
            ActionDescriptor(
                name='project.list',
                version='1.0',
                access='read',
                description='列出本机工作区中的项目，不扫描或上传项目内容。',
                when_to_use='需要选择已有项目，或判断是否应创建新项目时调用。',
                prerequisites=[],
                next_action='project.get',
                supports_dry_run=False,
                requires_idempotency=False,
                requires_confirmation=False,
                input_schema=ProjectListPayload.model_json_schema(),
            ),
            ProjectListPayload,
            list_projects,
        ),
    ]
    for descriptor, payload_model, handler in definitions:
        registry.register(descriptor, payload_model, handler)
    return registry
