import { createPortal } from 'react-dom'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Check, ChevronLeft, ChevronRight, FileLock2, LoaderCircle, X } from 'lucide-react'
import {
  confirmTargetCreate,
  previewTargetCreate,
  type TargetAdapter,
  type TargetCreateInput,
  type TargetCreatePreview,
  type TargetDetail,
  type TargetModality,
  type TargetType,
} from '@/api/workbench'
import { useLocale } from '@/contexts/LocaleContext'
import Button from '@/components/ui/Button'
import ErrorAlert from '@/components/ui/ErrorAlert'
import Badge from '@/components/ui/Badge'
import {
  targetAdapterLabel,
  targetConnectionLabel,
  targetStatusLabel,
  targetTypeLabel,
} from './targetPresentation'

interface TargetDraft {
  name: string
  type: TargetType
  description: string
  capabilities: string
  versionLabel: string
  provider: string
  inputModalities: TargetModality[]
  outputModalities: TargetModality[]
  adapter: TargetAdapter
  endpoint: string
  modelId: string
  credentialRef: string
  inputField: string
  outputPath: string
  timeoutSeconds: number
  hostRuntime: string
  modelParametersRef: string
  toolContractRef: string
  loadingMethod: 'file' | 'module'
  inputPreprocessorRef: string
  environmentNotes: string
}

const TARGET_TYPES: TargetType[] = ['model', 'agent', 'workflow', 'skill', 'algorithm']
const MODALITIES: TargetModality[] = ['text', 'image', 'audio', 'video']
const ADAPTERS: TargetAdapter[] = [
  'openai_chat_completions',
  'openai_responses',
  'http_json',
  'evalscope_model',
]

function initialDraft(): TargetDraft {
  return {
    name: '',
    type: 'model',
    description: '',
    capabilities: '',
    versionLabel: 'v1',
    provider: '',
    inputModalities: ['text'],
    outputModalities: ['text'],
    adapter: 'openai_chat_completions',
    endpoint: '',
    modelId: '',
    credentialRef: '',
    inputField: 'input',
    outputPath: 'output',
    timeoutSeconds: 60,
    hostRuntime: '',
    modelParametersRef: '',
    toolContractRef: '',
    loadingMethod: 'file',
    inputPreprocessorRef: '',
    environmentNotes: '',
  }
}

function operationKey(): string {
  const suffix = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`
  return `web-create-target-${suffix}`
}

function splitCapabilities(value: string): string[] {
  return Array.from(new Set(value.split(/[，,\n]/).map((item) => item.trim()).filter(Boolean)))
}

function toggleModality(values: TargetModality[], modality: TargetModality): TargetModality[] {
  return values.includes(modality)
    ? values.filter((value) => value !== modality)
    : [...values, modality]
}

function fieldClass(): string {
  return 'min-h-11 w-full rounded-[var(--radius-sm)] border border-[var(--border-md)] bg-[var(--bg-card)] px-3 text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-dim)] focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent-dim)]'
}

function Label({ children }: { children: React.ReactNode }) {
  return <span className="mb-1.5 block text-sm font-medium text-[var(--text)]">{children}</span>
}

function StepMarker({ index, current, label }: { index: number; current: number; label: string }) {
  const done = index < current
  const active = index === current
  return (
    <li className="flex min-w-0 flex-1 items-center gap-2" aria-current={active ? 'step' : undefined}>
      <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-semibold ${
        done || active
          ? 'bg-[var(--accent)] text-[var(--text-on-filled)]'
          : 'border border-[var(--border-md)] bg-[var(--bg-card)] text-[var(--text-dim)]'
      }`}>
        {done ? <Check size={14} aria-hidden="true" /> : index + 1}
      </span>
      <span className={`truncate text-xs font-medium ${active ? 'text-[var(--text)]' : 'text-[var(--text-muted)]'}`}>
        {label}
      </span>
    </li>
  )
}

