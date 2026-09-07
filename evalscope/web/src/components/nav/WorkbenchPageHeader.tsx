import { useLocation } from 'react-router-dom'
import { useLocale } from '@/contexts/LocaleContext'
import { resolveWorkbenchPageMeta } from '@/navigation/workbenchNavigation'

export default function WorkbenchPageHeader() {
  const { pathname } = useLocation()
  const { t } = useLocale()
  const pageMeta = resolveWorkbenchPageMeta(pathname)

  if (!pageMeta?.showPageHeader) return null

  return (
    <header className="flex flex-col gap-1 border-b border-[var(--border)] pb-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">
        {t(pageMeta.sectionKey)}
      </p>
      <h1 className="text-2xl font-semibold tracking-tight text-[var(--text)] sm:text-[28px]">
        {t(pageMeta.titleKey)}
      </h1>
      {pageMeta.descriptionKey && (
        <p className="max-w-3xl text-sm leading-6 text-[var(--text-muted)]">
          {t(pageMeta.descriptionKey)}
        </p>
      )}
    </header>
  )
}
