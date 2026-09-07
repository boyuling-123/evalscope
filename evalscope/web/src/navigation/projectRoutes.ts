const PROJECT_ID_PATTERN = /^prj_[a-f0-9]{20}$/

export function isProjectId(value: string | undefined): value is string {
  return Boolean(value && PROJECT_ID_PATTERN.test(value))
}

export function projectBase(projectId: string): string {
  return `/project/${encodeURIComponent(projectId)}`
}

export function projectRoute(projectId: string | undefined, path = '/dashboard'): string {
  if (!isProjectId(projectId)) return '/projects'
  const normalized = path.startsWith('/') ? path : `/${path}`
  return `${projectBase(projectId)}${normalized}`
}

export function projectRouteOr(
  projectId: string | undefined,
  path: string,
  legacyPath = path,
): string {
  return isProjectId(projectId) ? projectRoute(projectId, path) : legacyPath
}

export function projectRouteFromPathname(pathname: string, projectId: string): string {
  const match = pathname.match(/^\/project\/[^/]+(\/.*)?$/)
  return projectRoute(projectId, match?.[1] || '/dashboard')
}

export function projectIdFromPathname(pathname: string): string | undefined {
  const match = pathname.match(/^\/project\/([^/]+)(?:\/|$)/)
  let candidate: string | undefined
  try {
    candidate = match ? decodeURIComponent(match[1]) : undefined
  } catch {
    return undefined
  }
  return isProjectId(candidate) ? candidate : undefined
}
