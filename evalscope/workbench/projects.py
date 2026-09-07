# Copyright (c) Alibaba, Inc. and its affiliates.
"""Portable project manifests stored under the local workbench root."""

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from pydantic import Field, field_validator

from .contracts import WorkbenchModel
from .errors import WorkbenchActionError
from .persistence import atomic_write_json


class ProjectManifest(WorkbenchModel):
    schema_version: int = 1
    id: str = Field(pattern=r'^prj_[a-f0-9]{20}$')
    name: str = Field(min_length=1, max_length=120)
    description: Optional[str] = Field(default=None, max_length=1000)
    created_at: str
    updated_at: str
    archived: bool = False


class ProjectRecord(ProjectManifest):
    root_path: str


class ProjectCreatePayload(WorkbenchModel):
    name: str = Field(min_length=1, max_length=120)
    description: Optional[str] = Field(default=None, max_length=1000)

    @field_validator('name')
    @classmethod
    def normalize_name(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError('项目名称不能为空')
        return normalized


class ProjectListPayload(WorkbenchModel):
    include_archived: bool = False
    limit: int = Field(default=100, ge=1, le=200)


class ProjectGetPayload(WorkbenchModel):
    project_id: str = Field(pattern=r'^prj_[a-f0-9]{20}$')


class ProjectStore:
    def __init__(self, workspace_root: str):
        self.root = Path(workspace_root).expanduser().resolve()
        self.projects_root = self.root / 'projects'

    def _manifest_path(self, project_id: str) -> Path:
        return self.projects_root / project_id / 'project.json'

    def create(self, payload: ProjectCreatePayload, operation_id: str) -> ProjectRecord:
        project_id = f'prj_{operation_id[:20]}'
        path = self._manifest_path(project_id)
        if path.exists():
            existing = self.get(project_id)
            if existing.name != payload.name or existing.description != payload.description:
                raise WorkbenchActionError(
                    code='IDEMPOTENCY_CONFLICT',
                    message='该创建操作已生成不同项目，请更换幂等键。',
                    status_code=409,
                )
            return existing

        now = datetime.now(timezone.utc).isoformat()
        manifest = ProjectManifest(
            id=project_id,
            name=payload.name,
            description=payload.description,
            created_at=now,
            updated_at=now,
        )
        atomic_write_json(path, manifest.model_dump(mode='json', exclude_none=True))
        return self._record(manifest, path.parent)

    def get(self, project_id: str) -> ProjectRecord:
        path = self._manifest_path(project_id)
        if not path.is_file():
            raise WorkbenchActionError(
                code='PROJECT_NOT_FOUND',
                message='未找到指定项目，请先刷新项目列表。',
                status_code=404,
                details={'project_id': project_id},
            )
        try:
            manifest = ProjectManifest.model_validate_json(path.read_text(encoding='utf-8'))
        except (OSError, ValueError, json.JSONDecodeError) as error:
            raise WorkbenchActionError(
                code='STORAGE_CORRUPTED',
                message='项目清单无法读取，请检查文件完整性。',
                status_code=500,
                details={'project_id': project_id, 'error_type': type(error).__name__},
            ) from None
        return self._record(manifest, path.parent)

    def list(self, payload: ProjectListPayload) -> tuple[list[ProjectRecord], list[str]]:
        if not self.projects_root.is_dir():
            return [], []
        projects: list[ProjectRecord] = []
        warnings: list[str] = []
        for path in sorted(self.projects_root.glob('prj_*/project.json')):
            try:
                manifest = ProjectManifest.model_validate_json(path.read_text(encoding='utf-8'))
            except (OSError, ValueError, json.JSONDecodeError):
                warnings.append(f'已跳过损坏的项目清单：{path.parent.name}')
                continue
            if payload.include_archived or not manifest.archived:
                projects.append(self._record(manifest, path.parent))
        projects.sort(key=lambda project: project.updated_at, reverse=True)
        return projects[: payload.limit], warnings

    @staticmethod
    def _record(manifest: ProjectManifest, root: Path) -> ProjectRecord:
        return ProjectRecord(**manifest.model_dump(mode='json'), root_path=str(root))
