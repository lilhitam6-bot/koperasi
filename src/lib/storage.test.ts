import { describe, expect, it } from 'vitest'
import { buildUserStoragePath, validateEvidenceFile } from './storage'

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

describe('validateEvidenceFile', () => {
  it('accepts jpg png and webp image uploads under 5MB', () => {
    const file = new File(['x'], 'bukti.webp', { type: 'image/webp' })

    expect(validateEvidenceFile(file)).toEqual({ ok: true })
  })

  it('rejects unsupported upload types', () => {
    const file = new File(['x'], 'bukti.pdf', { type: 'application/pdf' })

    expect(validateEvidenceFile(file)).toEqual({
      ok: false,
      message: 'File harus berupa JPG, PNG, atau WEBP.',
    })
  })
})
