// Component tests for the sandbox section of EvalConfigForm.
//
// The sandbox payload-assembly logic went through several review rounds on
// PR #1545: the bug that actually shipped was that optional fields (manager
// URL, docker image, pool size) were sent as empty/NaN values instead of
// being omitted, which silently overrides backend defaults (see
// CodeExecutionSandboxMixin._resolve_sandbox_config_dict, which merges
// default_config on top of BenchmarkMeta.sandbox_config via dict.update).
// These tests lock in the corrected behaviour so it doesn't regress:
//   - sandbox disabled -> no `sandbox` key in the submitted config;
//   - enabled with all optional fields blank -> only `enabled` / `engine`;
//   - enabled with every field filled -> nested `manager_config` /
//     `default_config` / `pool_size` appear;
//   - an invalid pool size (0) blocks submit and marks the field invalid.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { LocaleProvider } from '@/contexts/LocaleContext'
import type { TargetVersionCandidate } from '@/api/workbench'

vi.mock('@/api/eval', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/eval')>()
  return { ...actual, listBenchmarks: vi.fn(() => new Promise(() => {})) }
})

vi.mock('@/api/workbench', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/workbench')>()
  return { ...actual, listRunnableTargetVersions: vi.fn() }
})

import EvalConfigForm from './EvalConfigForm'
import * as workbenchApi from '@/api/workbench'

afterEach(cleanup)
beforeEach(() => {
  vi.mocked(workbenchApi.listRunnableTargetVersions).mockReset()
})

function renderForm(onSubmit = vi.fn()) {
  render(
    <LocaleProvider>
      <EvalConfigForm onSubmit={onSubmit} />
    </LocaleProvider>,
  )
  return onSubmit
}

/** Fills the two required fields and opens the "More Parameters" section where sandbox lives. */
function fillRequiredAndExpand() {
  fireEvent.change(screen.getByLabelText(/Model Name/), { target: { value: 'qwen-plus' } })
  fireEvent.change(screen.getByLabelText(/^Datasets/), { target: { value: 'gsm8k' } })
  fireEvent.click(screen.getByRole('button', { name: /More Parameters/i }))
}

function submit() {
  fireEvent.click(screen.getByRole('button', { name: /Start Evaluation/i }))
}

describe('EvalConfigForm sandbox payload', () => {
  it('omits the sandbox key entirely when sandbox is disabled', () => {
    const onSubmit = renderForm()
    fillRequiredAndExpand()

    submit()

    expect(onSubmit).toHaveBeenCalledTimes(1)
    const config = onSubmit.mock.calls[0][0]
    expect(config).not.toHaveProperty('sandbox')
  })

  it('sends only enabled/engine when optional fields are left blank', () => {
    const onSubmit = renderForm()
    fillRequiredAndExpand()
    fireEvent.click(screen.getByLabelText(/Enable Sandbox/))

    submit()

    expect(onSubmit).toHaveBeenCalledTimes(1)
    const config = onSubmit.mock.calls[0][0]
    expect(config.sandbox).toEqual({ enabled: true, engine: 'docker' })
  })

  it('nests manager_config/default_config/pool_size when every field is filled', () => {
    const onSubmit = renderForm()
    fillRequiredAndExpand()
    fireEvent.click(screen.getByLabelText(/Enable Sandbox/))
    fireEvent.change(screen.getByLabelText('Engine'), { target: { value: 'volcengine' } })
    fireEvent.change(screen.getByLabelText('Manager URL'), { target: { value: 'https://sandbox.example.com' } })
    fireEvent.change(screen.getByLabelText('Docker Image'), { target: { value: 'my-image:latest' } })
    fireEvent.change(screen.getByLabelText('Pool Size'), { target: { value: '3' } })

    submit()

    expect(onSubmit).toHaveBeenCalledTimes(1)
    const config = onSubmit.mock.calls[0][0]
    expect(config.sandbox).toEqual({
      enabled: true,
      engine: 'volcengine',
      manager_config: { base_url: 'https://sandbox.example.com' },
      default_config: { image: 'my-image:latest' },
      pool_size: 3,
    })
  })

  it('blocks submit and marks the pool size field invalid when pool size is 0', () => {
    const onSubmit = renderForm()
    fillRequiredAndExpand()
    fireEvent.click(screen.getByLabelText(/Enable Sandbox/))
    fireEvent.change(screen.getByLabelText('Pool Size'), { target: { value: '0' } })

    submit()

    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Pool Size')).toHaveAttribute('aria-invalid', 'true')
  })
})

