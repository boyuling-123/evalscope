import { useLocale } from '@/contexts/LocaleContext'
import { useQueryParams } from '@/hooks/useQueryParams'
import EvalConfigForm from '@/components/eval/EvalConfigForm'
import TaskRunnerShell from '@/components/tasks/TaskRunnerShell'
import { submitEvalTask, stopEvalTask, getEvalProgress, getEvalLog, getEvalReportUrl } from '@/api/eval'
import { useParams } from 'react-router-dom'

export default function EvalTaskPanel() {
  const { t } = useLocale()
  const queryParams = useQueryParams()
  const { projectId } = useParams()
  const initialDataset = queryParams.get('dataset')
  // Legacy routes may prefill a model. Project routes use stable target IDs instead,
  // and no secret is ever carried in the URL.
  const initialModel = queryParams.get('model')
  const initialTargetId = queryParams.get('targetId')
  const initialTargetVersionId = queryParams.get('targetVersionId')

  return (
    <TaskRunnerShell
      idPrefix="eval"
      projectId={projectId}
      title={t('eval.title')}
      configTitle={t('eval.config')}
      statusTitle={t('eval.status')}
      readyLabel={t('eval.ready')}
      submitTask={submitEvalTask}
      stopTask={stopEvalTask}
      getProgress={getEvalProgress}
      getLog={getEvalLog}
      getReportUrl={getEvalReportUrl}
      renderForm={({ onSubmit, disabled }) => (
        <EvalConfigForm
          onSubmit={onSubmit}
          disabled={disabled}
          initialDataset={initialDataset}
          initialModel={initialModel}
          projectId={projectId}
          initialTargetId={initialTargetId}
          initialTargetVersionId={initialTargetVersionId}
        />
      )}
    />
  )
}
