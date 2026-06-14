import { describe, expect, it } from 'vitest'
import { buildSetoranIdempotencyKey, getSetoranDueDate, normalizeSetoranAmount } from './setoran'

describe('setoran helpers', () => {
  it('builds stable idempotency keys per surveyor, nasabah, date, and amount', () => {
    expect(
      buildSetoranIdempotencyKey({
        surveyorId: 'surveyor-1',
        nasabahId: 'nasabah-1',
        tanggal: '2026-06-14',
        jumlahDibayar: 50000,
      })
    ).toBe('surveyor-1:nasabah-1:2026-06-14:50000')
  })

  it('normalizes formatted rupiah input into an integer amount', () => {
    expect(normalizeSetoranAmount('Rp 50.000')).toBe(50000)
    expect(normalizeSetoranAmount('50000')).toBe(50000)
  })

  it('builds due date using nasabah due day and payment month', () => {
    expect(getSetoranDueDate({ tanggal: '2026-06-14', tglJatuhTempo: 10 })).toBe('2026-06-10')
  })
})
