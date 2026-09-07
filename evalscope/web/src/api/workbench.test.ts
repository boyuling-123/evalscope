import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  confirmTargetConnectionCheck,
  confirmTargetCreate,
  confirmProjectCreate,
  getTarget,
  listTargets,
  listProjects,
  previewProjectCreate,
  previewTargetConnectionCheck,
  previewTargetCreate,
  type ProjectRecord,
  type TargetCreateInput,
  type TargetConnectionCheck,
  type TargetDetail,
} from './workbench'

const PROJECT: ProjectRecord = {
  schema_version: 1,
  id: 'prj_0123456789abcdefabcd',
  name: '中文 Agent 评测',
  description: '本地演示项目',
  created_at: '2026-09-08T00:00:00Z',
  updated_at: '2026-09-08T00:00:00Z',
  archived: false,
  root_path: '/tmp/evalscope/projects/prj_0123456789abcdefabcd',
  runs_path: '/tmp/evalscope/projects/prj_0123456789abcdefabcd/runs',
}

const TARGET_INPUT: TargetCreateInput = {
  project_id: PROJECT.id,
  name: '客服 Agent',
  type: 'agent',
  description: '用于回归客服意图识别与工具调用',
  capabilities: ['意图识别', '工具调用'],
  version_label: 'v1',
  provider: '本地服务',
  input_modalities: ['text'],
  output_modalities: ['text'],
  connection: {
    adapter: 'openai_responses',
    endpoint: 'http://127.0.0.1:9000/v1/responses',
    model_id: 'customer-agent',
    credential_ref: 'env:TARGET_API_KEY',
    method: 'POST',
    input_field: 'input',
    output_path: 'output_text',
    timeout_seconds: 60,
  },
}

const TARGET_DETAIL: TargetDetail = {
  target: {
    schema_version: 1,
    id: 'tgt_0123456789abcdefabcd',
    project_id: PROJECT.id,
    name: TARGET_INPUT.name,
    type: TARGET_INPUT.type,
    description: TARGET_INPUT.description,
    capabilities: TARGET_INPUT.capabilities,
    latest_version_id: 'tgv_0123456789abcdefabcd',
    status: 'draft',
    created_at: '2026-09-08T01:00:00Z',
    updated_at: '2026-09-08T01:00:00Z',
  },
  version: {
    schema_version: 1,
    id: 'tgv_0123456789abcdefabcd',
    target_id: 'tgt_0123456789abcdefabcd',
    version_number: 1,
    label: 'v1',
    provider: '本地服务',
    input_modalities: ['text'],
    output_modalities: ['text'],
    connection: {
      adapter: 'openai_responses',
      endpoint: 'http://127.0.0.1:9000/v1/responses',
      model_id: 'customer-agent',
      method: 'POST',
      input_field: 'input',
      output_path: 'output_text',
      timeout_seconds: 60,
      credential_configured: true,
    },
    connection_status: 'untested',
    config_hash: 'a'.repeat(64),
    created_at: '2026-09-08T01:00:00Z',
  },
  versions: [{
    id: 'tgv_0123456789abcdefabcd',
    version_number: 1,
    label: 'v1',
    provider: '本地服务',
    connection_status: 'untested',
    config_hash: 'a'.repeat(64),
    created_at: '2026-09-08T01:00:00Z',
  }],
}

const TARGET_CHECK: TargetConnectionCheck = {
  schema_version: 1,
  id: 'tcc_0123456789abcdefabcd',
  target_id: TARGET_DETAIL.target.id,
  version_id: TARGET_DETAIL.version.id,
  status: 'passed',
  checked_at: '2026-09-08T02:00:00Z',
  duration_ms: 18,
  http_status: 200,
  output_type: 'string',
  output_hash: 'b'.repeat(64),
}

function actionResponse(
  data: unknown,
  options: { verdict?: 'ready' | 'completed' | 'blocked'; blockingReasons?: string[]; warnings?: string[] } = {},
) {
  return {
    ok: true,
    request_id: 'req_test',
    result: {
      verdict: options.verdict ?? 'completed',
      blocking_reasons: options.blockingReasons ?? [],
      data,
    },
    warnings: options.warnings ?? [],
  }
}

