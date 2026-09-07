# Copyright (c) Alibaba, Inc. and its affiliates.
"""Project-scoped, immutable evaluation target manifests."""

from __future__ import annotations

import json
import os
import re
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal, Optional
from urllib import error as urllib_error
from urllib import request as urllib_request
from urllib.parse import urlsplit

from pydantic import Field, field_validator, model_validator

from .contracts import WorkbenchModel
from .errors import WorkbenchActionError
from .persistence import atomic_write_json, content_hash
from .projects import ProjectStore

TargetType = Literal['model', 'agent', 'workflow', 'skill', 'algorithm']
TargetStatus = Literal['draft', 'ready', 'unavailable', 'archived']
ConnectionStatus = Literal['untested', 'passed', 'failed']
TargetModality = Literal['text', 'image', 'audio', 'video']
TargetAdapter = Literal['openai_chat_completions', 'openai_responses', 'http_json', 'evalscope_model']
ConnectionCheckStatus = Literal['passed', 'failed']
_FIELD_PATH_PATTERN = r'^[A-Za-z_][A-Za-z0-9_-]*(?:\[\d+\])*(?:\.[A-Za-z_][A-Za-z0-9_-]*(?:\[\d+\])*)*$'


class TargetConnection(WorkbenchModel):
    adapter: TargetAdapter
    endpoint: Optional[str] = Field(default=None, max_length=2048)
    model_id: Optional[str] = Field(default=None, min_length=1, max_length=300)
    credential_ref: Optional[str] = Field(
        default=None,
        pattern=r'^(env:[A-Z][A-Z0-9_]{1,127}|keychain:[A-Za-z0-9_.-]{1,64}/[A-Za-z0-9_.-]{1,64})$',
    )
    method: Literal['POST'] = 'POST'
    input_field: str = Field(default='input', max_length=256, pattern=_FIELD_PATH_PATTERN)
    output_path: str = Field(default='output', max_length=256, pattern=_FIELD_PATH_PATTERN)
    timeout_seconds: int = Field(default=60, ge=1, le=300)

    @field_validator('endpoint')
    @classmethod
    def validate_endpoint(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        normalized = value.strip().rstrip('/')
        parsed = urlsplit(normalized)
        if parsed.scheme not in {'http', 'https'} or not parsed.hostname:
            raise ValueError('Endpoint 必须是有效的 HTTP 或 HTTPS 地址')
        if parsed.username or parsed.password:
            raise ValueError('Endpoint 不得包含账号或密码')
        if parsed.query or parsed.fragment:
            raise ValueError('Endpoint 不得包含查询参数或片段，请改用固定服务地址')
        return normalized

    @model_validator(mode='after')
    def validate_adapter_requirements(self):
        if self.adapter != 'evalscope_model' and self.endpoint is None:
            raise ValueError('远程接口适配器必须提供 endpoint')
        if self.adapter in {'openai_chat_completions', 'openai_responses', 'evalscope_model'} and not self.model_id:
            raise ValueError('当前适配器必须提供 model_id')
        return self


class TargetRuntimeBinding(WorkbenchModel):
    """Immutable execution context required for a portable Skill target."""

    host_runtime: str = Field(min_length=1, max_length=200)
    model_parameters_ref: str = Field(min_length=1, max_length=500)
    tool_contract_ref: str = Field(min_length=1, max_length=500)
    loading_method: Literal['file', 'module']
    input_preprocessor_ref: str = Field(min_length=1, max_length=500)
    environment_notes: Optional[str] = Field(default=None, max_length=1000)

    @field_validator(
        'host_runtime',
        'model_parameters_ref',
        'tool_contract_ref',
        'input_preprocessor_ref',
    )
    @classmethod
    def normalize_required_text(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError('运行绑定字段不能为空')
        return normalized


class TargetManifest(WorkbenchModel):
    schema_version: int = 1
    id: str = Field(pattern=r'^tgt_[a-f0-9]{20}$')
    project_id: str = Field(pattern=r'^prj_[a-f0-9]{20}$')
    name: str = Field(min_length=1, max_length=120)
    type: TargetType
    description: Optional[str] = Field(default=None, max_length=1000)
    capabilities: list[str] = Field(default_factory=list, max_length=50)
    latest_version_id: str = Field(pattern=r'^tgv_[a-f0-9]{20}$')
    status: TargetStatus = 'draft'
    last_run_id: Optional[str] = Field(default=None, max_length=128)
    created_at: str
    updated_at: str


class TargetVersion(WorkbenchModel):
    schema_version: int = 1
    id: str = Field(pattern=r'^tgv_[a-f0-9]{20}$')
    target_id: str = Field(pattern=r'^tgt_[a-f0-9]{20}$')
    based_on_version_id: Optional[str] = Field(default=None, pattern=r'^tgv_[a-f0-9]{20}$')
    version_number: int = Field(ge=1)
    label: str = Field(min_length=1, max_length=80)
    provider: str = Field(min_length=1, max_length=120)
    input_modalities: list[TargetModality] = Field(min_length=1, max_length=4)
    output_modalities: list[TargetModality] = Field(min_length=1, max_length=4)
    connection: TargetConnection
    runtime_binding: Optional[TargetRuntimeBinding] = None
    connection_status: ConnectionStatus = 'untested'
    last_connected_at: Optional[str] = None
    last_connection_check_id: Optional[str] = Field(default=None, pattern=r'^tcc_[a-f0-9]{20}$')
    config_hash: str = Field(pattern=r'^[a-f0-9]{64}$')
    created_at: str


class TargetVersionSummary(WorkbenchModel):
    id: str
    based_on_version_id: Optional[str] = Field(default=None, pattern=r'^tgv_[a-f0-9]{20}$')
    version_number: int
    label: str
    provider: str
    connection_status: ConnectionStatus
    last_connected_at: Optional[str] = None
    config_hash: str
    created_at: str


class TargetSummary(WorkbenchModel):
    target: TargetManifest
    latest_version: TargetVersion


class TargetDetail(WorkbenchModel):
    target: TargetManifest
    version: TargetVersion
    versions: list[TargetVersionSummary]


class TargetCreatePayload(WorkbenchModel):
    project_id: str = Field(pattern=r'^prj_[a-f0-9]{20}$')
    name: str = Field(min_length=1, max_length=120)
    type: TargetType
    description: Optional[str] = Field(default=None, max_length=1000)
    capabilities: list[str] = Field(default_factory=list, max_length=50)
    version_label: str = Field(default='v1', min_length=1, max_length=80)
    provider: str = Field(min_length=1, max_length=120)
    input_modalities: list[TargetModality] = Field(default_factory=lambda: ['text'], min_length=1, max_length=4)
    output_modalities: list[TargetModality] = Field(default_factory=lambda: ['text'], min_length=1, max_length=4)
    connection: TargetConnection
    runtime_binding: Optional[TargetRuntimeBinding] = None

    @field_validator('name', 'version_label', 'provider')
    @classmethod
    def normalize_required_text(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError('字段不能为空')
        return normalized

    @field_validator('capabilities')
    @classmethod
    def normalize_capabilities(cls, values: list[str]) -> list[str]:
        normalized = [value.strip() for value in values]
        if any(not value for value in normalized):
            raise ValueError('能力名称不能为空')
        if len(set(normalized)) != len(normalized):
            raise ValueError('能力名称不能重复')
        return normalized

    @field_validator('input_modalities', 'output_modalities')
    @classmethod
    def reject_duplicate_modalities(cls, values: list[TargetModality]) -> list[TargetModality]:
        if len(set(values)) != len(values):
            raise ValueError('输入输出模态不能重复')
        return values

    @model_validator(mode='after')
    def validate_runtime_binding(self):
        if self.type == 'skill' and self.runtime_binding is None:
            raise ValueError('Skill 对象必须绑定宿主运行时、参数、Tool 契约、加载方式和输入预处理')
        return self


class TargetVersionCreatePayload(WorkbenchModel):
    project_id: str = Field(pattern=r'^prj_[a-f0-9]{20}$')
    target_id: str = Field(pattern=r'^tgt_[a-f0-9]{20}$')
    base_version_id: str = Field(pattern=r'^tgv_[a-f0-9]{20}$')
    version_label: str = Field(min_length=1, max_length=80)
    provider: str = Field(min_length=1, max_length=120)
    input_modalities: list[TargetModality] = Field(min_length=1, max_length=4)
    output_modalities: list[TargetModality] = Field(min_length=1, max_length=4)
    connection: TargetConnection
    runtime_binding: Optional[TargetRuntimeBinding] = None
    reuse_base_credential: bool = False

    @field_validator('version_label', 'provider')
    @classmethod
    def normalize_required_text(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError('字段不能为空')
        return normalized

    @field_validator('input_modalities', 'output_modalities')
    @classmethod
    def reject_duplicate_modalities(cls, values: list[TargetModality]) -> list[TargetModality]:
        if len(set(values)) != len(values):
            raise ValueError('输入输出模态不能重复')
        return values

    @model_validator(mode='after')
    def validate_credential_mode(self):
        if self.reuse_base_credential and self.connection.credential_ref is not None:
            raise ValueError('沿用已有凭据时不能同时提供新的凭据引用')
        return self


class TargetListPayload(WorkbenchModel):
    project_id: str = Field(pattern=r'^prj_[a-f0-9]{20}$')
    types: list[TargetType] = Field(default_factory=list, max_length=5)
    statuses: list[TargetStatus] = Field(default_factory=list, max_length=4)
    limit: int = Field(default=100, ge=1, le=200)


class TargetGetPayload(WorkbenchModel):
    project_id: str = Field(pattern=r'^prj_[a-f0-9]{20}$')
    target_id: str = Field(pattern=r'^tgt_[a-f0-9]{20}$')
    version_id: Optional[str] = Field(default=None, pattern=r'^tgv_[a-f0-9]{20}$')


class TargetConnectionCheckPayload(WorkbenchModel):
    project_id: str = Field(pattern=r'^prj_[a-f0-9]{20}$')
    target_id: str = Field(pattern=r'^tgt_[a-f0-9]{20}$')
    version_id: Optional[str] = Field(default=None, pattern=r'^tgv_[a-f0-9]{20}$')
    sample_input: Any

    @field_validator('sample_input')
    @classmethod
    def limit_sample_size(cls, value: Any) -> Any:
        try:
            encoded = json.dumps(value, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
        except (TypeError, ValueError):
            raise ValueError('试调输入必须是可序列化的 JSON 数据') from None
        if len(encoded) > 64 * 1024:
            raise ValueError('试调输入不能超过 64 KiB')
        return value


class TargetConnectionCheck(WorkbenchModel):
    schema_version: int = 1
    id: str = Field(pattern=r'^tcc_[a-f0-9]{20}$')
    target_id: str = Field(pattern=r'^tgt_[a-f0-9]{20}$')
    version_id: str = Field(pattern=r'^tgv_[a-f0-9]{20}$')
    status: ConnectionCheckStatus
    checked_at: str
    duration_ms: int = Field(ge=0)
    http_status: Optional[int] = Field(default=None, ge=100, le=599)
    output_type: Optional[str] = Field(default=None, max_length=80)
    output_hash: Optional[str] = Field(default=None, pattern=r'^[a-f0-9]{64}$')
    error_code: Optional[str] = Field(default=None, max_length=80)


class _NoRedirectHandler(urllib_request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def _resolve_credential(reference: Optional[str]) -> Optional[str]:
    if reference is None:
        return None
    if reference.startswith('env:'):
        value = os.environ.get(reference.removeprefix('env:'))
        if not value:
            raise WorkbenchActionError(
                code='TARGET_CREDENTIAL_UNAVAILABLE',
                message='服务端凭据引用不可用，请检查本地环境变量后重试。',
            )
        return value

    service, account = reference.removeprefix('keychain:').split('/', 1)
    security = Path('/usr/bin/security')
    if not security.is_file():
        raise WorkbenchActionError(
            code='TARGET_CREDENTIAL_UNAVAILABLE',
            message='当前系统无法读取钥匙串凭据，请检查服务端运行环境。',
        )
    try:
        result = subprocess.run(
            [str(security), 'find-generic-password', '-s', service, '-a', account, '-w'],
            capture_output=True,
            check=False,
            text=True,
            timeout=5,
        )
    except (OSError, subprocess.SubprocessError):
        raise WorkbenchActionError(
            code='TARGET_CREDENTIAL_UNAVAILABLE',
            message='服务端无法读取钥匙串凭据，请检查本地配置。',
        ) from None
    value = result.stdout.strip() if result.returncode == 0 else ''
    if not value:
        raise WorkbenchActionError(
            code='TARGET_CREDENTIAL_UNAVAILABLE',
            message='钥匙串凭据引用不存在或不可访问，请检查本地配置。',
        )
    return value


def _path_tokens(path: str) -> list[str | int]:
    if re.fullmatch(_FIELD_PATH_PATTERN, path) is None:
        raise ValueError('invalid field path')
    tokens: list[str | int] = []
    for name, index in re.findall(r'([A-Za-z_][A-Za-z0-9_-]*)|\[(\d+)\]', path):
        tokens.append(name if name else int(index))
    if not tokens or not isinstance(tokens[0], str):
        raise ValueError('invalid field path')
    return tokens


def _set_path(path: str, value: Any) -> dict[str, Any]:
    tokens = _path_tokens(path)
    root: dict[str, Any] = {}
    current: Any = root
    for position, token in enumerate(tokens):
        final = position == len(tokens) - 1
        if isinstance(token, str):
            if final:
                current[token] = value
                continue
            next_value: Any = [] if isinstance(tokens[position + 1], int) else {}
            current[token] = next_value
            current = next_value
            continue
        while len(current) <= token:
            current.append(None)
        if final:
            current[token] = value
        else:
            next_value = [] if isinstance(tokens[position + 1], int) else {}
            current[token] = next_value
            current = next_value
    return root


def _get_path(payload: Any, path: str) -> Any:
    current = payload
    for token in _path_tokens(path):
        if isinstance(token, str) and isinstance(current, dict) and token in current:
            current = current[token]
        elif isinstance(token, int) and isinstance(current, list) and token < len(current):
            current = current[token]
        else:
            raise KeyError(path)
    return current


def _trial_body(version: TargetVersion, sample_input: Any) -> dict[str, Any]:
    if version.connection.adapter == 'openai_chat_completions':
        return {
            'model': version.connection.model_id,
            'messages': [{'role': 'user', 'content': sample_input}],
        }
    if version.connection.adapter == 'openai_responses':
        return {'model': version.connection.model_id, 'input': sample_input}
    return _set_path(version.connection.input_field, sample_input)


def _perform_http_trial(version: TargetVersion, sample_input: Any) -> dict[str, Any]:
    if version.connection.adapter == 'evalscope_model':
        return {'status': 'failed', 'error_code': 'ADAPTER_TRIAL_NOT_SUPPORTED', 'duration_ms': 0}

    credential = _resolve_credential(version.connection.credential_ref)
    headers = {'Content-Type': 'application/json', 'Accept': 'application/json'}
    if credential:
        headers['Authorization'] = f'Bearer {credential}'
    body = json.dumps(_trial_body(version, sample_input), ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    request = urllib_request.Request(
        version.connection.endpoint,
        data=body,
        headers=headers,
        method=version.connection.method,
    )
    started = time.monotonic()
    try:
        with urllib_request.build_opener(urllib_request.ProxyHandler({}), _NoRedirectHandler()).open(
            request,
            timeout=version.connection.timeout_seconds,
        ) as response:
            raw = response.read(1024 * 1024 + 1)
            status = response.status
    except urllib_error.HTTPError as error:
        return {
            'status': 'failed',
            'error_code': 'HTTP_STATUS_ERROR',
            'http_status': error.code,
            'duration_ms': round((time.monotonic() - started) * 1000),
        }
    except (urllib_error.URLError, TimeoutError, OSError):
        return {
            'status': 'failed',
            'error_code': 'CONNECTION_FAILED',
            'duration_ms': round((time.monotonic() - started) * 1000),
        }

    duration_ms = round((time.monotonic() - started) * 1000)
    if len(raw) > 1024 * 1024:
        return {
            'status': 'failed',
            'error_code': 'RESPONSE_TOO_LARGE',
            'http_status': status,
            'duration_ms': duration_ms,
        }
    try:
        response_payload = json.loads(raw.decode('utf-8'))
        output = _get_path(response_payload, version.connection.output_path)
    except (UnicodeDecodeError, json.JSONDecodeError):
        return {
            'status': 'failed',
            'error_code': 'INVALID_JSON_RESPONSE',
            'http_status': status,
            'duration_ms': duration_ms,
        }
    except KeyError:
        return {
            'status': 'failed',
            'error_code': 'OUTPUT_PATH_NOT_FOUND',
            'http_status': status,
            'duration_ms': duration_ms,
        }

    return {
        'status': 'passed',
        'http_status': status,
        'duration_ms': duration_ms,
        'output_type': type(output).__name__,
        'output_hash': content_hash(output),
    }


class TargetStore:
    def __init__(self, workspace_root: str):
        self.projects = ProjectStore(workspace_root)

    @staticmethod
    def _target_root(project_root: Path, target_id: str) -> Path:
        return project_root / 'targets' / target_id

    @staticmethod
    def _version_path(target_root: Path, version_id: str) -> Path:
        return target_root / 'versions' / f'{version_id}.json'

    def create(self, payload: TargetCreatePayload, operation_id: str) -> TargetDetail:
        project = self.projects.get(payload.project_id)
        project_root = Path(project.root_path)
        target_id = f'tgt_{operation_id[:20]}'
        version_id = f'tgv_{operation_id[20:40]}'
        target_root = self._target_root(project_root, target_id)
        target_path = target_root / 'target.json'
        version_path = self._version_path(target_root, version_id)
        config_hash = self._config_hash(payload)

        if target_path.exists():
            existing = self.get(TargetGetPayload(project_id=payload.project_id, target_id=target_id))
            manifest_matches = (
                existing.target.name == payload.name
                and existing.target.type == payload.type
                and existing.target.description == payload.description
                and existing.target.capabilities == payload.capabilities
            )
            if not manifest_matches or existing.version.config_hash != config_hash:
                raise WorkbenchActionError(
                    code='IDEMPOTENCY_CONFLICT',
                    message='该创建操作已生成不同评测对象，请更换幂等键。',
                    status_code=409,
                )
            return existing

        now = datetime.now(timezone.utc).isoformat()
        version = TargetVersion(
            id=version_id,
            target_id=target_id,
            version_number=1,
            label=payload.version_label,
            provider=payload.provider,
            input_modalities=payload.input_modalities,
            output_modalities=payload.output_modalities,
            connection=payload.connection,
            runtime_binding=payload.runtime_binding,
            config_hash=config_hash,
            created_at=now,
        )
        manifest = TargetManifest(
            id=target_id,
            project_id=payload.project_id,
            name=payload.name,
            type=payload.type,
            description=payload.description,
            capabilities=payload.capabilities,
            latest_version_id=version_id,
            created_at=now,
            updated_at=now,
        )

        if version_path.exists():
            existing_version = self._read_version(version_path, target_id)
            if existing_version.config_hash != config_hash:
                raise WorkbenchActionError(
                    code='IDEMPOTENCY_CONFLICT',
                    message='该创建操作留下了不同版本，请更换幂等键。',
                    status_code=409,
                )
            manifest = manifest.model_copy(update={'created_at': existing_version.created_at, 'updated_at': now})
        else:
            atomic_write_json(version_path, version.model_dump(mode='json', exclude_none=True))
        atomic_write_json(target_path, manifest.model_dump(mode='json', exclude_none=True))
        return self.get(TargetGetPayload(project_id=payload.project_id, target_id=target_id))

    def create_version(self, payload: TargetVersionCreatePayload, operation_id: str) -> TargetDetail:
        base_detail = self.get(
            TargetGetPayload(
                project_id=payload.project_id,
                target_id=payload.target_id,
                version_id=payload.base_version_id,
            )
        )
        if base_detail.target.type == 'skill' and payload.runtime_binding is None:
            raise WorkbenchActionError(
                code='VALIDATION_FAILED',
                message='Skill 对象的新版本必须继续冻结完整运行绑定。',
                field_errors=[
                    {
                        'field': 'runtime_binding',
                        'message': 'Skill 对象必须绑定宿主运行时、参数、Tool 契约、加载方式和输入预处理',
                        'type': 'value_error',
                    }
                ],
            )

        connection = payload.connection
        if payload.reuse_base_credential:
            inherited_reference = base_detail.version.connection.credential_ref
            if inherited_reference is None:
                raise WorkbenchActionError(
                    code='TARGET_CREDENTIAL_REFERENCE_MISSING',
                    message='基线版本没有可沿用的服务端凭据引用，请改为提供新引用或不使用鉴权。',
                )
            connection = connection.model_copy(update={'credential_ref': inherited_reference})

        config_hash = self._version_config_hash(
            label=payload.version_label,
            provider=payload.provider,
            input_modalities=payload.input_modalities,
            output_modalities=payload.output_modalities,
            connection=connection,
            runtime_binding=payload.runtime_binding,
        )
        project_root = Path(self.projects.get(payload.project_id).root_path)
        target_root = self._target_root(project_root, payload.target_id)
        target_path = target_root / 'target.json'
        version_id = f'tgv_{operation_id[:20]}'
        version_path = self._version_path(target_root, version_id)

        if version_path.exists():
            existing = self._read_version(version_path, payload.target_id)
            if existing.config_hash != config_hash or existing.based_on_version_id != payload.base_version_id:
                raise WorkbenchActionError(
                    code='IDEMPOTENCY_CONFLICT',
                    message='该创建操作已生成不同对象版本，请更换幂等键。',
                    status_code=409,
                )
            if base_detail.target.latest_version_id == payload.base_version_id:
                now = datetime.now(timezone.utc).isoformat()
                manifest = base_detail.target.model_copy(
                    update={'latest_version_id': existing.id, 'status': 'draft', 'updated_at': now}
                )
                atomic_write_json(target_path, manifest.model_dump(mode='json', exclude_none=True))
            return self.get(
                TargetGetPayload(
                    project_id=payload.project_id,
                    target_id=payload.target_id,
                    version_id=version_id,
                )
            )

        if base_detail.target.latest_version_id != payload.base_version_id:
            raise WorkbenchActionError(
                code='TARGET_VERSION_CONFLICT',
                message='对象已有更新版本，请刷新页面后基于最新版重新创建。',
                status_code=409,
                details={
                    'target_id': payload.target_id,
                    'expected_base_version_id': base_detail.target.latest_version_id,
                },
            )

        versions = self._list_versions(target_root, payload.target_id)
        now = datetime.now(timezone.utc).isoformat()
        version = TargetVersion(
            id=version_id,
            target_id=payload.target_id,
            based_on_version_id=payload.base_version_id,
            version_number=max(item.version_number for item in versions) + 1,
            label=payload.version_label,
            provider=payload.provider,
            input_modalities=payload.input_modalities,
            output_modalities=payload.output_modalities,
            connection=connection,
            runtime_binding=payload.runtime_binding,
            connection_status='untested',
            config_hash=config_hash,
            created_at=now,
        )
        atomic_write_json(version_path, version.model_dump(mode='json', exclude_none=True))
        manifest = base_detail.target.model_copy(
            update={'latest_version_id': version.id, 'status': 'draft', 'updated_at': now}
        )
        atomic_write_json(target_path, manifest.model_dump(mode='json', exclude_none=True))
        return self.get(
            TargetGetPayload(
                project_id=payload.project_id,
                target_id=payload.target_id,
                version_id=version.id,
            )
        )

    def list(self, payload: TargetListPayload) -> tuple[list[TargetSummary], list[str]]:
        project = self.projects.get(payload.project_id)
        targets_root = Path(project.root_path) / 'targets'
        if not targets_root.is_dir():
            return [], []

        records: list[TargetSummary] = []
        warnings: list[str] = []
        for path in sorted(targets_root.glob('tgt_*/target.json')):
            try:
                manifest = self._read_manifest(path, payload.project_id)
                if payload.types and manifest.type not in payload.types:
                    continue
                if payload.statuses and manifest.status not in payload.statuses:
                    continue
                version = self._read_version(
                    self._version_path(path.parent, manifest.latest_version_id),
                    manifest.id,
                )
                records.append(TargetSummary(target=manifest, latest_version=version))
            except WorkbenchActionError:
                warnings.append(f'已跳过损坏的评测对象：{path.parent.name}')
        records.sort(key=lambda record: record.target.updated_at, reverse=True)
        return records[: payload.limit], warnings

    def get(self, payload: TargetGetPayload) -> TargetDetail:
        project = self.projects.get(payload.project_id)
        target_root = self._target_root(Path(project.root_path), payload.target_id)
        target_path = target_root / 'target.json'
        if not target_path.is_file():
            raise WorkbenchActionError(
                code='TARGET_NOT_FOUND',
                message='未找到指定评测对象，请先刷新对象列表。',
                status_code=404,
                details={'project_id': payload.project_id, 'target_id': payload.target_id},
            )
        manifest = self._read_manifest(target_path, payload.project_id)
        version_id = payload.version_id or manifest.latest_version_id
        version = self._read_version(self._version_path(target_root, version_id), manifest.id)
        summaries = [
            TargetVersionSummary(
                id=item.id,
                based_on_version_id=item.based_on_version_id,
                version_number=item.version_number,
                label=item.label,
                provider=item.provider,
                connection_status=item.connection_status,
                last_connected_at=item.last_connected_at,
                config_hash=item.config_hash,
                created_at=item.created_at,
            )
            for item in self._list_versions(target_root, manifest.id)
        ]
        summaries.sort(key=lambda item: item.version_number, reverse=True)
        return TargetDetail(target=manifest, version=version, versions=summaries)

    def check_connection(self, payload: TargetConnectionCheckPayload, operation_id: str) -> TargetConnectionCheck:
        detail = self.get(
            TargetGetPayload(
                project_id=payload.project_id,
                target_id=payload.target_id,
                version_id=payload.version_id,
            )
        )
        target_root = self._target_root(Path(self.projects.get(payload.project_id).root_path), payload.target_id)
        check_id = f'tcc_{operation_id[:20]}'
        check_path = target_root / 'connection_checks' / f'{check_id}.json'
        if check_path.is_file():
            try:
                return TargetConnectionCheck.model_validate_json(check_path.read_text(encoding='utf-8'))
            except (OSError, ValueError, json.JSONDecodeError):
                raise WorkbenchActionError(
                    code='STORAGE_CORRUPTED',
                    message='连接试调记录无法读取，请检查文件完整性。',
                    status_code=500,
                    details={'target_id': payload.target_id, 'check_id': check_id},
                ) from None

        outcome = _perform_http_trial(detail.version, payload.sample_input)
        checked_at = datetime.now(timezone.utc).isoformat()
        check = TargetConnectionCheck(
            id=check_id,
            target_id=payload.target_id,
            version_id=detail.version.id,
            checked_at=checked_at,
            **outcome,
        )
        atomic_write_json(check_path, check.model_dump(mode='json', exclude_none=True))

        connection_status: ConnectionStatus = 'passed' if check.status == 'passed' else 'failed'
        version = detail.version.model_copy(
            update={
                'connection_status': connection_status,
                'last_connected_at': checked_at if check.status == 'passed' else detail.version.last_connected_at,
                'last_connection_check_id': check.id,
            }
        )
        atomic_write_json(
            self._version_path(target_root, version.id),
            version.model_dump(mode='json', exclude_none=True),
        )
        if detail.target.latest_version_id == version.id:
            manifest = detail.target.model_copy(
                update={
                    'status': 'ready' if check.status == 'passed' else 'unavailable',
                    'updated_at': checked_at,
                }
            )
            atomic_write_json(target_root / 'target.json', manifest.model_dump(mode='json', exclude_none=True))
        return check

    @staticmethod
    def _config_hash(payload: TargetCreatePayload) -> str:
        return TargetStore._version_config_hash(
            label=payload.version_label,
            provider=payload.provider,
            input_modalities=payload.input_modalities,
            output_modalities=payload.output_modalities,
            connection=payload.connection,
            runtime_binding=payload.runtime_binding,
        )

    @staticmethod
    def _version_config_hash(
        *,
        label: str,
        provider: str,
        input_modalities: list[TargetModality],
        output_modalities: list[TargetModality],
        connection: TargetConnection,
        runtime_binding: Optional[TargetRuntimeBinding],
    ) -> str:
        public_connection = connection.model_dump(
            mode='json',
            exclude={'credential_ref'},
            exclude_none=True,
        )
        public_connection['credential_configured'] = connection.credential_ref is not None
        return content_hash(
            {
                'version_label': label,
                'provider': provider,
                'input_modalities': input_modalities,
                'output_modalities': output_modalities,
                'connection': public_connection,
                'runtime_binding': (
                    runtime_binding.model_dump(mode='json', exclude_none=True) if runtime_binding is not None else None
                ),
            }
        )

    @staticmethod
    def _read_manifest(path: Path, project_id: str) -> TargetManifest:
        try:
            manifest = TargetManifest.model_validate_json(path.read_text(encoding='utf-8'))
            if manifest.project_id != project_id or manifest.id != path.parent.name:
                raise ValueError('target identity mismatch')
            return manifest
        except (OSError, ValueError, json.JSONDecodeError) as error:
            raise WorkbenchActionError(
                code='STORAGE_CORRUPTED',
                message='评测对象清单无法读取，请检查文件完整性。',
                status_code=500,
                details={'target_id': path.parent.name, 'error_type': type(error).__name__},
            ) from None

    @staticmethod
    def _read_version(path: Path, target_id: str) -> TargetVersion:
        if not path.is_file():
            raise WorkbenchActionError(
                code='STORAGE_CORRUPTED',
                message='评测对象版本不存在，请检查文件完整性。',
                status_code=500,
                details={'target_id': target_id, 'version_id': path.stem},
            )
        try:
            version = TargetVersion.model_validate_json(path.read_text(encoding='utf-8'))
            if version.target_id != target_id or version.id != path.stem:
                raise ValueError('target version identity mismatch')
            return version
        except (OSError, ValueError, json.JSONDecodeError) as error:
            raise WorkbenchActionError(
                code='STORAGE_CORRUPTED',
                message='评测对象版本无法读取，请检查文件完整性。',
                status_code=500,
                details={'target_id': target_id, 'version_id': path.stem, 'error_type': type(error).__name__},
            ) from None

    def _list_versions(self, target_root: Path, target_id: str) -> list[TargetVersion]:
        paths = sorted((target_root / 'versions').glob('tgv_*.json'))
        return [self._read_version(path, target_id) for path in paths]
