# Copyright (c) Alibaba, Inc. and its affiliates.
"""Structured failures that are safe to return to action callers."""

from dataclasses import dataclass, field
from typing import Any, Dict


@dataclass
class WorkbenchActionError(Exception):
    code: str
    message: str
    status_code: int = 400
    field_errors: list[Dict[str, str]] = field(default_factory=list)
    retryable: bool = False
    details: Dict[str, Any] = field(default_factory=dict)

    def __post_init__(self):
        super().__init__(self.message)
