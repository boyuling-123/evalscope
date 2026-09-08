# Copyright (c) Alibaba, Inc. and its affiliates.
"""Project-scoped run storage tests for the local workbench service."""

import json
from pathlib import Path
from types import SimpleNamespace

from evalscope.service.app import create_app
from evalscope.service.project_scope import ProjectScopeError, resolve_runs_root
from evalscope.workbench.projects import ProjectCreatePayload, ProjectStore
from evalscope.workbench.targets import (
    TargetConnectionCheckPayload,
    TargetCreatePayload,
    TargetGetPayload,
    TargetStore,
)


def _project(workspace: Path, operation: str = 'a' * 32):
    return ProjectStore(str(workspace)).create(
        ProjectCreatePayload(name='中文 Agent 回归'),
        operation,
    )


def _target(workspace: Path, project_id: str, operation: str = 'b' * 64, *, verified: bool = True):
    store = TargetStore(str(workspace))
    detail = store.create(
        TargetCreatePayload(
            project_id=project_id,
            name='客服模型',
            type='model',
            provider='本地服务',
            connection={
                'adapter': 'openai_chat_completions',
                'endpoint': 'http://127.0.0.1:8123/v1/chat/completions',
                'model_id': 'qwen-local',
                'credential_ref': 'env:BOUND_TARGET_API_KEY',
                'output_path': 'choices[0].message.content',
            },
        ),
        operation,
    )
    if verified:
        store.check_connection(
            TargetConnectionCheckPayload(
                project_id=project_id,
                target_id=detail.target.id,
                version_id=detail.version.id,
                sample_input='本地测试',
            ),
            'd' * 64,
        )
        detail = store.get(TargetGetPayload(
            project_id=project_id,
            target_id=detail.target.id,
            version_id=detail.version.id,
        ))
    return detail


def test_registered_project_resolves_to_its_reserved_runs_directory(tmp_path: Path) -> None:
    outputs = tmp_path / 'legacy-outputs'
    workspace = tmp_path / 'workbench'
    project = _project(workspace)
    app = create_app(outputs=str(outputs), workspace=str(workspace))

    with app.app_context():
        assert resolve_runs_root(project.id) == project.runs_path
        assert resolve_runs_root(None) == str(outputs.resolve())

    assert Path(project.runs_path).is_dir()


def test_project_progress_ignores_forged_legacy_root(tmp_path: Path) -> None:
    outputs = tmp_path / 'legacy-outputs'
    workspace = tmp_path / 'workbench'
    project = _project(workspace)
    task_id = 'eval_1700000000000'

    project_progress = Path(project.runs_path) / task_id / 'progress.json'
    project_progress.parent.mkdir(parents=True)
    project_progress.write_text(json.dumps({'percent': 72.0}), encoding='utf-8')

    legacy_progress = outputs / task_id / 'progress.json'
    legacy_progress.parent.mkdir(parents=True)
    legacy_progress.write_text(json.dumps({'percent': 3.0}), encoding='utf-8')

    client = create_app(outputs=str(outputs), workspace=str(workspace)).test_client()
    response = client.get(
        '/api/v1/eval/progress',
        query_string={
            'task_id': task_id,
            'project_id': project.id,
            'root_path': str(outputs),
        },
    )

    assert response.status_code == 200
    assert response.get_json()['percent'] == 72.0


def test_unknown_and_malformed_projects_fail_before_file_access(tmp_path: Path) -> None:
    client = create_app(workspace=str(tmp_path / 'workbench')).test_client()

    unknown = client.get(
        '/api/v1/perf/progress',
        query_string={'task_id': 'perf_1700000000000', 'project_id': f'prj_{"b" * 20}'},
    )
    malformed = client.get(
        '/api/v1/reports',
        query_string={'project_id': '../../outside', 'root_path': str(tmp_path)},
    )

    assert unknown.status_code == 404
    assert malformed.status_code == 400
    assert 'project_id' in malformed.get_json()['error']


def test_project_eval_requires_an_exact_target_version(tmp_path: Path, monkeypatch) -> None:
    workspace = tmp_path / 'workbench'
    project = _project(workspace)
    monkeypatch.setattr(
        'evalscope.service.blueprints.eval._execute_task',
        lambda *_args, **_kwargs: (_ for _ in ()).throw(AssertionError('invalid run must not execute')),
    )

    client = create_app(workspace=str(workspace)).test_client()
    response = client.post(
        '/api/v1/eval/invoke',
        headers={'EvalScope-Task-Id': 'eval_1700000000001'},
        json={
            'project_id': project.id,
            'model': 'model',
            'datasets': ['demo'],
            'api_url': 'http://example.test',
        },
    )

    assert response.status_code == 400
    assert 'target_id and target_version_id' in response.get_json()['error']


