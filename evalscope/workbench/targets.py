# Copyright (c) Alibaba, Inc. and its affiliates.
"""Project-scoped, immutable evaluation target manifests."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal, Optional
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


class TargetConnection(WorkbenchModel):
    adapter: TargetAdapter
    endpoint: Optional[str] = Field(default=None, max_length=2048)
    model_id: Optional[str] = Field(default=None, min_length=1, max_length=300)
    credential_ref: Optional[str] = Field(
        default=None,
        pattern=r'^(env:[A-Z][A-Z0-9_]{1,127}|keychain:[A-Za-z0-9_.-]{1,64}/[A-Za-z0-9_.-]{1,64})$',
    )
    method: Literal['POST'] = 'POST'
    input_field: str = Field(default='input', pattern=r'^[A-Za-z_][A-Za-z0-9_.\[\]-]{0,255}$')
    output_path: str = Field(default='output', pattern=r'^[A-Za-z_][A-Za-z0-9_.\[\]-]{0,255}$')
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
    version_number: int = Field(ge=1)
    label: str = Field(min_length=1, max_length=80)
    provider: str = Field(min_length=1, max_length=120)
    input_modalities: list[TargetModality] = Field(min_length=1, max_length=4)
    output_modalities: list[TargetModality] = Field(min_length=1, max_length=4)
    connection: TargetConnection
    runtime_binding: Optional[TargetRuntimeBinding] = None
    connection_status: ConnectionStatus = 'untested'
    last_connected_at: Optional[str] = None
    config_hash: str = Field(pattern=r'^[a-f0-9]{64}$')
    created_at: str


class TargetVersionSummary(WorkbenchModel):
    id: str
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


class TargetListPayload(WorkbenchModel):
    project_id: str = Field(pattern=r'^prj_[a-f0-9]{20}$')
    types: list[TargetType] = Field(default_factory=list, max_length=5)
    statuses: list[TargetStatus] = Field(default_factory=list, max_length=4)
    limit: int = Field(default=100, ge=1, le=200)


class TargetGetPayload(WorkbenchModel):
    project_id: str = Field(pattern=r'^prj_[a-f0-9]{20}$')
    target_id: str = Field(pattern=r'^tgt_[a-f0-9]{20}$')
    version_id: Optional[str] = Field(default=None, pattern=r'^tgv_[a-f0-9]{20}$')


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

    @staticmethod
    def _config_hash(payload: TargetCreatePayload) -> str:
        return content_hash(
            payload.model_dump(
                mode='json',
                exclude={'project_id', 'name', 'description', 'capabilities'},
                exclude_none=True,
            )
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
