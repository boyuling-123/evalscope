import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowRight,
  Check,
  FolderKanban,
  HardDrive,
  LoaderCircle,
  Plus,
  RefreshCw,
  X,
} from 'lucide-react'
import { useLocale } from '@/contexts/LocaleContext'
import { useProjects } from '@/contexts/ProjectContext'
import { projectRoute } from '@/navigation/projectRoutes'
import type { ProjectCreateInput, ProjectCreatePreview } from '@/api/workbench'
import Button from '@/components/ui/Button'
import ErrorAlert from '@/components/ui/ErrorAlert'
import Skeleton from '@/components/ui/Skeleton'

function operationKey(): string {
  const suffix = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`
  return `web-create-project-${suffix}`
}

function ProjectCreateDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useLocale()
  const navigate = useNavigate()
  const { previewCreate, create } = useProjects()
  const [input, setInput] = useState<ProjectCreateInput>({ name: '', description: '' })
  const [preview, setPreview] = useState<ProjectCreatePreview | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const panelRef = useRef<HTMLElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const busyRef = useRef(busy)

  useEffect(() => {
    busyRef.current = busy
  }, [busy])

  useEffect(() => {
    if (!open) return
    const previousFocus = document.activeElement as HTMLElement | null
    panelRef.current?.querySelector<HTMLElement>('input:not([disabled])')?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busyRef.current) {
        event.stopPropagation()
        onClose()
        return
      }
      if (event.key !== 'Tab' || !panelRef.current) return
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement as HTMLElement | null
      if (!active || !Array.from(focusable).includes(active)) {
        event.preventDefault()
        const next = event.shiftKey ? last : first
        next.focus()
      } else if (event.shiftKey && active === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      previousFocus?.focus?.()
    }
  }, [onClose, open])

  useEffect(() => {
    if (open && preview) titleRef.current?.focus()
  }, [open, preview])

  if (!open) return null

  const submitPreview = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      setPreview(await previewCreate({
        name: input.name.trim(),
        description: input.description?.trim() || undefined,
      }))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('projects.createFailed'))
    } finally {
      setBusy(false)
    }
  }

  const confirmCreate = async () => {
    if (!preview) return
    setBusy(true)
    setError('')
    try {
      const project = await create(
        { name: preview.preview.name, description: preview.preview.description },
        preview.confirmation.token,
        operationKey(),
      )
      navigate(projectRoute(project.id))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('projects.createFailed'))
      setPreview(null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[90] grid place-items-center p-4">
      <button
        type="button"
        aria-label={t('projects.closeDialog')}
        className="absolute inset-0 bg-slate-950/45 backdrop-blur-[2px]"
        onClick={busy ? undefined : onClose}
      />
      <section
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-project-title"
        aria-describedby="create-project-description"
        className="relative z-10 w-full max-w-lg overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-card)] shadow-[var(--shadow-lg)]"
      >
        <header className="flex items-start justify-between border-b border-[var(--border)] px-5 py-4">
          <div>
            <h2
              ref={titleRef}
              id="create-project-title"
              tabIndex={-1}
              className="text-lg font-semibold text-[var(--text)] outline-none"
            >
              {preview ? t('projects.confirmTitle') : t('projects.createTitle')}
            </h2>
            <p id="create-project-description" className="mt-1 text-sm text-[var(--text-muted)]">
              {preview ? t('projects.confirmDescription') : t('projects.createDescription')}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label={t('projects.closeDialog')}
            className="coarse-target grid h-9 w-9 place-items-center rounded-[var(--radius-sm)] text-[var(--text-muted)] hover:bg-[var(--bg-card2)] hover:text-[var(--text)]"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        {preview ? (
          <div className="space-y-4 p-5">
            <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-deep)] p-4">
              <div className="flex items-start gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-[var(--accent-dim)] text-[var(--accent)]">
                  <FolderKanban size={18} aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="font-semibold text-[var(--text)]">{preview.preview.name}</p>
                  <p className="mt-1 text-sm leading-5 text-[var(--text-muted)]">
                    {preview.preview.description || t('projects.noDescription')}
                  </p>
                </div>
              </div>
              <div className="mt-4 border-t border-[var(--border)] pt-3">
                <p className="text-xs font-medium text-[var(--text-muted)]">{t('projects.writeScope')}</p>
                <ul className="mt-2 space-y-1.5">
                  {preview.preview.writes.map((item) => (
                    <li key={item} className="flex items-center gap-2 text-sm text-[var(--text)]">
                      <Check size={14} className="text-[var(--success)]" aria-hidden="true" />
                      <code className="text-xs">{item}</code>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <p className="text-xs leading-5 text-[var(--text-muted)]">{t('projects.confirmHint')}</p>
            {error && <ErrorAlert>{error}</ErrorAlert>}
            <footer className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setPreview(null)} disabled={busy}>
                {t('projects.backToEdit')}
              </Button>
              <Button type="button" onClick={() => void confirmCreate()} disabled={busy}>
                {busy && <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />}
                {t('projects.confirmCreate')}
              </Button>
            </footer>
          </div>
        ) : (
          <form className="space-y-4 p-5" onSubmit={(event) => void submitPreview(event)}>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-[var(--text)]">
                {t('projects.nameLabel')}
              </span>
              <input
                required
                maxLength={120}
                value={input.name}
                onChange={(event) => setInput((current) => ({ ...current, name: event.target.value }))}
                placeholder={t('projects.namePlaceholder')}
                className="min-h-11 w-full rounded-[var(--radius-sm)] border border-[var(--border-md)] bg-[var(--bg-card)] px-3 text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-dim)] focus:border-[var(--accent)]"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-[var(--text)]">
                {t('projects.descriptionLabel')}
              </span>
              <textarea
                rows={3}
                maxLength={1000}
                value={input.description}
                onChange={(event) => setInput((current) => ({ ...current, description: event.target.value }))}
                placeholder={t('projects.descriptionPlaceholder')}
                className="w-full resize-none rounded-[var(--radius-sm)] border border-[var(--border-md)] bg-[var(--bg-card)] px-3 py-2.5 text-sm leading-5 text-[var(--text)] outline-none placeholder:text-[var(--text-dim)] focus:border-[var(--accent)]"
              />
            </label>
            {error && <ErrorAlert>{error}</ErrorAlert>}
            <footer className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={busy || !input.name.trim()}>
                {busy && <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />}
                {t('projects.previewAction')}
              </Button>
            </footer>
          </form>
        )}
      </section>
    </div>
  )
}

export default function ProjectsPage() {
  const { t, locale } = useLocale()
  const { projects, loading, error, warnings, refresh } = useProjects()
  const [searchParams, setSearchParams] = useSearchParams()
  const createOpen = searchParams.get('create') === '1'

  const closeCreate = () => {
    const next = new URLSearchParams(searchParams)
    next.delete('create')
    setSearchParams(next, { replace: true })
  }

  return (
    <div className="space-y-5">
      {error && (
        <div className="flex flex-col gap-3 rounded-[var(--radius)] border border-[var(--danger-border)] bg-[var(--danger-bg)] p-4 sm:flex-row sm:items-center sm:justify-between">
          <ErrorAlert className="border-0 bg-transparent p-0">{error}</ErrorAlert>
          <Button variant="outline" onClick={() => void refresh()}>
            <RefreshCw size={15} aria-hidden="true" />
            {t('projects.retry')}
          </Button>
        </div>
      )}
      {warnings.map((warning) => (
        <div key={warning} role="status" className="rounded-[var(--radius-sm)] border border-[var(--warning-border)] bg-[var(--warning-bg)] px-4 py-3 text-sm text-[var(--warning-text)]">
          {warning}
        </div>
      ))}

      {loading ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-card)] p-5">
              <Skeleton lines={4} height={14} />
            </div>
          ))}
        </div>
      ) : projects.length > 0 ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => (
            <Link
              key={project.id}
              to={projectRoute(project.id)}
              className="group flex min-h-48 flex-col rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-[var(--shadow-sm)] transition-[border-color,box-shadow] hover:border-[var(--border-strong)] hover:shadow-[var(--shadow)]"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-[11px] border border-[var(--border)] bg-[var(--bg-deep)] text-[var(--accent)]">
                  <FolderKanban size={19} aria-hidden="true" />
                </span>
                <ArrowRight size={17} className="text-[var(--text-dim)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--accent)]" aria-hidden="true" />
              </div>
              <h2 className="mt-5 truncate text-base font-semibold text-[var(--text)]">{project.name}</h2>
              <p className="mt-1 line-clamp-2 min-h-10 text-sm leading-5 text-[var(--text-muted)]">
                {project.description || t('projects.noDescription')}
              </p>
              <div className="mt-auto flex items-center justify-between gap-3 border-t border-[var(--border)] pt-3 text-xs text-[var(--text-dim)]">
                <span className="flex min-w-0 items-center gap-1.5">
                  <HardDrive size={13} className="shrink-0" aria-hidden="true" />
                  <span className="truncate">{t('projects.localProject')}</span>
                </span>
                <time dateTime={project.updated_at}>
                  {new Date(project.updated_at).toLocaleDateString(locale === 'zh' ? 'zh-CN' : 'en-US')}
                </time>
              </div>
            </Link>
          ))}
        </div>
      ) : !error ? (
        <section className="grid min-h-[420px] place-items-center rounded-[var(--radius-lg)] border border-dashed border-[var(--border-md)] bg-[var(--bg-card)] px-6 py-12 text-center">
          <div className="max-w-md">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-[14px] border border-[var(--border)] bg-[var(--bg-deep)] text-[var(--accent)]">
              <FolderKanban size={22} aria-hidden="true" />
            </span>
            <h2 className="mt-5 text-lg font-semibold text-[var(--text)]">{t('projects.emptyTitle')}</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">{t('projects.emptyDescription')}</p>
            <Button className="mt-5" onClick={() => setSearchParams({ create: '1' })}>
              <Plus size={16} aria-hidden="true" />
              {t('projects.createAction')}
            </Button>
          </div>
        </section>
      ) : null}

      <ProjectCreateDialog open={createOpen} onClose={closeCreate} />
    </div>
  )
}
