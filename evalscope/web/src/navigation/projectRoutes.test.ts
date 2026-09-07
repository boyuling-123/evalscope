import { describe, expect, it } from 'vitest'
import {
  isProjectId,
  projectBase,
  projectRoute,
  projectRouteFromPathname,
  projectRouteOr,
} from './projectRoutes'

const PROJECT_ID = 'prj_0123456789abcdefabcd'

describe('project-scoped routes', () => {
  it('accepts only canonical project ids', () => {
    expect(isProjectId(PROJECT_ID)).toBe(true)
    expect(isProjectId('prj_demo')).toBe(false)
    expect(isProjectId('../project')).toBe(false)
    expect(isProjectId(undefined)).toBe(false)
  })

  it('keeps every workbench page inside the active project', () => {
    expect(projectBase(PROJECT_ID)).toBe(`/project/${PROJECT_ID}`)
    expect(projectRoute(PROJECT_ID)).toBe(`/project/${PROJECT_ID}/dashboard`)
    expect(projectRoute(PROJECT_ID, 'runs')).toBe(`/project/${PROJECT_ID}/runs`)
    expect(projectRouteOr(PROJECT_ID, '/benchmarks')).toBe(`/project/${PROJECT_ID}/benchmarks`)
  })

  it('falls back safely when no valid project is available', () => {
    expect(projectRoute('invalid', '/runs')).toBe('/projects')
    expect(projectRouteOr(undefined, '/runs', '/legacy-runs')).toBe('/legacy-runs')
  })

  it('moves the current project page to another project without losing its suffix', () => {
    expect(projectRouteFromPathname('/project/prj_aaaaaaaaaaaaaaaaaaaa/runs?view=quality', PROJECT_ID))
      .toBe(`/project/${PROJECT_ID}/runs?view=quality`)
    expect(projectRouteFromPathname('/projects', PROJECT_ID)).toBe(`/project/${PROJECT_ID}/dashboard`)
  })
})
