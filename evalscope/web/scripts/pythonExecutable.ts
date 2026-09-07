import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

interface PythonResolutionOptions {
  env?: NodeJS.ProcessEnv
  platform?: NodeJS.Platform
  exists?: (path: string) => boolean
}

export function resolvePythonExecutable(
  repoRoot: string,
  {
    env = process.env,
    platform = process.platform,
    exists = existsSync,
  }: PythonResolutionOptions = {},
): string {
  const configured = env.EVALSCOPE_PYTHON?.trim() || env.PYTHON?.trim()
  if (configured) return configured

  const virtualEnvPython = resolve(
    repoRoot,
    platform === 'win32' ? '.venv/Scripts/python.exe' : '.venv/bin/python',
  )
  return exists(virtualEnvPython) ? virtualEnvPython : 'python'
}
