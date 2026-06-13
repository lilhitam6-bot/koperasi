import type { LocationTrackingStatus, SurveyorLocation } from '@/types'

export function isUsableSurveyorLocation(location: SurveyorLocation, maxAccuracyMeters = 100): boolean {
  if (location.latitude < -90 || location.latitude > 90) return false
  if (location.longitude < -180 || location.longitude > 180) return false
  if (location.accuracy_meters === null) return true
  return location.accuracy_meters <= maxAccuracyMeters
}

export function locationStatusLabel(status: LocationTrackingStatus): string {
  const labels: Record<LocationTrackingStatus, string> = {
    idle: 'Tracking belum aktif',
    requesting: 'Meminta izin lokasi',
    tracking: 'Tracking aktif',
    denied: 'Izin lokasi ditolak',
    unavailable: 'GPS tidak tersedia',
    error: 'Tracking bermasalah',
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
