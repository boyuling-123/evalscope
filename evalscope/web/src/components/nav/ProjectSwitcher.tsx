import { FolderKanban } from 'lucide-react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useLocale } from '@/contexts/LocaleContext'
import { useProjects } from '@/contexts/ProjectContext'
import { isProjectId, projectRouteFromPathname } from '@/navigation/projectRoutes'

export default function ProjectSwitcher({ collapsed }: { collapsed: boolean }) {
  const { t } = useLocale()
  const { projects } = useProjects()
  const { projectId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()

  if (collapsed) {
    return (
      <Link
        to="/projects"
        aria-label={t('projects.allProjects')}
        title={t('projects.allProjects')}
        className="coarse-target mx-auto grid h-10 w-10 place-items-center rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-deep)] text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[var(--accent)]"
      >
        <FolderKanban size={17} aria-hidden="true" />
      </Link>
    )
  }

  return (
    <div className="px-2">
      <label className="block">
        <span className="sr-only">
          {t('projects.switchLabel')}
        </span>
        <span className="relative block">
          <FolderKanban size={15} className="pointer-events-none absolute left-2.5 top-1/2 z-10 -translate-y-1/2 text-[var(--text-dim)]" aria-hidden="true" />
          <select
            aria-label={t('projects.switchLabel')}
            value={isProjectId(projectId) ? projectId : ''}
            onChange={(event) => {
              if (!event.target.value) {
                navigate('/projects')
                return
              }
              navigate(projectRouteFromPathname(
                `${location.pathname}${location.search}`,
                event.target.value,
              ))
            }}
            className="min-h-9 w-full rounded-[6px] border border-transparent bg-[var(--bg-card2)] py-1 pl-8 pr-2 text-sm font-medium text-[var(--text)] outline-none hover:border-[var(--border-md)] focus:border-[var(--accent)]"
          >
            <option value="">{t('projects.allProjects')}</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>{project.name}</option>
            ))}
          </select>
        </span>
      </label>
    </div>
  )
}
