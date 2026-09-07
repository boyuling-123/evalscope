# Copyright (c) Alibaba, Inc. and its affiliates.
"""Small, recoverable file primitives for the local workbench."""

import hashlib
import json
import os
import secrets
from datetime import datetime, timezone
from pathlib import Path
from threading import RLock
from typing import Any, Dict, Optional
from uuid import uuid4

from .contracts import ActionRequest, ActionResponse
from .errors import WorkbenchActionError

_JSON_LOCK = RLock()


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(',', ':'), sort_keys=True)


def content_hash(value: Any) -> str:
    return hashlib.sha256(canonical_json(value).encode('utf-8')).hexdigest()


def atomic_write_json(path: Path, payload: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f'.{path.name}.{uuid4().hex}.tmp')
    try:
        with temporary.open('w', encoding='utf-8') as handle:
            handle.write(canonical_json(payload))
            handle.write('\n')
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def append_jsonl(path: Path, payload: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    line = f'{canonical_json(payload)}\n'
    with _JSON_LOCK, path.open('a', encoding='utf-8') as handle:
        handle.write(line)
        handle.flush()
        os.fsync(handle.fileno())


class ActionStateStore:
    """Persists idempotency outcomes and payload-free audit events."""

    def __init__(self, workspace_root: str):
        self.root = Path(workspace_root).expanduser().resolve()

    @staticmethod
    def request_fingerprint(request: ActionRequest) -> str:
        return content_hash(
            {
                'action': request.action,
                'action_version': request.action_version,
                'actor': request.actor.model_dump(mode='json'),
                'payload': request.payload,
            }
        )

    @staticmethod
    def operation_id(request: ActionRequest) -> Optional[str]:
        if not request.idempotency_key:
            return None
        return content_hash(
            {
                'action': request.action,
                'actor': request.actor.model_dump(mode='json'),
                'idempotency_key': request.idempotency_key,
            }
        )

    def replay(self, request: ActionRequest, fingerprint: str) -> Optional[ActionResponse]:
        operation_id = self.operation_id(request)
        if operation_id is None:
            return None
        path = self.root / '.action-state' / 'idempotency' / f'{operation_id}.json'
        if not path.is_file():
            return None
        try:
            record = json.loads(path.read_text(encoding='utf-8'))
            if record['fingerprint'] != fingerprint:
                raise WorkbenchActionError(
                    code='IDEMPOTENCY_CONFLICT',
                    message='同一幂等键已用于不同参数，请更换幂等键后重试。',
                    status_code=409,
                    details={'action': request.action},
                )
            response = ActionResponse.model_validate(record['response'])
        except WorkbenchActionError:
            raise
        except (OSError, KeyError, json.JSONDecodeError, ValueError) as error:
            raise WorkbenchActionError(
                code='STORAGE_CORRUPTED',
                message='幂等记录无法读取，请先检查本地工作区完整性。',
                status_code=500,
                details={'record': path.name, 'error_type': type(error).__name__},
            ) from None
        return response.model_copy(update={'request_id': request.request_id})

    def remember(self, request: ActionRequest, fingerprint: str, response: ActionResponse) -> None:
        operation_id = self.operation_id(request)
        if operation_id is None:
            return
        path = self.root / '.action-state' / 'idempotency' / f'{operation_id}.json'
        atomic_write_json(
            path,
            {
                'schema_version': 1,
                'fingerprint': fingerprint,
                'response': response.model_dump(mode='json', exclude_none=True),
            },
        )

    def issue_confirmation(self, request: ActionRequest, fingerprint: str) -> Dict[str, str]:
        token = f'confirm_{secrets.token_urlsafe(32)}'
        token_hash = hashlib.sha256(token.encode('utf-8')).hexdigest()
        expires_at = datetime.now(timezone.utc).timestamp() + 30 * 60
        path = self.root / '.action-state' / 'confirmations' / f'{token_hash}.json'
        atomic_write_json(
            path,
            {
                'schema_version': 1,
                'token_hash': token_hash,
                'fingerprint': fingerprint,
                'action': request.action,
                'actor_id_hash': hashlib.sha256(request.actor.id.encode('utf-8')).hexdigest(),
                'expires_at': expires_at,
                'consumed': False,
            },
        )
        return {
            'token': token,
            'expires_at': datetime.fromtimestamp(expires_at, timezone.utc).isoformat(),
        }

    def validate_confirmation(self, request: ActionRequest, fingerprint: str) -> Path:
        token = request.confirmation_token
        if token is None:
            raise WorkbenchActionError(
                code='CONFIRMATION_REQUIRED',
                message='该写操作必须先 dry_run，并携带预览返回的确认凭据。',
                status_code=409,
            )
        token_hash = hashlib.sha256(token.encode('utf-8')).hexdigest()
        path = self.root / '.action-state' / 'confirmations' / f'{token_hash}.json'
        try:
            record = json.loads(path.read_text(encoding='utf-8'))
        except FileNotFoundError:
            raise WorkbenchActionError(
                code='CONFIRMATION_INVALID',
                message='确认凭据不存在或已失效，请重新预览。',
                status_code=409,
            ) from None
        except (OSError, json.JSONDecodeError, ValueError) as error:
            raise WorkbenchActionError(
                code='STORAGE_CORRUPTED',
                message='确认记录无法读取，请检查本地工作区完整性。',
                status_code=500,
                details={'record': path.name, 'error_type': type(error).__name__},
            ) from None

        actor_id_hash = hashlib.sha256(request.actor.id.encode('utf-8')).hexdigest()
        matches_request = (
            record.get('token_hash') == token_hash
            and record.get('fingerprint') == fingerprint
            and record.get('action') == request.action
            and record.get('actor_id_hash') == actor_id_hash
        )
        if not matches_request:
            raise WorkbenchActionError(
                code='CONFIRMATION_INVALID',
                message='确认凭据与当前操作不匹配，请重新预览。',
                status_code=409,
            )
        if record.get('consumed'):
            raise WorkbenchActionError(
                code='CONFIRMATION_ALREADY_USED',
                message='确认凭据已使用，请检查原操作结果或重新预览。',
                status_code=409,
            )
        if float(record.get('expires_at', 0)) <= datetime.now(timezone.utc).timestamp():
            raise WorkbenchActionError(
                code='CONFIRMATION_EXPIRED',
                message='确认凭据已过期，请重新预览。',
                status_code=409,
            )
        return path

    @staticmethod
    def consume_confirmation(path: Path) -> None:
        try:
            record = json.loads(path.read_text(encoding='utf-8'))
            record['consumed'] = True
            record['consumed_at'] = datetime.now(timezone.utc).isoformat()
            atomic_write_json(path, record)
        except (OSError, json.JSONDecodeError, ValueError) as error:
            raise WorkbenchActionError(
                code='STORAGE_CORRUPTED',
                message='确认记录无法更新，请检查本地工作区完整性。',
                status_code=500,
                details={'record': path.name, 'error_type': type(error).__name__},
            ) from None

    def audit(
        self,
        request: ActionRequest,
        outcome: str,
        fingerprint: str,
        *,
        error_code: Optional[str] = None,
        parent_event_id: Optional[str] = None,
    ) -> str:
        event_id = f'audit_{uuid4().hex}'
        append_jsonl(
            self.root / 'audit' / 'events.jsonl',
            {
                'schema_version': 1,
                'event_id': event_id,
                'parent_event_id': parent_event_id,
                'timestamp': datetime.now(timezone.utc).isoformat(),
                'request_id': request.request_id,
                'action': request.action,
                'action_version': request.action_version,
                'actor_type': request.actor.type,
                'actor_id_hash': hashlib.sha256(request.actor.id.encode('utf-8')).hexdigest(),
                'dry_run': request.dry_run,
                'payload_hash': fingerprint,
                'outcome': outcome,
                'error_code': error_code,
            },
        )
        return event_id
