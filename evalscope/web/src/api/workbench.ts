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

export type TargetType = 'model' | 'agent' | 'workflow' | 'skill' | 'algorithm'
export type TargetStatus = 'draft' | 'ready' | 'unavailable' | 'archived'
export type TargetConnectionStatus = 'untested' | 'passed' | 'failed'
export type TargetModality = 'text' | 'image' | 'audio' | 'video'
export type TargetAdapter =
  | 'openai_chat_completions'
  | 'openai_responses'
  | 'http_json'
  | 'evalscope_model'

export interface TargetConnectionInput {
  adapter: TargetAdapter
  endpoint?: string
  model_id?: string
  credential_ref?: string
  method: 'POST'
  input_field: string
  output_path: string
  timeout_seconds: number
}

export interface TargetConnectionPublic extends Omit<TargetConnectionInput, 'credential_ref'> {
  credential_configured: boolean
}

export interface TargetRuntimeBinding {
  host_runtime: string
  model_parameters_ref: string
  tool_contract_ref: string
  loading_method: 'file' | 'module'
  input_preprocessor_ref: string
  environment_notes?: string
}

export interface TargetManifest {
  schema_version: number
  id: string
  project_id: string
  name: string
  type: TargetType
  description?: string
  capabilities: string[]
  latest_version_id: string
  status: TargetStatus
  last_run_id?: string
  created_at: string
  updated_at: string
}

export interface TargetVersion {
  schema_version: number
  id: string
  target_id: string
  version_number: number
  label: string
  provider: string
  input_modalities: TargetModality[]
  output_modalities: TargetModality[]
  connection: TargetConnectionPublic
  runtime_binding?: TargetRuntimeBinding
  connection_status: TargetConnectionStatus
  last_connected_at?: string
  config_hash: string
  created_at: string
}

export interface TargetVersionSummary {
  id: string
  version_number: number
  label: string
  provider: string
  connection_status: TargetConnectionStatus
  last_connected_at?: string
  config_hash: string
  created_at: string
}

export interface TargetSummary {
  target: TargetManifest
  latest_version: TargetVersion
}

export interface TargetDetail {
  target: TargetManifest
  version: TargetVersion
  versions: TargetVersionSummary[]
}

export interface TargetCreateInput {
  project_id: string
  name: string
  type: TargetType
  description?: string
  capabilities: string[]
  version_label: string
  provider: string
  input_modalities: TargetModality[]
  output_modalities: TargetModality[]
  connection: TargetConnectionInput
  runtime_binding?: TargetRuntimeBinding
}

export interface TargetCreatePreview {
  preview: {
    project_id: string
    name: string
    type: TargetType
    version_label: string
    adapter: TargetAdapter
    credential_configured: boolean
    initial_status: 'draft'
    connection_status: 'untested'
    writes: string[]
    starts_connection_test: false
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

export async function listTargets(
  projectId: string,
  signal?: AbortSignal,
): Promise<{ targets: TargetSummary[]; warnings: string[] }> {
  const response = await executeAction<{ targets: TargetSummary[]; count: number }>(
    'target.list',
    { project_id: projectId, limit: 200 },
    { signal },
  )
  return { targets: response.data.targets, warnings: response.warnings }
}

export async function getTarget(
  projectId: string,
  targetId: string,
  versionId?: string,
  signal?: AbortSignal,
): Promise<TargetDetail> {
  const response = await executeAction<{ target: TargetDetail }>(
    'target.get',
    { project_id: projectId, target_id: targetId, version_id: versionId },
    { signal },
  )
  return response.data.target
}

export async function previewTargetCreate(
  input: TargetCreateInput,
  signal?: AbortSignal,
): Promise<TargetCreatePreview> {
  const response = await executeAction<TargetCreatePreview>(
    'target.create',
    input,
    { dryRun: true, signal },
  )
  return response.data
}

export async function confirmTargetCreate(
  input: TargetCreateInput,
  confirmationToken: string,
  idempotencyKey: string,
  signal?: AbortSignal,
): Promise<TargetDetail> {
  const response = await executeAction<{ target: TargetDetail }>(
    'target.create',
    input,
    { confirmationToken, idempotencyKey, signal },
  )
  return response.data.target
}