describe('EvalConfigForm project target binding', () => {
  const candidate: TargetVersionCandidate = {
    target: {
      schema_version: 1,
      id: 'tgt_0123456789abcdefabcd',
      project_id: 'prj_0123456789abcdefabcd',
      name: '客服 Agent',
      type: 'agent',
      capabilities: ['问答'],
      latest_version_id: 'tgv_0123456789abcdefabcd',
      status: 'ready',
      created_at: '2026-09-08T00:00:00Z',
      updated_at: '2026-09-08T00:10:00Z',
    },
    version: {
      schema_version: 1,
      id: 'tgv_0123456789abcdefabcd',
      target_id: 'tgt_0123456789abcdefabcd',
      version_number: 1,
      label: 'production-1',
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
      connection_status: 'passed',
      last_connected_at: '2026-09-08T00:10:00Z',
      config_hash: 'a'.repeat(64),
      created_at: '2026-09-08T00:00:00Z',
    },
  }

  it('submits stable target IDs and never exposes manual connection fields', async () => {
    vi.mocked(workbenchApi.listRunnableTargetVersions).mockResolvedValue({
      versions: [candidate],
      warnings: [],
    })
    const onSubmit = vi.fn()
    render(
      <LocaleProvider>
        <EvalConfigForm onSubmit={onSubmit} projectId={candidate.target.project_id} />
      </LocaleProvider>,
    )

    await act(async () => { await Promise.resolve() })
    const selector = screen.getByLabelText(/Verified Target Version/)
    expect(screen.queryByLabelText(/Model Name/)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Model API Key/)).not.toBeInTheDocument()
    fireEvent.change(selector, { target: { value: candidate.version.id } })
    fireEvent.change(screen.getByLabelText(/^Datasets/), { target: { value: 'gsm8k' } })
    submit()

    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      target_id: candidate.target.id,
      target_version_id: candidate.version.id,
      datasets: ['gsm8k'],
    })
    expect(onSubmit.mock.calls[0][0]).not.toHaveProperty('model')
    expect(onSubmit.mock.calls[0][0]).not.toHaveProperty('api_url')
    expect(onSubmit.mock.calls[0][0]).not.toHaveProperty('api_key')
  })

  it('honors an exact deep-linked target version after candidates load', async () => {
    vi.mocked(workbenchApi.listRunnableTargetVersions).mockResolvedValue({
      versions: [candidate],
      warnings: [],
    })
    render(
      <LocaleProvider>
        <EvalConfigForm
          onSubmit={vi.fn()}
          projectId={candidate.target.project_id}
          initialTargetId={candidate.target.id}
          initialTargetVersionId={candidate.version.id}
        />
      </LocaleProvider>,
    )

    await act(async () => { await Promise.resolve() })
    const selector = screen.getByLabelText(/Verified Target Version/)
    expect(selector).toHaveValue(candidate.version.id)
    expect(screen.getByText(candidate.version.id)).toBeInTheDocument()
    expect(screen.getByText('openai_responses')).toBeInTheDocument()
  })

  it('blocks execution and links to target setup when no verified version exists', async () => {
    vi.mocked(workbenchApi.listRunnableTargetVersions).mockResolvedValue({ versions: [], warnings: [] })
    render(
      <LocaleProvider>
        <EvalConfigForm onSubmit={vi.fn()} projectId={candidate.target.project_id} />
      </LocaleProvider>,
    )
    await act(async () => { await Promise.resolve() })

    expect(screen.getByRole('button', { name: 'Start Evaluation' })).toBeDisabled()
    expect(screen.getByRole('link', { name: 'Manage targets' })).toHaveAttribute(
      'href',
      `/project/${candidate.target.project_id}/targets`,
    )
  })
})
