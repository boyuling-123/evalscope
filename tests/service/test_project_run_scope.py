# Copyright (c) Alibaba, Inc. and its affiliates.
"""Project-scoped run storage tests for the local workbench service."""

import json
from pathlib import Path
from types import SimpleNamespace

from evalscope.service.app import create_app
from evalscope.service.project_scope import ProjectScopeError, resolve_runs_root
from evalscope.workbench.projects import ProjectCreatePayload, ProjectStore


def _project(workspace: Path, operation: str = 'a' * 32):
    return ProjectStore(str(workspace)).create(
        ProjectCreatePayload(name='中文 Agent 回归'),
        operation,
    )


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


def test_eval_invoke_uses_project_runs_without_leaking_scope_into_task_config(tmp_path: Path, monkeypatch) -> None:
    workspace = tmp_path / 'workbench'
    project = _project(workspace)
    captured = {}

    def build_config(data):
        captured['payload'] = data
        return SimpleNamespace(model='model', datasets=['demo'], work_dir='')

    def execute_task(_task_id, task_config, label, process_key):
        captured['work_dir'] = task_config.work_dir
        captured['label'] = label
        captured['process_key'] = process_key
        return {'status': 'completed'}

    monkeypatch.setattr('evalscope.service.blueprints.eval._build_task_config', build_config)
    monkeypatch.setattr('evalscope.service.blueprints.eval._execute_task', execute_task)

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

    assert response.status_code == 200
    assert 'project_id' not in captured['payload']
    assert captured['work_dir'] == str(Path(project.runs_path) / 'eval_1700000000001')
    assert captured['process_key'] == f'{project.id}:eval_1700000000001'


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
