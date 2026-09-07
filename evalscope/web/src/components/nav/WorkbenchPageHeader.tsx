import { Plus } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { useLocale } from '@/contexts/LocaleContext'
import { resolveWorkbenchPageMeta } from '@/navigation/workbenchNavigation'

export default function WorkbenchPageHeader() {
  const { pathname } = useLocation()
  const { t } = useLocale()
  const pageMeta = resolveWorkbenchPageMeta(pathname)

  if (!pageMeta?.showPageHeader) return null

  return (
    <header className="flex flex-col gap-3 border-b border-[var(--border)] pb-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-[-0.02em] text-[var(--text)] sm:text-[22px]">
          {t(pageMeta.titleKey)}
        </h1>
        {pageMeta.descriptionKey && (
          <p className="mt-1 max-w-3xl text-[13px] leading-5 text-[var(--text-muted)]">
            {t(pageMeta.descriptionKey)}
          </p>
        )}
      </div>
      {pageMeta.action && (
        <Link
          to={pageMeta.action.to}
          className="coarse-target inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-[var(--radius-sm)] bg-[var(--accent)] px-3.5 text-sm font-medium text-[var(--text-on-filled)] shadow-[var(--shadow-sm)] transition-colors hover:bg-[var(--accent-dark)]"
        >
          <Plus size={15} aria-hidden="true" />
          {t(pageMeta.action.labelKey)}
        </Link>
      )}
    </header>
  )
}
