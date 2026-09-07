import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { axe } from 'jest-axe'
import { LocaleProvider } from '@/contexts/LocaleContext'
import WorkbenchPageHeader from '@/components/nav/WorkbenchPageHeader'
import type { TargetCreateInput, TargetDetail, TargetSummary } from '@/api/workbench'
import TargetsPage from './TargetsPage'

const PROJECT_ID = 'prj_0123456789abcdefabcd'
const TARGET_ID = 'tgt_0123456789abcdefabcd'
const VERSION_ID = 'tgv_0123456789abcdefabcd'

const mocks = vi.hoisted(() => ({
  listTargets: vi.fn(),
  previewTargetCreate: vi.fn(),
  confirmTargetCreate: vi.fn(),
}))

vi.mock('@/api/workbench', () => ({
  listTargets: mocks.listTargets,
  previewTargetCreate: mocks.previewTargetCreate,
  confirmTargetCreate: mocks.confirmTargetCreate,
}))

const SUMMARY: TargetSummary = {
  target: {
    schema_version: 1,
    id: TARGET_ID,
    project_id: PROJECT_ID,
    name: '客服 Agent',
    type: 'agent',
    description: '客服回归对象',
    capabilities: ['意图识别'],
    latest_version_id: VERSION_ID,
    status: 'draft',
    created_at: '2026-09-08T01:00:00Z',
    updated_at: '2026-09-08T01:00:00Z',
  },
  latest_version: {
    schema_version: 1,
    id: VERSION_ID,
    target_id: TARGET_ID,
    version_number: 1,
    label: 'v1',
    provider: '本地服务',
    input_modalities: ['text'],
    output_modalities: ['text'],
    connection: {
      adapter: 'openai_responses',
      endpoint: 'http://127.0.0.1:9000/v1/responses',
      model_id: 'customer-agent',
      method: 'POST',
      input_field: 'input',
      output_path: 'output_text',
      timeout_seconds: 60,
      credential_configured: true,
    },
    connection_status: 'untested',
    config_hash: 'a'.repeat(64),
    created_at: '2026-09-08T01:00:00Z',
  },
}

const DETAIL: TargetDetail = {
  target: SUMMARY.target,
  version: SUMMARY.latest_version,
  versions: [{
    id: VERSION_ID,
    version_number: 1,
    label: 'v1',
    provider: '本地服务',
    connection_status: 'untested',
    config_hash: 'a'.repeat(64),
    created_at: '2026-09-08T01:00:00Z',
  }],
}

function renderPage(initialEntry = `/project/${PROJECT_ID}/targets`) {
  return render(
    <LocaleProvider defaultLocale="zh">
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/project/:projectId/targets" element={<><WorkbenchPageHeader /><TargetsPage /></>} />
          <Route path="/project/:projectId/targets/:targetId" element={<p>对象详情已打开</p>} />
        </Routes>
      </MemoryRouter>
    </LocaleProvider>,
  )
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  document.body.style.overflow = ''
})

describe('TargetsPage', () => {
  it('renders a project-scoped Langfuse-style resource table with honest capability status', async () => {
    mocks.listTargets.mockResolvedValue({ targets: [SUMMARY], warnings: [] })
    const { container } = renderPage()
    await act(async () => { await Promise.resolve() })

    expect(screen.getByRole('heading', { level: 1, name: '评测对象' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: '对象目录' })).toBeInTheDocument()
    const table = screen.getByRole('table')
    expect(within(table).getByRole('columnheader', { name: '输入输出模态' })).toBeInTheDocument()
    expect(within(table).getByRole('link', { name: /客服 Agent/ })).toHaveAttribute('href', `/project/${PROJECT_ID}/targets/${TARGET_ID}`)
    expect(screen.getByText('接口文档、promptfoo Provider 与 Inspect Task 导入仍在规划中，当前没有伪装成可用操作。')).toBeInTheDocument()
    expect(mocks.listTargets).toHaveBeenCalledWith(PROJECT_ID, expect.any(AbortSignal))

    fireEvent.change(screen.getByPlaceholderText('搜索名称、Provider 或能力'), { target: { value: '不存在' } })
    expect(screen.getByText('没有匹配的对象')).toBeInTheDocument()

    vi.useRealTimers()
    try {
      expect((await axe(container)).violations).toEqual([])
    } finally {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-07-01T00:00:00.000Z'))
    }
  })

  it('requires a dry-run preview before saving an untested target draft', async () => {
    mocks.listTargets.mockResolvedValue({ targets: [], warnings: [] })
    mocks.previewTargetCreate.mockResolvedValue({
      preview: {
        project_id: PROJECT_ID,
        name: '客服 Agent',
        type: 'agent',
        version_label: 'v1',
        adapter: 'openai_responses',
        credential_configured: true,
        initial_status: 'draft',
        connection_status: 'untested',
        writes: ['target.json', 'versions/<version_id>.json'],
        starts_connection_test: false,
      },
      confirmation: { token: 'confirm_target', expires_at: '2026-09-08T01:10:00Z' },
    })
    mocks.confirmTargetCreate.mockResolvedValue(DETAIL)
    renderPage(`/project/${PROJECT_ID}/targets?create=1`)
    await act(async () => { await Promise.resolve() })

    expect(screen.getByRole('dialog', { name: '接入新对象' })).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Agent'))
    fireEvent.change(screen.getByLabelText('对象名称'), { target: { value: '  客服 Agent  ' } })
    fireEvent.click(screen.getByRole('button', { name: '继续' }))
    fireEvent.change(screen.getByLabelText('Provider'), { target: { value: '本地服务' } })
    fireEvent.change(screen.getByLabelText('Endpoint'), { target: { value: 'http://127.0.0.1:9000/v1/responses' } })
    fireEvent.change(screen.getByLabelText('模型 ID'), { target: { value: 'customer-agent' } })
    fireEvent.change(screen.getByPlaceholderText('env:TARGET_API_KEY'), { target: { value: 'env:TARGET_API_KEY' } })
    expect(mocks.confirmTargetCreate).not.toHaveBeenCalled()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '预览本地写入' }))
    })
    expect(screen.getByRole('heading', { level: 3, name: '草稿写入预览' })).toBeInTheDocument()
    expect(screen.getByText('本次操作不会进行连接测试，也不会产生任何模型调用。')).toBeInTheDocument()
    expect(mocks.previewTargetCreate).toHaveBeenCalledOnce()
    const previewInput = mocks.previewTargetCreate.mock.calls[0][0] as TargetCreateInput
    expect(previewInput).toMatchObject({
      project_id: PROJECT_ID,
      name: '客服 Agent',
      type: 'agent',
      provider: '本地服务',
      connection: { credential_ref: 'env:TARGET_API_KEY' },
    })
    expect(mocks.confirmTargetCreate).not.toHaveBeenCalled()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '确认保存草稿' }))
    })
    expect(screen.getByText('对象详情已打开')).toBeInTheDocument()
    expect(mocks.confirmTargetCreate).toHaveBeenCalledWith(
      previewInput,
      'confirm_target',
      expect.stringMatching(/^web-create-target-/),
    )
  })
})
