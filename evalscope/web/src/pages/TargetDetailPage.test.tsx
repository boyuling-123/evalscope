import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { axe } from 'jest-axe'
import { LocaleProvider } from '@/contexts/LocaleContext'
import type { TargetDetail } from '@/api/workbench'
import TargetDetailPage from './TargetDetailPage'

const PROJECT_ID = 'prj_0123456789abcdefabcd'
const TARGET_ID = 'tgt_0123456789abcdefabcd'

const mocks = vi.hoisted(() => ({ getTarget: vi.fn() }))
vi.mock('@/api/workbench', () => ({ getTarget: mocks.getTarget }))

const DETAIL: TargetDetail = {
  target: {
    schema_version: 1,
    id: TARGET_ID,
    project_id: PROJECT_ID,
    name: '生产客服 Agent',
    type: 'agent',
    description: '只连接远端黑盒 Agent',
    capabilities: ['检索', '工单创建'],
    latest_version_id: 'tgv_0123456789abcdefabcd',
    status: 'draft',
    created_at: '2026-09-08T01:00:00Z',
    updated_at: '2026-09-08T01:00:00Z',
  },
  version: {
    schema_version: 1,
    id: 'tgv_0123456789abcdefabcd',
    target_id: TARGET_ID,
    version_number: 1,
    label: 'release-1',
    provider: '内部平台',
    input_modalities: ['text'],
    output_modalities: ['text'],
    connection: {
      adapter: 'http_json',
      endpoint: 'https://agent.example.test/invoke',
      method: 'POST',
      input_field: 'query',
      output_path: 'data.answer',
      timeout_seconds: 90,
      credential_configured: true,
    },
    connection_status: 'untested',
    config_hash: 'b'.repeat(64),
    created_at: '2026-09-08T01:00:00Z',
  },
  versions: [{
    id: 'tgv_0123456789abcdefabcd',
    version_number: 1,
    label: 'release-1',
    provider: '内部平台',
    connection_status: 'untested',
    config_hash: 'b'.repeat(64),
    created_at: '2026-09-08T01:00:00Z',
  }],
}

function renderPage() {
  return render(
    <LocaleProvider defaultLocale="zh">
      <MemoryRouter initialEntries={[`/project/${PROJECT_ID}/targets/${TARGET_ID}`]}>
        <Routes><Route path="/project/:projectId/targets/:targetId" element={<TargetDetailPage />} /></Routes>
      </MemoryRouter>
    </LocaleProvider>,
  )
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('TargetDetailPage', () => {
  it('owns one H1 and exposes only detail tabs backed by real target data', async () => {
    mocks.getTarget.mockResolvedValue(DETAIL)
    const { container } = renderPage()
    await act(async () => { await Promise.resolve() })

    expect(screen.getByRole('heading', { level: 1, name: '生产客服 Agent' })).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 2, name: '对象概览' })).toBeInTheDocument()
    const tablist = screen.getByRole('tablist')
    expect(within(tablist).getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['概览', '版本', '接入配置'])
    expect(within(tablist).queryByRole('tab', { name: '调试' })).not.toBeInTheDocument()
    expect(mocks.getTarget).toHaveBeenCalledWith(PROJECT_ID, TARGET_ID, undefined, expect.any(AbortSignal))

    vi.useRealTimers()
    try {
      expect((await axe(container)).violations).toEqual([])
    } finally {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-07-01T00:00:00.000Z'))
    }
  })

  it('shows the black-box boundary and credential status without exposing its reference', async () => {
    mocks.getTarget.mockResolvedValue(DETAIL)
    renderPage()
    await act(async () => { await Promise.resolve() })

    screen.getByRole('heading', { level: 1, name: '生产客服 Agent' })
    fireEvent.click(screen.getByRole('tab', { name: '接入配置' }))
    expect(screen.getByRole('heading', { level: 2, name: '接入配置' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: '远端黑盒边界' })).toBeInTheDocument()
    expect(screen.getByText('已配置服务端引用')).toBeInTheDocument()
    expect(screen.getByText('https://agent.example.test/invoke')).toBeInTheDocument()
    expect(document.body.textContent).not.toContain('env:')
    expect(document.body.textContent).not.toContain('API_KEY')

    fireEvent.click(screen.getByRole('tab', { name: '版本' }))
    expect(screen.getByRole('heading', { level: 2, name: '不可变版本' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'release-1 · #1' })).toBeInTheDocument()
  })
})
