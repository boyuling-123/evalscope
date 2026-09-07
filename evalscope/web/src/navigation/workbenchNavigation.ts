import {
  BarChart3,
  BookOpen,
  ListChecks,
  type LucideIcon,
} from 'lucide-react'
import { projectRoute } from './projectRoutes'

export interface WorkbenchNavItem {
  to: string
  labelKey: string
  icon: LucideIcon
  end?: boolean
}

export interface WorkbenchNavGroup {
  key: 'observe' | 'evaluation' | 'optimization' | 'integration'
  labelKey: string
  items: WorkbenchNavItem[]
}

export function getOverviewNavigation(projectId: string): WorkbenchNavItem {
  return {
    to: projectRoute(projectId, '/dashboard'),
    labelKey: 'nav.dashboard',
    icon: BarChart3,
    end: true,
  }
}

// Empty PRD groups stay hidden until they contain a route backed by a working
// Action and page. This keeps the Langfuse-style hierarchy honest.
export function getWorkbenchNavigation(projectId: string): WorkbenchNavGroup[] {
  return [
    {
      key: 'evaluation',
      labelKey: 'nav.groupEvaluation',
      items: [
        { to: projectRoute(projectId, '/runs'), labelKey: 'nav.runs', icon: ListChecks },
        { to: projectRoute(projectId, '/benchmarks'), labelKey: 'nav.benchmarks', icon: BookOpen },
      ],
    },
  ]
}

export interface WorkbenchPageAction {
  labelKey: string
  to: string
}

export interface WorkbenchPageMeta {
  sectionKey: string
  titleKey: string
  descriptionKey?: string
  showPageHeader: boolean
  action?: WorkbenchPageAction
}

interface PageMetaMatcher {
  matches: (pathname: string) => RegExpMatchArray | null
  build: (match: RegExpMatchArray) => WorkbenchPageMeta
}

const staticMeta = (
  sectionKey: string,
  titleKey: string,
  options: Omit<WorkbenchPageMeta, 'sectionKey' | 'titleKey'>,
) => (): WorkbenchPageMeta => ({ sectionKey, titleKey, ...options })

const pageMetaMatchers: PageMetaMatcher[] = [
  {
    matches: (pathname) => pathname.match(/^\/projects$/),
    build: staticMeta('nav.workspace', 'projects.title', {
      descriptionKey: 'projects.description',
      showPageHeader: true,
      action: { labelKey: 'projects.createAction', to: '/projects?create=1' },
    }),
  },
  {
    matches: (pathname) => pathname.match(/^\/project\/([^/]+)\/runs\/quality\/[^/]+\/[^/]+$/),
    build: staticMeta('nav.groupEvaluation', 'nav.runDetail', { showPageHeader: false }),
  },
  {
    matches: (pathname) => pathname.match(/^\/project\/([^/]+)\/runs\/performance\/(detail|compare)$/),
    build: staticMeta('nav.groupEvaluation', 'nav.performanceDetail', { showPageHeader: false }),
  },
  {
    matches: (pathname) => pathname.match(/^\/project\/([^/]+)\/runs\/viewer$/),
    build: staticMeta('nav.groupEvaluation', 'nav.reportViewer', { showPageHeader: false }),
  },
  {
    matches: (pathname) => pathname.match(/^\/project\/([^/]+)\/runs\/compare$/),
    build: staticMeta('nav.groupEvaluation', 'nav.compare', { showPageHeader: false }),
  },
  {
    matches: (pathname) => pathname.match(/^\/project\/([^/]+)\/dashboard$/),
    build: (match) => ({
      sectionKey: 'nav.workspace',
      titleKey: 'nav.dashboard',
      descriptionKey: 'nav.dashboardDescription',
      showPageHeader: true,
      action: { labelKey: 'nav.newRun', to: projectRoute(match[1], '/runs/new') },
    }),
  },
  {
    matches: (pathname) => pathname.match(/^\/project\/([^/]+)\/runs\/new$/),
    build: staticMeta('nav.groupEvaluation', 'nav.newRun', {
      descriptionKey: 'nav.newRunDescription',
      showPageHeader: true,
    }),
  },
  {
    matches: (pathname) => pathname.match(/^\/project\/([^/]+)\/runs$/),
    build: (match) => ({
      sectionKey: 'nav.groupEvaluation',
      titleKey: 'nav.runs',
      descriptionKey: 'nav.runsDescription',
      showPageHeader: true,
      action: { labelKey: 'nav.newRun', to: projectRoute(match[1], '/runs/new') },
    }),
  },
  {
    matches: (pathname) => pathname.match(/^\/project\/([^/]+)\/benchmarks$/),
    build: staticMeta('nav.groupEvaluation', 'nav.benchmarks', {
      descriptionKey: 'nav.benchmarksDescription',
      showPageHeader: true,
    }),
  },
]

export function resolveWorkbenchPageMeta(pathname: string): WorkbenchPageMeta | null {
  for (const matcher of pageMetaMatchers) {
    const match = matcher.matches(pathname)
    if (match) return matcher.build(match)
  }
  return null
}

export const workbenchPageMetadata: WorkbenchPageMeta[] = [
  resolveWorkbenchPageMeta('/projects'),
  resolveWorkbenchPageMeta('/project/prj_aaaaaaaaaaaaaaaaaaaa/dashboard'),
  resolveWorkbenchPageMeta('/project/prj_aaaaaaaaaaaaaaaaaaaa/runs'),
  resolveWorkbenchPageMeta('/project/prj_aaaaaaaaaaaaaaaaaaaa/runs/new'),
  resolveWorkbenchPageMeta('/project/prj_aaaaaaaaaaaaaaaaaaaa/benchmarks'),
].filter((meta): meta is WorkbenchPageMeta => Boolean(meta))
