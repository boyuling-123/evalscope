# Copyright (c) Alibaba, Inc. and its affiliates.
"""Resolve registered workbench projects to isolated local run directories."""

from pathlib import Path
from typing import Optional

from flask import current_app
from pydantic import ValidationError

from evalscope.workbench.errors import WorkbenchActionError
from evalscope.workbench.projects import ProjectGetPayload, ProjectStore

from .utils import OUTPUT_DIR


class ProjectScopeError(Exception):
    """Raised when an API request cannot resolve its requested project scope."""

    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def resolve_runs_root(project_id: Optional[str], *, create: bool = False) -> str:
    """Return the output root for a project, or the legacy service root.

    Project paths are never accepted from the caller. They are derived from the
    server-side project registry so a forged ``root_path`` cannot cross project
    boundaries. Omitting ``project_id`` preserves the existing EvalScope API.
    """
    if not project_id:
        return str(Path(current_app.config.get('OUTPUTS_ROOT') or OUTPUT_DIR).expanduser().resolve())

    workspace_root = current_app.config.get('WORKBENCH_ROOT')
    if not workspace_root:
        raise ProjectScopeError('Workbench project storage is not configured.', 500)

    try:
        validated_id = ProjectGetPayload(project_id=project_id).project_id
    except ValidationError:
        raise ProjectScopeError('project_id 格式无效。') from None

    try:
        project = ProjectStore(workspace_root).get(validated_id)
    except WorkbenchActionError as error:
        raise ProjectScopeError(error.message, error.status_code) from None

    project_root = Path(project.root_path).resolve()
    registered_root = (Path(workspace_root).expanduser().resolve() / 'projects' / validated_id).resolve()
    if project_root != registered_root:
        raise ProjectScopeError('项目目录与注册记录不一致，请检查工作区完整性。', 409)

    runs_root = project_root / 'runs'
    if create:
        runs_root.mkdir(parents=True, exist_ok=True)
    return str(runs_root)
