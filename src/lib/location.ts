import type { LocationTrackingStatus, SurveyorLocation } from '@/types'

export const PRECISE_LOCATION_THRESHOLD_METERS = 30
export const COARSE_LOCATION_WARNING_METERS = 75

export function isUsableSurveyorLocation(location: SurveyorLocation, maxAccuracyMeters = 100): boolean {
  if (location.latitude < -90 || location.latitude > 90) return false
  if (location.longitude < -180 || location.longitude > 180) return false
  if (location.accuracy_meters === null) return true
  return location.accuracy_meters <= maxAccuracyMeters
}

export function locationStatusLabel(status: LocationTrackingStatus): string {
  const labels: Record<LocationTrackingStatus, string> = {
    idle: 'Lokasi belum diambil',
    requesting: 'Mengambil lokasi',
    tracking: 'Lokasi siap',
    denied: 'Izin lokasi ditolak',
    unavailable: 'GPS tidak tersedia',
    error: 'Lokasi bermasalah',
  }

  return labels[status]
}

export function formatLastSeen(capturedAt: string, now = new Date()): string {
  const diffMs = Math.max(0, now.getTime() - new Date(capturedAt).getTime())
  const diffSeconds = Math.round(diffMs / 1000)

  if (diffSeconds < 60) return `${diffSeconds} detik lalu`

  const diffMinutes = Math.round(diffSeconds / 60)
  return `${diffMinutes} menit lalu`
}

export function parseCoordinatePair(value: string): { latitude: number; longitude: number } | null {
  const match = value.trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/)
  if (!match) return null

  const latitude = Number(match[1])
  const longitude = Number(match[2])

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
  if (latitude < -90 || latitude > 90) return null
  if (longitude < -180 || longitude > 180) return null

  return { latitude, longitude }
}

export function pickMoreAccurateLocation(current: SurveyorLocation | null, next: SurveyorLocation): SurveyorLocation {
  if (!current) return next
  if (current.accuracy_meters === null) return current
  if (next.accuracy_meters === null) return next
  return next.accuracy_meters < current.accuracy_meters ? next : current
}

export function locationAccuracyHint(location: SurveyorLocation): string | null {
  if (location.accuracy_meters === null || location.accuracy_meters <= COARSE_LOCATION_WARNING_METERS) return null
  return 'Akurasi GPS masih kasar. Coba refresh di area terbuka atau input koordinat manual.'
}
