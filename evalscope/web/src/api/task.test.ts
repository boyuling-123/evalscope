import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiPostValidated, apiValidated } from './client'
import { createTaskApi } from './task'

vi.mock('./client', () => ({
  apiPostValidated: vi.fn(),
  apiValidated: vi.fn(),
}))

const post = vi.mocked(apiPostValidated)
const get = vi.mocked(apiValidated)

beforeEach(() => {
  post.mockResolvedValue({ status: 'ok', task_id: 'task-1' })
  get.mockResolvedValue({ percent: 50 })
})

describe.each(['eval', 'perf'] as const)('createTaskApi(%s)', (scope) => {
  it('keeps all task lifecycle requests under the selected API scope', async () => {
    const api = createTaskApi(scope)

    await api.submit({ model: 'qwen-plus' }, 'task-1')
    await api.progress('task-1')
    await api.log('task-1', 12, 100)
    await api.stop('task-1')

    expect(post).toHaveBeenNthCalledWith(
      1,
      `/api/v1/${scope}/invoke`,
      { model: 'qwen-plus' },
      expect.objectContaining({ headers: { 'EvalScope-Task-Id': 'task-1' } }),
    )
    expect(get).toHaveBeenNthCalledWith(
      1,
      `/api/v1/${scope}/progress`,
      expect.objectContaining({ params: { task_id: 'task-1' } }),
    )
    expect(get).toHaveBeenNthCalledWith(
      2,
      `/api/v1/${scope}/log`,
      expect.objectContaining({ params: { task_id: 'task-1', start_line: '12', page: '100' } }),
    )
    expect(post).toHaveBeenNthCalledWith(
      2,
      `/api/v1/${scope}/stop`,
      {},
      expect.objectContaining({ params: { task_id: 'task-1' } }),
    )
    expect(api.reportUrl('task 1')).toBe(`/api/v1/${scope}/report?task_id=task%201`)
  })

  it('keeps every task lifecycle request inside an explicit project', async () => {
    const api = createTaskApi(scope)
    const options = { projectId: 'prj_0123456789abcdefabcd' }

    await api.submit({ model: 'qwen-plus' }, 'task-2', options)
    await api.progress('task-2', options)
    await api.log('task-2', 0, 50, options)
    await api.stop('task-2', options)

    expect(post).toHaveBeenNthCalledWith(
      1,
      `/api/v1/${scope}/invoke`,
      { model: 'qwen-plus', project_id: options.projectId },
      expect.objectContaining({ headers: { 'EvalScope-Task-Id': 'task-2' } }),
    )
    expect(get).toHaveBeenNthCalledWith(
      1,
      `/api/v1/${scope}/progress`,
      expect.objectContaining({ params: { task_id: 'task-2', project_id: options.projectId } }),
    )
    expect(get).toHaveBeenNthCalledWith(
      2,
      `/api/v1/${scope}/log`,
      expect.objectContaining({
        params: { task_id: 'task-2', project_id: options.projectId, start_line: '0', page: '50' },
      }),
    )
    expect(post).toHaveBeenNthCalledWith(
      2,
      `/api/v1/${scope}/stop`,
      {},
      expect.objectContaining({ params: { task_id: 'task-2', project_id: options.projectId } }),
    )
    expect(api.reportUrl('task-2', options)).toContain(`project_id=${options.projectId}`)
  })
})
