import { describe, expect, it } from 'vitest'
import { SUKABUMI_MAP, createTrackedSukabumiMarker, markerBounds, markerPopupLabel } from './map'
import type { AreaMarker, SurveyorLocation } from '@/types'

const markers: AreaMarker[] = [
  {
    id: 'marker-a',
    surveyor_id: 'surveyor-1',
    latitude: -6.9192,
    longitude: 106.9272,
    status: 'bagus',
    notes: 'Pasar Pelita',
    photo_url: null,
    created_at: '2026-06-01T00:00:00.000Z',
    updated_at: '2026-06-01T00:00:00.000Z',
  },
  {
    id: 'marker-b',
    surveyor_id: 'surveyor-2',
    latitude: -6.9345,
    longitude: 106.958,
    status: 'potensial',
    notes: null,
    photo_url: null,
    created_at: '2026-06-01T00:00:00.000Z',
    updated_at: '2026-06-01T00:00:00.000Z',
  },
]

describe('SUKABUMI_MAP', () => {
  it('centers the operational map on Sukabumi city', () => {
    expect(SUKABUMI_MAP.center).toEqual([-6.9277, 106.9296])
    expect(SUKABUMI_MAP.zoom).toBe(13)
  })
})

describe('markerBounds', () => {
  it('returns south-west and north-east corners for Leaflet fitBounds', () => {
    expect(markerBounds(markers)).toEqual([
      [-6.9345, 106.9272],
      [-6.9192, 106.958],
    ])
  })
})

describe('markerPopupLabel', () => {
  it('formats a readable popup label with fallback notes', () => {
    expect(markerPopupLabel(markers[0])).toBe('Bagus - Pasar Pelita')
    expect(markerPopupLabel(markers[1])).toBe('Potensial - Belum ada catatan')
  })
})

describe('createTrackedSukabumiMarker', () => {
  it('creates a marker at the latest tracked device location with form details', () => {
    const location: SurveyorLocation = {
      surveyor_id: 'surveyor-1',
      latitude: -6.9277,
      longitude: 106.9296,
      accuracy_meters: 18,
      heading: null,
      speed_mps: null,
      captured_at: '2026-06-14T01:00:00.000Z',
    }

    const marker = createTrackedSukabumiMarker({
      existingCount: 3,
      surveyorId: 'surveyor-1',
      location,
      status: 'bagus',
      notes: 'Warung padat transaksi dekat pasar',
      photoUrl: 'surveyor-1/2026-06-14T01-01-00-000Z-survey.jpg',
      createdAt: '2026-06-14T01:01:00.000Z',
    })

    expect(marker).toMatchObject({
      id: 'marker-4',
      surveyor_id: 'surveyor-1',
      latitude: -6.9277,
      longitude: 106.9296,
      status: 'bagus',
      notes: 'Warung padat transaksi dekat pasar',
      photo_url: 'surveyor-1/2026-06-14T01-01-00-000Z-survey.jpg',
      created_at: '2026-06-14T01:01:00.000Z',
      updated_at: '2026-06-14T01:01:00.000Z',
    })
  })
})
