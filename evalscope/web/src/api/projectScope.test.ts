import { describe, expect, it } from 'vitest'
import { projectIdFromRunsPath, scopedRootParams } from './projectScope'

const PROJECT_ID = 'prj_0123456789abcdefabcd'

describe('project API scope', () => {
  it('recognizes portable project run directories', () => {
    expect(projectIdFromRunsPath(`/workspace/projects/${PROJECT_ID}/runs`)).toBe(PROJECT_ID)
    expect(projectIdFromRunsPath(`C:\\workspace\\projects\\${PROJECT_ID}\\runs`)).toBe(PROJECT_ID)
  })

  it('does not treat arbitrary output roots as registered projects', () => {
    expect(scopedRootParams('/tmp/outputs')).toEqual({ root_path: '/tmp/outputs' })
  })

  it('adds the project id when the root follows the workbench layout', () => {
    const rootPath = `/workspace/projects/${PROJECT_ID}/runs`
    expect(scopedRootParams(rootPath)).toEqual({ root_path: rootPath, project_id: PROJECT_ID })
  })
})
