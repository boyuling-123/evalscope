import { useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useLocale } from '@/contexts/LocaleContext'
import {
  overviewNavigation,
  workbenchNavigation,
  type WorkbenchNavItem,
} from '@/navigation/workbenchNavigation'

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
      to="/dashboard"
      end
      aria-label={t('nav.brand')}
      className="coarse-target flex min-w-0 items-center gap-3 rounded-[var(--radius-sm)] px-2 py-1.5 text-[var(--text)]"
    >
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-[var(--accent)] text-sm font-bold text-[var(--text-on-filled)] shadow-[var(--shadow-glow-soft)]">
        E
      </span>
      {!collapsed && (
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold tracking-tight">{t('nav.brand')}</span>
          <span className="block truncate text-[11px] text-[var(--text-dim)]">{t('nav.brandTagline')}</span>
        </span>
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
            ? 'bg-[var(--accent-dim)] text-[var(--accent)]'
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

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className={`flex h-16 shrink-0 items-center border-b border-[var(--border)] ${collapsed ? 'justify-center px-2' : 'justify-between px-3'}`}>
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

      <nav aria-label={t('nav.primaryNavigation')} className="min-h-0 flex-1 overflow-y-auto px-2 py-4">
        <SidebarLink item={overviewNavigation} collapsed={collapsed} onNavigate={mobile ? onCloseMobile : undefined} />

        {workbenchNavigation.map((group) => (
          <section
            key={group.key}
            className="mt-6"
            aria-label={collapsed ? t(group.labelKey) : undefined}
            aria-labelledby={collapsed ? undefined : `nav-group-${group.key}${mobile ? '-mobile' : ''}`}
          >
            {!collapsed && (
              <h2
                id={`nav-group-${group.key}${mobile ? '-mobile' : ''}`}
                className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-dim)]"
              >
                {t(group.labelKey)}
              </h2>
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
        {!collapsed && (
          <div className="mb-2 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-deep)] px-3 py-2">
            <p className="text-xs font-medium text-[var(--text)]">{t('nav.localMode')}</p>
            <p className="mt-0.5 text-[11px] leading-4 text-[var(--text-dim)]">{t('nav.localModeHint')}</p>
          </div>
        )}
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
          collapsed ? 'w-[72px]' : 'w-[248px]'
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
