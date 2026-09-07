import { createPortal } from 'react-dom'
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { ArrowRight, Check, ChevronLeft, FileLock2, LoaderCircle, X } from 'lucide-react'
import {
  confirmTargetVersionCreate,
  previewTargetVersionCreate,
  type TargetAdapter,
  type TargetDetail,
  type TargetModality,
  type TargetVersionCreateInput,
  type TargetVersionCreatePreview,
} from '@/api/workbench'
import { useLocale } from '@/contexts/LocaleContext'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import ErrorAlert from '@/components/ui/ErrorAlert'
import { targetAdapterLabel, targetConnectionLabel, targetStatusLabel } from './targetPresentation'

interface VersionDraft {
  versionLabel: string
  provider: string
  inputModalities: TargetModality[]
  outputModalities: TargetModality[]
  adapter: TargetAdapter
  endpoint: string
  modelId: string
  inputField: string
  outputPath: string
  timeoutSeconds: number
  reuseBaseCredential: boolean
  credentialRef: string
  hostRuntime: string
  modelParametersRef: string
  toolContractRef: string
  loadingMethod: 'file' | 'module'
  inputPreprocessorRef: string
  environmentNotes: string
}

const ADAPTERS: TargetAdapter[] = [
  'openai_chat_completions',
  'openai_responses',
  'http_json',
  'evalscope_model',
]
const MODALITIES: TargetModality[] = ['text', 'image', 'audio', 'video']

function initialDraft(detail: TargetDetail): VersionDraft {
  const version = detail.version
  const nextNumber = Math.max(...detail.versions.map((item) => item.version_number)) + 1
  return {
    versionLabel: `v${nextNumber}`,
    provider: version.provider,
    inputModalities: [...version.input_modalities],
    outputModalities: [...version.output_modalities],
    adapter: version.connection.adapter,
    endpoint: version.connection.endpoint ?? '',
    modelId: version.connection.model_id ?? '',
    inputField: version.connection.input_field,
    outputPath: version.connection.output_path,
    timeoutSeconds: version.connection.timeout_seconds,
    reuseBaseCredential: version.connection.credential_configured,
    credentialRef: '',
    hostRuntime: version.runtime_binding?.host_runtime ?? '',
    modelParametersRef: version.runtime_binding?.model_parameters_ref ?? '',
    toolContractRef: version.runtime_binding?.tool_contract_ref ?? '',
    loadingMethod: version.runtime_binding?.loading_method ?? 'file',
    inputPreprocessorRef: version.runtime_binding?.input_preprocessor_ref ?? '',
    environmentNotes: version.runtime_binding?.environment_notes ?? '',
  }
}

function fieldClass(): string {
  return 'min-h-11 w-full rounded-[var(--radius-sm)] border border-[var(--border-md)] bg-[var(--bg-card)] px-3 text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-dim)] focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent-dim)]'
}

function FieldLabel({ children }: { children: ReactNode }) {
  return <span className="mb-1.5 block text-sm font-medium text-[var(--text)]">{children}</span>
}

function toggleModality(values: TargetModality[], modality: TargetModality): TargetModality[] {
  return values.includes(modality)
    ? values.filter((value) => value !== modality)
    : [...values, modality]
}

