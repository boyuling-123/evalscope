import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import WorkbenchPageHeader from '@/components/nav/WorkbenchPageHeader'
import WorkbenchSidebar from '@/components/nav/WorkbenchSidebar'
import WorkbenchTopbar from '@/components/nav/WorkbenchTopbar'
import PathBar from '@/components/ui/PathBar'
import ErrorBoundary from '@/components/common/ErrorBoundary'
import { useScan } from '@/contexts/ReportsContext'
import { useLocale } from '@/contexts/LocaleContext'

// Project overview and run lists share the local output-directory control.
function showsScanPath(pathname: string): boolean {
  return /^\/project\/[^/]+\/(dashboard|runs)$/.test(pathname)
}

export default function MainLayout() {
  const location = useLocation()
  const { t } = useLocale()
  const { rootPath, triggerScan } = useScan()
  const [visible, setVisible] = useState(true)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false)
  // Bumped by the route-level boundary's retry, which remounts the page in place
  // instead of reloading the document and losing the scan state.
  const [reloadToken, setReloadToken] = useState(0)
  const prevPath = useRef(location.pathname)

  // Local mirror of rootPath so typing does not fan out a rescan on every keystroke.
  const [pathInput, setPathInput] = useState(rootPath)
  useEffect(() => {
    const sync = () => setPathInput(rootPath)
    sync()
  }, [rootPath])

  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0 })
  }, [location.pathname])

  useEffect(() => {
    if (prevPath.current !== location.pathname) {
      setVisible(false)
      const timer = setTimeout(() => {
        setVisible(true)
        prevPath.current = location.pathname
      }, 60)
      return () => clearTimeout(timer)
    }
  }, [location.pathname])

  const showPathBar = showsScanPath(location.pathname)

  return (
    <div className="workbench-canvas flex min-h-screen">
      <WorkbenchSidebar
        collapsed={sidebarCollapsed}
        mobileOpen={mobileNavigationOpen}
        onToggleCollapsed={() => setSidebarCollapsed((current) => !current)}
        onCloseMobile={() => setMobileNavigationOpen(false)}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <WorkbenchTopbar
          mobileNavigationOpen={mobileNavigationOpen}
          onOpenNavigation={() => setMobileNavigationOpen(true)}
        />
        <main className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col gap-4 px-4 py-4 sm:px-6 lg:px-7 lg:py-5">
          <WorkbenchPageHeader />
          {showPathBar && (
            <PathBar
              value={pathInput}
              onChange={setPathInput}
              onSubmit={() => triggerScan(pathInput.trim())}
              placeholder={t('reports.pathLabel')}
              submitLabel={t('reports.scan')}
              scanningLabel={t('reports.scanning')}
            />
          )}
          <div
            key={location.pathname}
            className="page-enter"
            style={{ opacity: visible ? undefined : 0 }}
          >
            {/* Keyed by route so a page that throws is contained: the nav, theme and
                locale stay usable, and navigating elsewhere clears the error by
                remount rather than by discarding the session. */}
            <ErrorBoundary
              key={location.pathname}
              labels={{
                title: t('common.pageErrorTitle'),
                body: t('common.pageErrorBody'),
                action: t('common.retry'),
              }}
              onRecover={() => setReloadToken((token) => token + 1)}
            >
              <Outlet key={reloadToken} />
            </ErrorBoundary>
          </div>
        </main>
      </div>
    </div>
  )
}
