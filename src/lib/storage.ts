import type { SupabaseClient } from '@supabase/supabase-js'

export const MARKER_PHOTOS_BUCKET = 'marker-photos'
export const SETORAN_PHOTOS_BUCKET = 'setoran-photos'

const ALLOWED_EVIDENCE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const MAX_EVIDENCE_FILE_SIZE = 5 * 1024 * 1024

export function buildUserStoragePath({
  userId,
  fileName,
  timestamp = new Date().toISOString(),
}: {
  userId: string
  fileName: string
  timestamp?: string
}): string {
  const cleanTimestamp = timestamp.replace(/[:.]/g, '-')
  const extension = fileName.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
  const baseName = fileName
    .replace(/\.[^.]*$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  const safeName = baseName || 'upload'

  return `${userId}/${cleanTimestamp}-${safeName}.${extension}`
}

export async function uploadEvidenceFile({
  bucket,
  file,
  supabase,
  userId,
}: {
  bucket: string
  file: File
  supabase: SupabaseClient
  userId: string
}): Promise<string> {
  const validation = validateEvidenceFile(file)
  if (!validation.ok) {
    throw new Error(validation.message)
  }

  const path = buildUserStoragePath({
    userId,
    fileName: file.name,
  })
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
  })

  if (error) {
    throw new Error(error.message || 'Upload gambar gagal.')
  }

  return path
}

export function validateEvidenceFile(file: File): { ok: true } | { ok: false; message: string } {
  if (!ALLOWED_EVIDENCE_MIME_TYPES.has(file.type)) {
    return { ok: false, message: 'File harus berupa JPG, PNG, atau WEBP.' }
  }

  if (file.size > MAX_EVIDENCE_FILE_SIZE) {
    return { ok: false, message: 'Ukuran file maksimal 5MB.' }
  }

  return { ok: true }
}
