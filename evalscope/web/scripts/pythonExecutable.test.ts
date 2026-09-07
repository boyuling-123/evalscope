import { describe, expect, it } from 'vitest'
import { resolve } from 'node:path'
import { resolvePythonExecutable } from './pythonExecutable'

describe('resolvePythonExecutable', () => {
  it('honors an explicit EvalScope interpreter before legacy PYTHON', () => {
    expect(resolvePythonExecutable('/repo', {
      env: { EVALSCOPE_PYTHON: '/tools/evalscope-python', PYTHON: '/tools/python' },
      exists: () => false,
    })).toBe('/tools/evalscope-python')
  })

  it('uses the repository virtual environment when it exists', () => {
    const expected = resolve('/repo', '.venv/bin/python')
    expect(resolvePythonExecutable('/repo', {
      env: {},
      platform: 'darwin',
      exists: (path) => path === expected,
    })).toBe(expected)
  })

  it('falls back to the system command when no interpreter is configured', () => {
    expect(resolvePythonExecutable('/repo', {
      env: {},
      exists: () => false,
    })).toBe('python')
  })
})
