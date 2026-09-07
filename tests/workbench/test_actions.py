import json

from evalscope.workbench import create_default_registry
from evalscope.workbench.contracts import ActionRequest


def action_request(action, payload=None, **overrides):
    request = {
        'action': action,
        'action_version': '1.0',
        'request_id': 'req_test_001',
        'actor': {'type': 'user', 'id': 'local-test-user'},
        'payload': payload or {},
    }
    request.update(overrides)
    return request


def preview_project(registry, payload=None, **overrides):
    request = action_request(
        'project.create',
        payload or {'name': '退款客服评测', 'description': '本地回归项目'},
        dry_run=True,
        idempotency_key='create-refund-project-v1',
        **overrides,
    )
    response = registry.execute(request)
    assert response.ok
    assert response.result.verdict == 'ready'
    return request, response.result.data['confirmation']['token']


def test_discovery_only_exposes_registered_actions(tmp_path):
    registry = create_default_registry(str(tmp_path))

    response = registry.execute(action_request('capabilities.discover'))

    assert response.ok
    actions = response.result.data['actions']
    names = {item['name'] for item in actions}
    assert names == {
        'capabilities.discover',
        'project.create',
        'project.get',
        'project.list',
        'target.create',
        'target.get',
        'target.list',
    }
    assert all(item['next_action'] in names for item in actions if item.get('next_action'))
    assert 'dataset.inspect' not in json.dumps(response.model_dump(mode='json'), ensure_ascii=False)


def test_project_create_dry_run_only_writes_confirmation_and_audit(tmp_path):
    registry = create_default_registry(str(tmp_path))

    _, token = preview_project(registry)

    assert token.startswith('confirm_')
    assert not (tmp_path / 'projects').exists()
    assert len(list((tmp_path / '.action-state' / 'confirmations').glob('*.json'))) == 1
    assert (tmp_path / 'audit' / 'events.jsonl').is_file()


def test_project_create_requires_idempotency_and_confirmation(tmp_path):
    registry = create_default_registry(str(tmp_path))
    payload = {'name': '退款客服评测'}

    missing_key = registry.execute(action_request('project.create', payload))
    missing_confirmation = registry.execute(
        action_request('project.create', payload, idempotency_key='create-refund-project-v1')
    )

    assert missing_key.error.code == 'IDEMPOTENCY_KEY_REQUIRED'
    assert missing_confirmation.error.code == 'CONFIRMATION_REQUIRED'


def test_project_create_replays_same_operation_and_rejects_changed_payload(tmp_path):
    registry = create_default_registry(str(tmp_path))
    preview, token = preview_project(registry)
    actual = {
        **preview,
        'request_id': 'req_create_001',
        'dry_run': False,
        'confirmation_token': token,
    }

    created = registry.execute(actual)
    replayed = registry.execute({**actual, 'request_id': 'req_create_002'})
    conflict = registry.execute({
        **actual,
        'request_id': 'req_create_003',
        'payload': {'name': '另一个项目'},
    })

    assert created.ok
    assert created.result.verdict == 'completed'
    project = created.result.data['project']
    assert project['id'].startswith('prj_')
    assert (tmp_path / 'projects' / project['id'] / 'project.json').is_file()
    assert (tmp_path / 'projects' / project['id'] / 'runs').is_dir()
    assert project['runs_path'].endswith('/runs')
    assert replayed.ok
    assert replayed.result.data['project']['id'] == project['id']
    assert '重复提交' in replayed.warnings[0]
    assert conflict.error.code == 'IDEMPOTENCY_CONFLICT'
    assert len(list((tmp_path / 'projects').glob('prj_*'))) == 1


def test_confirmation_is_bound_to_actor_and_payload(tmp_path):
    registry = create_default_registry(str(tmp_path))
    preview, token = preview_project(registry)

    response = registry.execute({
        **preview,
        'dry_run': False,
        'confirmation_token': token,
        'actor': {'type': 'agent', 'id': 'another-caller'},
    })

    assert response.error.code == 'CONFIRMATION_INVALID'
    assert not (tmp_path / 'projects').exists()


def test_project_list_and_get_return_portable_manifest(tmp_path):
    registry = create_default_registry(str(tmp_path))
    preview, token = preview_project(registry)
    created = registry.execute({**preview, 'dry_run': False, 'confirmation_token': token})
    project_id = created.result.data['project']['id']

    listed = registry.execute(action_request('project.list'))
    fetched = registry.execute(action_request('project.get', {'project_id': project_id}))

    assert listed.result.data['count'] == 1
    assert listed.result.data['projects'][0]['id'] == project_id
    assert fetched.result.data['project']['name'] == '退款客服评测'
    assert fetched.result.next_action == 'project.list'


def test_unknown_action_and_invalid_payload_are_structured(tmp_path):
    registry = create_default_registry(str(tmp_path))

    unknown = registry.execute(action_request('unknown.action'))
    invalid = registry.execute(action_request('project.create', {'name': '   '}, dry_run=True))

    assert unknown.error.code == 'ACTION_NOT_FOUND'
    assert unknown.error.details['available_actions']
    assert invalid.error.code == 'VALIDATION_FAILED'
    assert invalid.error.field_errors[0].field == 'name'


def test_audit_does_not_store_raw_actor_payload_or_confirmation(tmp_path):
    registry = create_default_registry(str(tmp_path))
    secret_value = 'raw-secret-must-not-appear'
    preview, token = preview_project(
        registry,
        payload={'name': '脱敏检查', 'description': secret_value},
        actor={'type': 'agent', 'id': secret_value},
    )
    registry.execute({**preview, 'dry_run': False, 'confirmation_token': token})

    audit = (tmp_path / 'audit' / 'events.jsonl').read_text(encoding='utf-8')

    assert secret_value not in audit
    assert token not in audit
    events = [json.loads(line) for line in audit.splitlines()]
    assert all(event['payload_hash'] for event in events)
    assert all(event['actor_id_hash'] for event in events)


def test_corrupted_idempotency_record_returns_safe_error(tmp_path):
    registry = create_default_registry(str(tmp_path))
    preview, token = preview_project(registry)
    actual = {**preview, 'dry_run': False, 'confirmation_token': token}
    created = registry.execute(actual)
    assert created.ok
    request = ActionRequest.model_validate(actual)
    operation_id = registry.state.operation_id(request)
    record = tmp_path / '.action-state' / 'idempotency' / f'{operation_id}.json'
    record.write_text('{broken', encoding='utf-8')

    response = registry.execute(actual)

    assert response.error.code == 'STORAGE_CORRUPTED'
    assert response.error.details['record'] == record.name
