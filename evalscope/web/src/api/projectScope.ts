import { isProjectId } from '@/navigation/projectRoutes'

export function projectIdFromRunsPath(rootPath: string): string | undefined {
  const match = rootPath.match(/(?:^|[\\/])projects[\\/](prj_[a-f0-9]{20})[\\/]runs[\\/]?$/)
  return isProjectId(match?.[1]) ? match[1] : undefined
}

export function scopedRootParams(rootPath: string): Record<string, string> {
  const projectId = projectIdFromRunsPath(rootPath)
  return projectId
    ? { root_path: rootPath, project_id: projectId }
    : { root_path: rootPath }
}
