import type { AreaMarker, AuditEvent, Nasabah, OfflineQueueItem, Profile, Setoran } from '@/types'

export const profiles: Profile[] = [
  {
    id: 'owner-1',
    full_name: 'Owner Lokal',
    role: 'owner',
    is_active: true,
    max_nasabah: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-06-13T00:00:00.000Z',
  },
  {
    id: 'surveyor-1',
    full_name: 'Surveyor Lokal',
    role: 'surveyor',
    is_active: true,
    max_nasabah: 40,
    created_at: '2026-01-02T00:00:00.000Z',
    updated_at: '2026-06-13T00:00:00.000Z',
  },
]

export const nasabahSeed: Nasabah[] = []
export const markerSeed: AreaMarker[] = []
export const setoranSeed: Setoran[] = []
export const auditSeed: AuditEvent[] = []
export const offlineSeed: OfflineQueueItem[] = []
