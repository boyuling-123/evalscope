import { useLocale } from '@/contexts/LocaleContext'
import { useQueryParams } from '@/hooks/useQueryParams'
import Tabs from '@/components/ui/Tabs'
import ReportsPage from '@/pages/ReportsPage'
import PerfReportsPage from '@/pages/PerfReportsPage'

export default function RunsPage() {
  const { t } = useLocale()
  const { get, set } = useQueryParams()
  const view = get('view') === 'performance' ? 'performance' : 'quality'

  const tabs = [
    { key: 'quality', label: t('runs.qualityTab'), panelId: 'runs-quality-panel' },
    { key: 'performance', label: t('runs.performanceTab'), panelId: 'runs-performance-panel' },
  ]

  return (
    <Tabs
      tabs={tabs}
      activeKey={view}
      onChange={(key) => set('view', key)}
      panels={{
        'runs-quality-panel': <ReportsPage />,
        'runs-performance-panel': <PerfReportsPage />,
      }}
    />
  )
}
