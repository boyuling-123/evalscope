import type { Translate } from '@/contexts/LocaleContext'
import type {
  TargetAdapter,
  TargetConnectionStatus,
  TargetModality,
  TargetStatus,
  TargetType,
} from '@/api/workbench'

const TYPE_KEYS: Record<TargetType, string> = {
  model: 'targets.typeModel',
  agent: 'targets.typeAgent',
  workflow: 'targets.typeWorkflow',
  skill: 'targets.typeSkill',
  algorithm: 'targets.typeAlgorithm',
}

const STATUS_KEYS: Record<TargetStatus, string> = {
  draft: 'targets.statusDraft',
  ready: 'targets.statusReady',
  unavailable: 'targets.statusUnavailable',
  archived: 'targets.statusArchived',
}

const CONNECTION_KEYS: Record<TargetConnectionStatus, string> = {
  untested: 'targets.connectionUntested',
  passed: 'targets.connectionPassed',
  failed: 'targets.connectionFailed',
}

const MODALITY_KEYS: Record<TargetModality, string> = {
  text: 'targets.modalityText',
  image: 'targets.modalityImage',
  audio: 'targets.modalityAudio',
  video: 'targets.modalityVideo',
}

const ADAPTER_KEYS: Record<TargetAdapter, string> = {
  openai_chat_completions: 'targets.adapterOpenaiChatCompletions',
  openai_responses: 'targets.adapterOpenaiResponses',
  http_json: 'targets.adapterHttpJson',
  evalscope_model: 'targets.adapterEvalscopeModel',
}

export const targetTypeLabel = (t: Translate, value: TargetType) => t(TYPE_KEYS[value])
export const targetStatusLabel = (t: Translate, value: TargetStatus) => t(STATUS_KEYS[value])
export const targetConnectionLabel = (t: Translate, value: TargetConnectionStatus) => t(CONNECTION_KEYS[value])
export const targetModalityLabel = (t: Translate, value: TargetModality) => t(MODALITY_KEYS[value])
export const targetAdapterLabel = (t: Translate, value: TargetAdapter) => t(ADAPTER_KEYS[value])
