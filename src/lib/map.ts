import type { AreaMarker, AreaStatus, SurveyorLocation } from '@/types'

export type LatLngTuple = [number, number]
export type LatLngBounds = [LatLngTuple, LatLngTuple]

export const SUKABUMI_MAP = {
  center: [-6.9277, 106.9296] as LatLngTuple,
  zoom: 13,
  tileUrl: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution: '&copy; OpenStreetMap contributors',
}

export const AREA_STATUS_LABELS: Record<AreaStatus, string> = {
  potensial: 'Potensial',
  bagus: 'Bagus',
  kurang_prospektif: 'Kurang prospektif',
}

export const AREA_STATUS_COLORS: Record<AreaStatus, string> = {
  potensial: '#e5b94f',
  bagus: '#235a45',
  kurang_prospektif: '#b95738',
}

export function markerBounds(markers: AreaMarker[]): LatLngBounds | null {
  if (markers.length === 0) return null

  const latitudes = markers.map((marker) => marker.latitude)
  const longitudes = markers.map((marker) => marker.longitude)

  return [
    [Math.min(...latitudes), Math.min(...longitudes)],
    [Math.max(...latitudes), Math.max(...longitudes)],
  ]
}

export function markerPopupLabel(marker: Pick<AreaMarker, 'status' | 'notes'>): string {
  return `${AREA_STATUS_LABELS[marker.status]} - ${marker.notes ?? 'Belum ada catatan'}`
}

export function createTrackedSukabumiMarker({
  existingCount,
  surveyorId,
  location,
  status,
  notes,
  photoUrl,
  createdAt,
}: {
  existingCount: number
  surveyorId: string
  location: SurveyorLocation
  status: AreaStatus
  notes: string
  photoUrl?: string | null
  createdAt: string
}): AreaMarker {
  const nextNumber = existingCount + 1
  const cleanNotes = notes.trim()
  const cleanPhotoUrl = photoUrl?.trim()

  return {
    id: `marker-${nextNumber}`,
    surveyor_id: surveyorId,
    latitude: location.latitude,
    longitude: location.longitude,
    status,
    notes: cleanNotes.length > 0 ? cleanNotes : null,
    photo_url: cleanPhotoUrl || null,
    created_at: createdAt,
    updated_at: createdAt,
  }
}