def test_eval_invoke_locks_verified_target_and_ignores_forged_connection_fields(
    tmp_path: Path,
    monkeypatch,
) -> None:
    workspace = tmp_path / 'workbench'
    project = _project(workspace)
    monkeypatch.setattr(
        'evalscope.workbench.targets._perform_http_trial',
        lambda *_args: {
            'status': 'passed',
            'http_status': 200,
            'duration_ms': 2,
            'output_type': 'str',
            'output_hash': 'f' * 64,
        },
    )
    target = _target(workspace, project.id)
    monkeypatch.setenv('BOUND_TARGET_API_KEY', 'server-only-secret')
    captured = {}

    def build_config(data):
        captured['payload'] = dict(data)
        return SimpleNamespace(model=data['model'], datasets=data['datasets'], work_dir='')

    monkeypatch.setattr('evalscope.service.blueprints.eval._build_task_config', build_config)
    def execute_task(_task_id, task_config, label, process_key):
        captured['work_dir'] = task_config.work_dir
        captured['process_key'] = process_key
        captured['api_key'] = task_config.api_key.get_secret_value()
        captured['label'] = label
        return {'status': 'completed'}

    monkeypatch.setattr('evalscope.service.blueprints.eval._execute_task', execute_task)
    client = create_app(workspace=str(workspace)).test_client()
    task_id = 'eval_1700000000002'

    response = client.post(
        '/api/v1/eval/invoke',
        headers={'EvalScope-Task-Id': task_id},
        json={
            'project_id': project.id,
            'target_id': target.target.id,
            'target_version_id': target.version.id,
            'datasets': ['demo'],
            'model': 'forged-model',
            'api_url': 'https://attacker.invalid/v1',
            'api_key': 'browser-forged-secret',
            'eval_type': 'mock_llm',
        },
    )

    assert response.status_code == 200
    assert captured['payload']['model'] == 'qwen-local'
    assert captured['payload']['model_id'] == 'qwen-local'
    assert captured['payload']['api_url'] == 'http://127.0.0.1:8123/v1/chat/completions'
    assert 'api_key' not in captured['payload']
    assert captured['api_key'] == 'server-only-secret'
    assert captured['payload']['eval_type'] == 'openai_api'
    assert captured['work_dir'] == str(Path(project.runs_path) / task_id)
    assert captured['process_key'] == f'{project.id}:{task_id}'
    binding_path = Path(project.runs_path) / task_id / 'target-binding.json'
    binding_text = binding_path.read_text(encoding='utf-8')
    binding = json.loads(binding_text)
    assert binding['target_version_id'] == target.version.id
    assert binding['target_config_hash'] == target.version.config_hash
    assert 'server-only-secret' not in binding_text
    assert 'BOUND_TARGET_API_KEY' not in binding_text
    manifest = TargetStore(str(workspace)).get(TargetGetPayload(
        project_id=project.id,
        target_id=target.target.id,
    )).target
    assert manifest.last_run_id == task_id

    resumed = client.post(
        '/api/v1/eval/resume/invoke',
        headers={'EvalScope-Task-Id': task_id},
        json={
            'project_id': project.id,
            'datasets': ['demo'],
            'model': 'forged-resume-model',
            'api_url': 'https://attacker.invalid/v1',
            'api_key': 'forged-resume-secret',
        },
    )
    assert resumed.status_code == 200
    assert captured['payload']['model'] == 'qwen-local'
    assert captured['payload']['api_url'] == 'http://127.0.0.1:8123/v1/chat/completions'
    assert captured['api_key'] == 'server-only-secret'


def test_eval_invoke_rejects_unverified_target_and_existing_run_rebinding(tmp_path: Path, monkeypatch) -> None:
    workspace = tmp_path / 'workbench'
    project = _project(workspace)
    monkeypatch.setattr(
        'evalscope.workbench.targets._perform_http_trial',
        lambda *_args: {
            'status': 'passed',
            'http_status': 200,
            'duration_ms': 2,
            'output_type': 'str',
            'output_hash': 'f' * 64,
        },
    )
    verified = _target(workspace, project.id)
    unverified = _target(workspace, project.id, operation='c' * 64, verified=False)
    monkeypatch.setenv('BOUND_TARGET_API_KEY', 'server-only-secret')
    monkeypatch.setattr(
        'evalscope.service.blueprints.eval._build_task_config',
        lambda data: SimpleNamespace(model=data['model'], datasets=data['datasets'], work_dir=''),
    )
    monkeypatch.setattr(
        'evalscope.service.blueprints.eval._execute_task',
        lambda *_args, **_kwargs: {'status': 'completed'},
    )
    client = create_app(workspace=str(workspace)).test_client()

    rejected = client.post(
        '/api/v1/eval/invoke',
        headers={'EvalScope-Task-Id': 'eval_1700000000003'},
        json={
            'project_id': project.id,
            'target_id': unverified.target.id,
            'target_version_id': unverified.version.id,
            'datasets': ['demo'],
        },
    )
    assert rejected.status_code == 409
    assert rejected.get_json()['code'] == 'TARGET_VERSION_NOT_VERIFIED'

    task_id = 'eval_1700000000004'
    created = client.post(
        '/api/v1/eval/invoke',
        headers={'EvalScope-Task-Id': task_id},
        json={
            'project_id': project.id,
            'target_id': verified.target.id,
            'target_version_id': verified.version.id,
            'datasets': ['demo'],
        },
    )
    rebound = client.post(
        '/api/v1/eval/invoke',
        headers={'EvalScope-Task-Id': task_id},
        json={
            'project_id': project.id,
            'target_id': unverified.target.id,
            'target_version_id': unverified.version.id,
            'datasets': ['demo'],
        },
    )

    assert created.status_code == 200
    assert rebound.status_code == 409
    assert rebound.get_json()['code'] == 'RUN_TARGET_BINDING_CONFLICT'


