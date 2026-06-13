import { describe, expect, it } from 'vitest'
import { formatLastSeen, isUsableSurveyorLocation, locationStatusLabel } from './location'
import type { SurveyorLocation } from '@/types'

const location: SurveyorLocation = {
  surveyor_id: 'surveyor-1',
  latitude: -6.9277,
  longitude: 106.9296,
  accuracy_meters: 24,
  heading: null,
  speed_mps: null,
  captured_at: '2026-06-13T10:00:00.000Z',
}

describe('isUsableSurveyorLocation', () => {
  it('accepts a Sukabumi location inside the accuracy threshold', () => {
    expect(isUsableSurveyorLocation(location)).toBe(true)
  })

  it('rejects very inaccurate foreground locations', () => {
    expect(isUsableSurveyorLocation({ ...location, accuracy_meters: 250 })).toBe(false)
  })
})

describe('locationStatusLabel', () => {
  it('formats foreground tracking states for the UI', () => {
    expect(locationStatusLabel('tracking')).toBe('Tracking aktif')
    expect(locationStatusLabel('denied')).toBe('Izin lokasi ditolak')
  })
})

describe('formatLastSeen', () => {
  it('formats the latest captured location age', () => {
    expect(formatLastSeen(location.captured_at, new Date('2026-06-13T10:00:45.000Z'))).toBe('45 detik lalu')
    expect(formatLastSeen(location.captured_at, new Date('2026-06-13T10:03:00.000Z'))).toBe('3 menit lalu')
  })
})
