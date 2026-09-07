import { HardDrive, Menu } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { useLocale } from '@/contexts/LocaleContext'
import { resolveWorkbenchPageMeta } from '@/navigation/workbenchNavigation'
import LocaleToggle from './LocaleToggle'
import ThemeToggle from './ThemeToggle'

interface WorkbenchTopbarProps {
  mobileNavigationOpen: boolean
  onOpenNavigation: () => void
}

export default function WorkbenchTopbar({
  mobileNavigationOpen,
  onOpenNavigation,
}: WorkbenchTopbarProps) {
  const { t } = useLocale()
  const { pathname } = useLocation()
  const pageMeta = resolveWorkbenchPageMeta(pathname)

  return (
    <header className="sticky top-0 z-50 flex h-16 shrink-0 items-center justify-between border-b border-[var(--border)] bg-[var(--surface-glass)] px-4 backdrop-blur-xl sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={onOpenNavigation}
          aria-label={t('nav.openNavigation')}
          aria-controls="mobile-workbench-navigation"
          aria-expanded={mobileNavigationOpen}
          className="coarse-target grid h-9 w-9 shrink-0 place-items-center rounded-[var(--radius-sm)] text-[var(--text-muted)] hover:bg-[var(--bg-card2)] hover:text-[var(--text)] lg:hidden"
        >
          <Menu size={18} aria-hidden="true" />
        </button>

        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2 text-xs text-[var(--text-dim)]">
            <HardDrive size={13} className="shrink-0" aria-hidden="true" />
            <span className="truncate">{t('nav.localWorkspace')}</span>
            {pageMeta && (
              <>
                <span aria-hidden="true">/</span>
                <span className="truncate text-[var(--text-muted)]">{t(pageMeta.titleKey)}</span>
              </>
            )}
          </div>
          <p className="mt-0.5 truncate text-sm font-semibold text-[var(--text)]">{t('nav.workspaceName')}</p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <div className="mr-1 hidden items-center gap-1.5 rounded-full border border-[var(--success-border)] bg-[var(--success-bg)] px-2.5 py-1 text-xs font-medium text-[var(--success)] sm:flex">
          <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
          {t('nav.localMode')}
        </div>
        <LocaleToggle />
        <ThemeToggle />
      </div>
    </header>
  )
}