describe('workbench Action client', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  it('lists projects through the single Action gateway', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => actionResponse({ projects: [PROJECT], count: 1 }),
    } as Response)

    await expect(listProjects()).resolves.toEqual({ projects: [PROJECT], warnings: [] })
    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(new URL(url).pathname).toBe('/api/v1/workbench/actions/execute')
    expect(JSON.parse(String(init.body))).toMatchObject({
      action: 'project.list',
      action_version: '1.0',
      dry_run: false,
      payload: { include_archived: false, limit: 200 },
    })
  })

  it('previews project creation without writing', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => actionResponse({
        preview: { name: PROJECT.name, description: PROJECT.description, writes: [PROJECT.root_path] },
        confirmation: { token: 'confirm_test', expires_at: '2026-09-08T00:10:00Z' },
      }),
    } as Response)

    const preview = await previewProjectCreate({ name: PROJECT.name, description: PROJECT.description })
    expect(preview.confirmation.token).toBe('confirm_test')
    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body))
    expect(body).toMatchObject({ action: 'project.create', dry_run: true })
    expect(body.confirmation_token).toBeUndefined()
  })

  it('writes only after an explicit confirmation token and idempotency key', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => actionResponse({ project: PROJECT }),
    } as Response)

    await expect(confirmProjectCreate(
      { name: PROJECT.name, description: PROJECT.description },
      'confirm_test',
      'create-project-test',
    )).resolves.toEqual(PROJECT)

    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body))
    expect(body).toMatchObject({
      action: 'project.create',
      dry_run: false,
      confirmation_token: 'confirm_test',
      idempotency_key: 'create-project-test',
    })
  })

  it('lists and gets targets inside the selected project scope', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => actionResponse({
          targets: [{ target: TARGET_DETAIL.target, latest_version: TARGET_DETAIL.version }],
          count: 1,
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => actionResponse({ target: TARGET_DETAIL }),
      } as Response)

    await expect(listTargets(PROJECT.id)).resolves.toMatchObject({ targets: [{ target: TARGET_DETAIL.target }] })
    await expect(getTarget(PROJECT.id, TARGET_DETAIL.target.id)).resolves.toEqual(TARGET_DETAIL)

    const listBody = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body))
    const getBody = JSON.parse(String((fetchMock.mock.calls[1][1] as RequestInit).body))
    expect(listBody).toMatchObject({ action: 'target.list', payload: { project_id: PROJECT.id, limit: 200 } })
    expect(getBody).toMatchObject({ action: 'target.get', payload: { project_id: PROJECT.id, target_id: TARGET_DETAIL.target.id } })
    expect(JSON.stringify(TARGET_DETAIL)).not.toContain('TARGET_API_KEY')
  })

  it('previews and confirms a target draft through the guarded Action flow', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => actionResponse({
          preview: {
            project_id: PROJECT.id,
            name: TARGET_INPUT.name,
            type: TARGET_INPUT.type,
            version_label: 'v1',
            adapter: 'openai_responses',
            credential_configured: true,
            initial_status: 'draft',
            connection_status: 'untested',
            writes: ['target.json', 'versions/<version_id>.json'],
            starts_connection_test: false,
          },
          confirmation: { token: 'confirm_target', expires_at: '2026-09-08T01:10:00Z' },
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => actionResponse({ target: TARGET_DETAIL }),
      } as Response)

    const preview = await previewTargetCreate(TARGET_INPUT)
    expect(preview.preview.starts_connection_test).toBe(false)
    await expect(confirmTargetCreate(
      TARGET_INPUT,
      preview.confirmation.token,
      'create-target-test',
    )).resolves.toEqual(TARGET_DETAIL)

    const previewBody = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body))
    const createBody = JSON.parse(String((fetchMock.mock.calls[1][1] as RequestInit).body))
    expect(previewBody).toMatchObject({ action: 'target.create', dry_run: true, payload: TARGET_INPUT })
    expect(createBody).toMatchObject({
      action: 'target.create',
      dry_run: false,
      confirmation_token: 'confirm_target',
      idempotency_key: 'create-target-test',
    })
  })

  it('previews and confirms exactly one real target connection request', async () => {
    const sampleInput = { question: '退款多久到账？' }
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => actionResponse({
          preview: {
            project_id: PROJECT.id,
            target_id: TARGET_DETAIL.target.id,
            version_id: TARGET_DETAIL.version.id,
            adapter: 'openai_responses',
            endpoint_origin: 'http://127.0.0.1:9000',
            credential_configured: true,
            starts_external_call: true,
            may_consume_model_quota: true,
            persists_sample_input: false,
            persists_full_output: false,
          },
          confirmation: { token: 'confirm_connection', expires_at: '2026-09-08T02:10:00Z' },
        }, { verdict: 'ready', warnings: ['预览不会联网。'] }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => actionResponse({ check: TARGET_CHECK, target: TARGET_DETAIL }, { warnings: ['真实试调成功。'] }),
      } as Response)

    const preview = await previewTargetConnectionCheck(
      PROJECT.id,
      TARGET_DETAIL.target.id,
      TARGET_DETAIL.version.id,
      sampleInput,
    )
    expect(preview).toMatchObject({
      verdict: 'ready',
      blockingReasons: [],
      warnings: ['预览不会联网。'],
      confirmation: { token: 'confirm_connection' },
    })

    await expect(confirmTargetConnectionCheck(
      PROJECT.id,
      TARGET_DETAIL.target.id,
      TARGET_DETAIL.version.id,
      sampleInput,
      'confirm_connection',
      'check-target-test',
    )).resolves.toEqual({ check: TARGET_CHECK, target: TARGET_DETAIL, warnings: ['真实试调成功。'] })

    const previewBody = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body))
    const confirmBody = JSON.parse(String((fetchMock.mock.calls[1][1] as RequestInit).body))
    expect(previewBody).toMatchObject({
      action: 'target.connection.check',
      dry_run: true,
      payload: { project_id: PROJECT.id, version_id: TARGET_DETAIL.version.id, sample_input: sampleInput },
    })
    expect(confirmBody).toMatchObject({
      action: 'target.connection.check',
      dry_run: false,
      confirmation_token: 'confirm_connection',
      idempotency_key: 'check-target-test',
    })
  })
})
