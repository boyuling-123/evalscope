import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import {
  confirmProjectCreate,
  listProjects,
  previewProjectCreate,
  type ProjectCreateInput,
  type ProjectCreatePreview,
  type ProjectRecord,
} from '@/api/workbench'
import { isDomainError } from '@/api/errors'

interface ProjectContextValue {
  projects: ProjectRecord[]
  loading: boolean
  error: string
  warnings: string[]
  refresh: (signal?: AbortSignal) => Promise<void>
  previewCreate: (input: ProjectCreateInput, signal?: AbortSignal) => Promise<ProjectCreatePreview>
  create: (
    input: ProjectCreateInput,
    confirmationToken: string,
    idempotencyKey: string,
    signal?: AbortSignal,
  ) => Promise<ProjectRecord>
}

const ProjectContext = createContext<ProjectContextValue | null>(null)

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<ProjectRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [warnings, setWarnings] = useState<string[]>([])

  const refresh = useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    setError('')
    try {
      const result = await listProjects(signal)
      setProjects(result.projects)
      setWarnings(result.warnings)
    } catch (reason) {
      if (isDomainError(reason) && reason.kind === 'aborted') return
      setError(reason instanceof Error ? reason.message : '无法读取本地项目。')
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    void listProjects(controller.signal)
      .then((result) => {
        setProjects(result.projects)
        setWarnings(result.warnings)
      })
      .catch((reason: unknown) => {
        if (isDomainError(reason) && reason.kind === 'aborted') return
        setError(reason instanceof Error ? reason.message : '无法读取本地项目。')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [])

  const create = useCallback(async (
    input: ProjectCreateInput,
    confirmationToken: string,
    idempotencyKey: string,
    signal?: AbortSignal,
  ) => {
    const project = await confirmProjectCreate(input, confirmationToken, idempotencyKey, signal)
    setProjects((current) => [project, ...current.filter((item) => item.id !== project.id)])
    return project
  }, [])

  return (
    <ProjectContext.Provider
      value={{
        projects,
        loading,
        error,
        warnings,
        refresh,
        previewCreate: previewProjectCreate,
        create,
      }}
    >
      {children}
    </ProjectContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useProjects(): ProjectContextValue {
  const context = useContext(ProjectContext)
  if (!context) throw new Error('useProjects must be used within ProjectProvider')
  return context
}

// eslint-disable-next-line react-refresh/only-export-components
export function useOptionalProjects(): ProjectContextValue | null {
  return useContext(ProjectContext)
}
