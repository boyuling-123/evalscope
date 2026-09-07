import { useState } from 'react'
import { ArrowRight, Boxes, FlaskConical, RefreshCw } from 'lucide-react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { listTargets, type TargetStatus, type TargetSummary, type TargetType } from '@/api/workbench'
import { useLocale } from '@/contexts/LocaleContext'
import { useAsyncResource } from '@/hooks/useAsyncResource'
import { isProjectId, projectRoute } from '@/navigation/projectRoutes'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import ErrorAlert from '@/components/ui/ErrorAlert'
import SearchInput from '@/components/ui/SearchInput'
import Skeleton from '@/components/ui/Skeleton'
import TargetCreateDrawer from '@/components/targets/TargetCreateDrawer'
import {
  targetAdapterLabel,
  targetConnectionLabel,
  targetModalityLabel,
  targetStatusLabel,
  targetTypeLabel,
} from '@/components/targets/targetPresentation'

const EMPTY_TARGETS: TargetSummary[] = []
const TARGET_TYPES: TargetType[] = ['model', 'agent', 'workflow', 'skill', 'algorithm']
const TARGET_STATUSES: TargetStatus[] = ['draft', 'ready', 'unavailable', 'archived']

function statusVariant(status: TargetStatus): 'default' | 'success' | 'warning' | 'danger' {
  if (status === 'ready') return 'success'
  if (status === 'draft') return 'warning'
  if (status === 'unavailable') return 'danger'
  return 'default'
}

