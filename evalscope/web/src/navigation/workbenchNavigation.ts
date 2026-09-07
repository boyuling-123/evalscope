import {
  BarChart3,
  BookOpen,
  FileText,
  FlaskConical,
  Gauge,
  type LucideIcon,
} from 'lucide-react'

export interface WorkbenchNavItem {
  to: string
  labelKey: string
  icon: LucideIcon
  end?: boolean
}

export interface WorkbenchNavGroup {
  key: string
  labelKey: string
  items: WorkbenchNavItem[]
}

export const overviewNavigation: WorkbenchNavItem = {
  to: '/dashboard',
  labelKey: 'nav.dashboard',
  icon: BarChart3,
  end: true,
}

// Only routes backed by working pages are exposed. Future PRD groups such as
// Observe, Optimize and Integrate stay out of the navigation until their first
// usable capability lands; this prevents a polished shell from overstating the product.
export const workbenchNavigation: WorkbenchNavGroup[] = [
  {
    key: 'evaluation',
    labelKey: 'nav.groupEvaluation',
    items: [
      { to: '/tasks', labelKey: 'nav.tasks', icon: FlaskConical },
      { to: '/reports', labelKey: 'nav.evaluations', icon: FileText },
      { to: '/performance', labelKey: 'nav.performance', icon: Gauge },
      { to: '/benchmarks', labelKey: 'nav.benchmarks', icon: BookOpen },
    ],
  },
]

export interface WorkbenchPageMeta {
  sectionKey: string
  titleKey: string
  descriptionKey?: string
  showPageHeader: boolean
}

interface PageMetaMatcher extends WorkbenchPageMeta {
  matches: (pathname: string) => boolean
}

const pageMetaMatchers: PageMetaMatcher[] = [
  {
    matches: (pathname) => /^\/reports\/[^/]+\/[^/]+$/.test(pathname),
    sectionKey: 'nav.groupEvaluation',
    titleKey: 'nav.evaluationDetail',
    showPageHeader: false,
  },
  {
    matches: (pathname) => pathname === '/perf-report',
    sectionKey: 'nav.groupEvaluation',
    titleKey: 'nav.performanceDetail',
    showPageHeader: false,
  },
  {
    matches: (pathname) => pathname === '/perf-compare',
    sectionKey: 'nav.groupEvaluation',
    titleKey: 'nav.performanceCompare',
    showPageHeader: false,
  },
  {
    matches: (pathname) => pathname === '/viewer',
    sectionKey: 'nav.groupEvaluation',
    titleKey: 'nav.reportViewer',
    showPageHeader: false,
  },
  {
    matches: (pathname) => pathname === '/dashboard',
    sectionKey: 'nav.workspace',
    titleKey: 'nav.dashboard',
    descriptionKey: 'nav.dashboardDescription',
    showPageHeader: true,
  },
  {
    matches: (pathname) => pathname === '/tasks',
    sectionKey: 'nav.groupEvaluation',
    titleKey: 'nav.tasks',
    descriptionKey: 'nav.tasksDescription',
    showPageHeader: true,
  },
  {
    matches: (pathname) => pathname === '/reports',
    sectionKey: 'nav.groupEvaluation',
    titleKey: 'nav.evaluations',
    descriptionKey: 'nav.evaluationsDescription',
    showPageHeader: true,
  },
  {
    matches: (pathname) => pathname === '/compare',
    sectionKey: 'nav.groupEvaluation',
    titleKey: 'nav.compare',
    descriptionKey: 'nav.compareDescription',
    showPageHeader: true,
  },
  {
    matches: (pathname) => pathname === '/performance',
    sectionKey: 'nav.groupEvaluation',
    titleKey: 'nav.performance',
    descriptionKey: 'nav.performanceDescription',
    showPageHeader: true,
  },
  {
    matches: (pathname) => pathname === '/benchmarks',
    sectionKey: 'nav.groupEvaluation',
    titleKey: 'nav.benchmarks',
    descriptionKey: 'nav.benchmarksDescription',
    showPageHeader: true,
  },
]

function toPageMeta(matcher: PageMetaMatcher): WorkbenchPageMeta {
  return {
    sectionKey: matcher.sectionKey,
    titleKey: matcher.titleKey,
    descriptionKey: matcher.descriptionKey,
    showPageHeader: matcher.showPageHeader,
  }
}

export const workbenchPageMetadata: WorkbenchPageMeta[] = pageMetaMatchers.map(toPageMeta)

export function resolveWorkbenchPageMeta(pathname: string): WorkbenchPageMeta | null {
  const match = pageMetaMatchers.find((candidate) => candidate.matches(pathname))
  if (!match) return null
  return toPageMeta(match)
}
