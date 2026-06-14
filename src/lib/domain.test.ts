import { describe, expect, it } from 'vitest'
import {
  calculateDashboardSummary,
  calculateScore,
  determineStatusBayar,
  isApprovedActiveNasabah,
  isNasabahVisibleToSurveyor,
  projectOfflineQueue,
  toCsv,
} from './domain'
import type { Nasabah, OfflineQueueItem, Setoran } from '@/types'

const nasabah: Nasabah[] = [
  {
    id: 'n-1',
    surveyor_id: 's-1',
    nama: 'Sari Wijaya',
    alamat: 'Pasar Baru',
    jumlah_pinjaman: 2000000,
    tanggal_mulai: '2026-01-10',
    tenor_bulan: 10,
    angsuran: 220000,
    tgl_jatuh_tempo: 10,
    status: 'aktif',
    review_status: 'approved',
    submitted_by: 's-1',
    reviewed_by: 'owner-1',
    reviewed_at: '2026-01-10T00:00:00.000Z',
    review_notes: null,
    score: 80,
    score_label: 'Excellent',
    created_at: '2026-01-10T00:00:00.000Z',
    updated_at: '2026-06-10T00:00:00.000Z',
  },
  {
    id: 'n-2',
    surveyor_id: 's-2',
    nama: 'Budi Hartono',
    alamat: 'Gang Melati',
    jumlah_pinjaman: 1500000,
    tanggal_mulai: '2026-02-05',
    tenor_bulan: 8,
    angsuran: 210000,
    tgl_jatuh_tempo: 5,
    status: 'macet',
    review_status: 'approved',
    submitted_by: 's-2',
    reviewed_by: 'owner-1',
    reviewed_at: '2026-02-05T00:00:00.000Z',
    review_notes: null,
    score: 35,
    score_label: 'At Risk',
    created_at: '2026-02-05T00:00:00.000Z',
    updated_at: '2026-06-11T00:00:00.000Z',
  },
]

const setoran: Setoran[] = [
  {
    id: 'p-1',
    nasabah_id: 'n-1',
    surveyor_id: 's-1',
    tanggal: '2026-06-10',
    jumlah_dibayar: 220000,
    jatuh_tempo: '2026-06-10',
    status_bayar: 'tepat_waktu',
    foto_bukti_url: '/proof-a.jpg',
    notes: null,
    created_at: '2026-06-10T09:00:00.000Z',
  },
  {
    id: 'p-2',
    nasabah_id: 'n-2',
    surveyor_id: 's-2',
    tanggal: '2026-06-12',
    jumlah_dibayar: 100000,
    jatuh_tempo: '2026-06-05',
    status_bayar: 'kurang',
    foto_bukti_url: '/proof-b.jpg',
    notes: 'Bayar sebagian',
    created_at: '2026-06-12T09:00:00.000Z',
  },
]

describe('calculateScore', () => {
  it('scores perfect twelve month customers as excellent', () => {
    expect(calculateScore({ totalSetoran: 12, tepatWaktu: 12, bulanAktif: 12 })).toEqual({
      score: 100,
      label: 'Excellent',
    })
  })

  it('keeps new customers consistent with score thresholds', () => {
    expect(calculateScore({ totalSetoran: 0, tepatWaktu: 0, bulanAktif: 0 })).toEqual({
      score: 0,
      label: 'At Risk',
    })
  })
})

describe('determineStatusBayar', () => {
  it('marks short payments as kurang before checking lateness', () => {
    expect(determineStatusBayar('2026-06-20', '2026-06-10', 150000, 220000)).toBe('kurang')
  })

  it('marks full late payments as terlambat', () => {
    expect(determineStatusBayar('2026-06-11', '2026-06-10', 220000, 220000)).toBe('terlambat')
  })
})

describe('dashboard projections', () => {
  it('summarizes active customers, outstanding loans, monthly deposits, and macet count', () => {
    expect(calculateDashboardSummary(nasabah, setoran, '2026-06')).toEqual({
      totalNasabahAktif: 1,
      totalOutstanding: 2000000,
      totalSetoranBulanIni: 320000,
      nasabahMacet: 1,
    })
  })

  it('excludes draft, rejected, and hiatus nasabah from active dashboard counts', () => {
    const summary = calculateDashboardSummary(
      [
        nasabah[0],
        { ...nasabah[0], id: 'draft-1', review_status: 'draft' },
        { ...nasabah[0], id: 'rejected-1', review_status: 'rejected' },
        { ...nasabah[0], id: 'hiatus-1', status: 'hiatus' },
      ],
      [],
      '2026-06'
    )

    expect(summary.totalNasabahAktif).toBe(1)
    expect(summary.totalOutstanding).toBe(2000000)
  })
})

describe('nasabah lifecycle helpers', () => {
  it('allows setoran only for approved active nasabah', () => {
    expect(isApprovedActiveNasabah(nasabah[0])).toBe(true)
    expect(isApprovedActiveNasabah({ ...nasabah[0], review_status: 'draft' })).toBe(false)
    expect(isApprovedActiveNasabah({ ...nasabah[0], status: 'hiatus' })).toBe(false)
  })

  it('hides hiatus records from surveyor workspaces', () => {
    expect(isNasabahVisibleToSurveyor(nasabah[0])).toBe(true)
    expect(isNasabahVisibleToSurveyor({ ...nasabah[0], status: 'hiatus' })).toBe(false)
  })
})

describe('offline queue projection', () => {
  it('counts pending and failed queue items for the sync indicator', () => {
    const queue: OfflineQueueItem[] = [
      { localId: 'a', type: 'marker', payload: { notes: 'A' }, status: 'pending', retryCount: 0, createdAt: '2026-06-13T00:00:00.000Z' },
      { localId: 'b', type: 'setoran', payload: { notes: 'B' }, status: 'failed', retryCount: 3, createdAt: '2026-06-13T00:00:00.000Z' },
    ]

    expect(projectOfflineQueue(queue)).toEqual({ pending: 1, failed: 1, syncing: 0, total: 2 })
  })
})

describe('toCsv', () => {
  it('escapes commas and quotes for owner exports', () => {
    const csv = toCsv([{ nama: 'Sari, "Bu"', status: 'aktif' }])

    expect(csv).toBe('nama,status\n"Sari, ""Bu""",aktif')
  })
})
