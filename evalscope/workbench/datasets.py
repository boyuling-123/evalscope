# Copyright (c) Alibaba, Inc. and its affiliates.
"""Project-scoped, immutable dataset manifests and case revisions."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Annotated, Any, Literal, Optional

from pydantic import Field, field_validator, model_validator

from .contracts import WorkbenchModel
from .errors import WorkbenchActionError
from .persistence import atomic_write_json, content_hash
from .projects import ProjectStore

DatasetType = Literal['general', 'conversation', 'multimodal', 'agent_trace', 'benchmark']
DatasetStatus = Literal['ready', 'archived']
DatasetFieldType = Literal['string', 'number', 'boolean', 'object', 'array', 'any']
DatasetFieldRole = Literal['input', 'expected', 'metadata', 'attachment', 'label', 'id']
DatasetSource = Literal['manual', 'import_package', 'file', 'folder', 'benchmark', 'trace']
DatasetRevisionId = Annotated[str, Field(pattern=r'^dcr_[a-f0-9]{20}$')]


class DatasetField(WorkbenchModel):
    name: str = Field(min_length=1, max_length=120, pattern=r'^[A-Za-z_][A-Za-z0-9_.-]*$')
    type: DatasetFieldType = 'any'
    role: DatasetFieldRole
    required: bool = False


class DatasetSchema(WorkbenchModel):
    fields: list[DatasetField] = Field(min_length=1, max_length=200)

    @model_validator(mode='after')
    def validate_roles(self):
        names = [field.name for field in self.fields]
        if len(names) != len(set(names)):
            raise ValueError('字段名称不能重复')
        if not any(field.role == 'input' for field in self.fields):
            raise ValueError('字段结构必须至少包含一个 input 字段')
        if sum(field.role == 'id' for field in self.fields) > 1:
            raise ValueError('字段结构最多包含一个 id 字段')
        return self


class DatasetCaseInput(WorkbenchModel):
    case_id: Optional[str] = Field(default=None, pattern=r'^dsc_[a-f0-9]{20}$')
    input: Any
    expected: Any = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    attachments: list[str] = Field(default_factory=list, max_length=20)
    labels: list[str] = Field(default_factory=list, max_length=50)
    source_ref: Optional[str] = Field(default=None, max_length=2048)

    @model_validator(mode='after')
    def validate_serialized_size(self):
        try:
            encoded = json.dumps(self.model_dump(mode='json'), ensure_ascii=False, separators=(',', ':')).encode(
                'utf-8'
            )
        except (TypeError, ValueError):
            raise ValueError('Case 必须是可序列化的 JSON 数据') from None
        if len(encoded) > 1024 * 1024:
            raise ValueError('单条 Case 元数据不能超过 1 MiB；媒体内容请使用附件引用')
        return self


class DatasetCaseRevision(WorkbenchModel):
    schema_version: int = 1
    id: str = Field(pattern=r'^dcr_[a-f0-9]{20}$')
    case_id: str = Field(pattern=r'^dsc_[a-f0-9]{20}$')
    input: Any
    expected: Any = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    attachments: list[str] = Field(default_factory=list)
    labels: list[str] = Field(default_factory=list)
    source_ref: Optional[str] = None
    content_hash: str = Field(pattern=r'^[a-f0-9]{64}$')
    created_at: str


class DatasetVersion(WorkbenchModel):
    schema_version: int = 1
    id: str = Field(pattern=r'^dsv_[a-f0-9]{20}$')
    dataset_id: str = Field(pattern=r'^dst_[a-f0-9]{20}$')
    version_number: int = Field(ge=1)
    label: str = Field(min_length=1, max_length=80)
    revision_ids: list[DatasetRevisionId] = Field(max_length=1000)
    row_count: int = Field(ge=0)
    content_hash: str = Field(pattern=r'^[a-f0-9]{64}$')
    source: DatasetSource
    source_ref: Optional[str] = Field(default=None, max_length=2048)
    created_at: str


class DatasetManifest(WorkbenchModel):
    schema_version: int = 1
    id: str = Field(pattern=r'^dst_[a-f0-9]{20}$')
    project_id: str = Field(pattern=r'^prj_[a-f0-9]{20}$')
    name: str = Field(min_length=1, max_length=120)
    description: Optional[str] = Field(default=None, max_length=1000)
    type: DatasetType
    dataset_schema: DatasetSchema = Field(alias='schema')
    latest_version_id: str = Field(pattern=r'^dsv_[a-f0-9]{20}$')
    status: DatasetStatus = 'ready'
    associated_run_ids: list[str] = Field(default_factory=list, max_length=500)
    created_at: str
    updated_at: str


class DatasetSummary(WorkbenchModel):
    dataset: DatasetManifest
    latest_version: DatasetVersion


class DatasetDetail(WorkbenchModel):
    dataset: DatasetManifest
    version: DatasetVersion
    cases: list[DatasetCaseRevision]


class DatasetCreatePayload(WorkbenchModel):
    project_id: str = Field(pattern=r'^prj_[a-f0-9]{20}$')
    name: str = Field(min_length=1, max_length=120)
    description: Optional[str] = Field(default=None, max_length=1000)
    type: DatasetType = 'general'
    version_label: str = Field(default='v1', min_length=1, max_length=80)
    dataset_schema: DatasetSchema = Field(alias='schema')
    cases: list[DatasetCaseInput] = Field(min_length=1, max_length=1000)
    source: DatasetSource = 'import_package'
    source_ref: Optional[str] = Field(default=None, max_length=2048)

    @field_validator('name', 'version_label')
    @classmethod
    def normalize_required_text(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError('字段不能为空')
        return normalized

    @model_validator(mode='after')
    def reject_duplicate_case_ids(self):
        case_ids = [case.case_id for case in self.cases if case.case_id is not None]
        if len(case_ids) != len(set(case_ids)):
            raise ValueError('同一导入包内 case_id 不能重复')
        encoded = json.dumps(
            self.model_dump(mode='json', by_alias=True),
            ensure_ascii=False,
            separators=(',', ':'),
        ).encode('utf-8')
        if len(encoded) > 8 * 1024 * 1024:
            raise ValueError('导入包不能超过 8 MiB；大数据请使用流式文件导入')
        return self


class DatasetListPayload(WorkbenchModel):
    project_id: str = Field(pattern=r'^prj_[a-f0-9]{20}$')
    types: list[DatasetType] = Field(default_factory=list, max_length=5)
    include_archived: bool = False
    limit: int = Field(default=100, ge=1, le=200)


class DatasetGetPayload(WorkbenchModel):
    project_id: str = Field(pattern=r'^prj_[a-f0-9]{20}$')
    dataset_id: str = Field(pattern=r'^dst_[a-f0-9]{20}$')
    version_id: Optional[str] = Field(default=None, pattern=r'^dsv_[a-f0-9]{20}$')
    include_cases: bool = True


class DatasetStore:
    def __init__(self, workspace_root: str):
        self.projects = ProjectStore(workspace_root)

    @staticmethod
    def _dataset_root(project_root: Path, dataset_id: str) -> Path:
        return project_root / 'datasets' / dataset_id

    def create(self, payload: DatasetCreatePayload, operation_id: str) -> DatasetDetail:
        project = self.projects.get(payload.project_id)
        dataset_id = f'dst_{operation_id[:20]}'
        root = self._dataset_root(Path(project.root_path), dataset_id)
        if (root / 'dataset.json').exists():
            return self.get(DatasetGetPayload(project_id=payload.project_id, dataset_id=dataset_id))

        now = datetime.now(timezone.utc).isoformat()
        revisions: list[DatasetCaseRevision] = []
        for index, case in enumerate(payload.cases):
            case_id = case.case_id or f'dsc_{content_hash({"dataset_id": dataset_id, "index": index})[:20]}'
            case_content = case.model_dump(mode='json', exclude={'case_id'})
            revision_hash = content_hash({'case_id': case_id, **case_content})
            revisions.append(
                DatasetCaseRevision(
                    id=f'dcr_{revision_hash[:20]}',
                    case_id=case_id,
                    **case_content,
                    content_hash=revision_hash,
                    created_at=now,
                )
            )

        version_hash = content_hash(
            {
                'dataset_id': dataset_id,
                'schema': payload.dataset_schema.model_dump(mode='json'),
                'revision_ids': [revision.id for revision in revisions],
            }
        )
        version = DatasetVersion(
            id=f'dsv_{version_hash[:20]}',
            dataset_id=dataset_id,
            version_number=1,
            label=payload.version_label,
            revision_ids=[revision.id for revision in revisions],
            row_count=len(revisions),
            content_hash=version_hash,
            source=payload.source,
            source_ref=payload.source_ref,
            created_at=now,
        )
        manifest = DatasetManifest(
            id=dataset_id,
            project_id=payload.project_id,
            name=payload.name,
            description=payload.description,
            type=payload.type,
            dataset_schema=payload.dataset_schema,
            latest_version_id=version.id,
            created_at=now,
            updated_at=now,
        )

        for revision in revisions:
            atomic_write_json(
                root / 'revisions' / f'{revision.id}.json',
                revision.model_dump(mode='json'),
            )
        atomic_write_json(root / 'versions' / f'{version.id}.json', version.model_dump(mode='json'))
        atomic_write_json(
            root / 'dataset.json',
            manifest.model_dump(mode='json', by_alias=True),
        )
        return DatasetDetail(dataset=manifest, version=version, cases=revisions)

    def list(self, payload: DatasetListPayload) -> tuple[list[DatasetSummary], list[str]]:
        project = self.projects.get(payload.project_id)
        datasets_root = Path(project.root_path) / 'datasets'
        if not datasets_root.is_dir():
            return [], []
        records: list[DatasetSummary] = []
        warnings: list[str] = []
        for path in sorted(datasets_root.glob('dst_*/dataset.json')):
            try:
                manifest = DatasetManifest.model_validate_json(path.read_text(encoding='utf-8'))
                if manifest.project_id != payload.project_id:
                    raise ValueError('project identity mismatch')
                if (manifest.status == 'archived' and not payload.include_archived) or (
                    payload.types and manifest.type not in payload.types
                ):
                    continue
                version = self._read_version(
                    path.parent,
                    manifest.latest_version_id,
                    manifest.id,
                    manifest.dataset_schema,
                )
                records.append(DatasetSummary(dataset=manifest, latest_version=version))
            except (OSError, ValueError, json.JSONDecodeError, WorkbenchActionError):
                warnings.append(f'已跳过损坏的数据集：{path.parent.name}')
        records.sort(key=lambda record: record.dataset.updated_at, reverse=True)
        return records[: payload.limit], warnings

    def get(self, payload: DatasetGetPayload) -> DatasetDetail:
        project = self.projects.get(payload.project_id)
        root = self._dataset_root(Path(project.root_path), payload.dataset_id)
        path = root / 'dataset.json'
        if not path.is_file():
            raise WorkbenchActionError(
                code='DATASET_NOT_FOUND',
                message='未找到指定数据集，请先刷新数据集列表。',
                status_code=404,
                details={'dataset_id': payload.dataset_id},
            )
        try:
            manifest = DatasetManifest.model_validate_json(path.read_text(encoding='utf-8'))
            if manifest.project_id != payload.project_id:
                raise ValueError('project identity mismatch')
            version = self._read_version(
                root,
                payload.version_id or manifest.latest_version_id,
                manifest.id,
                manifest.dataset_schema,
            )
            cases = [self._read_revision(root, revision_id) for revision_id in version.revision_ids]
            if not payload.include_cases:
                cases = []
            return DatasetDetail(dataset=manifest, version=version, cases=cases)
        except WorkbenchActionError:
            raise
        except (OSError, ValueError, json.JSONDecodeError):
            raise WorkbenchActionError(
                code='STORAGE_CORRUPTED',
                message='数据集记录无法读取，请检查文件完整性。',
                status_code=500,
                details={'dataset_id': payload.dataset_id},
            ) from None

    @staticmethod
    def _read_version(
        root: Path,
        version_id: str,
        dataset_id: str,
        dataset_schema: DatasetSchema,
    ) -> DatasetVersion:
        path = root / 'versions' / f'{version_id}.json'
        if not path.is_file():
            raise WorkbenchActionError(
                code='DATASET_VERSION_NOT_FOUND',
                message='未找到指定数据集版本。',
                status_code=404,
            )
        version = DatasetVersion.model_validate_json(path.read_text(encoding='utf-8'))
        if version.dataset_id != dataset_id:
            raise ValueError('dataset identity mismatch')
        expected_hash = content_hash(
            {
                'dataset_id': dataset_id,
                'schema': dataset_schema.model_dump(mode='json'),
                'revision_ids': version.revision_ids,
            }
        )
        if (
            version.row_count != len(version.revision_ids)
            or version.content_hash != expected_hash
            or version.id != f'dsv_{expected_hash[:20]}'
        ):
            raise ValueError('dataset version integrity mismatch')
        return version

    @staticmethod
    def _read_revision(root: Path, revision_id: str) -> DatasetCaseRevision:
        path = root / 'revisions' / f'{revision_id}.json'
        if not path.is_file():
            raise ValueError('missing case revision')
        revision = DatasetCaseRevision.model_validate_json(path.read_text(encoding='utf-8'))
        revision_content = revision.model_dump(
            mode='json',
            include={'input', 'expected', 'metadata', 'attachments', 'labels', 'source_ref'},
        )
        expected_hash = content_hash({'case_id': revision.case_id, **revision_content})
        if (
            revision.id != revision_id
            or revision.content_hash != expected_hash
            or revision.id != f'dcr_{expected_hash[:20]}'
        ):
            raise ValueError('revision identity mismatch')
        return revision
