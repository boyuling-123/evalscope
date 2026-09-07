import type { ReactNode } from 'react'
import { ArrowLeft, Box, KeyRound, LockKeyhole, RefreshCw, ShieldAlert } from 'lucide-react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { getTarget, type TargetStatus } from '@/api/workbench'
import { useLocale } from '@/contexts/LocaleContext'
import { useAsyncResource } from '@/hooks/useAsyncResource'
import { isProjectId, projectRoute } from '@/navigation/projectRoutes'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import ErrorAlert from '@/components/ui/ErrorAlert'
import Skeleton from '@/components/ui/Skeleton'
import Tabs from '@/components/ui/Tabs'
import {
  targetAdapterLabel,
  targetConnectionLabel,
  targetModalityLabel,
  targetStatusLabel,
  targetTypeLabel,
} from '@/components/targets/targetPresentation'

type DetailTab = 'overview' | 'versions' | 'connection'

function statusVariant(status: TargetStatus): 'default' | 'success' | 'warning' | 'danger' {
  if (status === 'ready') return 'success'
  if (status === 'draft') return 'warning'
  if (status === 'unavailable') return 'danger'
  return 'default'
}

function DefinitionItem({ label, children, mono = false }: { label: string; children: ReactNode; mono?: boolean }) {
  return (
    <div className="min-w-0 border-b border-[var(--border)] py-3 last:border-b-0">
      <dt className="text-xs font-medium text-[var(--text-dim)]">{label}</dt>
      <dd className={`mt-1 break-words text-sm text-[var(--text)] ${mono ? 'font-mono text-xs' : ''}`}>{children}</dd>
    </div>
  )
}

