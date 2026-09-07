import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread

from evalscope.workbench import create_default_registry
from evalscope.workbench.persistence import content_hash
from evalscope.workbench.targets import TargetCreatePayload, TargetGetPayload, TargetStore, _perform_http_trial


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


def connection_check_request(target, *, key='check-agent-target-v1', sample_input=None):
    detail = target.result.data['target']
    return action_request(
        'target.connection.check',
        {
            'project_id': detail['target']['project_id'],
            'target_id': detail['target']['id'],
            'version_id': detail['version']['id'],
            'sample_input': sample_input if sample_input is not None else {'question': '退款多久到账？'},
        },
        dry_run=True,
        idempotency_key=key,
    )


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


def test_target_api_rejects_malformed_field_paths(tmp_path):
    registry = create_default_registry(str(tmp_path))
    project_id = create_project(registry)

    for field, malformed in (
        ('input_field', 'request..input'),
        ('output_path', 'choices[abc].message.content'),
        ('output_path', 'data.answer.'),
    ):
        payload = target_payload(project_id)
        payload['connection'][field] = malformed
        response = registry.execute(action_request('target.create', payload, dry_run=True))

        assert response.error.code == 'VALIDATION_FAILED'
        assert any(item.field == f'connection.{field}' for item in response.error.field_errors)


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


def test_connection_check_preview_and_unconfirmed_request_never_call_target(tmp_path, monkeypatch):
    registry = create_default_registry(str(tmp_path))
    project_id = create_project(registry)
    target = create_target(registry, project_id)
    request = connection_check_request(target)

    def unexpected_probe(*_args):
        raise AssertionError('preview or unconfirmed request must not call the target')

    monkeypatch.setattr('evalscope.workbench.targets._perform_http_trial', unexpected_probe)
    preview = registry.execute(request)
    unconfirmed = registry.execute({**request, 'dry_run': False})

    assert preview.ok
    assert preview.result.verdict == 'ready'
    assert preview.result.data['preview']['starts_external_call'] is True
    assert preview.result.data['preview']['may_consume_model_quota'] is True
    assert preview.result.data['preview']['persists_sample_input'] is False
    assert preview.result.data['confirmation']['token'].startswith('confirm_')
    assert unconfirmed.error.code == 'CONFIRMATION_REQUIRED'
    assert not list((tmp_path / 'projects' / project_id).rglob('connection_checks/*.json'))


def test_confirmed_connection_check_promotes_target_without_persisting_payload_or_secret(tmp_path, monkeypatch):
    registry = create_default_registry(str(tmp_path))
    project_id = create_project(registry)
    target = create_target(registry, project_id)
    request = connection_check_request(target, sample_input={'private_case': 'do-not-persist'})
    calls = []

    def successful_probe(version, sample_input):
        calls.append((version.id, sample_input))
        return {
            'status': 'passed',
            'http_status': 200,
            'duration_ms': 12,
            'output_type': 'dict',
            'output_hash': content_hash({'answer': 'ok'}),
        }

    monkeypatch.setattr('evalscope.workbench.targets._perform_http_trial', successful_probe)
    preview = registry.execute(request)
    confirmed = registry.execute({
        **request,
        'request_id': 'req_connection_confirmed',
        'dry_run': False,
        'confirmation_token': preview.result.data['confirmation']['token'],
    })
    replayed = registry.execute({
        **request,
        'request_id': 'req_connection_replayed',
        'dry_run': False,
        'confirmation_token': preview.result.data['confirmation']['token'],
    })

    assert confirmed.ok
    assert confirmed.result.data['check']['status'] == 'passed'
    assert confirmed.result.data['target']['target']['status'] == 'ready'
    assert confirmed.result.data['target']['version']['connection_status'] == 'passed'
    assert confirmed.result.data['target']['version']['last_connected_at']
    assert len(calls) == 1
    assert replayed.ok
    assert '重复提交' in replayed.warnings[-1]
    persisted = '\n'.join(
        path.read_text(encoding='utf-8') for path in (tmp_path / 'projects' / project_id).rglob('*.json')
    )
    response_json = confirmed.model_dump_json()
    assert 'do-not-persist' not in persisted
    assert 'do-not-persist' not in response_json
    assert 'EVAL_TARGET_API_KEY' not in response_json


