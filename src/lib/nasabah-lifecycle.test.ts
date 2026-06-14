import { describe, expect, it } from 'vitest'
import { canReactivateNasabah, canReviseRejectedNasabah, getNasabahLifecycleLabel } from './nasabah-lifecycle'

describe('nasabah lifecycle', () => {
  it('labels draft, approved active, rejected, and hiatus states', () => {
    expect(getNasabahLifecycleLabel({ reviewStatus: 'draft', status: 'aktif' })).toBe('Draft menunggu review')
    expect(getNasabahLifecycleLabel({ reviewStatus: 'approved', status: 'aktif' })).toBe('Approved aktif')
    expect(getNasabahLifecycleLabel({ reviewStatus: 'rejected', status: 'aktif' })).toBe('Ditolak')
    expect(getNasabahLifecycleLabel({ reviewStatus: 'approved', status: 'hiatus' })).toBe('Hiatus')
  })

  it('allows rejected nasabah revision only before approval', () => {
    expect(canReviseRejectedNasabah({ reviewStatus: 'rejected', status: 'aktif' })).toBe(true)
    expect(canReviseRejectedNasabah({ reviewStatus: 'approved', status: 'aktif' })).toBe(false)
  })

  it('allows owner reactivation from hiatus into approved active', () => {
    expect(canReactivateNasabah({ reviewStatus: 'approved', status: 'hiatus' })).toBe(true)
    expect(canReactivateNasabah({ reviewStatus: 'draft', status: 'aktif' })).toBe(false)
  })
})
