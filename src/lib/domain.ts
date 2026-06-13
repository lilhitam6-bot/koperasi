import type {
  DashboardSummary,
  Nasabah,
  OfflineQueueItem,
  QueueProjection,
  ScoreLabel,
  ScoringInput,
  ScoringResult,
  Setoran,
  StatusBayar,
} from '@/types'

const WEIGHT_KONSISTENSI = 0.7
const WEIGHT_DURASI = 0.3
const DURASI_BENCHMARK_BULAN = 12

export function calculateScore(input: ScoringInput): ScoringResult {
  const { totalSetoran, tepatWaktu, bulanAktif } = input

  if (totalSetoran <= 0) {
    return { score: 0, label: 'At Risk' }
  }

  const safeTepatWaktu = Math.min(Math.max(tepatWaktu, 0), totalSetoran)
  const safeBulanAktif = Math.max(bulanAktif, 0)
  const skorKonsistensi = (safeTepatWaktu / totalSetoran) * 100
  const skorDurasi = Math.min((safeBulanAktif / DURASI_BENCHMARK_BULAN) * 100, 100)
  const score = Math.round(WEIGHT_KONSISTENSI * skorKonsistensi + WEIGHT_DURASI * skorDurasi)

  return { score, label: getScoreLabel(score) }
}

export function getScoreLabel(score: number): ScoreLabel {
  if (score >= 80) return 'Excellent'
  if (score >= 60) return 'Good'
  if (score >= 40) return 'Fair'
  return 'At Risk'
}

export function determineStatusBayar(
  tanggalBayar: string,
  jatuhTempo: string,
  jumlahDibayar: number,
  angsuran: number
): StatusBayar {
  if (jumlahDibayar < angsuran) return 'kurang'
  if (new Date(tanggalBayar) > new Date(jatuhTempo)) return 'terlambat'
  return 'tepat_waktu'
}

export function calculateDashboardSummary(
  nasabah: Nasabah[],
  setoran: Setoran[],
  month: string
): DashboardSummary {
  return {
    totalNasabahAktif: nasabah.filter((item) => item.status === 'aktif').length,
    totalOutstanding: nasabah
      .filter((item) => item.status === 'aktif')
      .reduce((sum, item) => sum + item.jumlah_pinjaman, 0),
    totalSetoranBulanIni: setoran
      .filter((item) => item.tanggal.startsWith(month))
      .reduce((sum, item) => sum + item.jumlah_dibayar, 0),
    nasabahMacet: nasabah.filter((item) => item.status === 'macet').length,
  }
}

export function projectOfflineQueue(queue: OfflineQueueItem[]): QueueProjection {
  return queue.reduce<QueueProjection>(
    (projection, item) => ({
      pending: projection.pending + (item.status === 'pending' ? 1 : 0),
      failed: projection.failed + (item.status === 'failed' ? 1 : 0),
      syncing: projection.syncing + (item.status === 'syncing' ? 1 : 0),
      total: projection.total + 1,
    }),
    { pending: 0, failed: 0, syncing: 0, total: 0 }
  )
}

export function toCsv(rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) return ''

  const headers = Object.keys(rows[0])
  const body = rows.map((row) => headers.map((header) => escapeCsvCell(row[header])).join(','))

  return [headers.join(','), ...body].join('\n')
}

export function formatRupiah(value: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(value)
}

export function getCurrentMonth(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function escapeCsvCell(value: unknown): string {
  const text = String(value ?? '')
  if (!/[",\n]/.test(text)) return text
  return `"${text.replaceAll('"', '""')}"`
}
