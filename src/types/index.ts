export type UserRole = 'surveyor' | 'owner'

export interface Profile {
  id: string
  full_name: string
  role: UserRole
  is_active: boolean
  max_nasabah: number | null
  created_at: string
  updated_at: string
}

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
  surveyor?: Pick<Profile, 'id' | 'full_name'>
}

export type LocationTrackingStatus = 'idle' | 'requesting' | 'tracking' | 'denied' | 'unavailable' | 'error'

export interface SurveyorLocation {
  surveyor_id: string
  latitude: number
  longitude: number
  accuracy_meters: number | null
  heading: number | null
  speed_mps: number | null
  captured_at: string
}

export type NasabahStatus = 'aktif' | 'lunas' | 'macet' | 'hiatus'
export type NasabahReviewStatus = 'draft' | 'approved' | 'rejected'
export type ScoreLabel = 'Excellent' | 'Good' | 'Fair' | 'At Risk'

export interface Nasabah {
  id: string
  surveyor_id: string
  nama: string
  alamat: string
  jumlah_pinjaman: number
  tanggal_mulai: string
  tenor_bulan: number
  angsuran: number
  tgl_jatuh_tempo: number
  status: NasabahStatus
  review_status: NasabahReviewStatus
  submitted_by: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  review_notes: string | null
  score: number
  score_label: ScoreLabel
  created_at: string
  updated_at: string
  surveyor?: Pick<Profile, 'id' | 'full_name'>
}

export type StatusBayar = 'tepat_waktu' | 'terlambat' | 'kurang'

export interface Setoran {
  id: string
  nasabah_id: string
  surveyor_id: string
  tanggal: string
  jumlah_dibayar: number
  jatuh_tempo: string
  status_bayar: StatusBayar
  foto_bukti_url: string
  notes: string | null
  created_at: string
  nasabah?: Pick<Nasabah, 'id' | 'nama'>
}

export type OfflineItemType = 'setoran' | 'marker'
export type OfflineItemStatus = 'pending' | 'syncing' | 'failed'

export interface OfflineQueueItem {
  localId: string
  type: OfflineItemType
  payload: unknown
  status: OfflineItemStatus
  retryCount: number
  createdAt: string
}

export interface ScoringInput {
  totalSetoran: number
  tepatWaktu: number
  bulanAktif: number
}

export interface ScoringResult {
  score: number
  label: ScoreLabel
}

export interface DashboardSummary {
  totalNasabahAktif: number
  totalOutstanding: number
  totalSetoranBulanIni: number
  nasabahMacet: number
}

export interface QueueProjection {
  pending: number
  failed: number
  syncing: number
  total: number
}

export interface AuditEvent {
  id: string
  actor: string
  action: string
  table_name: string
  created_at: string
}
