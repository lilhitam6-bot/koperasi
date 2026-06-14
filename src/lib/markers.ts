import type { AreaStatus } from '@/types'

export function buildMarkerInsertPayload({
  surveyorId,
  latitude,
  longitude,
  status,
  notes,
  photoPath,
}: {
  surveyorId: string
  latitude: number
  longitude: number
  status: AreaStatus
  notes: string
  photoPath: string | null
}) {
  return {
    surveyor_id: surveyorId,
    latitude,
    longitude,
    status,
    notes: notes.trim() || null,
    photo_url: photoPath,
  }
}
