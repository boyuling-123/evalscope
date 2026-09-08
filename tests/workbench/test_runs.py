# Copyright (c) Alibaba, Inc. and its affiliates.
"""Immutable run-to-target binding tests."""

import json

from evalscope.workbench.runs import RunBindingStore, RunTargetBinding


def binding(**overrides):
    values = {
        'run_id': 'eval_1700000000001',
        'project_id': f'prj_{"a" * 20}',
        'target_id': f'tgt_{"b" * 20}',
        'target_name': '客服模型',
        'target_type': 'model',
        'target_version_id': f'tgv_{"c" * 20}',
        'target_version_number': 2,
        'target_version_label': 'production-2',
        'target_config_hash': 'd' * 64,
        'adapter': 'openai_chat_completions',
        'model_id': 'qwen-local',
        'bound_at': '2026-09-08T00:00:00+00:00',
    }
    values.update(overrides)
    return RunTargetBinding.model_validate(values)


def test_run_binding_is_idempotent_and_contains_no_connection_secret(tmp_path):
    run_dir = tmp_path / 'eval_1700000000001'
    first = RunBindingStore.bind(run_dir, binding())
    replayed = RunBindingStore.bind(
        run_dir,
        binding(bound_at='2026-09-08T00:01:00+00:00'),
    )
    stored = json.loads((run_dir / 'target-binding.json').read_text(encoding='utf-8'))

    assert replayed == first
    assert stored['target_version_id'] == f'tgv_{"c" * 20}'
    assert 'credential' not in json.dumps(stored)
    assert 'endpoint' not in stored


def test_run_binding_rejects_rebinding_an_existing_run(tmp_path):
    run_dir = tmp_path / 'eval_1700000000001'
    RunBindingStore.bind(run_dir, binding())

    try:
        RunBindingStore.bind(run_dir, binding(target_version_id=f'tgv_{"e" * 20}'))
    except Exception as error:
        assert getattr(error, 'code', None) == 'RUN_TARGET_BINDING_CONFLICT'
    else:
        raise AssertionError('an existing run must not be rebound to a different target version')


def test_run_binding_rejects_a_record_copied_to_another_run_directory(tmp_path):
    source = tmp_path / 'eval_1700000000001'
    other = tmp_path / 'eval_1700000000002'
    RunBindingStore.bind(source, binding())
    other.mkdir()
    (other / 'target-binding.json').write_bytes((source / 'target-binding.json').read_bytes())

    try:
        RunBindingStore.read(other)
    except Exception as error:
        assert getattr(error, 'code', None) == 'STORAGE_CORRUPTED'
    else:
        raise AssertionError('a binding copied to another run directory must be rejected')
