import { describe, expect, it } from 'vitest'
import { SUKABUMI_MAP, createDemoSukabumiMarker, markerBounds, markerPopupLabel } from './map'
import type { AreaMarker } from '@/types'

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

describe('createDemoSukabumiMarker', () => {
  it('creates a sequential Sukabumi tracker marker for the active surveyor', () => {
    const marker = createDemoSukabumiMarker({
      existingCount: 3,
      surveyorId: 'surveyor-1',
      createdAt: '2026-06-13T10:00:00.000Z',
    })

    expect(marker).toMatchObject({
      id: 'marker-4',
      surveyor_id: 'surveyor-1',
      status: 'potensial',
      notes: 'Marker tracking baru di Sukabumi #4',
      photo_url: null,
      created_at: '2026-06-13T10:00:00.000Z',
      updated_at: '2026-06-13T10:00:00.000Z',
    })
    expect(marker.latitude).toBeGreaterThan(-6.95)
    expect(marker.latitude).toBeLessThan(-6.9)
    expect(marker.longitude).toBeGreaterThan(106.9)
    expect(marker.longitude).toBeLessThan(106.97)
  })
})
