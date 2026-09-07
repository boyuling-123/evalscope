# Copyright (c) Alibaba, Inc. and its affiliates.
"""Stable contracts for workbench actions."""

from typing import Any, Dict, Literal, Optional
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field, model_validator


def _request_id() -> str:
    return f'req_{uuid4().hex}'


class WorkbenchModel(BaseModel):
    model_config = ConfigDict(extra='forbid', populate_by_name=True)


class ActionActor(WorkbenchModel):
    type: Literal['user', 'agent', 'system']
    id: str = Field(min_length=1, max_length=128)


class ActionRequest(WorkbenchModel):
    action: str = Field(pattern=r'^[a-z][a-z0-9_.-]{2,80}$')
    action_version: str = Field(default='1.0', pattern=r'^\d+\.\d+$')
    request_id: str = Field(default_factory=_request_id, min_length=5, max_length=128)
    idempotency_key: Optional[str] = Field(default=None, min_length=1, max_length=256)
    actor: ActionActor
    dry_run: bool = False
    confirmation_token: Optional[str] = Field(default=None, min_length=8, max_length=512)
    payload: Dict[str, Any] = Field(default_factory=dict)


class ActionFieldError(WorkbenchModel):
    field: str
    message: str
    type: str


class ActionErrorDetail(WorkbenchModel):
    code: str
    message: str
    field_errors: list[ActionFieldError] = Field(default_factory=list)
    retryable: bool = False
    details: Dict[str, Any] = Field(default_factory=dict)


class ActionResult(WorkbenchModel):
    verdict: Literal['ready', 'completed', 'blocked']
    blocking_reasons: list[str] = Field(default_factory=list)
    next_action: Optional[str] = None
    data: Dict[str, Any] = Field(default_factory=dict)


class ActionResponse(WorkbenchModel):
    ok: bool
    request_id: str
    result: Optional[ActionResult] = None
    warnings: list[str] = Field(default_factory=list)
    audit_event_id: Optional[str] = None
    error: Optional[ActionErrorDetail] = None

    @model_validator(mode='after')
    def validate_success_or_error(self):
        if self.ok and (self.result is None or self.error is not None):
            raise ValueError('successful action responses require result and forbid error')
        if not self.ok and (self.error is None or self.result is not None):
            raise ValueError('failed action responses require error and forbid result')
        return self


class ActionDescriptor(WorkbenchModel):
    name: str
    version: str
    access: Literal['read', 'draft', 'write']
    description: str
    when_to_use: str
    prerequisites: list[str] = Field(default_factory=list)
    next_action: Optional[str] = None
    supports_dry_run: bool
    requires_idempotency: bool
    requires_confirmation: bool
    input_schema: Dict[str, Any]
