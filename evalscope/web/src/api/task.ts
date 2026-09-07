import { apiPostValidated, apiValidated } from './client'
import type { EvalInvokeResponse, LogResponse, ProgressResponse, TaskStatusResponse } from './types'

type TaskScope = 'eval' | 'perf'

export interface TaskRequestOptions {
  projectId?: string
  signal?: AbortSignal
}

function projectParams(taskId: string, projectId?: string): Record<string, string> {
  return projectId ? { task_id: taskId, project_id: projectId } : { task_id: taskId }
}

export function createTaskApi(scope: TaskScope) {
  const basePath = `/api/v1/${scope}`

  return {
    submit(
      payload: Record<string, unknown>,
      taskId: string,
      options: TaskRequestOptions = {},
    ): Promise<EvalInvokeResponse> {
      const body = options.projectId ? { ...payload, project_id: options.projectId } : payload
      return apiPostValidated<EvalInvokeResponse>(`${basePath}/invoke`, body, {
        headers: { 'EvalScope-Task-Id': taskId },
        signal: options.signal,
      })
    },

    progress(taskId: string, options: TaskRequestOptions = {}): Promise<ProgressResponse> {
      return apiValidated<ProgressResponse>(`${basePath}/progress`, {
        params: projectParams(taskId, options.projectId),
        signal: options.signal,
      })
    },

    log(
      taskId: string,
      startLine?: number,
      page = 500,
      options: TaskRequestOptions = {},
    ): Promise<LogResponse> {
      const params: Record<string, string> = {
        ...projectParams(taskId, options.projectId),
        page: String(page),
      }
      if (startLine !== undefined) params.start_line = String(startLine)
      return apiValidated<LogResponse>(`${basePath}/log`, { params, signal: options.signal })
    },

    reportUrl(taskId: string, options: TaskRequestOptions = {}): string {
      const taskParam = `task_id=${encodeURIComponent(taskId)}`
      const projectParam = options.projectId
        ? `&project_id=${encodeURIComponent(options.projectId)}`
        : ''
      return `${basePath}/report?${taskParam}${projectParam}`
    },

    stop(taskId: string, options: TaskRequestOptions = {}): Promise<TaskStatusResponse> {
      return apiPostValidated<TaskStatusResponse>(
        `${basePath}/stop`,
        {},
        { params: projectParams(taskId, options.projectId), signal: options.signal },
      )
    },
  }
}
