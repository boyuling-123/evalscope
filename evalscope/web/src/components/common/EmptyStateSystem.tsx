import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AlertCircle, Inbox, SearchX } from 'lucide-react'
import { useLocale } from '@/contexts/LocaleContext'
import EmptyState from '@/components/common/EmptyState'
import Button from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import { projectRouteOr } from '@/navigation/projectRoutes'

export const MAX_REVEAL_DELAY_MS = 300

export type EmptyReason = 'no-data' | 'load-error' | 'no-match'
export type EmptyStateView =
  | 'dashboard'
  | 'reports'
  | 'evaluations'
  | 'compare'
  | 'performance'
  | 'perf-compare'
  | 'benchmarks'

interface EmptyStateAction {
  labelKey: string
  navigateTo: string
}

export interface ResolvedEmptyStateAction {
  label: string
  navigateTo: string
}

export interface EmptyStateContext {
  view?: EmptyStateView
  retryTo?: string
  clearFiltersTo?: string
  createTaskTo?: string
  extraActions?: EmptyStateAction[]
}

const VIEW_ROUTES: Record<EmptyStateView, string> = {
  dashboard: '/dashboard',
  reports: '/reports',
  evaluations: '/reports',
  compare: '/compare',
  performance: '/performance',
  'perf-compare': '/perf-compare',
  benchmarks: '/benchmarks',
}

function viewRoute(context: EmptyStateContext, projectId?: string): string {
  const legacy = context.view ? VIEW_ROUTES[context.view] : '/dashboard'
  if (context.view === 'performance') return projectRouteOr(projectId, '/runs?view=performance', legacy)
  if (context.view === 'perf-compare') return projectRouteOr(projectId, '/runs/performance/compare', legacy)
  if (context.view === 'compare') return projectRouteOr(projectId, '/runs/compare', legacy)
  if (context.view === 'benchmarks') return projectRouteOr(projectId, '/benchmarks', legacy)
  if (context.view === 'reports' || context.view === 'evaluations') {
    return projectRouteOr(projectId, '/runs', legacy)
  }
  return projectRouteOr(projectId, '/dashboard', legacy)
}

function createTaskRoute(context: EmptyStateContext, projectId?: string): string {
  if (context.createTaskTo?.trim()) return context.createTaskTo.trim()
  if (context.view === 'performance' || context.view === 'perf-compare') {
    return projectRouteOr(projectId, '/runs/new?tab=perf', '/tasks?tab=perf')
  }
  if (context.view === 'reports' || context.view === 'evaluations' || context.view === 'compare') {
    return projectRouteOr(projectId, '/runs/new?tab=eval', '/tasks?tab=eval')
  }
  return projectRouteOr(projectId, '/runs/new', '/tasks')
}

function actionsFor(reason: EmptyReason, context: EmptyStateContext, projectId?: string): EmptyStateAction[] {
  const actions: EmptyStateAction[] = reason === 'no-data'
    ? [
        { labelKey: 'empty.action.createTask', navigateTo: createTaskRoute(context, projectId) },
        { labelKey: 'empty.action.browseBenchmarks', navigateTo: projectRouteOr(projectId, '/benchmarks') },
      ]
    : reason === 'load-error'
      ? [
          { labelKey: 'empty.action.retry', navigateTo: context.retryTo?.trim() || viewRoute(context, projectId) },
          { labelKey: 'empty.action.backToDashboard', navigateTo: projectRouteOr(projectId, '/dashboard') },
        ]
      : [
          { labelKey: 'empty.action.clearFilters', navigateTo: context.clearFiltersTo?.trim() || viewRoute(context, projectId) },
          { labelKey: 'empty.action.createTask', navigateTo: createTaskRoute(context, projectId) },
        ]

  const seen = new Set<string>()
  return [...actions, ...(context.extraActions ?? [])]
    .map((action) => ({ ...action, navigateTo: action.navigateTo.trim() }))
    .filter((action) => action.navigateTo && !seen.has(action.navigateTo) && seen.add(action.navigateTo))
    .slice(0, 3)
}

/** Default reason-specific icon (28px Lucide, matching `EmptyState`). */
const REASON_ICON: Record<EmptyReason, ReactNode> = {
  'no-data': <Inbox size={28} strokeWidth={1.5} />,
  'load-error': <AlertCircle size={28} strokeWidth={1.5} />,
  'no-match': <SearchX size={28} strokeWidth={1.5} />,
}

export interface EmptyStateSystemProps {
  reason: EmptyReason
  loading?: boolean
  context?: EmptyStateContext
  icon?: ReactNode
  hint?: string
  className?: string
  onAction?: (action: ResolvedEmptyStateAction) => boolean | void
  revealDelayMs?: number
}

function RevealAfterDelay({ delay, children }: { delay: number; children: ReactNode }) {
  const [visible, setVisible] = useState(delay === 0)

  useEffect(() => {
    if (delay === 0) return
    const timer = window.setTimeout(() => setVisible(true), delay)
    return () => window.clearTimeout(timer)
  }, [delay])

  return visible ? children : null
}

export default function EmptyStateSystem({
  reason,
  loading = false,
  context,
  icon,
  hint,
  className,
  onAction,
  revealDelayMs = 0,
}: EmptyStateSystemProps) {
  const { t } = useLocale()
  const navigate = useNavigate()
  const { projectId } = useParams()
  const delay = Math.min(Math.max(revealDelayMs, 0), MAX_REVEAL_DELAY_MS)

  const resolved = useMemo(() => {
    const actions = actionsFor(reason, context ?? {}, projectId).map((action) => ({
      label: t(action.labelKey),
      navigateTo: action.navigateTo,
    }))
    return { message: t(`empty.${reason}.message`), actions }
  }, [reason, context, projectId, t])

  if (loading) return null

  return (
    <RevealAfterDelay key={`${reason}:${delay}`} delay={delay}>
      <div className={cn('flex flex-col items-center gap-4', className)}>
        <EmptyState icon={icon ?? REASON_ICON[reason]} title={resolved.message} hint={hint} className="py-8" />
        {resolved.actions.length > 0 && (
          <div className="flex flex-wrap items-center justify-center gap-2 -mt-2 pb-8">
            {resolved.actions.map((action, index) => (
              <Button
                key={action.navigateTo}
                variant={index === 0 ? 'primary' : 'outline'}
                size="sm"
                onClick={() => {
                  if (onAction?.(action) === true) return
                  navigate(action.navigateTo)
                }}
              >
                {action.label}
              </Button>
            ))}
          </div>
        )}
      </div>
    </RevealAfterDelay>
  )
}
