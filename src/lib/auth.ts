import type { Profile } from '@/types'

const publicAuthPaths = new Set(['/login', '/unauthorized'])

export function isPublicAuthPath(pathname: string): boolean {
  const parsedPath = pathname.split('?')[0] ?? pathname
  return publicAuthPaths.has(parsedPath)
}

export function getPostLoginPath(nextPath: string | null): string {
  if (!nextPath || !nextPath.startsWith('/') || nextPath.startsWith('//')) {
    return '/'
  }

  return nextPath
}

export function requireActiveProfile(profile: Profile | null): Profile | null {
  if (!profile?.is_active) {
    return null
  }

  return profile
}
