import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  confirmProjectCreate,
  listProjects,
  previewProjectCreate,
  type ProjectRecord,
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
}

function actionResponse(data: unknown) {
  return {
    ok: true,
    request_id: 'req_test',
    result: {
      verdict: 'completed',
      blocking_reasons: [],
      data,
    },
    warnings: [],
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
})
