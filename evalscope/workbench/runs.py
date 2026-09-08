# Copyright (c) Alibaba, Inc. and its affiliates.
"""Immutable evidence that binds a run to one exact target version."""

import json
from datetime import datetime, timezone
from pathlib import Path
from threading import RLock
from typing import Literal

from pydantic import Field

from .contracts import WorkbenchModel
from .errors import WorkbenchActionError
from .persistence import atomic_write_json
from .targets import TargetDetail, TargetType


class RunTargetBinding(WorkbenchModel):
    schema_version: int = 1
    run_id: str = Field(min_length=1, max_length=128)
    run_kind: Literal['evaluation'] = 'evaluation'
    project_id: str = Field(pattern=r'^prj_[a-f0-9]{20}$')
    target_id: str = Field(pattern=r'^tgt_[a-f0-9]{20}$')
    target_name: str = Field(min_length=1, max_length=120)
    target_type: TargetType
    target_version_id: str = Field(pattern=r'^tgv_[a-f0-9]{20}$')
    target_version_number: int = Field(ge=1)
    target_version_label: str = Field(min_length=1, max_length=80)
    target_config_hash: str = Field(pattern=r'^[a-f0-9]{64}$')
    adapter: Literal['openai_chat_completions', 'openai_responses']
    model_id: str = Field(min_length=1, max_length=300)
    bound_at: str

    @classmethod
    def from_target(cls, run_id: str, detail: TargetDetail) -> 'RunTargetBinding':
        connection = detail.version.connection
        if connection.adapter not in {'openai_chat_completions', 'openai_responses'} or not connection.model_id:
            raise WorkbenchActionError(
                code='TARGET_ADAPTER_NOT_RUNNABLE',
                message='该对象版本尚不能由模型评测执行器运行，请选择 OpenAI Chat Completions 或 Responses 适配器。',
                status_code=409,
            )
        return cls(
            run_id=run_id,
            project_id=detail.target.project_id,
            target_id=detail.target.id,
            target_name=detail.target.name,
            target_type=detail.target.type,
            target_version_id=detail.version.id,
            target_version_number=detail.version.version_number,
            target_version_label=detail.version.label,
            target_config_hash=detail.version.config_hash,
            adapter=connection.adapter,
            model_id=connection.model_id,
            bound_at=datetime.now(timezone.utc).isoformat(),
        )


class RunBindingStore:
    FILE_NAME = 'target-binding.json'
    _LOCK = RLock()

    @classmethod
    def read(cls, run_dir: str | Path) -> RunTargetBinding | None:
        path = Path(run_dir) / cls.FILE_NAME
        if not path.is_file():
            return None
        try:
            binding = RunTargetBinding.model_validate_json(path.read_text(encoding='utf-8'))
            if binding.run_id != path.parent.name:
                raise ValueError('run identity mismatch')
            return binding
        except (OSError, ValueError, json.JSONDecodeError):
            raise WorkbenchActionError(
                code='STORAGE_CORRUPTED',
                message='运行的对象版本绑定记录无法读取，请检查文件完整性。',
                status_code=500,
                details={'run_id': path.parent.name, 'record': cls.FILE_NAME},
            ) from None

    @classmethod
    def bind(cls, run_dir: str | Path, binding: RunTargetBinding) -> RunTargetBinding:
        with cls._LOCK:
            path = Path(run_dir) / cls.FILE_NAME
            existing = cls.read(run_dir)
            if existing is not None:
                same_identity = (
                    existing.run_id == binding.run_id
                    and existing.project_id == binding.project_id
                    and existing.target_id == binding.target_id
                    and existing.target_version_id == binding.target_version_id
                    and existing.target_config_hash == binding.target_config_hash
                )
                if not same_identity:
                    raise WorkbenchActionError(
                        code='RUN_TARGET_BINDING_CONFLICT',
                        message='该运行已锁定其他对象版本，不能覆盖。请创建新的运行。',
                        status_code=409,
                        details={'run_id': binding.run_id},
                    )
                return existing
            atomic_write_json(path, binding.model_dump(mode='json', exclude_none=True))
            return binding
