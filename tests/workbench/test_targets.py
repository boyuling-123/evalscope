import json

from evalscope.workbench import create_default_registry
from evalscope.workbench.targets import TargetCreatePayload, TargetStore


def action_request(action, payload=None, **overrides):
    request = {
        'action': action,
        'action_version': '1.0',
        'request_id': 'req_target_test_001',
        'actor': {'type': 'user', 'id': 'local-target-test-user'},
        'payload': payload or {},
    }
    request.update(overrides)
    return request


def confirmed_write(registry, action, payload, idempotency_key):
    preview = action_request(action, payload, dry_run=True, idempotency_key=idempotency_key)
    previewed = registry.execute(preview)
    assert previewed.ok
    token = previewed.result.data['confirmation']['token']
    return registry.execute({
        **preview,
        'request_id': f'req_{action.replace(".", "_")}_confirmed',
        'dry_run': False,
        'confirmation_token': token,
    })


def create_project(registry, name='中文 Agent 回归'):
    response = confirmed_write(registry, 'project.create', {'name': name}, f'create-{name}')
    assert response.ok
    return response.result.data['project']['id']


def target_payload(project_id, **overrides):
    payload = {
        'project_id': project_id,
        'name': '客服 Agent 生产候选',
        'type': 'agent',
        'description': '只保存接口契约，创建时不发起真实调用。',
        'capabilities': ['退款问答', '订单查询'],
        'version_label': '2026-09-candidate-1',
        'provider': '内部服务',
        'input_modalities': ['text'],
        'output_modalities': ['text'],
        'connection': {
            'adapter': 'http_json',
            'endpoint': 'http://127.0.0.1:8123/v1/invoke',
            'credential_ref': 'env:EVAL_TARGET_API_KEY',
            'input_field': 'request.input',
            'output_path': 'data.answer',
        },
    }
    payload.update(overrides)
    return payload


def create_target(registry, project_id, key='create-agent-target-v1', **overrides):
    response = confirmed_write(registry, 'target.create', target_payload(project_id, **overrides), key)
    assert response.ok
    return response


def test_target_preview_is_non_executing_and_does_not_expose_credential_reference(tmp_path):
    registry = create_default_registry(str(tmp_path))
    project_id = create_project(registry)
    payload = target_payload(project_id)

    response = registry.execute(
        action_request('target.create', payload, dry_run=True, idempotency_key='preview-agent-target')
    )

    assert response.ok
    assert response.result.verdict == 'ready'
    assert response.result.data['preview']['initial_status'] == 'draft'
    assert response.result.data['preview']['connection_status'] == 'untested'
    assert response.result.data['preview']['starts_connection_test'] is False
    assert not (tmp_path / 'projects' / project_id / 'targets').exists()
    assert payload['connection']['credential_ref'] not in json.dumps(response.model_dump(mode='json'))


def test_target_create_persists_immutable_version_as_untested_draft(tmp_path):
    registry = create_default_registry(str(tmp_path))
    project_id = create_project(registry)

    response = create_target(registry, project_id)
    detail = response.result.data['target']
    target = detail['target']
    version = detail['version']
    target_path = tmp_path / 'projects' / project_id / 'targets' / target['id'] / 'target.json'
    version_path = target_path.parent / 'versions' / f'{version["id"]}.json'

    assert target['status'] == 'draft'
    assert version['connection_status'] == 'untested'
    assert version['version_number'] == 1
    assert version['config_hash']
    assert version['connection']['credential_configured'] is True
    assert 'credential_ref' not in version['connection']
    assert target_path.is_file()
    assert version_path.is_file()
    stored_version = json.loads(version_path.read_text(encoding='utf-8'))
    assert stored_version['connection']['credential_ref'] == 'env:EVAL_TARGET_API_KEY'
    assert '真实试调通过前' in response.warnings[0]


def test_target_api_rejects_raw_secret_and_embedded_endpoint_credentials(tmp_path):
    registry = create_default_registry(str(tmp_path))
    project_id = create_project(registry)
    secret = 'never-persist-this-sensitive-value'
    with_secret = target_payload(project_id)
    with_secret['connection']['api_key'] = secret
    embedded = target_payload(project_id)
    embedded['connection']['endpoint'] = f'https://user:{secret}@example.test/v1/invoke?token={secret}'

    raw_secret = registry.execute(action_request('target.create', with_secret, dry_run=True))
    endpoint_secret = registry.execute(action_request('target.create', embedded, dry_run=True))

    assert raw_secret.error.code == 'VALIDATION_FAILED'
    assert endpoint_secret.error.code == 'VALIDATION_FAILED'
    assert secret not in json.dumps(raw_secret.model_dump(mode='json'))
    assert secret not in json.dumps(endpoint_secret.model_dump(mode='json'))
    persisted_text = '\n'.join(
        path.read_text(encoding='utf-8') for path in tmp_path.rglob('*') if path.is_file()
    )
    assert secret not in persisted_text


def test_target_list_and_get_are_project_scoped(tmp_path):
    registry = create_default_registry(str(tmp_path))
    project_a = create_project(registry, '项目 A')
    project_b = create_project(registry, '项目 B')
    created = create_target(registry, project_a)
    target_id = created.result.data['target']['target']['id']

    listed_a = registry.execute(action_request('target.list', {'project_id': project_a}))
    listed_b = registry.execute(action_request('target.list', {'project_id': project_b}))
    cross_project = registry.execute(
        action_request('target.get', {'project_id': project_b, 'target_id': target_id})
    )

    assert listed_a.result.data['count'] == 1
    assert listed_a.result.data['targets'][0]['target']['id'] == target_id
    assert 'EVAL_TARGET_API_KEY' not in listed_a.model_dump_json()
    assert listed_b.result.data['count'] == 0
    assert cross_project.error.code == 'TARGET_NOT_FOUND'


def test_target_list_skips_corrupted_manifest_with_warning(tmp_path):
    registry = create_default_registry(str(tmp_path))
    project_id = create_project(registry)
    created = create_target(registry, project_id)
    target_id = created.result.data['target']['target']['id']
    manifest = tmp_path / 'projects' / project_id / 'targets' / target_id / 'target.json'
    manifest.write_text('{broken', encoding='utf-8')

    response = registry.execute(action_request('target.list', {'project_id': project_id}))

    assert response.ok
    assert response.result.data['count'] == 0
    assert target_id in response.warnings[0]


def test_skill_target_requires_complete_runtime_binding(tmp_path):
    registry = create_default_registry(str(tmp_path))
    project_id = create_project(registry)

    response = registry.execute(
        action_request('target.create', target_payload(project_id, type='skill'), dry_run=True)
    )

    assert response.error.code == 'VALIDATION_FAILED'
    assert 'Skill 对象必须绑定宿主运行时' in response.error.field_errors[0].message


def test_target_store_rejects_operation_reuse_with_different_version_config(tmp_path):
    registry = create_default_registry(str(tmp_path))
    project_id = create_project(registry)
    store = TargetStore(str(tmp_path))
    operation_id = 'a' * 64
    original = TargetCreatePayload.model_validate(target_payload(project_id))
    changed = TargetCreatePayload.model_validate(target_payload(project_id, version_label='changed'))

    store.create(original, operation_id)

    try:
        store.create(changed, operation_id)
    except Exception as error:
        assert getattr(error, 'code', None) == 'IDEMPOTENCY_CONFLICT'
    else:
        raise AssertionError('reusing an operation ID with a changed immutable version must fail')
