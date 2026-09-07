import { useState } from 'react'
import { CheckCircle2, LoaderCircle, Play, ShieldCheck, TriangleAlert, XCircle } from 'lucide-react'
import {
  confirmTargetConnectionCheck,
  previewTargetConnectionCheck,
  type TargetConnectionCheck,
  type TargetConnectionCheckPreview,
  type TargetVersion,
} from '@/api/workbench'
import { useLocale } from '@/contexts/LocaleContext'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import ErrorAlert from '@/components/ui/ErrorAlert'

function operationKey(): string {
  const suffix = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`
  return `web-check-target-${suffix}`
}

export default function TargetConnectionCheckPanel({
  projectId,
  targetId,
  version,
  onCompleted,
}: {
  projectId: string
  targetId: string
  version: TargetVersion
  onCompleted: () => void
}) {
  const { t, locale } = useLocale()
  const [sampleText, setSampleText] = useState('"你好，请回复：连接成功"')
  const [preview, setPreview] = useState<TargetConnectionCheckPreview | null>(null)
  const [previewInput, setPreviewInput] = useState<unknown>()
  const [result, setResult] = useState<TargetConnectionCheck | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [busy, setBusy] = useState<'preview' | 'confirm' | null>(null)
  const [error, setError] = useState('')

  const resetPreview = (value: string) => {
    setSampleText(value)
    setPreview(null)
    setPreviewInput(undefined)
    setResult(null)
    setWarnings([])
    setError('')
  }

  const parseSample = (): unknown => {
    try {
      return JSON.parse(sampleText)
    } catch {
      throw new Error(t('targets.trialInvalidJson'))
    }
  }

  const previewCheck = async () => {
    setBusy('preview')
    setError('')
    setResult(null)
    try {
      const sample = parseSample()
      const next = await previewTargetConnectionCheck(projectId, targetId, version.id, sample)
      setPreviewInput(sample)
      setPreview(next)
      setWarnings(next.warnings)
    } catch (reason) {
      setPreview(null)
      setPreviewInput(undefined)
      setError(reason instanceof Error ? reason.message : t('targets.trialPreviewFailed'))
    } finally {
      setBusy(null)
    }
  }

  const confirmCheck = async () => {
    if (!preview?.confirmation || previewInput === undefined) return
    setBusy('confirm')
    setError('')
    try {
      const response = await confirmTargetConnectionCheck(
        projectId,
        targetId,
        version.id,
        previewInput,
        preview.confirmation.token,
        operationKey(),
      )
      setResult(response.check)
      setWarnings(response.warnings)
      setPreview(null)
      setPreviewInput(undefined)
      onCompleted()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('targets.trialFailed'))
      setPreview(null)
      setPreviewInput(undefined)
    } finally {
      setBusy(null)
    }
  }

  const formatTime = (value: string) => new Date(value).toLocaleString(
    locale === 'zh' ? 'zh-CN' : 'en-US',
    { dateStyle: 'medium', timeStyle: 'short' },
  )

  return (
    <section className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-[var(--shadow-sm)] sm:p-5" aria-labelledby="target-trial-heading">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-[var(--accent-dim)] text-[var(--accent)]">
          <Play size={17} aria-hidden="true" />
        </span>
        <div>
          <h2 id="target-trial-heading" className="font-semibold text-[var(--text)]">{t('targets.trialTitle')}</h2>
          <p className="mt-1 text-sm leading-5 text-[var(--text-muted)]">{t('targets.trialDescription')}</p>
        </div>
      </div>

      <label className="mt-4 block">
        <span className="mb-1.5 block text-sm font-medium text-[var(--text)]">{t('targets.trialInputLabel')}</span>
        <textarea
          value={sampleText}
          onChange={(event) => resetPreview(event.target.value)}
          rows={4}
          spellCheck={false}
          className="w-full resize-y rounded-[var(--radius-sm)] border border-[var(--border-md)] bg-[var(--bg-card)] px-3 py-2.5 font-mono text-xs leading-5 text-[var(--text)] outline-none placeholder:text-[var(--text-dim)] focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent-dim)]"
        />
      </label>
      <p className="mt-1.5 text-xs leading-5 text-[var(--text-dim)]">{t('targets.trialInputHint')}</p>

      {error && <ErrorAlert className="mt-3">{error}</ErrorAlert>}

      {preview?.verdict === 'blocked' && (
        <div role="status" className="mt-3 rounded-[var(--radius-sm)] border border-[var(--warning-border)] bg-[var(--warning-bg)] p-3 text-sm text-[var(--warning-text)]">
          <div className="flex items-center gap-2 font-medium"><TriangleAlert size={15} aria-hidden="true" />{t('targets.trialBlocked')}</div>
          <p className="mt-1 leading-5">{preview.blockingReasons[0]}</p>
        </div>
      )}

      {preview?.confirmation && (
        <div className="mt-3 rounded-[var(--radius-sm)] border border-[var(--warning-border)] bg-[var(--warning-bg)] p-3 text-sm text-[var(--warning-text)]">
          <div className="flex items-center gap-2 font-semibold"><TriangleAlert size={15} aria-hidden="true" />{t('targets.trialConfirmTitle')}</div>
          <p className="mt-1 leading-5">{t('targets.trialConfirmDescription', { origin: preview.preview.endpoint_origin || '—' })}</p>
          <p className="mt-1 text-xs leading-5">{t('targets.trialNoPersist')}</p>
          <Button className="mt-3 w-full sm:w-auto" onClick={confirmCheck} disabled={busy !== null}>
            {busy === 'confirm' ? <LoaderCircle size={15} className="animate-spin" aria-hidden="true" /> : <ShieldCheck size={15} aria-hidden="true" />}
            {busy === 'confirm' ? t('targets.trialRunning') : t('targets.trialConfirmAction')}
          </Button>
        </div>
      )}

      {result && (
        <div role="status" className={`mt-3 rounded-[var(--radius-sm)] border p-3 text-sm ${
          result.status === 'passed'
            ? 'border-[var(--success-border)] bg-[var(--success-bg)] text-[var(--success)]'
            : 'border-[var(--danger-border)] bg-[var(--danger-bg)] text-[var(--danger)]'
        }`}>
          <div className="flex items-center gap-2 font-semibold">
            {result.status === 'passed' ? <CheckCircle2 size={16} aria-hidden="true" /> : <XCircle size={16} aria-hidden="true" />}
            {result.status === 'passed' ? t('targets.trialPassed') : t('targets.trialNotPassed')}
          </div>
          <dl className="mt-2 grid grid-cols-2 gap-2 text-xs">
            <div><dt className="opacity-75">{t('targets.trialDuration')}</dt><dd className="mt-0.5 font-mono">{result.duration_ms} ms</dd></div>
            <div><dt className="opacity-75">{t('targets.trialHttpStatus')}</dt><dd className="mt-0.5 font-mono">{result.http_status ?? '—'}</dd></div>
            <div className="col-span-2"><dt className="opacity-75">{t('targets.trialCheckedAt')}</dt><dd className="mt-0.5">{formatTime(result.checked_at)}</dd></div>
            {result.error_code && <div className="col-span-2"><dt className="opacity-75">{t('targets.trialErrorCode')}</dt><dd className="mt-0.5 font-mono">{result.error_code}</dd></div>}
          </dl>
        </div>
      )}

      {warnings.map((warning) => <p key={warning} className="mt-2 text-xs leading-5 text-[var(--text-dim)]">{warning}</p>)}

      {!preview?.confirmation && preview?.verdict !== 'blocked' && (
        <Button variant="outline" className="mt-4 w-full sm:w-auto" onClick={previewCheck} disabled={busy !== null || !sampleText.trim()}>
          {busy === 'preview' ? <LoaderCircle size={15} className="animate-spin" aria-hidden="true" /> : <Play size={15} aria-hidden="true" />}
          {busy === 'preview' ? t('targets.trialPreviewing') : t('targets.trialPreviewAction')}
        </Button>
      )}
      <div className="mt-3"><Badge>{t('targets.trialManualOnly')}</Badge></div>
    </section>
  )
}
