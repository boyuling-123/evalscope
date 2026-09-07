import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { LocaleProvider } from '@/contexts/LocaleContext'
import ProjectsPage from './ProjectsPage'

const mocks = vi.hoisted(() => ({
  previewCreate: vi.fn(),
  create: vi.fn(),
  refresh: vi.fn(),
}))

vi.mock('@/contexts/ProjectContext', () => ({
  useProjects: () => ({
    projects: [],
    loading: false,
    error: '',
    warnings: [],
    previewCreate: mocks.previewCreate,
    create: mocks.create,
    refresh: mocks.refresh,
  }),
}))

const PROJECT = {
  schema_version: 1,
  id: 'prj_0123456789abcdefabcd',
  name: '中文 Agent 评测',
  description: '本地演示项目',
  created_at: '2026-09-08T00:00:00Z',
  updated_at: '2026-09-08T00:00:00Z',
  archived: false,
  root_path: '/tmp/evalscope/projects/prj_0123456789abcdefabcd',
  runs_path: '/tmp/evalscope/projects/prj_0123456789abcdefabcd/runs',
}

function renderPage() {
  return render(
    <LocaleProvider defaultLocale="zh">
      <MemoryRouter initialEntries={['/projects']}>
        <Routes>
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/project/:projectId/dashboard" element={<p>项目总览已打开</p>} />
        </Routes>
      </MemoryRouter>
    </LocaleProvider>,
  )
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('ProjectsPage', () => {
  it('requires an Action preview before it allows the local write', async () => {
    mocks.previewCreate.mockResolvedValue({
      preview: {
        name: PROJECT.name,
        description: PROJECT.description,
        writes: [PROJECT.root_path],
      },
      confirmation: { token: 'confirm_test', expires_at: '2026-09-08T00:10:00Z' },
    })
    mocks.create.mockResolvedValue(PROJECT)
    renderPage()

    fireEvent.click(screen.getByRole('button', { name: '新建项目' }))
    fireEvent.change(screen.getByLabelText('项目名称'), { target: { value: `  ${PROJECT.name}  ` } })
    fireEvent.change(screen.getByLabelText('项目说明（可选）'), { target: { value: PROJECT.description } })
    expect(mocks.create).not.toHaveBeenCalled()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '查看变更' }))
    })
    expect(screen.getByRole('heading', { name: '确认创建项目' })).toBeInTheDocument()
    expect(screen.getByText(PROJECT.root_path)).toBeInTheDocument()
    expect(mocks.previewCreate).toHaveBeenCalledWith({
      name: PROJECT.name,
      description: PROJECT.description,
    })
    expect(mocks.create).not.toHaveBeenCalled()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '确认并创建' }))
    })
    expect(mocks.create).toHaveBeenCalledWith(
      { name: PROJECT.name, description: PROJECT.description },
      'confirm_test',
      expect.stringMatching(/^web-create-project-/),
    )
    expect(screen.getByText('项目总览已打开')).toBeInTheDocument()
  })

  it('closes the create dialog with Escape before an operation starts', () => {
    renderPage()

    const trigger = screen.getByRole('button', { name: '新建项目' })
    trigger.focus()
    fireEvent.click(trigger)
    expect(screen.getByRole('dialog', { name: '新建本地项目' })).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })
})