def test_failed_connection_check_keeps_target_out_of_candidate_pool(tmp_path, monkeypatch):
    registry = create_default_registry(str(tmp_path))
    project_id = create_project(registry)
    target = create_target(registry, project_id)
    request = connection_check_request(target)

    monkeypatch.setattr(
        'evalscope.workbench.targets._perform_http_trial',
        lambda *_args: {
            'status': 'failed',
            'http_status': 503,
            'duration_ms': 9,
            'error_code': 'HTTP_STATUS_ERROR',
        },
    )
    preview = registry.execute(request)
    response = registry.execute({
        **request,
        'dry_run': False,
        'confirmation_token': preview.result.data['confirmation']['token'],
    })

    assert response.ok
    assert response.result.data['check']['status'] == 'failed'
    assert response.result.data['check']['error_code'] == 'HTTP_STATUS_ERROR'
    assert response.result.data['target']['target']['status'] == 'unavailable'
    assert response.result.data['target']['version']['connection_status'] == 'failed'
    assert 'last_connected_at' not in response.result.data['target']['version']
    assert '不会进入正式候选池' in response.warnings[0]


def test_evalscope_model_trial_is_blocked_without_issuing_confirmation(tmp_path):
    registry = create_default_registry(str(tmp_path))
    project_id = create_project(registry)
    target = create_target(
        registry,
        project_id,
        connection={
            'adapter': 'evalscope_model',
            'model_id': 'local-demo-model',
            'input_field': 'input',
            'output_path': 'output',
        },
    )

    response = registry.execute(connection_check_request(target))

    assert response.ok
    assert response.result.verdict == 'blocked'
    assert 'confirmation' not in response.result.data
    assert response.result.data['preview']['starts_external_call'] is False
    assert '尚未实现' in response.result.blocking_reasons[0]


def test_http_trial_uses_server_credential_and_real_field_mapping_without_returning_content(tmp_path, monkeypatch):
    captured = {}

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):
            length = int(self.headers.get('Content-Length', '0'))
            captured['authorization'] = self.headers.get('Authorization')
            captured['payload'] = json.loads(self.rfile.read(length))
            response = json.dumps({'data': {'answer': '本地 Mock 响应'}}, ensure_ascii=False).encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(response)))
            self.end_headers()
            self.wfile.write(response)

        def log_message(self, _format, *_args):
            return

    server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    monkeypatch.setenv('EVAL_TARGET_API_KEY', 'local-mock-secret')
    try:
        registry = create_default_registry(str(tmp_path))
        project_id = create_project(registry)
        target = create_target(
            registry,
            project_id,
            connection={
                'adapter': 'http_json',
                'endpoint': f'http://127.0.0.1:{server.server_port}/invoke',
                'credential_ref': 'env:EVAL_TARGET_API_KEY',
                'input_field': 'request.input',
                'output_path': 'data.answer',
            },
        )
        detail = target.result.data['target']
        version = TargetStore(str(tmp_path)).get(TargetGetPayload(
            project_id=project_id,
            target_id=detail['target']['id'],
            version_id=detail['version']['id'],
        )).version

        outcome = _perform_http_trial(version, {'question': '你好'})
    finally:
        server.shutdown()
        thread.join(timeout=2)
        server.server_close()

    assert outcome['status'] == 'passed', outcome
    assert outcome['http_status'] == 200
    assert outcome['output_type'] == 'str'
    assert outcome['output_hash'] == content_hash('本地 Mock 响应')
    assert '本地 Mock 响应' not in json.dumps(outcome, ensure_ascii=False)
    assert captured['authorization'] == 'Bearer local-mock-secret'
    assert captured['payload'] == {'request': {'input': {'question': '你好'}}}
