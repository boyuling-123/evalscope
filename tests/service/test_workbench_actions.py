from evalscope.service.app import create_app
from evalscope.workbench.projects import ProjectCreatePayload, ProjectStore


def action_request(action, payload=None, **overrides):
    request = {
        'action': action,
        'action_version': '1.0',
        'request_id': 'req_http_001',
        'actor': {'type': 'user', 'id': 'local-http-user'},
        'payload': payload or {},
    }
    request.update(overrides)
    return request


def test_workbench_action_endpoint_uses_explicit_workspace(tmp_path):
    app = create_app(outputs=str(tmp_path / 'outputs'), workspace=str(tmp_path / 'workspace'))
    app.config['TESTING'] = True
    client = app.test_client()

    response = client.post(
        '/api/v1/workbench/actions/execute',
        json=action_request('capabilities.discover'),
    )

    assert response.status_code == 200
    assert response.get_json()['result']['data']['count'] == 9
    assert app.config['WORKBENCH_ROOT'] == str(tmp_path / 'workspace')


def test_workbench_endpoint_returns_http_status_for_structured_errors(tmp_path):
    app = create_app(workspace=str(tmp_path))
    app.config['TESTING'] = True
    client = app.test_client()

    missing = client.post(
        '/api/v1/workbench/actions/execute',
        json=action_request('project.get', {'project_id': 'prj_aaaaaaaaaaaaaaaaaaaa'}),
    )
    project = ProjectStore(str(tmp_path)).create(ProjectCreatePayload(name='接口状态测试'), 'b' * 64)
    missing_target = client.post(
        '/api/v1/workbench/actions/execute',
        json=action_request(
            'target.get',
            {
                'project_id': project.id,
                'target_id': 'tgt_aaaaaaaaaaaaaaaaaaaa',
            },
        ),
    )
    malformed = client.post('/api/v1/workbench/actions/execute', data='{broken', content_type='application/json')

    assert missing.status_code == 404
    assert missing.get_json()['error']['code'] == 'PROJECT_NOT_FOUND'
    assert missing_target.status_code == 404
    assert missing_target.get_json()['error']['code'] == 'TARGET_NOT_FOUND'
    assert malformed.status_code == 400
    assert malformed.get_json()['error']['code'] == 'VALIDATION_FAILED'
