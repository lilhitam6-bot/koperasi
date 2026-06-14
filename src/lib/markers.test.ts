import { describe, expect, it } from 'vitest'
import { buildMarkerInsertPayload } from './markers'

describe('marker helpers', () => {
  it('builds an area_markers insert payload', () => {
    expect(
      buildMarkerInsertPayload({
        surveyorId: 'surveyor-1',
        latitude: -6.92,
        longitude: 106.92,
        status: 'potensial',
        notes: 'Dekat pasar',
        photoPath: 'surveyor-1/photo.webp',
      })
    ).toEqual({
      surveyor_id: 'surveyor-1',
      latitude: -6.92,
      longitude: 106.92,
      status: 'potensial',
      notes: 'Dekat pasar',
      photo_url: 'surveyor-1/photo.webp',
    })
  })

  it('normalizes empty notes and missing photos', () => {
    expect(
      buildMarkerInsertPayload({
        surveyorId: 'surveyor-1',
        latitude: -6.92,
        longitude: 106.92,
        status: 'bagus',
        notes: '  ',
        photoPath: null,
      })
    ).toEqual({
      surveyor_id: 'surveyor-1',
      latitude: -6.92,
      longitude: 106.92,
      status: 'bagus',
      notes: null,
      photo_url: null,
    })
  })
})