export default function TargetCreateDrawer({
  open,
  projectId,
  onClose,
  onCreated,
}: {
  open: boolean
  projectId: string
  onClose: () => void
  onCreated: (detail: TargetDetail) => void
}) {
  const { t } = useLocale()
  const [draft, setDraft] = useState<TargetDraft>(initialDraft)
  const [step, setStep] = useState(0)
  const [preview, setPreview] = useState<TargetCreatePreview | null>(null)
  const [previewInput, setPreviewInput] = useState<TargetCreateInput | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const panelRef = useRef<HTMLElement>(null)
  const busyRef = useRef(false)

  useEffect(() => {
    busyRef.current = busy
  }, [busy])

  useEffect(() => {
    if (!open) return
    const previousFocus = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panelRef.current?.querySelector<HTMLElement>('input, button, select, textarea')?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busyRef.current) {
        event.stopPropagation()
        onClose()
        return
      }
      if (event.key !== 'Tab' || !panelRef.current) return
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      document.body.style.overflow = previousOverflow
      previousFocus?.focus?.()
    }
  }, [onClose, open])

  useEffect(() => {
    if (!open) return
    panelRef.current?.querySelector<HTMLElement>(`[data-step-focus="${step}"]`)?.focus()
  }, [open, step])

  if (!open) return null

  const requiresEndpoint = draft.adapter !== 'evalscope_model'
  const requiresModelId = draft.adapter !== 'http_json'
  const skillBindingComplete = draft.type !== 'skill' || Boolean(
    draft.hostRuntime.trim()
    && draft.modelParametersRef.trim()
    && draft.toolContractRef.trim()
    && draft.inputPreprocessorRef.trim(),
  )
  const connectionComplete = Boolean(
    draft.versionLabel.trim()
    && draft.provider.trim()
    && (!requiresEndpoint || draft.endpoint.trim())
    && (!requiresModelId || draft.modelId.trim())
    && draft.inputField.trim()
    && draft.outputPath.trim()
    && draft.inputModalities.length
    && draft.outputModalities.length
    && skillBindingComplete,
  )

  const buildInput = (): TargetCreateInput => ({
    project_id: projectId,
    name: draft.name.trim(),
    type: draft.type,
    description: draft.description.trim() || undefined,
    capabilities: splitCapabilities(draft.capabilities),
    version_label: draft.versionLabel.trim(),
    provider: draft.provider.trim(),
    input_modalities: draft.inputModalities,
    output_modalities: draft.outputModalities,
    connection: {
      adapter: draft.adapter,
      endpoint: draft.endpoint.trim() || undefined,
      model_id: draft.modelId.trim() || undefined,
      credential_ref: draft.credentialRef.trim() || undefined,
      method: 'POST',
      input_field: draft.inputField.trim(),
      output_path: draft.outputPath.trim(),
      timeout_seconds: draft.timeoutSeconds,
    },
    runtime_binding: draft.type === 'skill' ? {
      host_runtime: draft.hostRuntime.trim(),
      model_parameters_ref: draft.modelParametersRef.trim(),
      tool_contract_ref: draft.toolContractRef.trim(),
      loading_method: draft.loadingMethod,
      input_preprocessor_ref: draft.inputPreprocessorRef.trim(),
      environment_notes: draft.environmentNotes.trim() || undefined,
    } : undefined,
  })

  const submitPreview = async (event: FormEvent) => {
    event.preventDefault()
    if (!connectionComplete) return
    setBusy(true)
    setError('')
    const input = buildInput()
    try {
      const nextPreview = await previewTargetCreate(input)
      setPreviewInput(input)
      setPreview(nextPreview)
      setStep(2)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('targets.createFailed'))
    } finally {
      setBusy(false)
    }
  }

  const confirmCreate = async () => {
    if (!preview || !previewInput) return
    setBusy(true)
    setError('')
    try {
      onCreated(await confirmTargetCreate(
        previewInput,
        preview.confirmation.token,
        operationKey(),
      ))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('targets.createFailed'))
      setPreview(null)
      setPreviewInput(null)
      setStep(1)
    } finally {
      setBusy(false)
    }
  }

  const content = (
    <div className="fixed inset-0 z-[100]">
      <button
        type="button"
        aria-label={t('targets.closeDrawer')}
        className="absolute inset-0 h-full w-full bg-slate-950/45 backdrop-blur-[2px]"
        onClick={busy ? undefined : onClose}
      />
      <section
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="target-create-title"
        aria-describedby="target-create-description"
        className="absolute inset-y-0 right-0 flex w-full max-w-[640px] flex-col border-l border-[var(--border)] bg-[var(--bg-card)] shadow-[var(--shadow-lg)]"
      >
        <header className="flex shrink-0 items-start justify-between border-b border-[var(--border)] px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 id="target-create-title" className="text-lg font-semibold text-[var(--text)]">
              {t('targets.createTitle')}
            </h2>
            <p id="target-create-description" className="mt-1 text-sm leading-5 text-[var(--text-muted)]">
              {t('targets.createDescription')}
            </p>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            aria-label={t('targets.closeDrawer')}
            className="coarse-target ml-4 grid h-9 w-9 shrink-0 place-items-center rounded-[var(--radius-sm)] text-[var(--text-muted)] hover:bg-[var(--bg-card2)] hover:text-[var(--text)]"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <ol className="flex shrink-0 gap-2 border-b border-[var(--border)] bg-[var(--bg-deep)] px-5 py-3 sm:px-6">
          <StepMarker index={0} current={step} label={t('targets.stepBasic')} />
          <StepMarker index={1} current={step} label={t('targets.stepConnection')} />
          <StepMarker index={2} current={step} label={t('targets.stepConfirm')} />
        </ol>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {step === 0 && (
            <form
              className="space-y-5 p-5 sm:p-6"
              onSubmit={(event) => {
                event.preventDefault()
                setError('')
                setStep(1)
              }}
            >
              <fieldset>
                <legend className="mb-2 text-sm font-medium text-[var(--text)]">{t('targets.typeLabel')}</legend>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {TARGET_TYPES.map((type) => (
                    <label key={type} className={`cursor-pointer rounded-[var(--radius-sm)] border px-3 py-3 text-sm transition-colors ${
                      draft.type === type
                        ? 'border-[var(--accent)] bg-[var(--accent-dim)] text-[var(--accent)]'
                        : 'border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-muted)] hover:border-[var(--border-strong)]'
                    }`}>
                      <input
                        type="radio"
                        name="target-type"
                        value={type}
                        checked={draft.type === type}
                        onChange={() => setDraft((current) => ({ ...current, type }))}
                        className="sr-only"
                      />
                      <span className="font-medium">{targetTypeLabel(t, type)}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className="block">
                <Label>{t('targets.nameLabel')}</Label>
                <input
                  required
                  data-step-focus="0"
                  maxLength={120}
                  value={draft.name}
                  onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                  placeholder={t('targets.namePlaceholder')}
                  className={fieldClass()}
                />
              </label>
              <label className="block">
                <Label>{t('targets.descriptionLabel')}</Label>
                <textarea
                  rows={4}
                  maxLength={1000}
                  value={draft.description}
                  onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
                  placeholder={t('targets.descriptionPlaceholder')}
                  className={`${fieldClass()} resize-y py-2.5`}
                />
              </label>
              <label className="block">
                <Label>{t('targets.capabilitiesLabel')}</Label>
                <textarea
                  rows={3}
                  value={draft.capabilities}
                  onChange={(event) => setDraft((current) => ({ ...current, capabilities: event.target.value }))}
                  placeholder={t('targets.capabilitiesPlaceholder')}
                  className={`${fieldClass()} resize-y py-2.5`}
                />
              </label>
              {error && <ErrorAlert>{error}</ErrorAlert>}
              <footer className="flex justify-end border-t border-[var(--border)] pt-4">
                <Button type="submit" disabled={!draft.name.trim()}>
                  {t('targets.next')}
                  <ChevronRight size={16} aria-hidden="true" />
                </Button>
              </footer>
            </form>
          )}

          {step === 1 && (
            <form className="space-y-5 p-5 sm:p-6" onSubmit={(event) => void submitPreview(event)}>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <Label>{t('targets.versionLabel')}</Label>
                  <input
                    required
                    data-step-focus="1"
                    maxLength={80}
                    value={draft.versionLabel}
                    onChange={(event) => setDraft((current) => ({ ...current, versionLabel: event.target.value }))}
                    className={fieldClass()}
                  />
                </label>
                <label className="block">
                  <Label>{t('targets.providerLabel')}</Label>
                  <input
                    required
                    maxLength={120}
                    value={draft.provider}
                    onChange={(event) => setDraft((current) => ({ ...current, provider: event.target.value }))}
                    placeholder={t('targets.providerPlaceholder')}
                    className={fieldClass()}
                  />
                </label>
              </div>
              <label className="block">
                <Label>{t('targets.adapterLabel')}</Label>
                <select
                  value={draft.adapter}
                  onChange={(event) => setDraft((current) => ({ ...current, adapter: event.target.value as TargetAdapter }))}
                  className={fieldClass()}
                >
                  {ADAPTERS.map((adapter) => (
                    <option key={adapter} value={adapter}>{targetAdapterLabel(t, adapter)}</option>
                  ))}
                </select>
              </label>
              {requiresEndpoint && (
                <label className="block">
                  <Label>{t('targets.endpointLabel')}</Label>
                  <input
                    required
                    type="url"
                    value={draft.endpoint}
                    onChange={(event) => setDraft((current) => ({ ...current, endpoint: event.target.value }))}
                    placeholder={t('targets.endpointPlaceholder')}
                    className={fieldClass()}
                  />
                </label>
              )}
              {requiresModelId && (
                <label className="block">
                  <Label>{t('targets.modelIdLabel')}</Label>
                  <input
                    required
                    value={draft.modelId}
                    onChange={(event) => setDraft((current) => ({ ...current, modelId: event.target.value }))}
                    placeholder={t('targets.modelIdPlaceholder')}
                    className={fieldClass()}
                  />
                </label>
              )}
              <label className="block">
                <Label>{t('targets.credentialRefLabel')}</Label>
                <input
                  pattern="(env:[A-Z][A-Z0-9_]{1,127}|keychain:[A-Za-z0-9_.-]{1,64}/[A-Za-z0-9_.-]{1,64})"
                  value={draft.credentialRef}
                  onChange={(event) => setDraft((current) => ({ ...current, credentialRef: event.target.value }))}
                  placeholder={t('targets.credentialRefPlaceholder')}
                  className={fieldClass()}
                  aria-describedby="target-credential-hint"
                />
                <span id="target-credential-hint" className="mt-1.5 block text-xs leading-5 text-[var(--text-muted)]">
                  {t('targets.credentialRefHint')}
                </span>
              </label>
              <div className="grid gap-4 sm:grid-cols-3">
                <label className="block">
                  <Label>{t('targets.inputFieldLabel')}</Label>
                  <input
                    required
                    value={draft.inputField}
                    onChange={(event) => setDraft((current) => ({ ...current, inputField: event.target.value }))}
                    className={fieldClass()}
                  />
                </label>
                <label className="block">
                  <Label>{t('targets.outputPathLabel')}</Label>
                  <input
                    required
                    value={draft.outputPath}
                    onChange={(event) => setDraft((current) => ({ ...current, outputPath: event.target.value }))}
                    className={fieldClass()}
                  />
                </label>
                <label className="block">
                  <Label>{t('targets.timeoutLabel')}</Label>
                  <input
                    required
                    type="number"
                    min={1}
                    max={300}
                    value={draft.timeoutSeconds}
                    onChange={(event) => setDraft((current) => ({ ...current, timeoutSeconds: Number(event.target.value) }))}
                    className={fieldClass()}
                  />
                </label>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {(['inputModalities', 'outputModalities'] as const).map((field) => (
                  <fieldset key={field}>
                    <legend className="mb-2 text-sm font-medium text-[var(--text)]">
                      {t(field === 'inputModalities' ? 'targets.inputModalitiesLabel' : 'targets.outputModalitiesLabel')}
                    </legend>
                    <div className="flex flex-wrap gap-2">
                      {MODALITIES.map((modality) => (
                        <label key={modality} className="flex min-h-9 cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--border)] px-2.5 text-sm text-[var(--text-muted)]">
                          <input
                            type="checkbox"
                            checked={draft[field].includes(modality)}
                            onChange={() => setDraft((current) => ({
                              ...current,
                              [field]: toggleModality(current[field], modality),
                            }))}
                          />
                          {t(`targets.modality${modality[0].toUpperCase()}${modality.slice(1)}`)}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                ))}
              </div>

              {draft.type === 'skill' && (
                <section className="space-y-4 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-deep)] p-4" aria-labelledby="skill-binding-title">
                  <div>
                    <h3 id="skill-binding-title" className="text-sm font-semibold text-[var(--text)]">{t('targets.skillBindingTitle')}</h3>
                    <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">{t('targets.skillBindingDescription')}</p>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block"><Label>{t('targets.hostRuntimeLabel')}</Label><input required value={draft.hostRuntime} onChange={(event) => setDraft((current) => ({ ...current, hostRuntime: event.target.value }))} className={fieldClass()} /></label>
                    <label className="block"><Label>{t('targets.loadingMethodLabel')}</Label><select value={draft.loadingMethod} onChange={(event) => setDraft((current) => ({ ...current, loadingMethod: event.target.value as 'file' | 'module' }))} className={fieldClass()}><option value="file">{t('targets.loadingFile')}</option><option value="module">{t('targets.loadingModule')}</option></select></label>
                    <label className="block"><Label>{t('targets.modelParametersRefLabel')}</Label><input required value={draft.modelParametersRef} onChange={(event) => setDraft((current) => ({ ...current, modelParametersRef: event.target.value }))} className={fieldClass()} /></label>
                    <label className="block"><Label>{t('targets.toolContractRefLabel')}</Label><input required value={draft.toolContractRef} onChange={(event) => setDraft((current) => ({ ...current, toolContractRef: event.target.value }))} className={fieldClass()} /></label>
                    <label className="block sm:col-span-2"><Label>{t('targets.inputPreprocessorRefLabel')}</Label><input required value={draft.inputPreprocessorRef} onChange={(event) => setDraft((current) => ({ ...current, inputPreprocessorRef: event.target.value }))} className={fieldClass()} /></label>
                    <label className="block sm:col-span-2"><Label>{t('targets.environmentNotesLabel')}</Label><textarea rows={2} value={draft.environmentNotes} onChange={(event) => setDraft((current) => ({ ...current, environmentNotes: event.target.value }))} className={`${fieldClass()} py-2.5`} /></label>
                  </div>
                </section>
              )}
              {error && <ErrorAlert>{error}</ErrorAlert>}
              <footer className="flex justify-between gap-3 border-t border-[var(--border)] pt-4">
                <Button type="button" variant="ghost" onClick={() => setStep(0)} disabled={busy}>
                  <ChevronLeft size={16} aria-hidden="true" />
                  {t('targets.previous')}
                </Button>
                <Button type="submit" disabled={busy || !connectionComplete}>
                  {busy && <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />}
                  {t('targets.previewAction')}
                </Button>
              </footer>
            </form>
          )}

          {step === 2 && preview && (
            <div className="space-y-5 p-5 sm:p-6">
              <div>
                <h3 data-step-focus="2" tabIndex={-1} className="text-base font-semibold text-[var(--text)] outline-none">{t('targets.previewTitle')}</h3>
                <p className="mt-1 text-sm text-[var(--text-muted)]">{t('targets.previewDescription')}</p>
              </div>
              <section className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-deep)] p-4">
                <div className="flex items-start gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] bg-[var(--accent-dim)] text-[var(--accent)]"><FileLock2 size={18} aria-hidden="true" /></span>
                  <div className="min-w-0">
                    <p className="font-semibold text-[var(--text)]">{preview.preview.name}</p>
                    <p className="mt-1 text-sm text-[var(--text-muted)]">{targetTypeLabel(t, preview.preview.type)} · {preview.preview.version_label} · {targetAdapterLabel(t, preview.preview.adapter)}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span className="text-xs text-[var(--text-dim)]">{t('targets.previewStatus')}</span>
                      <Badge variant="warning">{targetStatusLabel(t, preview.preview.initial_status)}</Badge>
                      <Badge>{targetConnectionLabel(t, preview.preview.connection_status)}</Badge>
                    </div>
                  </div>
                </div>
                <div className="mt-4 border-t border-[var(--border)] pt-3">
                  <p className="text-xs font-medium text-[var(--text-muted)]">{t('targets.writeScope')}</p>
                  <ul className="mt-2 space-y-1.5">
                    {preview.preview.writes.map((path) => <li key={path} className="flex items-center gap-2 text-xs text-[var(--text)]"><Check size={13} className="text-[var(--success)]" aria-hidden="true" /><code>{path}</code></li>)}
                  </ul>
                </div>
              </section>
              <div className="rounded-[var(--radius-sm)] border border-[var(--warning-border)] bg-[var(--warning-bg)] px-4 py-3 text-sm leading-6 text-[var(--warning-text)]">
                <p className="font-medium">{t('targets.previewNoTest')}</p>
                <p className="mt-1">{t('targets.confirmHint')}</p>
              </div>
              {error && <ErrorAlert>{error}</ErrorAlert>}
              <footer className="flex justify-between gap-3 border-t border-[var(--border)] pt-4">
                <Button type="button" variant="ghost" onClick={() => { setPreview(null); setPreviewInput(null); setStep(1) }} disabled={busy}>
                  <ChevronLeft size={16} aria-hidden="true" />
                  {t('targets.previous')}
                </Button>
                <Button type="button" onClick={() => void confirmCreate()} disabled={busy}>
                  {busy && <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />}
                  {t('targets.confirmCreate')}
                </Button>
              </footer>
            </div>
          )}
        </div>
      </section>
    </div>
  )

  return createPortal(content, document.body)
}