export default function TargetsPage() {
  const { projectId } = useParams()
  const { t, locale } = useLocale()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<TargetType | 'all'>('all')
  const [statusFilter, setStatusFilter] = useState<TargetStatus | 'all'>('all')
  const validProjectId = isProjectId(projectId) ? projectId : ''
  const createOpen = searchParams.get('create') === '1'
  const resource = useAsyncResource(
    async (signal) => listTargets(validProjectId, signal),
    [validProjectId],
    { enabled: Boolean(validProjectId), fallbackMessage: t('targets.loadFailed') },
  )
  const targets = resource.data?.targets ?? EMPTY_TARGETS
  const normalizedSearch = search.trim().toLocaleLowerCase(locale === 'zh' ? 'zh-CN' : 'en-US')
  const filteredTargets = targets.filter(({ target, latest_version: version }) => {
    if (typeFilter !== 'all' && target.type !== typeFilter) return false
    if (statusFilter !== 'all' && target.status !== statusFilter) return false
    if (!normalizedSearch) return true
    return [target.name, version.provider, ...target.capabilities]
      .some((value) => value.toLocaleLowerCase(locale === 'zh' ? 'zh-CN' : 'en-US').includes(normalizedSearch))
  })

  const closeCreate = () => {
    const next = new URLSearchParams(searchParams)
    next.delete('create')
    setSearchParams(next, { replace: true })
  }

  const formatTime = (value?: string) => value
    ? new Date(value).toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' })
    : t('targets.never')

  const modalities = (target: TargetSummary) => {
    const input = target.latest_version.input_modalities.map((item) => targetModalityLabel(t, item)).join('、')
    const output = target.latest_version.output_modalities.map((item) => targetModalityLabel(t, item)).join('、')
    return `${input} → ${output}`
  }

  return (
    <div className="space-y-4">
      <section className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-card)] shadow-[var(--shadow-sm)]" aria-labelledby="target-directory-title">
        <header className="flex flex-col gap-3 border-b border-[var(--border)] px-4 py-4 sm:px-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 id="target-directory-title" className="text-base font-semibold text-[var(--text)]">{t('targets.directoryTitle')}</h2>
            <p className="mt-1 text-sm leading-5 text-[var(--text-muted)]">{t('targets.directoryDescription')}</p>
          </div>
          <p className="shrink-0 text-xs text-[var(--text-dim)]">{t('targets.resultCount', { count: filteredTargets.length })}</p>
        </header>

        <div className="flex flex-col gap-3 border-b border-[var(--border)] bg-[var(--bg-deep)] px-4 py-3 sm:flex-row sm:items-center sm:px-5">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder={t('targets.searchPlaceholder')}
            ariaLabel={t('targets.searchPlaceholder')}
            clearLabel={t('targets.clearSearch')}
            className="w-full sm:max-w-sm"
          />
          <label>
            <span className="sr-only">{t('targets.typeLabel')}</span>
            <select
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value as TargetType | 'all')}
              className="min-h-11 w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-card)] px-3 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)] sm:min-h-9 sm:w-auto"
            >
              <option value="all">{t('targets.allTypes')}</option>
              {TARGET_TYPES.map((type) => <option key={type} value={type}>{targetTypeLabel(t, type)}</option>)}
            </select>
          </label>
          <label>
            <span className="sr-only">{t('targets.columnStatus')}</span>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as TargetStatus | 'all')}
              className="min-h-11 w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-card)] px-3 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)] sm:min-h-9 sm:w-auto"
            >
              <option value="all">{t('targets.allStatuses')}</option>
              {TARGET_STATUSES.map((status) => <option key={status} value={status}>{targetStatusLabel(t, status)}</option>)}
            </select>
          </label>
        </div>

        {resource.error && (
          <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <ErrorAlert className="flex-1">{resource.error}</ErrorAlert>
            <Button variant="outline" onClick={resource.reload}><RefreshCw size={15} aria-hidden="true" />{t('targets.retry')}</Button>
          </div>
        )}
        {resource.data?.warnings.map((warning) => (
          <div key={warning} role="status" className="mx-4 mt-4 rounded-[var(--radius-sm)] border border-[var(--warning-border)] bg-[var(--warning-bg)] px-4 py-3 text-sm text-[var(--warning-text)] sm:mx-5">{warning}</div>
        ))}

        {resource.loading && !resource.data ? (
          <div className="p-5"><Skeleton lines={8} height={14} /></div>
        ) : filteredTargets.length > 0 ? (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[1120px] border-collapse text-left text-sm">
                <thead className="bg-[var(--bg-deep)] text-xs font-semibold text-[var(--text-muted)]">
                  <tr>
                    {[t('targets.columnName'), t('targets.columnType'), t('targets.columnVersion'), t('targets.columnProvider'), t('targets.columnModalities'), t('targets.columnAdapter'), t('targets.columnLastConnected'), t('targets.columnLastRun'), t('targets.columnStatus')].map((heading) => (
                      <th key={heading} scope="col" className="border-b border-[var(--border)] px-4 py-3 first:pl-5 last:pr-5">{heading}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {filteredTargets.map((item) => (
                    <tr key={item.target.id} className="group hover:bg-[var(--bg-deep)]">
                      <td className="px-4 py-3.5 pl-5">
                        <Link to={projectRoute(validProjectId, `/targets/${item.target.id}`)} className="block max-w-[240px] font-medium text-[var(--text)] hover:text-[var(--accent)]">
                          <span className="block truncate">{item.target.name}</span>
                          <span className="mt-0.5 block truncate font-mono text-[11px] font-normal text-[var(--text-dim)]">{item.target.id}</span>
                        </Link>
                      </td>
                      <td className="px-4 py-3.5"><Badge>{targetTypeLabel(t, item.target.type)}</Badge></td>
                      <td className="px-4 py-3.5 font-mono text-xs text-[var(--text-muted)]">{item.latest_version.label}</td>
                      <td className="max-w-[170px] truncate px-4 py-3.5 text-[var(--text-muted)]">{item.latest_version.provider}</td>
                      <td className="px-4 py-3.5 text-xs text-[var(--text-muted)]">{modalities(item)}</td>
                      <td className="px-4 py-3.5 text-xs text-[var(--text-muted)]">{targetAdapterLabel(t, item.latest_version.connection.adapter)}</td>
                      <td className="px-4 py-3.5 text-xs text-[var(--text-muted)]">{formatTime(item.latest_version.last_connected_at)}</td>
                      <td className="max-w-[150px] truncate px-4 py-3.5 font-mono text-xs text-[var(--text-muted)]">{item.target.last_run_id || t('targets.noRun')}</td>
                      <td className="px-4 py-3.5 pr-5">
                        <Badge variant={statusVariant(item.target.status)}>{targetStatusLabel(t, item.target.status)}</Badge>
                        <span className="mt-1 block whitespace-nowrap text-[11px] text-[var(--text-dim)]">{targetConnectionLabel(t, item.latest_version.connection_status)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-[var(--border)] md:hidden">
              {filteredTargets.map((item) => (
                <Link key={item.target.id} to={projectRoute(validProjectId, `/targets/${item.target.id}`)} className="block p-4 hover:bg-[var(--bg-deep)]">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0"><h3 className="truncate font-semibold text-[var(--text)]">{item.target.name}</h3><p className="mt-1 truncate text-xs text-[var(--text-muted)]">{item.latest_version.provider} · {item.latest_version.label}</p></div>
                    <ArrowRight size={16} className="mt-1 shrink-0 text-[var(--text-dim)]" aria-hidden="true" />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2"><Badge>{targetTypeLabel(t, item.target.type)}</Badge><Badge variant={statusVariant(item.target.status)}>{targetStatusLabel(t, item.target.status)}</Badge></div>
                  <dl className="mt-3 grid grid-cols-2 gap-3 text-xs"><div><dt className="text-[var(--text-dim)]">{t('targets.columnModalities')}</dt><dd className="mt-1 text-[var(--text-muted)]">{modalities(item)}</dd></div><div><dt className="text-[var(--text-dim)]">{t('targets.columnAdapter')}</dt><dd className="mt-1 text-[var(--text-muted)]">{targetAdapterLabel(t, item.latest_version.connection.adapter)}</dd></div></dl>
                </Link>
              ))}
            </div>
          </>
        ) : !resource.error ? (
          <div className="grid min-h-[330px] place-items-center px-6 py-10 text-center">
            <div className="max-w-md">
              <span className="mx-auto grid h-12 w-12 place-items-center rounded-[14px] border border-[var(--border)] bg-[var(--bg-deep)] text-[var(--accent)]"><Boxes size={22} aria-hidden="true" /></span>
              <h3 className="mt-4 font-semibold text-[var(--text)]">{targets.length ? t('targets.noMatchesTitle') : t('targets.emptyTitle')}</h3>
              <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">{targets.length ? t('targets.noMatchesDescription') : t('targets.emptyDescription')}</p>
              {!targets.length && <Button className="mt-5" onClick={() => setSearchParams({ create: '1' })}>{t('targets.createAction')}</Button>}
            </div>
          </div>
        ) : null}
      </section>

      <aside className="flex items-start gap-3 rounded-[var(--radius-sm)] border border-dashed border-[var(--border-md)] bg-[var(--bg-card)] px-4 py-3 text-sm text-[var(--text-muted)]">
        <FlaskConical size={16} className="mt-0.5 shrink-0 text-[var(--text-dim)]" aria-hidden="true" />
        <p className="leading-5"><Badge className="mr-2">{t('targets.plannedBadge')}</Badge>{t('targets.plannedImports')}</p>
      </aside>

      {createOpen && (
        <TargetCreateDrawer
          open
          projectId={validProjectId}
          onClose={closeCreate}
          onCreated={(detail) => navigate(projectRoute(validProjectId, `/targets/${detail.target.id}`))}
        />
      )}
    </div>
  )
}
