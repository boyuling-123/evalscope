"""Offline smoke tests for the local EvalScope service."""


def test_service_boots_without_model_credentials(tmp_path, monkeypatch):
    monkeypatch.delenv('DASHSCOPE_API_KEY', raising=False)

    from evalscope.service.app import create_app

    app = create_app(outputs=str(tmp_path))
    app.config['TESTING'] = True
    client = app.test_client()

    health = client.get('/health')
    assert health.status_code == 200
    assert health.get_json()['status'] == 'ok'

    config = client.get('/api/v1/config')
    assert config.status_code == 200
    assert config.get_json() == {'outputs_root': str(tmp_path)}
    assert app.config['WORKBENCH_ROOT'] == str(tmp_path / '.evalscope-workbench')
