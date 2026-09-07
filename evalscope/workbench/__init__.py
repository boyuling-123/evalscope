# Copyright (c) Alibaba, Inc. and its affiliates.
"""Local-first product layer shared by Web, API, MCP and assistants."""

from .actions import ActionRegistry, create_default_registry
from .contracts import ActionRequest, ActionResponse

__all__ = ['ActionRegistry', 'ActionRequest', 'ActionResponse', 'create_default_registry']
