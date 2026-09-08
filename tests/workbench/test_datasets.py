import json

from evalscope.workbench import create_default_registry
from evalscope.workbench.persistence import content_hash


def action_request(action, payload=None, **overrides):
    request = {
        'action': action,
        'action_version': '1.0',
        'request_id': 'req_dataset_test_001',
        'actor': {'type': 'user', 'id': 'local-dataset-test-user'},
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


def create_project(registry):
    response = confirmed_write(
        registry,
        'project.create',
        {'name': '中文客服回归'},
        'create-dataset-test-project',
    )
    assert response.ok
    return response.result.data['project']['id']


def dataset_payload(project_id):
    return {
        'project_id': project_id,
        'name': '退款意图金标集',
        'description': '来自已确认字段映射的本地导入包。',
        'type': 'conversation',
        'version_label': '2026-09-baseline',
        'schema': {
            'fields': [
                {'name': 'sample_id', 'type': 'string', 'role': 'id', 'required': True},
                {'name': 'prompt', 'type': 'string', 'role': 'input', 'required': True},
                {'name': 'gold_answer', 'type': 'string', 'role': 'expected'},
                {'name': 'intent', 'type': 'string', 'role': 'label'},
            ]
        },
        'cases': [
            {
                'case_id': 'dsc_aaaaaaaaaaaaaaaaaaaa',
                'input': {'prompt': '退款多久到账？'},
                'expected': {'answer': '原路退回，通常 1 至 3 个工作日到账。'},
                'labels': ['refund'],
                'source_ref': 'rows/2',
            },
            {
                'input': {'prompt': '如何修改收货地址？'},
                'expected': None,
                'metadata': {'missing_policy': 'keep_empty'},
                'labels': ['address'],
                'source_ref': 'rows/3',
            },
        ],
        'source': 'import_package',
        'source_ref': 'imports/customer-service-v1.json',
    }


def test_dataset_preview_shows_mapping_and_never_starts_run_or_evaluation(tmp_path):
    registry = create_default_registry(str(tmp_path))
    project_id = create_project(registry)
    payload = dataset_payload(project_id)

    response = registry.execute(
        action_request('dataset.create', payload, dry_run=True, idempotency_key='preview-golden-dataset')
    )

    assert response.ok
    preview = response.result.data['preview']
    assert preview['row_count'] == 2
    assert preview['fields_by_role']['input'] == ['prompt']
    assert preview['fields_by_role']['expected'] == ['gold_answer']
    assert preview['has_expected_field'] is True
    assert preview['missing_values_preserved'] is True
    assert preview['starts_run'] is False
    assert preview['starts_evaluation'] is False
    assert not (tmp_path / 'projects' / project_id / 'datasets').exists()
    assert any('不启动模型运行或 AI 评价' in warning for warning in response.warnings)


def test_dataset_create_freezes_version_and_case_revisions(tmp_path):
    registry = create_default_registry(str(tmp_path))
    project_id = create_project(registry)
    payload = dataset_payload(project_id)

    response = confirmed_write(
        registry,
        'dataset.create',
        payload,
        'create-golden-dataset-v1',
    )

    assert response.ok
    detail = response.result.data['dataset']
    manifest = detail['dataset']
    version = detail['version']
    cases = detail['cases']
    root = tmp_path / 'projects' / project_id / 'datasets' / manifest['id']
    assert manifest['latest_version_id'] == version['id']
    assert version['version_number'] == 1
    assert version['row_count'] == 2
    assert version['revision_ids'] == [case['id'] for case in cases]
    assert cases[0]['case_id'] == 'dsc_aaaaaaaaaaaaaaaaaaaa'
    assert cases[1]['case_id'].startswith('dsc_')
    assert cases[1]['expected'] is None
    assert cases[0]['content_hash'] == content_hash({
        'case_id': cases[0]['case_id'],
        'input': cases[0]['input'],
        'expected': cases[0]['expected'],
        'metadata': {},
        'attachments': [],
        'labels': cases[0]['labels'],
        'source_ref': cases[0]['source_ref'],
    })
    assert (root / 'dataset.json').is_file()
    assert (root / 'versions' / f'{version["id"]}.json').is_file()
    assert all((root / 'revisions' / f'{item}.json').is_file() for item in version['revision_ids'])
    version_path = root / 'versions' / f'{version["id"]}.json'
    stored_version = json.loads(version_path.read_text(encoding='utf-8'))
    assert stored_version['revision_ids'] == version['revision_ids']
    assert '未启动模型运行或 AI 评价' in response.warnings[0]


def test_dataset_list_and_get_are_project_scoped_and_support_metadata_only(tmp_path):
    registry = create_default_registry(str(tmp_path))
    project_a = create_project(registry)
    second_project = confirmed_write(
        registry,
        'project.create',
        {'name': '另一个项目'},
        'create-second-dataset-project',
    )
    project_b = second_project.result.data['project']['id']
    created = confirmed_write(
        registry,
        'dataset.create',
        dataset_payload(project_a),
        'create-project-scoped-dataset',
    )
    dataset_id = created.result.data['dataset']['dataset']['id']

    listed_a = registry.execute(action_request('dataset.list', {'project_id': project_a}))
    listed_b = registry.execute(action_request('dataset.list', {'project_id': project_b}))
    metadata_only = registry.execute(
        action_request(
            'dataset.get',
            {'project_id': project_a, 'dataset_id': dataset_id, 'include_cases': False},
        )
    )
    cross_project = registry.execute(
        action_request('dataset.get', {'project_id': project_b, 'dataset_id': dataset_id})
    )

    assert listed_a.result.data['count'] == 1
    assert listed_a.result.data['datasets'][0]['latest_version']['row_count'] == 2
    assert listed_b.result.data['count'] == 0
    assert metadata_only.result.data['dataset']['cases'] == []
    assert cross_project.error.code == 'DATASET_NOT_FOUND'


def test_dataset_validation_rejects_ambiguous_schema_and_duplicate_case_ids(tmp_path):
    registry = create_default_registry(str(tmp_path))
    project_id = create_project(registry)
    no_input = dataset_payload(project_id)
    no_input['schema']['fields'][1]['role'] = 'metadata'
    duplicate = dataset_payload(project_id)
    duplicate['cases'][1]['case_id'] = duplicate['cases'][0]['case_id']

    no_input_response = registry.execute(action_request('dataset.create', no_input, dry_run=True))
    duplicate_response = registry.execute(action_request('dataset.create', duplicate, dry_run=True))

    assert no_input_response.error.code == 'VALIDATION_FAILED'
    assert '至少包含一个 input 字段' in no_input_response.error.field_errors[0].message
    assert duplicate_response.error.code == 'VALIDATION_FAILED'
    assert 'case_id 不能重复' in duplicate_response.error.field_errors[0].message


def test_dataset_validation_rejects_oversized_action_package(tmp_path):
    registry = create_default_registry(str(tmp_path))
    project_id = create_project(registry)
    oversized = dataset_payload(project_id)
    oversized['cases'] = [{'input': {'prompt': 'x' * 950_000}} for _ in range(9)]

    response = registry.execute(action_request('dataset.create', oversized, dry_run=True))

    assert response.error.code == 'VALIDATION_FAILED'
    assert '导入包不能超过 8 MiB' in response.error.field_errors[0].message


def test_dataset_get_reports_corrupted_revision_without_partial_data(tmp_path):
    registry = create_default_registry(str(tmp_path))
    project_id = create_project(registry)
    created = confirmed_write(
        registry,
        'dataset.create',
        dataset_payload(project_id),
        'create-corruption-test-dataset',
    )
    detail = created.result.data['dataset']
    dataset_id = detail['dataset']['id']
    revision_id = detail['version']['revision_ids'][0]
    revision_path = (
        tmp_path / 'projects' / project_id / 'datasets' / dataset_id / 'revisions' / f'{revision_id}.json'
    )
    revision = json.loads(revision_path.read_text(encoding='utf-8'))
    revision['input']['prompt'] = '被本地直接篡改的内容'
    revision_path.write_text(json.dumps(revision, ensure_ascii=False), encoding='utf-8')

    response = registry.execute(
        action_request('dataset.get', {'project_id': project_id, 'dataset_id': dataset_id})
    )

    assert response.error.code == 'STORAGE_CORRUPTED'
    assert response.result is None
