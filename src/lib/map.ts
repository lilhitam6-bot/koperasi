import type { AreaMarker, AreaStatus } from '@/types'

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

export function createDemoSukabumiMarker({
  existingCount,
  surveyorId,
  createdAt,
}: {
  existingCount: number
  surveyorId: string
  createdAt: string
}): AreaMarker {
  const nextNumber = existingCount + 1
  const offset = (nextNumber % 5) * 0.004

  return {
    id: `marker-${nextNumber}`,
    surveyor_id: surveyorId,
    latitude: Number((SUKABUMI_MAP.center[0] - 0.006 + offset).toFixed(5)),
    longitude: Number((SUKABUMI_MAP.center[1] + 0.006 + offset).toFixed(5)),
    status: 'potensial',
    notes: `Marker tracking baru di Sukabumi #${nextNumber}`,
    photo_url: null,
    created_at: createdAt,
    updated_at: createdAt,
  }
}
