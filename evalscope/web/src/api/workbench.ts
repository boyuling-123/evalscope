import { apiPostValidated } from './client'

const ACTION_ENDPOINT = '/api/v1/workbench/actions/execute'
const WEB_ACTOR = { type: 'user' as const, id: 'evalscope-web-ui' }

export interface ProjectRecord {
  schema_version: number
  id: string
  name: string
  description?: string
  created_at: string
  updated_at: string
  archived: boolean
  root_path: string
  runs_path: string
}

interface ActionErrorDetail {
  code: string
  message: string
  retryable: boolean
  field_errors: Array<{ field: string; message: string; type: string }>
}

interface ActionResult<T> {
  verdict: 'ready' | 'completed' | 'blocked'
  blocking_reasons: string[]
  next_action?: string
  data: T
}

interface ActionResponse<T> {
  ok: boolean
  request_id: string
  result?: ActionResult<T>
  warnings: string[]
  audit_event_id?: string
  error?: ActionErrorDetail
}

interface Confirmation {
  token: string
  expires_at: string
}

export interface ProjectCreateInput {
  name: string
  description?: string
}

export interface ProjectCreatePreview {
  preview: {
    name: string
    description?: string
    writes: string[]
  }
  confirmation: Confirmation
}

export class WorkbenchActionError extends Error {
  readonly code: string
  readonly fieldErrors: ActionErrorDetail['field_errors']

  constructor(detail: ActionErrorDetail) {
    super(detail.message)
    this.name = 'WorkbenchActionError'
    this.code = detail.code
    this.fieldErrors = detail.field_errors
    Object.setPrototypeOf(this, WorkbenchActionError.prototype)
  }
}

function requestId(): string {
  const suffix = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`
  return `req_web_${suffix}`
}

async function executeAction<T>(
  action: string,
  payload: object,
  options: {
    signal?: AbortSignal
    dryRun?: boolean
    confirmationToken?: string
    idempotencyKey?: string
  } = {},
): Promise<{ data: T; warnings: string[] }> {
  const response = await apiPostValidated<ActionResponse<T>>(
    ACTION_ENDPOINT,
    {
      action,
      action_version: '1.0',
      request_id: requestId(),
      actor: WEB_ACTOR,
      dry_run: options.dryRun ?? false,
      confirmation_token: options.confirmationToken,
      idempotency_key: options.idempotencyKey,
      payload,
    },
    { signal: options.signal },
  )

  if (!response.ok || !response.result) {
    throw new WorkbenchActionError(response.error ?? {
      code: 'INVALID_ACTION_RESPONSE',
      message: '本地服务返回了不完整的 Action 结果。',
      retryable: false,
      field_errors: [],
    })
  }
  return { data: response.result.data, warnings: response.warnings ?? [] }
}

export async function listProjects(signal?: AbortSignal): Promise<{
  projects: ProjectRecord[]
  warnings: string[]
}> {
  const response = await executeAction<{ projects: ProjectRecord[]; count: number }>(
    'project.list',
    { include_archived: false, limit: 200 },
    { signal },
  )
  return { projects: response.data.projects, warnings: response.warnings }
}

export async function previewProjectCreate(
  input: ProjectCreateInput,
  signal?: AbortSignal,
): Promise<ProjectCreatePreview> {
  const response = await executeAction<ProjectCreatePreview>(
    'project.create',
    input,
    { dryRun: true, signal },
  )
  return response.data
}

export async function confirmProjectCreate(
  input: ProjectCreateInput,
  confirmationToken: string,
  idempotencyKey: string,
  signal?: AbortSignal,
): Promise<ProjectRecord> {
  const response = await executeAction<{ project: ProjectRecord }>(
    'project.create',
    input,
    { confirmationToken, idempotencyKey, signal },
  )
  return response.data.project
}
