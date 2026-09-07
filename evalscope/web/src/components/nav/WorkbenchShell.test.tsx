import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { LocaleProvider } from '@/contexts/LocaleContext'
import { ThemeProvider, useTheme } from '@/contexts/ThemeContext'
import { useLocale } from '@/contexts/LocaleContext'
import { lookupTranslation } from '@/i18n/translations'
import {
  overviewNavigation,
  resolveWorkbenchPageMeta,
  workbenchNavigation,
  workbenchPageMetadata,
} from '@/navigation/workbenchNavigation'
import WorkbenchPageHeader from './WorkbenchPageHeader'
import WorkbenchSidebar from './WorkbenchSidebar'

function renderEnglish(ui: React.ReactNode, route = '/dashboard') {
  localStorage.removeItem('evalscope-locale')
  return render(
    <LocaleProvider defaultLocale="en">
      <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
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

describe('Workbench navigation', () => {
  it('only exposes routes backed by working pages', () => {
    const { container } = renderEnglish(
      <WorkbenchSidebar
        collapsed={false}
        mobileOpen={false}
        onToggleCollapsed={() => {}}
        onCloseMobile={() => {}}
      />,
    )

    const paths = Array.from(container.querySelectorAll('nav a')).map((link) => link.getAttribute('href'))
    expect(paths).toEqual(['/dashboard', '/tasks', '/reports', '/performance', '/benchmarks'])
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
    )

    fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }))
    expect(onToggleCollapsed).toHaveBeenCalledOnce()

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onCloseMobile).toHaveBeenCalledOnce()
  })
})

describe('Workbench page hierarchy', () => {
  it('renders one consistent top-level heading for a list page', () => {
    renderEnglish(<WorkbenchPageHeader />, '/reports')

    expect(screen.getByRole('heading', { level: 1, name: 'Evaluation results' })).toBeInTheDocument()
    expect(screen.getByText('Evaluation')).toBeInTheDocument()
    expect(screen.getByText(/individual cases/i)).toBeInTheDocument()
  })

  it('keeps detail pages on their existing object heading', () => {
    expect(resolveWorkbenchPageMeta('/reports/run/model')).toMatchObject({
      titleKey: 'nav.evaluationDetail',
      showPageHeader: false,
    })
  })

  it('defines translations for every navigation and page metadata key', () => {
    const keys = [
      overviewNavigation.labelKey,
      ...workbenchNavigation.flatMap((group) => [group.labelKey, ...group.items.map((item) => item.labelKey)]),
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
