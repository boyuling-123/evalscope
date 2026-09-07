import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { axe } from 'jest-axe'
import type { TargetConnectionCheck, TargetVersion } from '@/api/workbench'
import { LocaleProvider } from '@/contexts/LocaleContext'
import TargetConnectionCheckPanel from './TargetConnectionCheckPanel'

const PROJECT_ID = 'prj_0123456789abcdefabcd'
const TARGET_ID = 'tgt_0123456789abcdefabcd'
const VERSION_ID = 'tgv_0123456789abcdefabcd'

const mocks = vi.hoisted(() => ({
  previewTargetConnectionCheck: vi.fn(),
  confirmTargetConnectionCheck: vi.fn(),
}))

vi.mock('@/api/workbench', () => ({
  previewTargetConnectionCheck: mocks.previewTargetConnectionCheck,
  confirmTargetConnectionCheck: mocks.confirmTargetConnectionCheck,
}))

const VERSION: TargetVersion = {
  schema_version: 1,
  id: VERSION_ID,
  target_id: TARGET_ID,
  version_number: 1,
  label: 'v1',
  provider: '本地服务',
  input_modalities: ['text'],
  output_modalities: ['text'],
  connection: {
    adapter: 'http_json',
    endpoint: 'http://127.0.0.1:9100/invoke',
    method: 'POST',
    input_field: 'query',
    output_path: 'data.answer',
    timeout_seconds: 30,
    credential_configured: false,
  },
  connection_status: 'untested',
  config_hash: 'a'.repeat(64),
  created_at: '2026-09-08T01:00:00Z',
}

const PASSED_CHECK: TargetConnectionCheck = {
  schema_version: 1,
  id: 'tcc_0123456789abcdefabcd',
  target_id: TARGET_ID,
  version_id: VERSION_ID,
  status: 'passed',
  checked_at: '2026-09-08T02:00:00Z',
  duration_ms: 18,
  http_status: 200,
  output_type: 'string',
  output_hash: 'b'.repeat(64),
}

function renderPanel(onCompleted = vi.fn()) {
  const view = render(
    <LocaleProvider defaultLocale="zh">
      <TargetConnectionCheckPanel
        projectId={PROJECT_ID}
        targetId={TARGET_ID}
        version={VERSION}
        onCompleted={onCompleted}
      />
    </LocaleProvider>,
  )
  return { ...view, onCompleted }
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('TargetConnectionCheckPanel', () => {
  it('rejects invalid JSON locally without starting a preview or external request', async () => {
    renderPanel()
    fireEvent.change(screen.getByLabelText('试调输入（JSON）'), { target: { value: '{invalid' } })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '预览真实试调' }))
    })

    expect(screen.getByRole('alert')).toHaveTextContent('试调输入必须是合法 JSON。')
    expect(mocks.previewTargetConnectionCheck).not.toHaveBeenCalled()
    expect(mocks.confirmTargetConnectionCheck).not.toHaveBeenCalled()
  })

  it('requires a preview and a separate explicit confirmation before one real request', async () => {
    mocks.previewTargetConnectionCheck.mockResolvedValue({
      preview: {
        project_id: PROJECT_ID,
        target_id: TARGET_ID,
        version_id: VERSION_ID,
        adapter: 'http_json',
        endpoint_origin: 'http://127.0.0.1:9100',
        credential_configured: false,
        starts_external_call: true,
        may_consume_model_quota: true,
        persists_sample_input: false,
        persists_full_output: false,
      },
      confirmation: { token: 'confirm_connection', expires_at: '2026-09-08T02:10:00Z' },
      verdict: 'ready',
      blockingReasons: [],
      warnings: ['预览不会联网。'],
    })
    mocks.confirmTargetConnectionCheck.mockResolvedValue({
      check: PASSED_CHECK,
      target: {},
      warnings: ['真实试调成功。'],
    })
    const { container, onCompleted } = renderPanel()

    expect(screen.queryByRole('button', { name: '确认并发送一次请求' })).not.toBeInTheDocument()
    expect(mocks.confirmTargetConnectionCheck).not.toHaveBeenCalled()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '预览真实试调' }))
    })

    expect(mocks.previewTargetConnectionCheck).toHaveBeenCalledWith(
      PROJECT_ID,
      TARGET_ID,
      VERSION_ID,
      '你好，请回复：连接成功',
    )
    expect(mocks.confirmTargetConnectionCheck).not.toHaveBeenCalled()
    expect(screen.getByText(/http:\/\/127\.0\.0\.1:9100/)).toBeInTheDocument()
    expect(screen.getByText('平台只记录状态、耗时、输出类型与哈希，不保存样例正文和完整输出。')).toBeInTheDocument()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '确认并发送一次请求' }))
    })

    expect(mocks.confirmTargetConnectionCheck).toHaveBeenCalledOnce()
    expect(mocks.confirmTargetConnectionCheck).toHaveBeenCalledWith(
      PROJECT_ID,
      TARGET_ID,
      VERSION_ID,
      '你好，请回复：连接成功',
      'confirm_connection',
      expect.stringMatching(/^web-check-target-/),
    )
    expect(screen.getByRole('status')).toHaveTextContent('真实试调通过')
    expect(screen.getByText('18 ms')).toBeInTheDocument()
    expect(onCompleted).toHaveBeenCalledOnce()

    vi.useRealTimers()
    try {
      expect((await axe(container)).violations).toEqual([])
    } finally {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-07-01T00:00:00.000Z'))
    }
  })

  it('shows a blocking reason without exposing a confirmation action', async () => {
    mocks.previewTargetConnectionCheck.mockResolvedValue({
      preview: {
        project_id: PROJECT_ID,
        target_id: TARGET_ID,
        version_id: VERSION_ID,
        adapter: 'evalscope_model',
        starts_external_call: false,
      },
      verdict: 'blocked',
      blockingReasons: ['本地 EvalScope 适配器尚未接入试调运行器。'],
      warnings: [],
    })
    renderPanel()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '预览真实试调' }))
    })

    expect(screen.getByRole('status')).toHaveTextContent('本地 EvalScope 适配器尚未接入试调运行器。')
    expect(screen.queryByRole('button', { name: '确认并发送一次请求' })).not.toBeInTheDocument()
    expect(mocks.confirmTargetConnectionCheck).not.toHaveBeenCalled()
  })
})
