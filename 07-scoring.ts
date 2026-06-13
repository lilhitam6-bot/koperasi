/**
 * LendMap PWA — Scoring Algorithm
 * src/lib/scoring.ts
 *
 * Pure functions — tidak ada side effects, tidak ada Supabase calls.
 * Bisa dipakai di frontend dan Edge Function.
 * Setiap perubahan formula WAJIB update 08-CHANGELOG.md + PRD section 4.4.
 */

import type { ScoringInput, ScoringResult, ScoreLabel } from '@/types'

// ─── CONSTANTS ──────────────────────────────────────────────────────────────

const WEIGHT_KONSISTENSI = 0.70
const WEIGHT_DURASI = 0.30
const DURASI_BENCHMARK_BULAN = 12   // skor durasi maximal tercapai di 12 bulan

// ─── CORE ALGORITHM ─────────────────────────────────────────────────────────

/**
 * Hitung skor nasabah berdasarkan histori setoran.
 *
 * @param totalSetoran  - Total setoran yang sudah dilakukan (harus > 0)
 * @param tepatWaktu    - Jumlah setoran yang tepat waktu
 * @param bulanAktif    - Berapa bulan nasabah sudah aktif pinjam
 * @returns             - Score 0–100 dan label kategoris
 */
export function calculateScore(input: ScoringInput): ScoringResult {
  const { totalSetoran, tepatWaktu, bulanAktif } = input

  // Guard: nasabah baru belum punya histori
  if (totalSetoran === 0) {
    return { score: 0, label: 'At Risk' }
  }

  const skorKonsistensi = (tepatWaktu / totalSetoran) * 100
  const skorDurasi = Math.min((bulanAktif / DURASI_BENCHMARK_BULAN) * 100, 100)

  const rawScore = (WEIGHT_KONSISTENSI * skorKonsistensi) + (WEIGHT_DURASI * skorDurasi)
  const score = Math.round(Math.min(Math.max(rawScore, 0), 100))

  return { score, label: getScoreLabel(score) }
}

/**
 * Konversi angka score ke label kategoris.
 */
export function getScoreLabel(score: number): ScoreLabel {
  if (score >= 80) return 'Excellent'
  if (score >= 60) return 'Good'
  if (score >= 40) return 'Fair'
  return 'At Risk'
}

// ─── UNIT TESTS ─────────────────────────────────────────────────────────────
// Jalankan dengan: npx vitest run src/lib/scoring.test.ts
// File ini bisa di-import langsung untuk test atau pisahkan ke scoring.test.ts

if (process.env.NODE_ENV === 'test') {
  const assert = (condition: boolean, message: string) => {
    if (!condition) throw new Error(`FAIL: ${message}`)
    console.log(`PASS: ${message}`)
  }

  // Nasabah ideal: 12 bulan aktif, semua setoran tepat waktu
  const ideal = calculateScore({ totalSetoran: 12, tepatWaktu: 12, bulanAktif: 12 })
  assert(ideal.score === 100, 'Nasabah ideal harus score 100')
  assert(ideal.label === 'Excellent', 'Nasabah ideal harus Excellent')

  // Nasabah baru: belum ada setoran
  const baru = calculateScore({ totalSetoran: 0, tepatWaktu: 0, bulanAktif: 0 })
  assert(baru.score === 0, 'Nasabah baru tanpa setoran harus score 0')
  assert(baru.label === 'At Risk', 'Nasabah baru harus mengikuti klasifikasi score 0')

  // Nasabah konsisten tapi masih baru (2 bulan, 2/2 tepat waktu)
  const konsistenBaru = calculateScore({ totalSetoran: 2, tepatWaktu: 2, bulanAktif: 2 })
  // skor = (0.70 * 100) + (0.30 * (2/12 * 100)) = 70 + 5 = 75
  assert(konsistenBaru.score === 75, 'Nasabah konsisten 2 bulan harus score 75')
  assert(konsistenBaru.label === 'Good', 'Score 75 harus Good')

  // Nasabah lama tapi sering terlambat (12 bulan, 6/12 tepat waktu)
  const seringTerlambat = calculateScore({ totalSetoran: 12, tepatWaktu: 6, bulanAktif: 12 })
  // skor = (0.70 * 50) + (0.30 * 100) = 35 + 30 = 65
  assert(seringTerlambat.score === 65, 'Nasabah sering terlambat 12 bulan harus score 65')
  assert(seringTerlambat.label === 'Good', 'Score 65 harus Good')

  // Nasabah bermasalah: 12 bulan, hanya 2/12 tepat waktu
  const bermasalah = calculateScore({ totalSetoran: 12, tepatWaktu: 2, bulanAktif: 12 })
  // skor = (0.70 * 16.67) + (0.30 * 100) = 11.67 + 30 = 41.67 ≈ 42
  assert(bermasalah.score >= 40 && bermasalah.score <= 45, 'Nasabah bermasalah berada di boundary Fair')

  // Score tidak boleh > 100 atau < 0
  const overInput = calculateScore({ totalSetoran: 1, tepatWaktu: 5, bulanAktif: 100 })
  assert(overInput.score <= 100, 'Score tidak boleh melebihi 100')
  assert(overInput.score >= 0, 'Score tidak boleh negatif')

  console.log('\n✅ Semua test scoring passed\n')
}

// ─── HELPERS ────────────────────────────────────────────────────────────────

/**
 * Hitung jatuh tempo berikutnya dari tgl_jatuh_tempo (1–28) dan tanggal hari ini.
 * Digunakan untuk menentukan apakah setoran tepat waktu atau terlambat.
 */
export function getNextDueDate(tglJatuhTempo: number, referenceDate = new Date()): Date {
  const year = referenceDate.getFullYear()
  const month = referenceDate.getMonth()
  const day = referenceDate.getDate()

  const dueThisMonth = new Date(year, month, tglJatuhTempo)

  if (day <= tglJatuhTempo) {
    return dueThisMonth
  } else {
    return new Date(year, month + 1, tglJatuhTempo)
  }
}

/**
 * Tentukan status_bayar dari setoran berdasarkan tanggal bayar vs jatuh tempo dan jumlah.
 */
export function determineStatusBayar(
  tanggalBayar: Date,
  jatuhTempo: Date,
  jumlahDibayar: number,
  angsuran: number
): 'tepat_waktu' | 'terlambat' | 'kurang' {
  if (jumlahDibayar < angsuran) return 'kurang'
  if (tanggalBayar > jatuhTempo) return 'terlambat'
  return 'tepat_waktu'
}
