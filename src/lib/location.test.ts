import { describe, expect, it } from 'vitest'
import {
  formatLastSeen,
  isUsableSurveyorLocation,
  locationAccuracyHint,
  locationStatusLabel,
  parseCoordinatePair,
  pickMoreAccurateLocation,
} from './location'
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
    expect(locationStatusLabel('tracking')).toBe('Lokasi siap')
    expect(locationStatusLabel('denied')).toBe('Izin lokasi ditolak')
  })
})

describe('formatLastSeen', () => {
  it('formats the latest captured location age', () => {
    expect(formatLastSeen(location.captured_at, new Date('2026-06-13T10:00:45.000Z'))).toBe('45 detik lalu')
    expect(formatLastSeen(location.captured_at, new Date('2026-06-13T10:03:00.000Z'))).toBe('3 menit lalu')
  })
})

describe('parseCoordinatePair', () => {
  it('parses a latitude and longitude pair copied from Google Maps', () => {
    expect(parseCoordinatePair('-6.9277, 106.9296')).toEqual({
      latitude: -6.9277,
      longitude: 106.9296,
    })
  })

  it('rejects invalid or out-of-range coordinates', () => {
    expect(parseCoordinatePair('Sukabumi')).toBeNull()
    expect(parseCoordinatePair('-95, 106.9296')).toBeNull()
    expect(parseCoordinatePair('-6.9277, 190')).toBeNull()
  })
})

describe('pickMoreAccurateLocation', () => {
  it('keeps the location sample with the smallest accuracy radius', () => {
    const coarse = { ...location, accuracy_meters: 120 }
    const precise = { ...location, latitude: -6.91, accuracy_meters: 18 }

    expect(pickMoreAccurateLocation(coarse, precise)).toBe(precise)
    expect(pickMoreAccurateLocation(precise, coarse)).toBe(precise)
  })
})

describe('locationAccuracyHint', () => {
  it('flags coarse GPS samples for field users', () => {
    expect(locationAccuracyHint({ ...location, accuracy_meters: 18 })).toBeNull()
    expect(locationAccuracyHint({ ...location, accuracy_meters: 120 })).toBe('Akurasi GPS masih kasar. Coba refresh di area terbuka atau input koordinat manual.')
  })
})
