import { describe, expect, it } from 'vitest'
import { getPostLoginPath, isPublicAuthPath, requireActiveProfile } from './auth'
import type { Profile } from '@/types'

const activeOwner: Profile = {
  id: 'profile-1',
  full_name: 'Owner Test',
  role: 'owner',
  is_active: true,
  max_nasabah: null,
  created_at: '2026-06-14T00:00:00.000Z',
  updated_at: '2026-06-14T00:00:00.000Z',
}

describe('isPublicAuthPath', () => {
  it('treats login and unauthorized routes as public auth paths', () => {
    expect(isPublicAuthPath('/login')).toBe(true)
    expect(isPublicAuthPath('/login?next=%2F')).toBe(true)
    expect(isPublicAuthPath('/unauthorized')).toBe(true)
    expect(isPublicAuthPath('/')).toBe(false)
  })
})

describe('getPostLoginPath', () => {
  it('keeps safe internal next paths and falls back for external paths', () => {
    expect(getPostLoginPath('/map')).toBe('/map')
    expect(getPostLoginPath('/')).toBe('/')
    expect(getPostLoginPath('https://evil.example')).toBe('/')
    expect(getPostLoginPath('//evil.example')).toBe('/')
    expect(getPostLoginPath(null)).toBe('/')
  })
})

describe('requireActiveProfile', () => {
  it('returns an active profile', () => {
    expect(requireActiveProfile(activeOwner)).toEqual(activeOwner)
  })

  it('returns null when the profile is missing or inactive', () => {
    expect(requireActiveProfile(null)).toBeNull()
    expect(requireActiveProfile({ ...activeOwner, is_active: false })).toBeNull()
  })
})
