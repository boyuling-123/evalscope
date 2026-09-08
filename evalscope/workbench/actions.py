# Copyright (c) Alibaba, Inc. and its affiliates.
"""Registry and initial actions for the AI evaluation workbench."""

from dataclasses import dataclass
from threading import RLock
from typing import Any, Callable, Dict, Literal, Optional, Type
from urllib.parse import urlsplit

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
from .targets import (
    TargetConnectionCheckPayload,
    TargetCreatePayload,
    TargetDetail,
    TargetGetPayload,
    TargetListPayload,
    TargetStore,
    TargetSummary,
    TargetVersionCandidate,
    TargetVersionCreatePayload,
    TargetVersionListPayload,
)

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
        if descriptor.requires_confirmation and request.dry_run and handler_result.verdict == 'ready':
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
    if code in {'ACTION_NOT_FOUND', 'PROJECT_NOT_FOUND', 'TARGET_NOT_FOUND'}:
        return 404
    if code in {
        'IDEMPOTENCY_CONFLICT',
        'TARGET_VERSION_CONFLICT',
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
    targets = TargetStore(workspace_root)

    def public_target_detail(detail: TargetDetail) -> Dict[str, Any]:
        data = detail.model_dump(mode='json', exclude_none=True)
        connection = data['version']['connection']
        connection['credential_configured'] = bool(connection.pop('credential_ref', None))
        return data

    def public_target_summary(summary: TargetSummary) -> Dict[str, Any]:
        data = summary.model_dump(mode='json', exclude_none=True)
        connection = data['latest_version']['connection']
        connection['credential_configured'] = bool(connection.pop('credential_ref', None))
        return data

    def public_target_version_candidate(candidate: TargetVersionCandidate) -> Dict[str, Any]:
        data = candidate.model_dump(mode='json', exclude_none=True)
        connection = data['version']['connection']
        connection['credential_configured'] = bool(connection.pop('credential_ref', None))
        return data

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

    def create_target(payload: TargetCreatePayload, context: ActionExecutionContext) -> HandlerResult:
        if context.request.dry_run:
            projects.get(payload.project_id)
            return HandlerResult(
                verdict='ready',
                data={
                    'preview': {
                        'project_id': payload.project_id,
                        'name': payload.name,
                        'type': payload.type,
                        'version_label': payload.version_label,
                        'adapter': payload.connection.adapter,
                        'credential_configured': payload.connection.credential_ref is not None,
                        'initial_status': 'draft',
                        'connection_status': 'untested',
                        'writes': ['target.json', 'versions/<version_id>.json'],
                        'starts_connection_test': False,
                    }
                },
                next_action='target.create',
                warnings=('保存对象不会自动试调，也不会触发模型调用。',),
            )
        if context.operation_id is None:
            raise WorkbenchActionError(
                code='IDEMPOTENCY_KEY_REQUIRED',
                message='创建评测对象需要幂等键。',
            )
        detail = targets.create(payload, context.operation_id)
        return HandlerResult(
            verdict='completed',
            data={'target': public_target_detail(detail)},
            next_action='target.get',
            warnings=('对象已保存为草稿；真实试调通过前不会进入正式候选池。',),
        )

    def list_targets(payload: TargetListPayload, _: ActionExecutionContext) -> HandlerResult:
        records, warnings = targets.list(payload)
        return HandlerResult(
            verdict='completed',
            data={
                'targets': [public_target_summary(record) for record in records],
                'count': len(records),
            },
            next_action='target.create' if not records else 'target.get',
            warnings=tuple(warnings),
        )

    def get_target(payload: TargetGetPayload, _: ActionExecutionContext) -> HandlerResult:
        detail = targets.get(payload)
        return HandlerResult(
            verdict='completed',
            data={'target': public_target_detail(detail)},
            next_action='target.list',
        )

    def list_target_versions(payload: TargetVersionListPayload, _: ActionExecutionContext) -> HandlerResult:
        records, warnings = targets.list_runnable_versions(payload)
        return HandlerResult(
            verdict='completed',
            data={
                'versions': [public_target_version_candidate(record) for record in records],
                'count': len(records),
            },
            next_action='target.get' if records else 'target.list',
            warnings=tuple(warnings),
        )

    def create_target_version(
        payload: TargetVersionCreatePayload,
        context: ActionExecutionContext,
    ) -> HandlerResult:
        base = targets.get(
            TargetGetPayload(
                project_id=payload.project_id,
                target_id=payload.target_id,
                version_id=payload.base_version_id,
            )
        )
        if base.target.latest_version_id != payload.base_version_id:
            raise WorkbenchActionError(
                code='TARGET_VERSION_CONFLICT',
                message='对象已有更新版本，请刷新页面后基于最新版重新创建。',
                status_code=409,
                details={
                    'target_id': payload.target_id,
                    'expected_base_version_id': base.target.latest_version_id,
                },
            )
        if payload.reuse_base_credential and base.version.connection.credential_ref is None:
            raise WorkbenchActionError(
                code='TARGET_CREDENTIAL_REFERENCE_MISSING',
                message='基线版本没有可沿用的服务端凭据引用，请改为提供新引用或不使用鉴权。',
            )
        if context.request.dry_run:
            return HandlerResult(
                verdict='ready',
                data={
                    'preview': {
                        'project_id': payload.project_id,
                        'target_id': payload.target_id,
                        'base_version_id': payload.base_version_id,
                        'next_version_number': max(item.version_number for item in base.versions) + 1,
                        'version_label': payload.version_label,
                        'adapter': payload.connection.adapter,
                        'credential_configured': (
                            payload.connection.credential_ref is not None
                            or (payload.reuse_base_credential and base.version.connection.credential_ref is not None)
                        ),
                        'reuses_server_credential': payload.reuse_base_credential,
                        'initial_status': 'draft',
                        'connection_status': 'untested',
                        'writes': ['versions/<version_id>.json', 'target.json'],
                        'starts_connection_test': False,
                    }
                },
                next_action='target.version.create',
                warnings=('新版本不会继承旧版本的试调状态，也不会自动发起模型调用。',),
            )
        if context.operation_id is None:
            raise WorkbenchActionError(
                code='IDEMPOTENCY_KEY_REQUIRED',
                message='创建对象版本需要幂等键。',
            )
        detail = targets.create_version(payload, context.operation_id)
        return HandlerResult(
            verdict='completed',
            data={'target': public_target_detail(detail)},
            next_action='target.connection.check',
            warnings=('新版本已保存为未试调草稿；旧版本及其试调结果保持不变。',),
        )

    def check_target_connection(
        payload: TargetConnectionCheckPayload,
        context: ActionExecutionContext,
    ) -> HandlerResult:
        detail = targets.get(
            TargetGetPayload(
                project_id=payload.project_id,
                target_id=payload.target_id,
                version_id=payload.version_id,
            )
        )
        if detail.version.connection.adapter == 'evalscope_model':
            return HandlerResult(
                verdict='blocked',
                data={
                    'preview': {
                        'project_id': payload.project_id,
                        'target_id': payload.target_id,
                        'version_id': detail.version.id,
                        'adapter': detail.version.connection.adapter,
                        'starts_external_call': False,
                    }
                },
                blocking_reasons=('EvalScope 本地模型试调适配器尚未实现，请改用现有评测任务验证。',),
                next_action='target.get',
            )
        if context.request.dry_run:
            endpoint = urlsplit(detail.version.connection.endpoint or '')
            return HandlerResult(
                verdict='ready',
                data={
                    'preview': {
                        'project_id': payload.project_id,
                        'target_id': payload.target_id,
                        'version_id': detail.version.id,
                        'adapter': detail.version.connection.adapter,
                        'endpoint_origin': f'{endpoint.scheme}://{endpoint.netloc}',
                        'credential_configured': detail.version.connection.credential_ref is not None,
                        'starts_external_call': True,
                        'may_consume_model_quota': True,
                        'persists_sample_input': False,
                        'persists_full_output': False,
                    }
                },
                next_action='target.connection.check',
                warnings=('确认后将发送一次真实请求，可能产生模型调用费用；当前预览不会联网。',),
            )
        if context.operation_id is None:
            raise WorkbenchActionError(
                code='IDEMPOTENCY_KEY_REQUIRED',
                message='连接试调需要幂等键。',
            )
        check = targets.check_connection(payload, context.operation_id)
        refreshed = targets.get(
            TargetGetPayload(
                project_id=payload.project_id,
                target_id=payload.target_id,
                version_id=check.version_id,
            )
        )
        passed = check.status == 'passed'
        return HandlerResult(
            verdict='completed',
            data={
                'check': check.model_dump(mode='json', exclude_none=True),
                'target': public_target_detail(refreshed),
            },
            next_action='target.get' if passed else 'target.connection.check',
            warnings=(
                ('真实试调成功，对象已进入正式候选池。' if passed else '真实试调失败，对象不会进入正式候选池。'),
            ),
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
        (
            ActionDescriptor(
                name='target.connection.check',
                version='1.0',
                access='write',
                description='确认后向指定对象版本发送一次真实试调请求，并保存脱敏结果。',
                when_to_use='对象接入配置已保存，需要验证真实请求与输出映射后调用。',
                prerequisites=['有效 project_id、target_id', '明确单条试调输入', '正式调用前完成 dry_run 确认'],
                next_action='target.get',
                supports_dry_run=True,
                requires_idempotency=True,
                requires_confirmation=True,
                input_schema=TargetConnectionCheckPayload.model_json_schema(),
            ),
            TargetConnectionCheckPayload,
            check_target_connection,
        ),
        (
            ActionDescriptor(
                name='target.create',
                version='1.0',
                access='write',
                description='在项目内创建不可变评测对象版本；仅保存凭据引用，不会自动试调或运行。',
                when_to_use='用户确认对象类型、接口映射、版本和运行绑定后，保存待试调对象时调用。',
                prerequisites=['有效 project_id', '明确接口和输入输出映射', '正式写入前完成 dry_run 确认'],
                next_action='target.get',
                supports_dry_run=True,
                requires_idempotency=True,
                requires_confirmation=True,
                input_schema=TargetCreatePayload.model_json_schema(),
            ),
            TargetCreatePayload,
            create_target,
        ),
        (
            ActionDescriptor(
                name='target.get',
                version='1.0',
                access='read',
                description='读取项目内指定评测对象及不可变版本，不返回凭据引用内容。',
                when_to_use='查看对象详情、版本配置或准备试调前调用。',
                prerequisites=['有效 project_id', '有效 target_id'],
                next_action='target.list',
                supports_dry_run=False,
                requires_idempotency=False,
                requires_confirmation=False,
                input_schema=TargetGetPayload.model_json_schema(),
            ),
            TargetGetPayload,
            get_target,
        ),
        (
            ActionDescriptor(
                name='target.list',
                version='1.0',
                access='read',
                description='列出指定项目内的评测对象，可按类型和状态筛选。',
                when_to_use='进入对象列表、选择被测对象或检查项目内对象状态时调用。',
                prerequisites=['有效 project_id'],
                next_action='target.get',
                supports_dry_run=False,
                requires_idempotency=False,
                requires_confirmation=False,
                input_schema=TargetListPayload.model_json_schema(),
            ),
            TargetListPayload,
            list_targets,
        ),
        (
            ActionDescriptor(
                name='target.version.create',
                version='1.0',
                access='write',
                description='基于当前最新版创建新的不可变 TargetVersion；不会覆盖旧版本或自动试调。',
                when_to_use='用户确认新的接口、模型、Prompt、Tool 或 Skill 运行绑定后保存新版本时调用。',
                prerequisites=['有效 project_id、target_id 与最新 base_version_id', '正式写入前完成 dry_run 确认'],
                next_action='target.connection.check',
                supports_dry_run=True,
                requires_idempotency=True,
                requires_confirmation=True,
                input_schema=TargetVersionCreatePayload.model_json_schema(),
            ),
            TargetVersionCreatePayload,
            create_target_version,
        ),
        (
            ActionDescriptor(
                name='target.version.list',
                version='1.0',
                access='read',
                description='列出真实试调通过的不可变对象版本；包含仍可运行的历史版本，不返回凭据引用。',
                when_to_use='新建运行前选择需要精确锁定的正式对象版本时调用。',
                prerequisites=['有效 project_id'],
                next_action='target.get',
                supports_dry_run=False,
                requires_idempotency=False,
                requires_confirmation=False,
                input_schema=TargetVersionListPayload.model_json_schema(),
            ),
            TargetVersionListPayload,
            list_target_versions,
        ),
    ]
    for descriptor, payload_model, handler in definitions:
        registry.register(descriptor, payload_model, handler)
    return registry