def test_resume_keeps_legacy_unbound_project_runs_usable(tmp_path: Path, monkeypatch) -> None:
    workspace = tmp_path / 'workbench'
    project = _project(workspace)
    task_id = 'eval_legacy_project_run'
    (Path(project.runs_path) / task_id).mkdir(parents=True)
    captured = {}

    def build_config(data):
        captured.update(data)
        return SimpleNamespace(model=data['model'], datasets=data['datasets'], work_dir='')

    monkeypatch.setattr('evalscope.service.blueprints.eval._build_task_config', build_config)
    monkeypatch.setattr(
        'evalscope.service.blueprints.eval._execute_task',
        lambda *_args, **_kwargs: {'status': 'completed'},
    )

    response = create_app(workspace=str(workspace)).test_client().post(
        '/api/v1/eval/resume/invoke',
        headers={'EvalScope-Task-Id': task_id},
        json={
            'project_id': project.id,
            'model': 'legacy-local-model',
            'datasets': ['demo'],
            'api_url': 'http://127.0.0.1:8123/v1/chat/completions',
        },
    )

    assert response.status_code == 200
    assert captured['model'] == 'legacy-local-model'
    assert not (Path(project.runs_path) / task_id / 'target-binding.json').exists()


def test_perf_invoke_uses_the_same_project_runs_directory(tmp_path: Path, monkeypatch) -> None:
    workspace = tmp_path / 'workbench'
    project = _project(workspace, operation='c' * 32)
    perf_args = SimpleNamespace(model='model', url='http://example.test', api='openai')
    captured = {}

    def run_in_subprocess(*_args, **kwargs):
        captured['process_key'] = kwargs['task_id']
        return {'rps': 1}

    monkeypatch.setattr('evalscope.service.blueprints.perf.PerfArguments.from_dict', lambda _data: perf_args)
    monkeypatch.setattr('evalscope.service.blueprints.perf.create_log_file', lambda *_args, **_kwargs: '')
    monkeypatch.setattr('evalscope.service.blueprints.perf.run_in_subprocess', run_in_subprocess)
    monkeypatch.setattr('evalscope.service.blueprints.perf._build_perf_table', lambda *_args, **_kwargs: 'table')

    client = create_app(workspace=str(workspace)).test_client()
    response = client.post(
        '/api/v1/perf/invoke',
        headers={'EvalScope-Task-Id': 'perf_1700000000001'},
        json={'project_id': project.id, 'model': 'model', 'url': 'http://example.test'},
    )

    assert response.status_code == 200
    assert perf_args.outputs_dir == str(Path(project.runs_path) / 'perf_1700000000001')
    assert captured['process_key'] == f'{project.id}:perf_1700000000001'


def test_project_stop_uses_a_project_qualified_process_key(tmp_path: Path, monkeypatch) -> None:
    workspace = tmp_path / 'workbench'
    project = _project(workspace)
    task_id = 'eval_same_name'
    (Path(project.runs_path) / task_id).mkdir(parents=True)
    stopped = []

    monkeypatch.setattr(
        'evalscope.service.blueprints.eval.stop_process',
        lambda process_key: stopped.append(process_key) or True,
    )

    client = create_app(workspace=str(workspace)).test_client()
    response = client.post(
        '/api/v1/eval/stop',
        query_string={'task_id': task_id, 'project_id': project.id},
    )

    assert response.status_code == 200
    assert stopped == [f'{project.id}:{task_id}']


def test_resolver_rejects_a_project_manifest_outside_registered_directory(tmp_path: Path, monkeypatch) -> None:
    workspace = tmp_path / 'workbench'
    project = _project(workspace)
    app = create_app(workspace=str(workspace))

    monkeypatch.setattr(
        ProjectStore,
        'get',
        lambda _store, _project_id: project.model_copy(update={'root_path': str(tmp_path / 'outside')}),
    )

    with app.app_context():
        try:
            resolve_runs_root(project.id)
        except ProjectScopeError as error:
            assert error.status_code == 409
        else:
            raise AssertionError('mismatched project root must be rejected')
