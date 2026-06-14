import { describe, expect, it } from 'vitest'
import { buildUserStoragePath } from './storage'

describe('buildUserStoragePath', () => {
  it('creates a policy-compatible path under the authenticated user folder', () => {
    const path = buildUserStoragePath({
      userId: 'user-123',
      fileName: 'Foto Lokasi Pasar 01.JPG',
      timestamp: '2026-06-14T02:45:30.000Z',
    })

    expect(path).toBe('user-123/2026-06-14T02-45-30-000Z-foto-lokasi-pasar-01.jpg')
  })

  it('falls back to an upload name when the source file name is empty after sanitizing', () => {
    const path = buildUserStoragePath({
      userId: 'user-123',
      fileName: '...JPG',
      timestamp: '2026-06-14T02:45:30.000Z',
    })

    expect(path).toBe('user-123/2026-06-14T02-45-30-000Z-upload.jpg')
  })
})