export default function TargetDetailPage() {
  const { projectId, targetId } = useParams()
  const { t, locale } = useLocale()
  const [searchParams, setSearchParams] = useSearchParams()
  const queryTab = searchParams.get('tab')
  const activeTab: DetailTab = queryTab === 'versions' || queryTab === 'connection' ? queryTab : 'overview'
  const validProjectId = isProjectId(projectId) ? projectId : ''
  const validTargetId = targetId?.match(/^tgt_[a-f0-9]{20}$/) ? targetId : ''
  const versionId = searchParams.get('version') || undefined
  const resource = useAsyncResource(
    async (signal) => getTarget(validProjectId, validTargetId, versionId, signal),
    [validProjectId, validTargetId, versionId],
    { enabled: Boolean(validProjectId && validTargetId), fallbackMessage: t('targets.loadFailed') },
  )
  const detail = resource.data
  const formatTime = (value?: string) => value
    ? new Date(value).toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' })
    : t('targets.never')

  if (resource.loading && !detail) {
    return <div className="space-y-4"><Skeleton lines={3} height={18} /><Skeleton lines={10} height={14} /></div>
  }

  if (resource.error || !detail) {
    return (
      <div className="space-y-4">
        <Link to={projectRoute(validProjectId, '/targets')} className="inline-flex items-center gap-2 text-sm font-medium text-[var(--text-muted)] hover:text-[var(--accent)]"><ArrowLeft size={15} aria-hidden="true" />{t('targets.backToTargets')}</Link>
        <ErrorAlert>{resource.error || t('targets.loadFailed')}</ErrorAlert>
        <Button variant="outline" onClick={resource.reload}><RefreshCw size={15} aria-hidden="true" />{t('targets.retry')}</Button>
      </div>
    )
  }

  const { target, version, versions } = detail
  const changeTab = (key: string) => {
    const tab = key as DetailTab
    const next = new URLSearchParams(searchParams)
    if (tab === 'overview') next.delete('tab')
    else next.set('tab', tab)
    setSearchParams(next, { replace: true })
  }
  const selectVersion = (selectedVersionId: string) => {
    const next = new URLSearchParams(searchParams)
    next.set('version', selectedVersionId)
    next.set('tab', 'versions')
    setSearchParams(next)
  }

  const overviewPanel = (
    <section className="mt-4 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-[var(--shadow-sm)] sm:p-5" aria-labelledby="target-overview-heading">
      <h2 id="target-overview-heading" className="text-base font-semibold text-[var(--text)]">{t('targets.overviewTitle')}</h2>
      <div className="mt-4 grid gap-x-8 md:grid-cols-2">
        <dl>
          <DefinitionItem label={t('targets.targetId')} mono>{target.id}</DefinitionItem>
          <DefinitionItem label={t('targets.typeLabel')}>{targetTypeLabel(t, target.type)}</DefinitionItem>
          <DefinitionItem label={t('targets.descriptionLabel')}>{target.description || t('targets.noDescription')}</DefinitionItem>
          <DefinitionItem label={t('targets.capabilities')}>{target.capabilities.length ? target.capabilities.join('、') : t('targets.noCapabilities')}</DefinitionItem>
        </dl>
        <dl>
          <DefinitionItem label={t('targets.modalities')}>{version.input_modalities.map((item) => targetModalityLabel(t, item)).join('、')} → {version.output_modalities.map((item) => targetModalityLabel(t, item)).join('、')}</DefinitionItem>
          <DefinitionItem label={t('targets.currentVersion')}>{version.label} · #{version.version_number}</DefinitionItem>
          <DefinitionItem label={t('targets.providerLabel')}>{version.provider}</DefinitionItem>
          <DefinitionItem label={t('targets.createdAt')}>{formatTime(target.created_at)}</DefinitionItem>
        </dl>
      </div>
    </section>
  )

  const versionsPanel = (
    <section className="mt-4 overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-card)] shadow-[var(--shadow-sm)]" aria-labelledby="target-versions-heading">
      <header className="border-b border-[var(--border)] px-4 py-4 sm:px-5"><h2 id="target-versions-heading" className="text-base font-semibold text-[var(--text)]">{t('targets.versionsTitle')}</h2></header>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-[var(--bg-deep)] text-xs text-[var(--text-muted)]"><tr><th className="px-4 py-3 sm:pl-5">{t('targets.columnVersion')}</th><th className="px-4 py-3">{t('targets.providerLabel')}</th><th className="px-4 py-3">{t('targets.connectionStatus')}</th><th className="px-4 py-3">{t('targets.configHash')}</th><th className="px-4 py-3 sm:pr-5">{t('targets.createdAt')}</th></tr></thead>
          <tbody className="divide-y divide-[var(--border)]">
            {versions.map((item) => (
              <tr key={item.id} className={item.id === version.id ? 'bg-[var(--accent-dim)]' : 'hover:bg-[var(--bg-deep)]'}>
                <td className="px-4 py-3 sm:pl-5"><button type="button" onClick={() => selectVersion(item.id)} className="font-medium text-[var(--accent)] hover:underline">{item.label} · #{item.version_number}</button></td>
                <td className="px-4 py-3 text-[var(--text-muted)]">{item.provider}</td>
                <td className="px-4 py-3"><Badge variant={item.connection_status === 'passed' ? 'success' : item.connection_status === 'failed' ? 'danger' : 'warning'}>{targetConnectionLabel(t, item.connection_status)}</Badge></td>
                <td className="px-4 py-3 font-mono text-xs text-[var(--text-muted)]"><span title={item.config_hash}>{item.config_hash.slice(0, 12)}…</span></td>
                <td className="px-4 py-3 text-xs text-[var(--text-muted)] sm:pr-5">{formatTime(item.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )

  const connectionPanel = (
    <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <section className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-[var(--shadow-sm)] sm:p-5" aria-labelledby="target-connection-heading">
        <h2 id="target-connection-heading" className="text-base font-semibold text-[var(--text)]">{t('targets.connectionTitle')}</h2>
        <dl className="mt-3">
          <DefinitionItem label={t('targets.adapterLabel')}>{targetAdapterLabel(t, version.connection.adapter)}</DefinitionItem>
          <DefinitionItem label={t('targets.endpoint')} mono>{version.connection.endpoint || '—'}</DefinitionItem>
          <DefinitionItem label={t('targets.modelId')} mono>{version.connection.model_id || '—'}</DefinitionItem>
          <DefinitionItem label={t('targets.method')} mono>{version.connection.method}</DefinitionItem>
          <DefinitionItem label={t('targets.inputField')} mono>{version.connection.input_field}</DefinitionItem>
          <DefinitionItem label={t('targets.outputPath')} mono>{version.connection.output_path}</DefinitionItem>
          <DefinitionItem label={t('targets.timeout')}>{t('targets.seconds', { count: version.connection.timeout_seconds })}</DefinitionItem>
          <DefinitionItem label={t('targets.credential')}><span className="inline-flex items-center gap-2"><KeyRound size={14} className="text-[var(--text-dim)]" aria-hidden="true" />{version.connection.credential_configured ? t('targets.credentialConfigured') : t('targets.credentialMissing')}</span></DefinitionItem>
        </dl>
      </section>
      <div className="space-y-4">
        {version.connection.adapter !== 'evalscope_model' && (
          <aside className="rounded-[var(--radius)] border border-[var(--warning-border)] bg-[var(--warning-bg)] p-4 text-sm text-[var(--warning-text)]">
            <ShieldAlert size={18} aria-hidden="true" />
            <h2 className="mt-3 font-semibold">{t('targets.blackBoxTitle')}</h2>
            <p className="mt-1 leading-6">{t('targets.blackBoxDescription')}</p>
          </aside>
        )}
        {version.runtime_binding && (
          <section className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-card)] p-4" aria-labelledby="runtime-binding-heading">
            <LockKeyhole size={18} className="text-[var(--accent)]" aria-hidden="true" />
            <h2 id="runtime-binding-heading" className="mt-3 font-semibold text-[var(--text)]">{t('targets.runtimeBindingTitle')}</h2>
            <dl className="mt-2">
              <DefinitionItem label={t('targets.hostRuntimeLabel')} mono>{version.runtime_binding.host_runtime}</DefinitionItem>
              <DefinitionItem label={t('targets.modelParametersRefLabel')} mono>{version.runtime_binding.model_parameters_ref}</DefinitionItem>
              <DefinitionItem label={t('targets.toolContractRefLabel')} mono>{version.runtime_binding.tool_contract_ref}</DefinitionItem>
              <DefinitionItem label={t('targets.loadingMethodLabel')}>{version.runtime_binding.loading_method === 'file' ? t('targets.loadingFile') : t('targets.loadingModule')}</DefinitionItem>
              <DefinitionItem label={t('targets.inputPreprocessorRefLabel')} mono>{version.runtime_binding.input_preprocessor_ref}</DefinitionItem>
            </dl>
          </section>
        )}
      </div>
    </div>
  )

  return (
    <div className="space-y-4">
      <Link to={projectRoute(validProjectId, '/targets')} className="inline-flex items-center gap-2 text-sm font-medium text-[var(--text-muted)] hover:text-[var(--accent)]"><ArrowLeft size={15} aria-hidden="true" />{t('targets.backToTargets')}</Link>
      <header className="flex flex-col gap-4 border-b border-[var(--border)] pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-[11px] border border-[var(--border)] bg-[var(--bg-card)] text-[var(--accent)]"><Box size={19} aria-hidden="true" /></span><div className="min-w-0"><h1 className="truncate text-xl font-semibold tracking-[-0.02em] text-[var(--text)] sm:text-[22px]">{target.name}</h1><p className="mt-0.5 truncate font-mono text-xs text-[var(--text-dim)]">{target.id}</p></div></div>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--text-muted)]">{target.description || t('targets.noDescription')}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2"><Badge>{targetTypeLabel(t, target.type)}</Badge><Badge variant={statusVariant(target.status)}>{targetStatusLabel(t, target.status)}</Badge><Badge variant={version.connection_status === 'passed' ? 'success' : version.connection_status === 'failed' ? 'danger' : 'warning'}>{targetConnectionLabel(t, version.connection_status)}</Badge></div>
      </header>

      <Tabs
        tabs={[
          { key: 'overview', labelKey: 'targets.overviewTab', panelId: 'target-overview-panel' },
          { key: 'versions', labelKey: 'targets.versionsTab', panelId: 'target-versions-panel' },
          { key: 'connection', labelKey: 'targets.connectionTab', panelId: 'target-connection-panel' },
        ]}
        activeKey={activeTab}
        onChange={changeTab}
        panels={{
          'target-overview-panel': overviewPanel,
          'target-versions-panel': versionsPanel,
          'target-connection-panel': connectionPanel,
        }}
      />
    </div>
  )
}
