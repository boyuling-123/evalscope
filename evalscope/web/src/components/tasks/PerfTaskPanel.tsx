import { useLocale } from '@/contexts/LocaleContext'
import PerfConfigForm from '@/components/perf/PerfConfigForm'
import TaskRunnerShell from '@/components/tasks/TaskRunnerShell'
import { submitPerfTask, stopPerfTask, getPerfProgress, getPerfLog, getPerfReportUrl } from '@/api/perf'
import { useParams } from 'react-router-dom'

export default function PerfTaskPanel() {
  const { t } = useLocale()
  const { projectId } = useParams()
  return (
    <TaskRunnerShell
      idPrefix="perf"
      projectId={projectId}
      title={t('perf.task.title')}
      configTitle={t('perf.task.config')}
      statusTitle={t('perf.task.status')}
      readyLabel={t('perf.task.ready')}
      submitTask={submitPerfTask}
      stopTask={stopPerfTask}
      getProgress={getPerfProgress}
      getLog={getPerfLog}
      getReportUrl={getPerfReportUrl}
      renderForm={({ onSubmit, disabled }) => <PerfConfigForm onSubmit={onSubmit} disabled={disabled} />}
    />
  )
}
