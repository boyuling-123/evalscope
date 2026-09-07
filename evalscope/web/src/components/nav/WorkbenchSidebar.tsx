import { useEffect } from 'react'
import { NavLink, useParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useLocale } from '@/contexts/LocaleContext'
import {
  getOverviewNavigation,
  getWorkbenchNavigation,
  type WorkbenchNavItem,
} from '@/navigation/workbenchNavigation'
import { isProjectId } from '@/navigation/projectRoutes'
import ProjectSwitcher from './ProjectSwitcher'

interface WorkbenchSidebarProps {
  collapsed: boolean
  mobileOpen: boolean
  onToggleCollapsed: () => void
  onCloseMobile: () => void
}

interface SidebarContentProps {
  collapsed: boolean
  mobile: boolean
  onToggleCollapsed: () => void
  onCloseMobile: () => void
}

function Brand({ collapsed }: { collapsed: boolean }) {
  const { t } = useLocale()

  return (
    <NavLink
      to="/projects"
      end
      aria-label={t('nav.brand')}
      className="coarse-target flex min-w-0 items-center gap-2.5 rounded-[var(--radius-sm)] px-1.5 py-1 text-[var(--text)]"
    >
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-[7px] bg-[var(--accent)] text-xs font-bold text-[var(--text-on-filled)]">
        E
      </span>
      {!collapsed && (
        <span className="truncate text-sm font-semibold tracking-[-0.01em]">{t('nav.brand')}</span>
      )}
    </NavLink>
  )
}

function SidebarLink({ item, collapsed, onNavigate }: {
  item: WorkbenchNavItem
  collapsed: boolean
  onNavigate?: () => void
}) {
  const { t } = useLocale()
  const Icon = item.icon

  return (
    <NavLink
      to={item.to}
      end={item.end}
      title={collapsed ? t(item.labelKey) : undefined}
      onClick={onNavigate}
      className={({ isActive }) =>
        `coarse-target group flex min-h-10 items-center rounded-[var(--radius-sm)] text-sm font-medium transition-colors ${
          collapsed ? 'justify-center px-2' : 'gap-3 px-3'
        } ${
          isActive
            ? 'bg-[var(--bg-card2)] text-[var(--text)] shadow-[inset_2px_0_0_var(--accent)]'
            : 'text-[var(--text-muted)] hover:bg-[var(--bg-card2)] hover:text-[var(--text)]'
        }`
      }
    >
      <Icon size={17} strokeWidth={1.9} className="shrink-0" aria-hidden="true" />
      {!collapsed && <span className="truncate">{t(item.labelKey)}</span>}
    </NavLink>
  )
}

function SidebarContent({
  collapsed,
  mobile,
  onToggleCollapsed,
  onCloseMobile,
}: SidebarContentProps) {
  const { t } = useLocale()
  const { projectId } = useParams()
  const hasProject = isProjectId(projectId)
  const overviewNavigation = hasProject ? getOverviewNavigation(projectId) : null
  const workbenchNavigation = hasProject ? getWorkbenchNavigation(projectId) : []

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className={`flex h-12 shrink-0 items-center border-b border-[var(--border)] ${collapsed ? 'justify-center px-2' : 'justify-between px-3'}`}>
        <Brand collapsed={collapsed} />
        {mobile && (
          <button
            type="button"
            onClick={onCloseMobile}
            aria-label={t('nav.closeNavigation')}
            className="coarse-target grid h-9 w-9 shrink-0 place-items-center rounded-[var(--radius-sm)] text-[var(--text-muted)] hover:bg-[var(--bg-card2)] hover:text-[var(--text)]"
          >
            <X size={18} aria-hidden="true" />
          </button>
        )}
      </div>

      <div className="shrink-0 border-b border-[var(--border)] py-2">
        <ProjectSwitcher collapsed={collapsed} />
      </div>

      <nav aria-label={t('nav.primaryNavigation')} className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
        {overviewNavigation && (
          <SidebarLink item={overviewNavigation} collapsed={collapsed} onNavigate={mobile ? onCloseMobile : undefined} />
        )}

        {workbenchNavigation.map((group) => (
          <section
            key={group.key}
            className="mt-5"
            aria-label={collapsed ? t(group.labelKey) : undefined}
            aria-labelledby={collapsed ? undefined : `nav-group-${group.key}${mobile ? '-mobile' : ''}`}
          >
            {!collapsed && (
              <p
                id={`nav-group-${group.key}${mobile ? '-mobile' : ''}`}
                className="mb-1.5 px-3 text-[11px] font-semibold tracking-[0.08em] text-[var(--text-dim)]"
              >
                {t(group.labelKey)}
              </p>
            )}
            <div className="flex flex-col gap-1">
              {group.items.map((item) => (
                <SidebarLink
                  key={item.to}
                  item={item}
                  collapsed={collapsed}
                  onNavigate={mobile ? onCloseMobile : undefined}
                />
              ))}
            </div>
          </section>
        ))}
      </nav>

      <div className="shrink-0 border-t border-[var(--border)] p-2">
        {!mobile && (
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-label={collapsed ? t('nav.expandSidebar') : t('nav.collapseSidebar')}
            className={`coarse-target flex min-h-10 w-full items-center rounded-[var(--radius-sm)] text-sm text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-card2)] hover:text-[var(--text)] ${
              collapsed ? 'justify-center px-2' : 'gap-3 px-3'
            }`}
          >
            {collapsed ? <ChevronRight size={17} aria-hidden="true" /> : <ChevronLeft size={17} aria-hidden="true" />}
            {!collapsed && <span>{t('nav.collapseSidebar')}</span>}
          </button>
        )}
      </div>
    </div>
  )
}

export default function WorkbenchSidebar({
  collapsed,
  mobileOpen,
  onToggleCollapsed,
  onCloseMobile,
}: WorkbenchSidebarProps) {
  const { t } = useLocale()

  useEffect(() => {
    if (!mobileOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseMobile()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [mobileOpen, onCloseMobile])

  return (
    <>
      <aside
        className={`sticky top-0 hidden h-screen shrink-0 border-r border-[var(--border)] bg-[var(--bg-card)] transition-[width] duration-200 lg:block ${
          collapsed ? 'w-[68px]' : 'w-[236px]'
        }`}
      >
        <SidebarContent
          collapsed={collapsed}
          mobile={false}
          onToggleCollapsed={onToggleCollapsed}
          onCloseMobile={onCloseMobile}
        />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-[70] lg:hidden">
          <button
            type="button"
            aria-label={t('nav.closeNavigation')}
            onClick={onCloseMobile}
            className="absolute inset-0 h-full w-full bg-black/45 backdrop-blur-[2px]"
          />
          <aside
            id="mobile-workbench-navigation"
            className="relative z-10 h-full w-[min(86vw,320px)] border-r border-[var(--border)] bg-[var(--bg-card)] shadow-[var(--shadow-lg)]"
          >
            <SidebarContent
              collapsed={false}
              mobile
              onToggleCollapsed={onToggleCollapsed}
              onCloseMobile={onCloseMobile}
            />
          </aside>
        </div>
      )}
    </>
  )
}