function operationKey(): string {
  const suffix = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`
  return `web-create-target-version-${suffix}`
}

export default function TargetVersionCreateDrawer({
  open,
  detail,
  onClose,
  onCreated,
}: {
  open: boolean
  detail: TargetDetail
  onClose: () => void
  onCreated: (detail: TargetDetail) => void
}) {
  const { t } = useLocale()
  const [draft, setDraft] = useState<VersionDraft>(() => initialDraft(detail))
  const [preview, setPreview] = useState<TargetVersionCreatePreview | null>(null)
  const [previewInput, setPreviewInput] = useState<TargetVersionCreateInput | null>(null)
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

  if (!open) return null

  const requiresEndpoint = draft.adapter !== 'evalscope_model'
  const requiresModelId = draft.adapter !== 'http_json'
  const skillBindingComplete = detail.target.type !== 'skill' || Boolean(
    draft.hostRuntime.trim()
    && draft.modelParametersRef.trim()
    && draft.toolContractRef.trim()
    && draft.inputPreprocessorRef.trim(),
  )
  const formComplete = Boolean(
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

  const buildInput = (): TargetVersionCreateInput => ({
    project_id: detail.target.project_id,
    target_id: detail.target.id,
    base_version_id: detail.version.id,
    version_label: draft.versionLabel.trim(),
    provider: draft.provider.trim(),
    input_modalities: draft.inputModalities,
    output_modalities: draft.outputModalities,
    connection: {
      adapter: draft.adapter,
      endpoint: draft.endpoint.trim() || undefined,
      model_id: draft.modelId.trim() || undefined,
      credential_ref: draft.reuseBaseCredential ? undefined : draft.credentialRef.trim() || undefined,
      method: 'POST',
      input_field: draft.inputField.trim(),
      output_path: draft.outputPath.trim(),
      timeout_seconds: draft.timeoutSeconds,
    },
    runtime_binding: detail.target.type === 'skill' ? {
      host_runtime: draft.hostRuntime.trim(),
      model_parameters_ref: draft.modelParametersRef.trim(),
      tool_contract_ref: draft.toolContractRef.trim(),
      loading_method: draft.loadingMethod,
      input_preprocessor_ref: draft.inputPreprocessorRef.trim(),
      environment_notes: draft.environmentNotes.trim() || undefined,
    } : undefined,
    reuse_base_credential: draft.reuseBaseCredential,
  })

  const previewCreate = async (event: FormEvent) => {
    event.preventDefault()
    if (!formComplete) return
    setBusy(true)
    setError('')
    const input = buildInput()
    try {
      const nextPreview = await previewTargetVersionCreate(input)
      setPreviewInput(input)
      setPreview(nextPreview)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('targets.versionCreateFailed'))
    } finally {
      setBusy(false)
    }
  }

  const confirmCreate = async () => {
    if (!preview || !previewInput) return
    setBusy(true)
    setError('')
    try {
      onCreated(await confirmTargetVersionCreate(
        previewInput,
        preview.confirmation.token,
        operationKey(),
      ))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('targets.versionCreateFailed'))
    } finally {
      setBusy(false)
    }
  }

  const editor = (
    <form className="space-y-6 p-5 sm:p-6" onSubmit={(event) => void previewCreate(event)}>
      <section aria-labelledby="new-version-identity" className="space-y-4">
        <div>
          <h3 id="new-version-identity" className="text-sm font-semibold text-[var(--text)]">{t('targets.versionIdentityTitle')}</h3>
          <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">{t('targets.versionIdentityDescription')}</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <FieldLabel>{t('targets.versionLabel')}</FieldLabel>
            <input required autoFocus maxLength={80} value={draft.versionLabel} onChange={(event) => setDraft((current) => ({ ...current, versionLabel: event.target.value }))} className={fieldClass()} />
          </label>
          <label className="block">
            <FieldLabel>{t('targets.providerLabel')}</FieldLabel>
            <input required maxLength={120} value={draft.provider} onChange={(event) => setDraft((current) => ({ ...current, provider: event.target.value }))} className={fieldClass()} />
          </label>
        </div>
      </section>

      <section aria-labelledby="new-version-connection" className="space-y-4 border-t border-[var(--border)] pt-5">
        <div>
          <h3 id="new-version-connection" className="text-sm font-semibold text-[var(--text)]">{t('targets.connectionTitle')}</h3>
          <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">{t('targets.versionConnectionDescription')}</p>
        </div>
        <label className="block">
          <FieldLabel>{t('targets.adapterLabel')}</FieldLabel>
          <select value={draft.adapter} onChange={(event) => setDraft((current) => ({ ...current, adapter: event.target.value as TargetAdapter }))} className={fieldClass()}>
            {ADAPTERS.map((adapter) => <option key={adapter} value={adapter}>{targetAdapterLabel(t, adapter)}</option>)}
          </select>
        </label>
        {requiresEndpoint && (
          <label className="block">
            <FieldLabel>{t('targets.endpointLabel')}</FieldLabel>
            <input required type="url" value={draft.endpoint} onChange={(event) => setDraft((current) => ({ ...current, endpoint: event.target.value }))} className={fieldClass()} />
          </label>
        )}
        {requiresModelId && (
          <label className="block">
            <FieldLabel>{t('targets.modelIdLabel')}</FieldLabel>
            <input required value={draft.modelId} onChange={(event) => setDraft((current) => ({ ...current, modelId: event.target.value }))} className={fieldClass()} />
          </label>
        )}
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block"><FieldLabel>{t('targets.inputFieldLabel')}</FieldLabel><input required value={draft.inputField} onChange={(event) => setDraft((current) => ({ ...current, inputField: event.target.value }))} className={fieldClass()} /></label>
          <label className="block"><FieldLabel>{t('targets.outputPathLabel')}</FieldLabel><input required value={draft.outputPath} onChange={(event) => setDraft((current) => ({ ...current, outputPath: event.target.value }))} className={fieldClass()} /></label>
          <label className="block"><FieldLabel>{t('targets.timeoutLabel')}</FieldLabel><input required type="number" min={1} max={300} value={draft.timeoutSeconds} onChange={(event) => setDraft((current) => ({ ...current, timeoutSeconds: Number(event.target.value) }))} className={fieldClass()} /></label>
        </div>
        {detail.version.connection.credential_configured && (
          <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-deep)] px-3 text-sm text-[var(--text)]">
            <input type="checkbox" checked={draft.reuseBaseCredential} onChange={(event) => setDraft((current) => ({ ...current, reuseBaseCredential: event.target.checked }))} />
            <span>{t('targets.reuseCredential')}</span>
          </label>
        )}
        {!draft.reuseBaseCredential && (
          <label className="block">
            <FieldLabel>{t('targets.replacementCredentialRef')}</FieldLabel>
            <input pattern="(env:[A-Z][A-Z0-9_]{1,127}|keychain:[A-Za-z0-9_.-]{1,64}/[A-Za-z0-9_.-]{1,64})" value={draft.credentialRef} onChange={(event) => setDraft((current) => ({ ...current, credentialRef: event.target.value }))} placeholder={t('targets.credentialRefPlaceholder')} className={fieldClass()} aria-describedby="new-version-credential-hint" />
            <span id="new-version-credential-hint" className="mt-1.5 block text-xs leading-5 text-[var(--text-muted)]">{t('targets.credentialRefHint')}</span>
          </label>
        )}
      </section>

      <section aria-labelledby="new-version-modalities" className="space-y-4 border-t border-[var(--border)] pt-5">
        <h3 id="new-version-modalities" className="text-sm font-semibold text-[var(--text)]">{t('targets.modalities')}</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          {(['inputModalities', 'outputModalities'] as const).map((field) => (
            <fieldset key={field}>
              <legend className="mb-2 text-sm font-medium text-[var(--text)]">{t(field === 'inputModalities' ? 'targets.inputModalitiesLabel' : 'targets.outputModalitiesLabel')}</legend>
              <div className="flex flex-wrap gap-2">
                {MODALITIES.map((modality) => (
                  <label key={modality} className="flex min-h-10 cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--border)] px-2.5 text-sm text-[var(--text-muted)]">
                    <input type="checkbox" checked={draft[field].includes(modality)} onChange={() => setDraft((current) => ({ ...current, [field]: toggleModality(current[field], modality) }))} />
                    {t(`targets.modality${modality[0].toUpperCase()}${modality.slice(1)}`)}
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
        </div>
      </section>

      {detail.target.type === 'skill' && (
        <section aria-labelledby="new-version-runtime" className="space-y-4 border-t border-[var(--border)] pt-5">
          <div><h3 id="new-version-runtime" className="text-sm font-semibold text-[var(--text)]">{t('targets.skillBindingTitle')}</h3><p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">{t('targets.skillBindingDescription')}</p></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block"><FieldLabel>{t('targets.hostRuntimeLabel')}</FieldLabel><input required value={draft.hostRuntime} onChange={(event) => setDraft((current) => ({ ...current, hostRuntime: event.target.value }))} className={fieldClass()} /></label>
            <label className="block"><FieldLabel>{t('targets.loadingMethodLabel')}</FieldLabel><select value={draft.loadingMethod} onChange={(event) => setDraft((current) => ({ ...current, loadingMethod: event.target.value as 'file' | 'module' }))} className={fieldClass()}><option value="file">{t('targets.loadingFile')}</option><option value="module">{t('targets.loadingModule')}</option></select></label>
            <label className="block"><FieldLabel>{t('targets.modelParametersRefLabel')}</FieldLabel><input required value={draft.modelParametersRef} onChange={(event) => setDraft((current) => ({ ...current, modelParametersRef: event.target.value }))} className={fieldClass()} /></label>
            <label className="block"><FieldLabel>{t('targets.toolContractRefLabel')}</FieldLabel><input required value={draft.toolContractRef} onChange={(event) => setDraft((current) => ({ ...current, toolContractRef: event.target.value }))} className={fieldClass()} /></label>
            <label className="block sm:col-span-2"><FieldLabel>{t('targets.inputPreprocessorRefLabel')}</FieldLabel><input required value={draft.inputPreprocessorRef} onChange={(event) => setDraft((current) => ({ ...current, inputPreprocessorRef: event.target.value }))} className={fieldClass()} /></label>
            <label className="block sm:col-span-2"><FieldLabel>{t('targets.environmentNotesLabel')}</FieldLabel><textarea rows={2} value={draft.environmentNotes} onChange={(event) => setDraft((current) => ({ ...current, environmentNotes: event.target.value }))} className={`${fieldClass()} py-2.5`} /></label>
          </div>
        </section>
      )}

      {error && <ErrorAlert>{error}</ErrorAlert>}
      <footer className="flex justify-end border-t border-[var(--border)] pt-4">
        <Button type="submit" disabled={busy || !formComplete}>
          {busy && <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />}
          {t('targets.previewVersionAction')}
        </Button>
      </footer>
    </form>
  )

  const review = preview && (
    <div className="space-y-5 p-5 sm:p-6">
      <div>
        <h3 className="text-base font-semibold text-[var(--text)]">{t('targets.versionPreviewTitle')}</h3>
        <p className="mt-1 text-sm leading-6 text-[var(--text-muted)]">{t('targets.versionPreviewDescription')}</p>
      </div>
      <section className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-deep)] p-4">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] bg-[var(--accent-dim)] text-[var(--accent)]"><FileLock2 size={18} aria-hidden="true" /></span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[var(--text)]"><span>{detail.version.label}</span><ArrowRight size={14} aria-hidden="true" /><span>{preview.preview.version_label}</span></div>
            <p className="mt-1 text-xs text-[var(--text-muted)]">{t('targets.versionNumberPreview', { count: preview.preview.next_version_number })} · {targetAdapterLabel(t, preview.preview.adapter)}</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 border-t border-[var(--border)] pt-3">
          <Badge variant="warning">{targetStatusLabel(t, preview.preview.initial_status)}</Badge>
          <Badge>{targetConnectionLabel(t, preview.preview.connection_status)}</Badge>
          {preview.preview.reuses_server_credential && <Badge variant="success">{t('targets.credentialReused')}</Badge>}
        </div>
        <ul className="mt-4 space-y-1.5">
          {preview.preview.writes.map((path) => <li key={path} className="flex items-center gap-2 text-xs text-[var(--text)]"><Check size={13} className="text-[var(--success)]" aria-hidden="true" /><code>{path}</code></li>)}
        </ul>
      </section>
      <div className="rounded-[var(--radius-sm)] border border-[var(--warning-border)] bg-[var(--warning-bg)] px-4 py-3 text-sm leading-6 text-[var(--warning-text)]">
        <p className="font-medium">{t('targets.versionNoTest')}</p>
        <p className="mt-1">{t('targets.versionPreservesHistory')}</p>
      </div>
      {error && <ErrorAlert>{error}</ErrorAlert>}
      <footer className="flex justify-between gap-3 border-t border-[var(--border)] pt-4">
        <Button type="button" variant="ghost" disabled={busy} onClick={() => { setPreview(null); setPreviewInput(null); setError('') }}><ChevronLeft size={16} aria-hidden="true" />{t('targets.previous')}</Button>
        <Button type="button" disabled={busy} onClick={() => void confirmCreate()}>{busy && <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />}{t('targets.confirmVersionCreate')}</Button>
      </footer>
    </div>
  )

  return createPortal(
    <div className="fixed inset-0 z-[100]">
      <button type="button" aria-label={t('targets.closeVersionDrawer')} className="absolute inset-0 h-full w-full bg-slate-950/45 backdrop-blur-[2px]" onClick={busy ? undefined : onClose} />
      <section ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="target-version-create-title" aria-describedby="target-version-create-description" className="absolute inset-y-0 right-0 flex w-full max-w-[680px] flex-col border-l border-[var(--border)] bg-[var(--bg-card)] shadow-[var(--shadow-lg)]">
        <header className="flex shrink-0 items-start justify-between border-b border-[var(--border)] px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 id="target-version-create-title" className="text-lg font-semibold text-[var(--text)]">{t('targets.createVersionTitle')}</h2>
            <p id="target-version-create-description" className="mt-1 text-sm leading-5 text-[var(--text-muted)]">{t('targets.createVersionDescription', { version: detail.version.label })}</p>
          </div>
          <button type="button" disabled={busy} onClick={onClose} aria-label={t('targets.closeVersionDrawer')} className="coarse-target ml-4 grid h-9 w-9 shrink-0 place-items-center rounded-[var(--radius-sm)] text-[var(--text-muted)] hover:bg-[var(--bg-card2)] hover:text-[var(--text)]"><X size={18} aria-hidden="true" /></button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">{preview ? review : editor}</div>
      </section>
    </div>,
    document.body,
  )
}
