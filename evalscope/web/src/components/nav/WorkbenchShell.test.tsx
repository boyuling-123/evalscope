import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { LocaleProvider } from '@/contexts/LocaleContext'
import { ThemeProvider, useTheme } from '@/contexts/ThemeContext'
import { useLocale } from '@/contexts/LocaleContext'
import { lookupTranslation } from '@/i18n/translations'
import {
  getOverviewNavigation,
  getWorkbenchNavigation,
  resolveWorkbenchPageMeta,
  workbenchPageMetadata,
} from '@/navigation/workbenchNavigation'
import WorkbenchPageHeader from './WorkbenchPageHeader'
import WorkbenchSidebar from './WorkbenchSidebar'

const PROJECT_ID = 'prj_aaaaaaaaaaaaaaaaaaaa'
const SECOND_PROJECT_ID = 'prj_bbbbbbbbbbbbbbbbbbbb'

vi.mock('@/contexts/ProjectContext', () => ({
  useProjects: () => ({
    projects: [{
      schema_version: 1,
      id: PROJECT_ID,
      name: 'Regression project',
      created_at: '2026-09-08T00:00:00Z',
      updated_at: '2026-09-08T00:00:00Z',
      archived: false,
      root_path: '/tmp/regression-project',
    }, {
      schema_version: 1,
      id: SECOND_PROJECT_ID,
      name: 'Second project',
      created_at: '2026-09-08T00:00:00Z',
      updated_at: '2026-09-08T00:00:00Z',
      archived: false,
      root_path: '/tmp/second-project',
    }],
    loading: false,
    error: '',
    warnings: [],
  }),
}))

function renderEnglish(ui: React.ReactNode, route = '/projects', routePattern = '*') {
  localStorage.removeItem('evalscope-locale')
  return render(
    <LocaleProvider defaultLocale="en">
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path={routePattern} element={ui} />
        </Routes>
      </MemoryRouter>
    </LocaleProvider>,
  )
}

afterEach(() => {
  cleanup()
  localStorage.removeItem('evalscope-locale')
  localStorage.removeItem('evalscope-theme')
  document.documentElement.removeAttribute('data-theme')
  document.documentElement.lang = ''
})

function WorkspaceDefaultsProbe() {
  const { locale } = useLocale()
  const { theme } = useTheme()
  return <span>{`${locale}:${theme}`}</span>
}

function LocationProbe() {
  const location = useLocation()
  return <output>{`${location.pathname}${location.search}`}</output>
}

describe('Workbench navigation', () => {
  it('only exposes routes backed by working pages', () => {
    const { container } = renderEnglish(
      <WorkbenchSidebar
        collapsed={false}
        mobileOpen={false}
        onToggleCollapsed={() => {}}
        onCloseMobile={() => {}}
      />,
      `/project/${PROJECT_ID}/dashboard`,
      '/project/:projectId/*',
    )

    const paths = Array.from(container.querySelectorAll('nav a')).map((link) => link.getAttribute('href'))
    expect(paths).toEqual([
      `/project/${PROJECT_ID}/dashboard`,
      `/project/${PROJECT_ID}/targets`,
      `/project/${PROJECT_ID}/runs`,
      `/project/${PROJECT_ID}/benchmarks`,
    ])
    expect(paths).not.toContain('/traces')
    expect(paths).not.toContain('/datasets')
    expect(paths).not.toContain('/evaluators')
    expect(paths).not.toContain('/mcp')
  })

  it('supports desktop collapse and closes the mobile drawer with Escape', () => {
    const onToggleCollapsed = vi.fn()
    const onCloseMobile = vi.fn()
    renderEnglish(
      <WorkbenchSidebar
        collapsed={false}
        mobileOpen
        onToggleCollapsed={onToggleCollapsed}
        onCloseMobile={onCloseMobile}
      />,
      `/project/${PROJECT_ID}/dashboard`,
      '/project/:projectId/*',
    )

    fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }))
    expect(onToggleCollapsed).toHaveBeenCalledOnce()

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onCloseMobile).toHaveBeenCalledOnce()
  })

  it('preserves the current collection view when switching projects', () => {
    renderEnglish(
      <>
        <WorkbenchSidebar
          collapsed={false}
          mobileOpen={false}
          onToggleCollapsed={() => {}}
          onCloseMobile={() => {}}
        />
        <LocationProbe />
      </>,
      `/project/${PROJECT_ID}/runs?view=performance`,
      '/project/:projectId/*',
    )

    fireEvent.change(screen.getByRole('combobox', { name: 'Switch project' }), {
      target: { value: SECOND_PROJECT_ID },
    })

    expect(screen.getByText(`/project/${SECOND_PROJECT_ID}/runs?view=performance`)).toBeInTheDocument()
  })
})

describe('Workbench page hierarchy', () => {
  it('renders one consistent top-level heading for a list page', () => {
    renderEnglish(<WorkbenchPageHeader />, `/project/${PROJECT_ID}/runs`)

    expect(screen.getByRole('heading', { level: 1, name: 'Evaluation runs' })).toBeInTheDocument()
    expect(screen.getByText(/quality and performance runs/i)).toBeInTheDocument()
    expect(screen.queryByText('Evaluation', { selector: 'p' })).not.toBeInTheDocument()
  })

  it('keeps detail pages on their existing object heading', () => {
    expect(resolveWorkbenchPageMeta(`/project/${PROJECT_ID}/runs/quality/run/model`)).toMatchObject({
      titleKey: 'nav.runDetail',
      showPageHeader: false,
    })
    expect(resolveWorkbenchPageMeta(`/project/${PROJECT_ID}/targets/tgt_aaaaaaaaaaaaaaaaaaaa`)).toMatchObject({
      titleKey: 'nav.targetDetail',
      showPageHeader: false,
    })
  })

  it('defines translations for every navigation and page metadata key', () => {
    const keys = [
      getOverviewNavigation(PROJECT_ID).labelKey,
      ...getWorkbenchNavigation(PROJECT_ID).flatMap((group) => [group.labelKey, ...group.items.map((item) => item.labelKey)]),
      ...workbenchPageMetadata.flatMap((meta) => [meta.sectionKey, meta.titleKey, meta.descriptionKey].filter(Boolean)),
    ] as string[]

    for (const key of keys) {
      expect(lookupTranslation('en', key)).not.toBe(key)
      expect(lookupTranslation('zh', key)).not.toBe(key)
    }
  })
})

describe('Chinese local-first defaults', () => {
  it('applies the requested fresh-workspace locale and theme to the document', () => {
    render(
      <ThemeProvider defaultTheme="light">
        <LocaleProvider defaultLocale="zh">
          <WorkspaceDefaultsProbe />
        </LocaleProvider>
      </ThemeProvider>,
    )

    expect(screen.getByText('zh:light')).toBeInTheDocument()
    expect(document.documentElement).toHaveAttribute('lang', 'zh-CN')
    expect(document.documentElement).toHaveAttribute('data-theme', 'light')
  })
})
