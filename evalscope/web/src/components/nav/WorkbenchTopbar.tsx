import { ChevronRight, HardDrive, Menu } from 'lucide-react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { useLocale } from '@/contexts/LocaleContext'
import { useProjects } from '@/contexts/ProjectContext'
import { resolveWorkbenchPageMeta } from '@/navigation/workbenchNavigation'
import { isProjectId, projectRoute } from '@/navigation/projectRoutes'
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
  const { projectId } = useParams()
  const { projects } = useProjects()
  const pageMeta = resolveWorkbenchPageMeta(pathname)
  const project = isProjectId(projectId)
    ? projects.find((candidate) => candidate.id === projectId)
    : undefined

  return (
    <header className="sticky top-0 z-50 flex h-12 shrink-0 items-center justify-between border-b border-[var(--border)] bg-[var(--surface-glass)] px-3 backdrop-blur-xl sm:px-5">
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

        <nav aria-label={t('nav.breadcrumb')} className="flex min-w-0 items-center gap-1.5 text-xs text-[var(--text-muted)]">
          <Link to="/projects" className="coarse-target truncate hover:text-[var(--text)]">{t('projects.title')}</Link>
          {project && (
            <>
              <ChevronRight size={13} className="shrink-0 text-[var(--text-dim)]" aria-hidden="true" />
              <Link
                to={projectRoute(project.id)}
                className="coarse-target max-w-44 truncate font-medium text-[var(--text)] hover:text-[var(--accent)]"
              >
                {project.name}
              </Link>
            </>
          )}
          {project && pageMeta && (
            <>
              <ChevronRight size={13} className="shrink-0 text-[var(--text-dim)]" aria-hidden="true" />
              <span className="max-w-40 truncate">{t(pageMeta.titleKey)}</span>
            </>
          )}
        </nav>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <div className="mr-1 hidden items-center gap-1.5 rounded-[6px] px-2 py-1 text-xs font-medium text-[var(--text-muted)] sm:flex">
          <HardDrive size={13} aria-hidden="true" />
          {t('nav.localMode')}
        </div>
        <LocaleToggle />
        <ThemeToggle />
      </div>
    </header>
  )
}
