/**
 * LendMap PWA — Master TypeScript Types
 * src/types/index.ts
 *
 * Single source of truth untuk semua types.
 * Derived from database schema di 02-ARCHITECTURE.md
 * JANGAN duplikasi types di file lain — import dari sini.
 */

// ─── AUTH & PROFILES ────────────────────────────────────────────────────────

export type UserRole = 'surveyor' | 'owner'

export interface Profile {
  id: string
  full_name: string
  role: UserRole
  is_active: boolean
  max_nasabah: number | null   // null = unlimited
  created_at: string
  updated_at: string
}

// ─── MAP MARKERS ────────────────────────────────────────────────────────────

export type AreaStatus = 'potensial' | 'bagus' | 'kurang_prospektif'

export interface AreaMarker {
  id: string
  surveyor_id: string
  latitude: number
  longitude: number
  status: AreaStatus
  notes: string | null
  photo_url: string | null
  created_at: string
  updated_at: string
  // joined
  surveyor?: Pick<Profile, 'id' | 'full_name'>
}

export interface AreaStatusHistory {
  id: string
  marker_id: string
  changed_by: string
  old_status: AreaStatus | null
  new_status: AreaStatus
  reason: string | null
  created_at: string
}

// Status transitions yang diperbolehkan
export const ALLOWED_STATUS_TRANSITIONS: Record<AreaStatus, AreaStatus[]> = {
  potensial: ['bagus', 'kurang_prospektif'],
  bagus: ['kurang_prospektif'],
  kurang_prospektif: [],   // terminal — tidak bisa naik kembali tanpa review owner
}

// ─── NASABAH ────────────────────────────────────────────────────────────────

export type NasabahStatus = 'aktif' | 'lunas' | 'macet'

export type ScoreLabel = 'Excellent' | 'Good' | 'Fair' | 'At Risk'

export interface Nasabah {
  id: string
  surveyor_id: string
  nama: string
  alamat: string
  jumlah_pinjaman: number      // dalam rupiah (integer)
  tanggal_mulai: string        // ISO date 'YYYY-MM-DD'
  tenor_bulan: number
  angsuran: number             // dalam rupiah (integer)
  tgl_jatuh_tempo: number      // 1–28 (tanggal dalam bulan)
  status: NasabahStatus
  score: number                // 0–100
  score_label: ScoreLabel
  created_at: string
  updated_at: string
  // joined
  surveyor?: Pick<Profile, 'id' | 'full_name'>
}

export interface NasabahFormInput {
  nama: string
  alamat: string
  jumlah_pinjaman: number
  tanggal_mulai: string
  tenor_bulan: number
  angsuran: number
  tgl_jatuh_tempo: number
}

// ─── SETORAN ────────────────────────────────────────────────────────────────

export type StatusBayar = 'tepat_waktu' | 'terlambat' | 'kurang'

export interface Setoran {
  id: string
  nasabah_id: string
  surveyor_id: string
  tanggal: string              // ISO date 'YYYY-MM-DD'
  jumlah_dibayar: number       // dalam rupiah
  jatuh_tempo: string          // ISO date 'YYYY-MM-DD'
  status_bayar: StatusBayar
  foto_bukti_url: string       // wajib — Supabase Storage URL
  notes: string | null
  created_at: string
  // joined
  nasabah?: Pick<Nasabah, 'id' | 'nama'>
}

export interface SetoranFormInput {
  nasabah_id: string
  tanggal: string
  jumlah_dibayar: number
  jatuh_tempo: string
  foto_bukti: File             // dikonsumsi di frontend, tidak dikirim ke DB langsung
  notes?: string
}

// ─── AUDIT LOG ──────────────────────────────────────────────────────────────

export type AuditAction = 'INSERT' | 'UPDATE' | 'DELETE'

export interface AuditLog {
  id: string
  actor_id: string | null
  action: AuditAction
  table_name: string
  record_id: string | null
  old_data: Record<string, unknown> | null
  new_data: Record<string, unknown> | null
  ip_address: string | null
  created_at: string
  // joined
  actor?: Pick<Profile, 'id' | 'full_name'>
}

// ─── PUSH SUBSCRIPTIONS ─────────────────────────────────────────────────────

export interface PushSubscriptionRecord {
  id: string
  user_id: string
  endpoint: string
  p256dh: string
  auth: string
  created_at: string
}

// ─── OFFLINE QUEUE ──────────────────────────────────────────────────────────

export type OfflineItemType = 'setoran' | 'marker'

export type OfflineItemStatus = 'pending' | 'syncing' | 'failed'

export interface OfflineQueueItem {
  localId: string              // UUID generated di client
  type: OfflineItemType
  payload: SetoranFormInput | Omit<AreaMarker, 'id' | 'created_at' | 'updated_at'>
  photoFile?: File             // untuk upload setelah online
  status: OfflineItemStatus
  retryCount: number
  createdAt: string
}

// ─── SCORING ────────────────────────────────────────────────────────────────

export interface ScoringInput {
  totalSetoran: number
  tepatWaktu: number
  bulanAktif: number
}

export interface ScoringResult {
  score: number
  label: ScoreLabel
}

export const SCORE_THRESHOLDS: Record<ScoreLabel, { min: number; max: number; color: string }> = {
  'Excellent': { min: 80, max: 100, color: '#16a34a' },  // green-600
  'Good':      { min: 60, max: 79,  color: '#2563eb' },  // blue-600
  'Fair':      { min: 40, max: 59,  color: '#ca8a04' },  // yellow-600
  'At Risk':   { min: 0,  max: 39,  color: '#dc2626' },  // red-600
}

// ─── DASHBOARD / ANALYTICS ──────────────────────────────────────────────────

export interface DashboardSummary {
  totalNasabahAktif: number
  totalOutstanding: number     // sum jumlah_pinjaman nasabah aktif (rupiah)
  totalSetoranBulanIni: number // sum jumlah_dibayar bulan berjalan (rupiah)
  nasabahMacet: number
}

export interface SurveyorPerformance {
  surveyor: Pick<Profile, 'id' | 'full_name'>
  jumlahNasabah: number
  avgScore: number
  totalSetoranBulanIni: number
  nasabahMacet: number
}

export interface MonthlySetoranTrend {
  month: string                // 'YYYY-MM'
  total: number                // total rupiah
  count: number                // jumlah transaksi
}

export interface AreaStatusDistribution {
  status: AreaStatus
  count: number
}

// ─── API RESPONSES ──────────────────────────────────────────────────────────

export interface ApiSuccess<T> {
  data: T
  error: null
}

export interface ApiError {
  data: null
  error: {
    message: string
    code?: string
  }
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError

// ─── FORM VALIDATION (Zod schemas di lib/validation.ts, types di sini) ──────

export interface ValidationError {
  field: string
  message: string
}
