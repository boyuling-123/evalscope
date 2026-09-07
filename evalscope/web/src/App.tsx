import { BrowserRouter, Routes, Route, Navigate, Outlet, useParams } from 'react-router-dom'
import { LocaleProvider } from '@/contexts/LocaleContext'
import { ProjectProvider, useProjects } from '@/contexts/ProjectContext'
import { ReportsProvider } from '@/contexts/ReportsContext'
import { ThemeProvider } from '@/contexts/ThemeContext'
import MainLayout from '@/layouts/MainLayout'
import ErrorBoundary from '@/components/common/ErrorBoundary'
import { lazy, Suspense } from 'react'
import Skeleton from '@/components/ui/Skeleton'
import { isProjectId, projectRoute } from '@/navigation/projectRoutes'

const DashboardPage = lazy(() => import('@/pages/DashboardPage'))
const ProjectsPage = lazy(() => import('@/pages/ProjectsPage'))
const RunsPage = lazy(() => import('@/pages/RunsPage'))
const ReportDetailPage = lazy(() => import('@/pages/ReportDetailPage'))
const ComparePage = lazy(() => import('@/pages/ComparePage'))
const TasksPage = lazy(() => import('@/pages/TasksPage'))
const PerfReportDetailPage = lazy(() => import('@/pages/PerfReportDetailPage'))
const PerfComparePage = lazy(() => import('@/pages/PerfComparePage'))
const ReportViewerPage = lazy(() => import('@/pages/ReportViewerPage'))
const BenchmarksPage = lazy(() => import('@/pages/BenchmarksPage'))
const TargetsPage = lazy(() => import('@/pages/TargetsPage'))
const TargetDetailPage = lazy(() => import('@/pages/TargetDetailPage'))

function ProjectRouteGuard() {
  const { projectId } = useParams()
  const { projects, loading } = useProjects()
  if (loading) return <Skeleton lines={5} height={16} className="p-2" />
  if (!isProjectId(projectId) || !projects.some((project) => project.id === projectId)) {
    return <Navigate to="/projects" replace />
  }
  return <Outlet />
}

function ProjectIndexRedirect() {
  const { projectId } = useParams()
  return <Navigate to={projectRoute(projectId)} replace />
}

function LegacyRouteRedirect({ path }: { path: string }) {
  const { projects, loading } = useProjects()
  if (loading) return <Skeleton lines={5} height={16} className="p-2" />
  return <Navigate to={projectRoute(projects[0]?.id, path)} replace />
}

function AppRoutes() {
  return (
    <Suspense fallback={<Skeleton lines={6} height={16} className="p-6" />}>
      <Routes>
        <Route element={<MainLayout />}>
          <Route path="/projects" element={<ProjectsPage />} />
          <Route element={<ProjectRouteGuard />}>
            <Route path="/project/:projectId" element={<ProjectIndexRedirect />} />
            <Route path="/project/:projectId/dashboard" element={<DashboardPage />} />
            <Route path="/project/:projectId/targets" element={<TargetsPage />} />
            <Route path="/project/:projectId/targets/:targetId" element={<TargetDetailPage />} />
            <Route path="/project/:projectId/runs" element={<RunsPage />} />
            <Route path="/project/:projectId/runs/new" element={<TasksPage />} />
            <Route path="/project/:projectId/runs/compare" element={<ComparePage />} />
            <Route path="/project/:projectId/runs/quality/:runId/:modelId" element={<ReportDetailPage />} />
            <Route path="/project/:projectId/runs/performance/detail" element={<PerfReportDetailPage />} />
            <Route path="/project/:projectId/runs/performance/compare" element={<PerfComparePage />} />
            <Route path="/project/:projectId/runs/viewer" element={<ReportViewerPage />} />
            <Route path="/project/:projectId/benchmarks" element={<BenchmarksPage />} />
          </Route>

          {/* Preserve old bookmarks while moving every working page into a project scope. */}
          <Route path="/dashboard" element={<LegacyRouteRedirect path="/dashboard" />} />
          <Route path="/reports" element={<LegacyRouteRedirect path="/runs" />} />
          <Route path="/performance" element={<LegacyRouteRedirect path="/runs?view=performance" />} />
          <Route path="/tasks" element={<LegacyRouteRedirect path="/runs/new" />} />
          <Route path="/eval" element={<LegacyRouteRedirect path="/runs/new?tab=eval" />} />
          <Route path="/perf" element={<LegacyRouteRedirect path="/runs/new?tab=perf" />} />
          <Route path="/benchmarks" element={<LegacyRouteRedirect path="/benchmarks" />} />
          <Route path="*" element={<Navigate to="/projects" replace />} />
        </Route>
      </Routes>
    </Suspense>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <ErrorBoundary>
        <ThemeProvider defaultTheme="light">
          <LocaleProvider defaultLocale="zh">
            <ProjectProvider>
              <ReportsProvider>
                <AppRoutes />
              </ReportsProvider>
            </ProjectProvider>
          </LocaleProvider>
        </ThemeProvider>
      </ErrorBoundary>
    </BrowserRouter>
  )
}
