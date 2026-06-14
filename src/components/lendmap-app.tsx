'use client'

import {
  Activity,
  Archive,
  Banknote,
  Camera,
  CheckCircle2,
  Cloud,
  Download,
  FileCheck2,
  Gauge,
  LocateFixed,
  LogOut,
  MapPinned,
  Menu,
  Plus,
  ReceiptText,
  RefreshCw,
  Search,
  ShieldCheck,
  UploadCloud,
  UserRound,
  Users,
  WifiOff,
  X,
} from 'lucide-react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { auditSeed, markerSeed, nasabahSeed, offlineSeed, setoranSeed } from '@/data/seed'
import { useForegroundLocationTracking } from '@/hooks/use-foreground-location-tracking'
import {
  calculateDashboardSummary,
  determineStatusBayar,
  formatRupiah,
  getCurrentMonth,
  isApprovedActiveNasabah,
  isNasabahVisibleToSurveyor,
  projectOfflineQueue,
  toCsv,
} from '@/lib/domain'
import { formatLastSeen, locationStatusLabel, parseCoordinatePair } from '@/lib/location'
import { buildMarkerInsertPayload } from '@/lib/markers'
import { createTrackedSukabumiMarker } from '@/lib/map'
import { canReactivateNasabah, getNasabahLifecycleLabel } from '@/lib/nasabah-lifecycle'
import { buildWeeklyPaymentSchedule, getMonthlyPaymentBreakdown, moveScheduleForHoliday } from '@/lib/payment-schedule'
import { buildSetoranIdempotencyKey, getSetoranDueDate, normalizeSetoranAmount } from '@/lib/setoran'
import { MARKER_PHOTOS_BUCKET, SETORAN_PHOTOS_BUCKET, uploadEvidenceFile } from '@/lib/storage'
import { createLendMapBrowserClient } from '@/lib/supabase-browser'
import type { AreaMarker, AreaStatus, AuditEvent, Nasabah, OfflineQueueItem, PaymentFrequency, PaymentSchedule, Profile, Setoran, SetoranPaymentType, SurveyorLocation, UserRole } from '@/types'

type ViewKey = 'dashboard' | 'map' | 'nasabah' | 'setoran' | 'audit'
type TrackerMarkerFormInput = {
  location: SurveyorLocation
  status: AreaStatus
  notes: string
  photoFile: File | null
}
type NasabahFormInput = {
  nama: string
  alamat: string
  jumlahPinjaman: number
  tanggalMulai: string
  tenorBulan: number
  angsuran: number
  tglJatuhTempo: number
  surveyorId: string
  paymentFrequency: PaymentFrequency
  installmentAmount: number
  interestAmount: number
  principalAmount: number
  monthlyDueDay: number | null
  weeklyDueDay: number | null
}
type MarkerCoordinateMode = 'gps' | 'manual'

const NASABAH_SELECT = 'id, surveyor_id, nama, alamat, jumlah_pinjaman, tanggal_mulai, tenor_bulan, angsuran, tgl_jatuh_tempo, payment_frequency, installment_count, installment_amount, interest_amount, principal_amount, monthly_due_day, weekly_due_day, status, review_status, submitted_by, reviewed_by, reviewed_at, review_notes, score, score_label, created_at, updated_at'
const SETORAN_SELECT = 'id, nasabah_id, surveyor_id, tanggal, jumlah_dibayar, jatuh_tempo, status_bayar, foto_bukti_url, notes, schedule_id, payment_type, installment_number, interest_paid, principal_paid, idempotency_key, sync_status, source_device, created_at'
const PAYMENT_SCHEDULE_SELECT = 'id, nasabah_id, installment_number, original_due_date, due_date, amount_due, status, is_holiday, holiday_label, paid_at, setoran_id, notes, created_at, updated_at'

const ownerViews: ViewKey[] = ['dashboard', 'map', 'nasabah', 'audit']
const surveyorViews: ViewKey[] = ['map', 'nasabah', 'setoran']

const SukabumiLeafletMap = dynamic(
  () => import('@/components/sukabumi-leaflet-map').then((module) => module.SukabumiLeafletMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[58vh] min-h-[360px] items-center justify-center rounded border border-outline bg-surface-low text-sm font-semibold text-ink/60 sm:h-[520px]">
        Memuat OpenStreetMap Sukabumi...
      </div>
    ),
  }
)

const areaStatusCopy: Record<AreaStatus, string> = {
  potensial: 'Potensial',
  bagus: 'Bagus',
  kurang_prospektif: 'Kurang prospektif',
}

const areaStatusClass: Record<AreaStatus, string> = {
  potensial: 'bg-maize/20 text-tertiary',
  bagus: 'bg-moss/15 text-moss',
  kurang_prospektif: 'bg-clay/10 text-clay',
}

export function LendMapApp({ currentProfile }: { currentProfile: Profile }) {
  const router = useRouter()
  const role = currentProfile.role
  const [activeView, setActiveView] = useState<ViewKey>(() => (role === 'owner' ? 'dashboard' : 'map'))
  const [nasabah, setNasabah] = useState<Nasabah[]>(nasabahSeed)
  const [surveyorOptions, setSurveyorOptions] = useState<Pick<Profile, 'id' | 'full_name'>[]>([])
  const [markers, setMarkers] = useState<AreaMarker[]>(markerSeed)
  const [setoran, setSetoran] = useState<Setoran[]>(setoranSeed)
  const [paymentSchedules, setPaymentSchedules] = useState<PaymentSchedule[]>([])
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>(auditSeed)
  const [offlineQueue, setOfflineQueue] = useState<OfflineQueueItem[]>(offlineSeed)
  const [selectedNasabahId, setSelectedNasabahId] = useState(() => {
    if (role === 'owner') return nasabahSeed[0]?.id ?? ''
    return nasabahSeed.find((item) => item.surveyor_id === currentProfile.id)?.id ?? ''
  })
  const [jumlahDibayar, setJumlahDibayar] = useState('220000')
  const [setoranTanggal, setSetoranTanggal] = useState(() => new Date().toISOString().slice(0, 10))
  const [setoranNotes, setSetoranNotes] = useState('')
  const [setoranProofFile, setSetoranProofFile] = useState<File | null>(null)
  const [setoranError, setSetoranError] = useState<string | null>(null)
  const [isSetoranSubmitting, setIsSetoranSubmitting] = useState(false)
  const [selectedScheduleId, setSelectedScheduleId] = useState('')
  const [setoranPaymentType, setSetoranPaymentType] = useState<SetoranPaymentType>('installment')
  const [isOfflineMode, setIsOfflineMode] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)

  const currentUser = currentProfile
  const trackingSurveyorId = role === 'owner' ? 'surveyor-1' : currentUser.id
  const locationTracking = useForegroundLocationTracking(trackingSurveyorId)
  const views = role === 'owner' ? ownerViews : surveyorViews
  const safeView = views.includes(activeView) ? activeView : views[0]
  const visibleNasabah = role === 'owner' ? nasabah : nasabah.filter((item) => item.surveyor_id === currentUser.id && isNasabahVisibleToSurveyor(item))
  const payableNasabah = visibleNasabah.filter(isApprovedActiveNasabah)
  const visibleMarkers = role === 'owner' ? markers : markers.filter((item) => item.surveyor_id === currentUser.id)
  const visibleSetoran = role === 'owner' ? setoran : setoran.filter((item) => item.surveyor_id === currentUser.id)
  const visiblePaymentSchedules = role === 'owner'
    ? paymentSchedules
    : paymentSchedules.filter((schedule) => visibleNasabah.some((customer) => customer.id === schedule.nasabah_id))
  const summary = useMemo(() => calculateDashboardSummary(nasabah, setoran, getCurrentMonth()), [nasabah, setoran])
  const queueProjection = useMemo(() => projectOfflineQueue(offlineQueue), [offlineQueue])

  async function refreshSetoran() {
    const supabase = createLendMapBrowserClient()
    const { data, error } = await supabase
      .from('setoran')
      .select(SETORAN_SELECT)
      .order('tanggal', { ascending: false })
      .order('created_at', { ascending: false })

    if (error) {
      setSetoranError(error.message || 'Riwayat setoran gagal dimuat.')
      return
    }

    setSetoran((data ?? []) as Setoran[])
  }

  async function refreshPaymentSchedules() {
    const supabase = createLendMapBrowserClient()
    const { data, error } = await supabase
      .from('nasabah_payment_schedules')
      .select(PAYMENT_SCHEDULE_SELECT)
      .order('due_date', { ascending: true })

    if (!error && data) {
      setPaymentSchedules(data as PaymentSchedule[])
      setSelectedScheduleId((current) => current || (data as PaymentSchedule[]).find((item) => item.status === 'scheduled')?.id || '')
    }
  }

  useEffect(() => {
    const supabase = createLendMapBrowserClient()

    async function loadNasabah() {
      const { data, error } = await supabase
        .from('nasabah')
        .select(NASABAH_SELECT)
        .order('created_at', { ascending: false })

      if (!error && data) {
        setNasabah(data as Nasabah[])
        const firstPayable = (data as Nasabah[]).find(isApprovedActiveNasabah)
        setSelectedNasabahId(firstPayable?.id ?? '')
      }
    }

    async function loadSurveyors() {
      if (role !== 'owner') return
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name')
        .eq('role', 'surveyor')
        .eq('is_active', true)
        .order('full_name')

      if (!error && data) {
        setSurveyorOptions(data)
      }
    }

    async function loadSetoran() {
      const { data, error } = await supabase
        .from('setoran')
        .select(SETORAN_SELECT)
        .order('tanggal', { ascending: false })
        .order('created_at', { ascending: false })

      if (!error && data) {
        setSetoran(data as Setoran[])
      }
    }

    async function loadPaymentSchedules() {
      const { data, error } = await supabase
        .from('nasabah_payment_schedules')
        .select(PAYMENT_SCHEDULE_SELECT)
        .order('due_date', { ascending: true })

      if (!error && data) {
        setPaymentSchedules(data as PaymentSchedule[])
        setSelectedScheduleId((data as PaymentSchedule[]).find((item) => item.status === 'scheduled')?.id ?? '')
      }
    }

    async function loadMarkers() {
      const { data, error } = await supabase
        .from('area_markers')
        .select('id, surveyor_id, latitude, longitude, status, notes, photo_url, created_at, updated_at')
        .order('created_at', { ascending: false })

      if (!error && data) {
        setMarkers(data as AreaMarker[])
      }
    }

    void loadNasabah()
    void loadSetoran()
    void loadMarkers()
    void loadPaymentSchedules()
    void loadSurveyors()
  }, [role])

  async function submitSetoran() {
    setSetoranError(null)
    const customer = payableNasabah.find((item) => item.id === selectedNasabahId)
    if (!customer) {
      setSetoranError('Pilih nasabah approved dan aktif sebelum mencatat setoran.')
      return
    }

    const amount = normalizeSetoranAmount(jumlahDibayar)
    const selectedSchedule = paymentSchedules.find((item) => item.id === selectedScheduleId && item.nasabah_id === customer.id)
    const paymentFrequency = customer.payment_frequency ?? 'weekly'
    const monthlyBreakdown = getMonthlyPaymentBreakdown({
      interestAmount: customer.interest_amount ?? 0,
      paymentType: setoranPaymentType === 'installment' ? 'interest_only' : setoranPaymentType,
      principalAmount: customer.principal_amount ?? customer.jumlah_pinjaman,
    })
    const effectiveAmount = paymentFrequency === 'monthly'
      ? monthlyBreakdown.totalPaid
      : selectedSchedule?.amount_due ?? amount
    const effectiveDueDate = paymentFrequency === 'weekly' && selectedSchedule
      ? selectedSchedule.due_date
      : getSetoranDueDate({
          tanggal: setoranTanggal,
          tglJatuhTempo: customer.monthly_due_day ?? customer.tgl_jatuh_tempo,
        })
    const effectivePaymentType: SetoranPaymentType = paymentFrequency === 'monthly' ? setoranPaymentType : 'installment'

    if (effectiveAmount <= 0) {
      setSetoranError('Jumlah dibayar harus lebih dari 0.')
      return
    }

    if (paymentFrequency === 'weekly' && !selectedSchedule) {
      setSetoranError('Pilih jadwal angsuran mingguan sebelum mencatat setoran.')
      return
    }

    const statusBayar = determineStatusBayar(setoranTanggal, effectiveDueDate, effectiveAmount, selectedSchedule?.amount_due ?? customer.angsuran)
    const createdAt = new Date().toISOString()
    const idempotencyKey = buildSetoranIdempotencyKey({
      surveyorId: customer.surveyor_id,
      nasabahId: customer.id,
      tanggal: setoranTanggal,
      jumlahDibayar: effectiveAmount,
    })
    const payment: Setoran = {
      id: `setoran-local-${idempotencyKey}`,
      nasabah_id: customer.id,
      surveyor_id: customer.surveyor_id,
      tanggal: setoranTanggal,
      jumlah_dibayar: effectiveAmount,
      jatuh_tempo: effectiveDueDate,
      status_bayar: statusBayar,
      foto_bukti_url: null,
      notes: setoranNotes.trim() || (isOfflineMode ? 'Queued offline dari mode lapangan' : null),
      schedule_id: selectedSchedule?.id ?? null,
      payment_type: effectivePaymentType,
      installment_number: selectedSchedule?.installment_number ?? null,
      interest_paid: paymentFrequency === 'monthly' ? monthlyBreakdown.interestPaid : 0,
      principal_paid: paymentFrequency === 'monthly' ? monthlyBreakdown.principalPaid : effectiveAmount,
      idempotency_key: idempotencyKey,
      sync_status: isOfflineMode ? 'pending' : 'synced',
      source_device: 'web',
      created_at: createdAt,
    }

    if (isOfflineMode) {
      setOfflineQueue((current) => [
        {
          localId: `offline-${current.length + 1}`,
          type: 'setoran',
          payload: payment,
          status: 'pending',
          retryCount: 0,
          createdAt: payment.created_at,
        },
        ...current,
      ])
      return
    }

    setIsSetoranSubmitting(true)
    try {
      const supabase = createLendMapBrowserClient()
      const proofPath = setoranProofFile
        ? await uploadEvidenceFile({
            bucket: SETORAN_PHOTOS_BUCKET,
            file: setoranProofFile,
            supabase,
            userId: currentProfile.id,
          })
        : null

      const { data, error } = await supabase.from('setoran').insert({
        nasabah_id: customer.id,
        surveyor_id: customer.surveyor_id,
        tanggal: setoranTanggal,
        jumlah_dibayar: effectiveAmount,
        jatuh_tempo: effectiveDueDate,
        status_bayar: statusBayar,
        foto_bukti_url: proofPath,
        notes: setoranNotes.trim() || null,
        schedule_id: selectedSchedule?.id ?? null,
        payment_type: effectivePaymentType,
        installment_number: selectedSchedule?.installment_number ?? null,
        interest_paid: paymentFrequency === 'monthly' ? monthlyBreakdown.interestPaid : 0,
        principal_paid: paymentFrequency === 'monthly' ? monthlyBreakdown.principalPaid : effectiveAmount,
        idempotency_key: idempotencyKey,
        sync_status: 'synced',
        source_device: 'web',
      }).select('id').single()

      if (error) {
        setSetoranError(error.message || 'Setoran gagal dicatat.')
        return
      }

      if (selectedSchedule && data) {
        await supabase
          .from('nasabah_payment_schedules')
          .update({
            status: 'paid',
            paid_at: createdAt,
            setoran_id: data.id,
          })
          .eq('id', selectedSchedule.id)
      }

      setJumlahDibayar('')
      setSetoranNotes('')
      setSetoranProofFile(null)
      await refreshSetoran()
      await refreshPaymentSchedules()
    } catch (error) {
      setSetoranError(error instanceof Error ? error.message : 'Setoran gagal dicatat.')
    } finally {
      setIsSetoranSubmitting(false)
    }

    setAuditEvents((current) => [
      {
        id: `audit-${current.length + 1}`,
        actor: currentUser.full_name,
        action: 'INSERT',
        table_name: 'setoran',
        created_at: createdAt,
      },
      ...current,
    ])
  }

  function syncOfflineQueue() {
    setOfflineQueue((current) => current.map((item) => ({ ...item, status: 'syncing' })))
    setTimeout(() => {
      setOfflineQueue([])
      setAuditEvents((current) => [
        {
          id: `audit-${current.length + 1}`,
          actor: currentUser.full_name,
          action: 'SYNC',
          table_name: 'offline_queue',
          created_at: new Date('2026-06-13T09:05:00.000Z').toISOString(),
        },
        ...current,
      ])
    }, 400)
  }

  async function addTrackerMarker(input: TrackerMarkerFormInput) {
    const supabase = createLendMapBrowserClient()
    const photoUrl = input.photoFile
      ? await uploadEvidenceFile({
          bucket: MARKER_PHOTOS_BUCKET,
          file: input.photoFile,
          supabase,
          userId: currentProfile.id,
        })
      : null

    const surveyorId = role === 'owner' ? 'surveyor-1' : currentUser.id
    const createdAt = new Date().toISOString()
    const localMarker = createTrackedSukabumiMarker({
      existingCount: markers.length,
      surveyorId,
      location: input.location,
      status: input.status,
      notes: input.notes,
      photoUrl,
      createdAt,
    })

    if (isOfflineMode) {
      setOfflineQueue((current) => [
        {
          localId: `offline-${current.length + 1}`,
          type: 'marker',
          payload: localMarker,
          status: 'pending',
          retryCount: 0,
          createdAt: localMarker.created_at,
        },
        ...current,
      ])
      return
    }

    const { data, error } = await supabase
      .from('area_markers')
      .insert(
        buildMarkerInsertPayload({
          surveyorId,
          latitude: input.location.latitude,
          longitude: input.location.longitude,
          status: input.status,
          notes: input.notes,
          photoPath: photoUrl,
        })
      )
      .select('id, surveyor_id, latitude, longitude, status, notes, photo_url, created_at, updated_at')
      .single()

    if (error) {
      throw new Error(error.message || 'Marker gagal disimpan.')
    }

    setMarkers((current) => [data as AreaMarker, ...current])
    setAuditEvents((current) => [
      {
        id: `audit-${current.length + 1}`,
        actor: currentUser.full_name,
        action: 'INSERT',
        table_name: 'area_markers',
        created_at: createdAt,
      },
      ...current,
    ])
  }

  function exportNasabah() {
    const csv = toCsv(
      visibleNasabah.map((item) => ({
        nama: item.nama,
        alamat: item.alamat,
        pinjaman: item.jumlah_pinjaman,
        angsuran: item.angsuran,
        status: item.status,
        review_status: item.review_status,
        lifecycle: getNasabahLifecycleLabel({ reviewStatus: item.review_status, status: item.status }),
        score: item.score,
        label: item.score_label,
      }))
    )
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = 'lendmap-nasabah-2026-06.csv'
    link.click()
    URL.revokeObjectURL(link.href)
  }

  async function createNasabah(input: NasabahFormInput) {
    const createdAt = new Date().toISOString()
    const isOwnerInput = role === 'owner'
    const payload = {
      surveyor_id: isOwnerInput ? input.surveyorId : currentUser.id,
      nama: input.nama.trim(),
      alamat: input.alamat.trim(),
      jumlah_pinjaman: input.jumlahPinjaman,
      tanggal_mulai: input.tanggalMulai,
      tenor_bulan: input.tenorBulan,
      angsuran: input.angsuran,
      tgl_jatuh_tempo: input.tglJatuhTempo,
      payment_frequency: input.paymentFrequency,
      installment_count: input.paymentFrequency === 'weekly' ? 6 : input.tenorBulan,
      installment_amount: input.installmentAmount,
      interest_amount: input.interestAmount,
      principal_amount: input.principalAmount,
      monthly_due_day: input.monthlyDueDay,
      weekly_due_day: input.weeklyDueDay,
      status: 'aktif',
      review_status: isOwnerInput ? 'approved' : 'draft',
      submitted_by: currentUser.id,
      reviewed_by: isOwnerInput ? currentUser.id : null,
      reviewed_at: isOwnerInput ? createdAt : null,
      review_notes: null,
      score: 0,
      score_label: 'At Risk',
      created_at: createdAt,
      updated_at: createdAt,
    }
    const supabase = createLendMapBrowserClient()
    const { data, error } = await supabase
      .from('nasabah')
      .insert(payload)
      .select(NASABAH_SELECT)
      .single()

    if (error) {
      throw new Error(error.message)
    }

    const nextNasabah = data as Nasabah

    if (input.paymentFrequency === 'weekly') {
      const { error: scheduleError } = await supabase
        .from('nasabah_payment_schedules')
        .insert(
          buildWeeklyPaymentSchedule({
            amountDue: input.installmentAmount,
            nasabahId: nextNasabah.id,
            startDate: input.tanggalMulai,
          })
        )

      if (scheduleError) {
        throw new Error(scheduleError.message)
      }
      await refreshPaymentSchedules()
    }

    setNasabah((current) => [nextNasabah, ...current])
    if (isApprovedActiveNasabah(nextNasabah)) {
      setSelectedNasabahId(nextNasabah.id)
    }
    setAuditEvents((current) => [
      {
        id: `audit-${current.length + 1}`,
        actor: currentUser.full_name,
        action: isOwnerInput ? 'INSERT_APPROVED' : 'INSERT_DRAFT',
        table_name: 'nasabah',
        created_at: createdAt,
      },
      ...current,
    ])
  }

  async function reviewNasabah(id: string, decision: 'approved' | 'rejected') {
    const reviewedAt = new Date().toISOString()
    const supabase = createLendMapBrowserClient()
    const { data, error } = await supabase
      .from('nasabah')
      .update({
        review_status: decision,
        reviewed_by: currentUser.id,
        reviewed_at: reviewedAt,
        review_notes: decision === 'approved' ? 'Disetujui bos' : 'Ditolak bos',
      })
      .eq('id', id)
      .select(NASABAH_SELECT)
      .single()

    if (error) {
      throw new Error(error.message)
    }

    setNasabah((current) => current.map((item) => (item.id === id ? (data as Nasabah) : item)))
    setAuditEvents((current) => [
      {
        id: `audit-${current.length + 1}`,
        actor: currentUser.full_name,
        action: decision === 'approved' ? 'APPROVE' : 'REJECT',
        table_name: 'nasabah',
        created_at: reviewedAt,
      },
      ...current,
    ])
  }

  async function moveNasabahToHiatus(id: string) {
    if (currentProfile.role !== 'owner') return

    const supabase = createLendMapBrowserClient()
    const { data, error } = await supabase
      .from('nasabah')
      .update({
        status: 'hiatus',
        review_notes: 'Dipindah ke hiatus oleh bos',
      })
      .eq('id', id)
      .select(NASABAH_SELECT)
      .single()

    if (error) {
      throw new Error(error.message)
    }

    setNasabah((current) => current.map((item) => (item.id === id ? (data as Nasabah) : item)))
    if (selectedNasabahId === id) {
      setSelectedNasabahId(payableNasabah.find((item) => item.id !== id)?.id ?? '')
    }
  }

  async function movePaymentScheduleForHoliday(schedule: PaymentSchedule, weekOffset: number) {
    const nextSchedule = moveScheduleForHoliday({
      originalDueDate: schedule.original_due_date,
      weekOffset,
    })
    const supabase = createLendMapBrowserClient()
    const { data, error } = await supabase
      .from('nasabah_payment_schedules')
      .update({
        ...nextSchedule,
        notes: weekOffset > 0 ? 'Jadwal dimundurkan karena libur' : null,
      })
      .eq('id', schedule.id)
      .select(PAYMENT_SCHEDULE_SELECT)
      .single()

    if (error) {
      setSetoranError(error.message || 'Jadwal angsuran gagal diperbarui.')
      return
    }

    setPaymentSchedules((current) => current.map((item) => (item.id === schedule.id ? (data as PaymentSchedule) : item)))
  }

  async function reactivateNasabah(id: string) {
    if (currentProfile.role !== 'owner') return

    const supabase = createLendMapBrowserClient()
    const { data, error } = await supabase
      .from('nasabah')
      .update({
        status: 'aktif',
        review_notes: 'Diaktifkan kembali oleh bos',
      })
      .eq('id', id)
      .eq('review_status', 'approved')
      .eq('status', 'hiatus')
      .select(NASABAH_SELECT)
      .single()

    if (error) {
      throw new Error(error.message)
    }

    setNasabah((current) => current.map((item) => (item.id === id ? (data as Nasabah) : item)))
    setSelectedNasabahId(id)
  }

  async function logout() {
    setAuthError(null)
    const supabase = createLendMapBrowserClient()
    const { error } = await supabase.auth.signOut()

    if (error) {
      setAuthError(error.message || 'Logout gagal. Coba lagi.')
      return
    }

    router.replace('/login')
    router.refresh()
  }

  return (
    <main className="min-h-screen bg-field text-ink">
      <Header
        role={role}
        userName={currentUser.full_name}
        queueTotal={queueProjection.total}
        isOfflineMode={isOfflineMode}
        onOfflineToggle={() => setIsOfflineMode((value) => !value)}
        onLogout={logout}
        authError={authError}
      />

      <div className="mx-auto grid w-full max-w-7xl gap-4 px-4 pb-24 pt-[72px] sm:px-6 lg:grid-cols-[220px_minmax(0,1fr)] lg:px-8 lg:pb-8">
        <Navigation role={role} activeView={safeView} onChange={setActiveView} />

        <section className="min-h-[calc(100vh-112px)] lg:min-h-[720px]">
            {safeView === 'dashboard' ? <OwnerDashboard summary={summary} nasabah={nasabah} setoran={setoran} /> : null}
            {safeView === 'map' ? (
              <MapWorkspace
                markers={visibleMarkers}
                role={role}
                onAddMarker={addTrackerMarker}
                locationTracking={locationTracking}
              />
            ) : null}
            {safeView === 'nasabah' ? (
              <NasabahWorkspace
                nasabah={visibleNasabah}
                currentUser={currentUser}
                onCreate={createNasabah}
                onExport={exportNasabah}
                onMoveToHiatus={moveNasabahToHiatus}
                onReactivate={reactivateNasabah}
                onReview={reviewNasabah}
                role={role}
                surveyorOptions={surveyorOptions}
              />
            ) : null}
            {safeView === 'setoran' ? (
              <SetoranWorkspace
                nasabah={payableNasabah}
                setoran={visibleSetoran}
                schedules={visiblePaymentSchedules}
                selectedNasabahId={selectedNasabahId}
                selectedScheduleId={selectedScheduleId}
                jumlahDibayar={jumlahDibayar}
                setoranTanggal={setoranTanggal}
                setoranNotes={setoranNotes}
                setoranProofFile={setoranProofFile}
                setoranPaymentType={setoranPaymentType}
                setoranError={setoranError}
                isSetoranSubmitting={isSetoranSubmitting}
                isOfflineMode={isOfflineMode}
                onNasabahChange={setSelectedNasabahId}
                onScheduleChange={setSelectedScheduleId}
                onAmountChange={setJumlahDibayar}
                onTanggalChange={setSetoranTanggal}
                onNotesChange={setSetoranNotes}
                onProofFileChange={setSetoranProofFile}
                onPaymentTypeChange={setSetoranPaymentType}
                onMoveScheduleForHoliday={movePaymentScheduleForHoliday}
                onSubmit={submitSetoran}
              />
            ) : null}
            {safeView === 'audit' ? (
              <AuditWorkspace
                events={auditEvents}
                queue={offlineQueue}
                projection={queueProjection}
                onSync={syncOfflineQueue}
              />
            ) : null}
        </section>
      </div>
    </main>
  )
}

function Header({
  role,
  userName,
  queueTotal,
  isOfflineMode,
  onOfflineToggle,
  onLogout,
  authError,
}: {
  role: UserRole
  userName: string
  queueTotal: number
  isOfflineMode: boolean
  onOfflineToggle: () => void
  onLogout: () => void
  authError: string | null
}) {
  return (
    <header className="fixed inset-x-0 top-0 z-[720] border-b border-outline bg-surface/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-outline bg-white text-primary">
            <Banknote size={19} />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-black text-primary">LendMap PWA</p>
            <p className="hidden text-xs font-semibold text-ink/60 sm:block">Operasi lapangan</p>
          </div>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <div className="hidden rounded-full border border-outline bg-white px-3 py-1.5 text-xs font-black capitalize text-primary sm:block">
            {role}
          </div>
          <button
            className={`inline-flex h-10 items-center justify-center gap-2 rounded-full border px-3 text-xs font-black ${
              isOfflineMode ? 'border-clay bg-clay text-white' : 'border-outline bg-white text-primary'
            }`}
            onClick={onOfflineToggle}
            type="button"
          >
            {isOfflineMode ? <WifiOff size={16} /> : <Cloud size={16} />}
            <span className="hidden sm:inline">{isOfflineMode ? 'Offline demo' : 'Online'}</span>
          </button>
          <div className="hidden items-center gap-2 rounded border border-outline bg-white px-3 py-2 text-xs lg:flex">
            <UserRound size={14} className="text-ink/50" />
            <strong className="max-w-36 truncate">{userName}</strong>
            <span className="text-ink/55">Q:{queueTotal}</span>
          </div>
          <button
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-outline bg-white text-ink hover:bg-clay/10 hover:text-clay"
            aria-label="Logout"
            onClick={onLogout}
            type="button"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
      {authError ? <p className="mx-auto max-w-7xl border-t border-clay/20 bg-clay/10 px-4 py-2 text-sm font-semibold text-clay sm:px-6 lg:px-8">{authError}</p> : null}
    </header>
  )
}

function Navigation({ role, activeView, onChange }: { role: UserRole; activeView: ViewKey; onChange: (view: ViewKey) => void }) {
  const views = role === 'owner' ? ownerViews : surveyorViews
  const mobileGridClass = views.length === 4 ? 'grid-cols-4' : 'grid-cols-3'
  const labels: Record<ViewKey, string> = {
    dashboard: 'Dashboard',
    map: 'Peta',
    nasabah: 'Nasabah',
    setoran: 'Setoran',
    audit: 'Audit',
  }
  const icons: Record<ViewKey, React.ReactNode> = {
    dashboard: <Activity size={18} />,
    map: <MapPinned size={18} />,
    nasabah: <Users size={18} />,
    setoran: <ReceiptText size={18} />,
    audit: <ShieldCheck size={18} />,
  }

  return (
    <nav className="fixed inset-x-0 bottom-0 z-[700] border-t border-outline bg-surface/95 shadow-dock backdrop-blur lg:sticky lg:inset-auto lg:top-[72px] lg:h-fit lg:rounded lg:border lg:bg-white lg:p-2 lg:shadow-none">
      <div className="mb-2 hidden items-center gap-2 px-2 py-2 text-xs font-black uppercase text-ink/50 lg:flex">
        <Menu size={14} />
        Menu
      </div>
      <div className={`safe-bottom grid ${mobileGridClass} lg:grid-cols-1 lg:gap-1 lg:p-0`}>
        {views.map((view) => (
          <button
            key={view}
            className={`inline-flex min-h-14 flex-col items-center justify-center gap-1 border-t-2 px-2 py-2 text-[11px] font-bold sm:text-sm lg:min-h-12 lg:flex-row lg:justify-start lg:rounded lg:border-t-0 lg:px-3 ${
              activeView === view
                ? 'border-primary bg-moss/10 text-primary lg:bg-primary lg:text-white'
                : 'border-transparent text-ink/65 hover:bg-surface-container hover:text-primary'
            }`}
            onClick={() => onChange(view)}
            type="button"
          >
            {icons[view]}
            {labels[view]}
          </button>
        ))}
      </div>
    </nav>
  )
}

function OwnerDashboard({ summary, nasabah, setoran }: { summary: ReturnType<typeof calculateDashboardSummary>; nasabah: Nasabah[]; setoran: Setoran[] }) {
  const scoreBuckets = [
    { label: 'Excellent', count: nasabah.filter((item) => item.score_label === 'Excellent').length, className: 'bg-moss' },
    { label: 'Good', count: nasabah.filter((item) => item.score_label === 'Good').length, className: 'bg-river' },
    { label: 'Fair', count: nasabah.filter((item) => item.score_label === 'Fair').length, className: 'bg-maize' },
    { label: 'At Risk', count: nasabah.filter((item) => item.score_label === 'At Risk').length, className: 'bg-clay' },
  ]
  const recentSetoran = setoran.slice(0, 4)
  const trendValues = [180000, 240000, 320000, 280000, 410000, summary.totalSetoranBulanIni]
  const maxTrend = Math.max(...trendValues, 1)

  return (
    <div className="space-y-4">
      <PageTitle
        eyebrow="Selamat bekerja"
        title="Dashboard owner"
        subtitle="Ringkasan nasabah, outstanding, dan setoran bulan berjalan."
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric icon={<Users size={16} />} label="Nasabah aktif" value={String(summary.totalNasabahAktif)} />
        <Metric icon={<Banknote size={16} />} label="Outstanding" value={formatRupiah(summary.totalOutstanding)} />
        <Metric icon={<ReceiptText size={16} />} label="Setoran bulan ini" value={formatRupiah(summary.totalSetoranBulanIni)} />
        <Metric icon={<Gauge size={16} />} label="Nasabah macet" value={String(summary.nasabahMacet)} tone="danger" />
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded border border-outline bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-black">Tren setoran</h3>
            <span className="rounded-full bg-surface-low px-2 py-1 text-xs font-bold text-ink/55">6 periode</span>
          </div>
          <div className="mt-5 flex h-56 items-end gap-3 border-b border-outline px-1">
            {trendValues.map((value, index) => (
              <div key={index} className="flex h-full flex-1 flex-col justify-end gap-2">
                <div
                  className={`w-full rounded-t ${index === trendValues.length - 1 ? 'bg-moss' : 'bg-river/25'}`}
                  style={{ height: `${Math.max(16, (value / maxTrend) * 100)}%` }}
                />
                <span className="text-center text-[11px] font-semibold text-ink/55">{index + 1}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded border border-outline bg-white p-4">
          <h3 className="text-sm font-black">Distribusi score</h3>
          <div className="mt-4 space-y-3">
            {scoreBuckets.map((bucket) => (
              <div key={bucket.label}>
                <div className="mb-1 flex justify-between text-sm font-semibold">
                  <span>{bucket.label}</span>
                  <strong>{bucket.count}</strong>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-surface-container">
                  <div className={`h-full ${bucket.className}`} style={{ width: `${Math.max(8, bucket.count * 25)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="rounded border border-outline bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-black">Setoran terbaru</h3>
          <span className="text-xs font-bold text-primary">Lihat semua</span>
        </div>
        <div className="mt-3 space-y-2 sm:hidden">
          {recentSetoran.map((item) => (
            <div key={item.id} className="rounded border border-outline p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-black">{nasabah.find((customer) => customer.id === item.nasabah_id)?.nama ?? '-'}</p>
                  <p className="mt-1 text-xs text-ink/55">{item.tanggal}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-black text-primary">+{formatRupiah(item.jumlah_dibayar)}</p>
                  <PaymentBadge status={item.status_bayar} />
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 hidden overflow-x-auto sm:block">
          <table className="w-full min-w-[560px] border-collapse text-left text-sm">
            <thead className="border-b border-outline text-xs uppercase text-ink/50">
              <tr>
                <th className="py-2">Tanggal</th>
                <th>Nasabah</th>
                <th>Jumlah</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {recentSetoran.map((item) => (
                <tr key={item.id} className="border-b border-outline/60">
                  <td className="py-3">{item.tanggal}</td>
                  <td>{nasabah.find((customer) => customer.id === item.nasabah_id)?.nama ?? '-'}</td>
                  <td className="font-black text-primary">+{formatRupiah(item.jumlah_dibayar)}</td>
                  <td><PaymentBadge status={item.status_bayar} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function MapWorkspace({
  markers,
  role,
  onAddMarker,
  locationTracking,
}: {
  markers: AreaMarker[]
  role: UserRole
  onAddMarker: (input: TrackerMarkerFormInput) => Promise<void>
  locationTracking: ReturnType<typeof useForegroundLocationTracking>
}) {
  const [capturedMarkerLocation, setCapturedMarkerLocation] = useState<SurveyorLocation | null>(null)
  const [focusLocationRequest, setFocusLocationRequest] = useState(0)
  const [isMarkerFormOpen, setIsMarkerFormOpen] = useState(false)
  const [markerCoordinateInput, setMarkerCoordinateInput] = useState('')
  const [markerCoordinateMode, setMarkerCoordinateMode] = useState<MarkerCoordinateMode>('gps')
  const [markerFormError, setMarkerFormError] = useState<string | null>(null)
  const [markerNotes, setMarkerNotes] = useState('')
  const [markerPhotoFile, setMarkerPhotoFile] = useState<File | null>(null)
  const [markerPhotoName, setMarkerPhotoName] = useState<string | null>(null)
  const [isMarkerSubmitting, setIsMarkerSubmitting] = useState(false)
  const [markerStatus, setMarkerStatus] = useState<AreaStatus>('potensial')

  function locateDevice() {
    locationTracking.refreshLocation()
    setFocusLocationRequest((value) => value + 1)
  }

  function openMarkerForm() {
    setCapturedMarkerLocation(locationTracking.location)
    setMarkerCoordinateInput('')
    setMarkerCoordinateMode(locationTracking.location ? 'gps' : 'manual')
    setMarkerFormError(null)
    setMarkerNotes('')
    setMarkerPhotoFile(null)
    setMarkerPhotoName(null)
    setMarkerStatus('potensial')
    setIsMarkerFormOpen(true)
  }

  async function submitMarkerForm() {
    const manualCoordinates = markerCoordinateMode === 'manual' ? parseCoordinatePair(markerCoordinateInput) : null
    const markerLocation =
      markerCoordinateMode === 'manual' && manualCoordinates
        ? {
            surveyor_id: capturedMarkerLocation?.surveyor_id ?? 'surveyor-1',
            latitude: manualCoordinates.latitude,
            longitude: manualCoordinates.longitude,
            accuracy_meters: null,
            heading: null,
            speed_mps: null,
            captured_at: new Date().toISOString(),
          }
        : capturedMarkerLocation

    if (!markerLocation) {
      setMarkerFormError('Lokasi belum tersedia. Pakai GPS aktif atau isi koordinat manual dari Google Maps.')
      return
    }

    if (markerCoordinateMode === 'manual' && !manualCoordinates) {
      setMarkerFormError('Format koordinat harus seperti -6.9277, 106.9296.')
      return
    }

    if (markerNotes.trim().length === 0) {
      setMarkerFormError('Penjelasan lokasi wajib diisi supaya marker bisa diaudit.')
      return
    }

    setIsMarkerSubmitting(true)
    try {
      await onAddMarker({
        location: markerLocation,
        status: markerStatus,
        notes: markerNotes,
        photoFile: markerPhotoFile,
      })
      setIsMarkerFormOpen(false)
      setCapturedMarkerLocation(null)
      setMarkerCoordinateInput('')
      setMarkerCoordinateMode('gps')
      setMarkerNotes('')
      setMarkerPhotoFile(null)
      setMarkerPhotoName(null)
      setMarkerFormError(null)
    } catch (error) {
      setMarkerFormError(error instanceof Error ? error.message : 'Upload gambar atau simpan marker gagal.')
    } finally {
      setIsMarkerSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      <PageTitle
        eyebrow={role === 'owner' ? 'Owner / semua surveyor' : 'Surveyor aktif'}
        title="Peta survei Sukabumi"
        subtitle={role === 'owner' ? 'Pantau marker area Sukabumi dari semua surveyor.' : 'Input dan pantau marker Sukabumi milik akun surveyor ini.'}
      />
      <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
        <div className="relative">
          <SukabumiLeafletMap
            focusLocationRequest={focusLocationRequest}
            markers={markers}
            surveyorLocation={locationTracking.location}
          />
          <button
            aria-label="Deteksi lokasi perangkat"
            className="absolute bottom-4 right-4 z-[500] inline-flex h-12 w-12 items-center justify-center rounded-full border border-outline bg-white text-secondary shadow-line"
            data-testid="locate-device-button"
            onClick={locateDevice}
            type="button"
          >
            <LocateFixed size={22} />
          </button>
        </div>
        <div className="space-y-3">
          <div className="rounded border border-outline bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-black uppercase text-ink/45">Tracking active</p>
              <span className="rounded-full border border-outline bg-surface-low px-2 py-1 text-[11px] font-black text-primary">
                {locationTracking.status === 'tracking' ? 'LIVE' : 'GPS'}
              </span>
            </div>
            <p className="mt-2 text-lg font-black">{locationStatusLabel(locationTracking.status)}</p>
            {locationTracking.location ? (
              <div className="mt-2 space-y-1 text-sm text-ink/65">
                <p>Diambil: {formatLastSeen(locationTracking.location.captured_at)}</p>
                <p>Akurasi: {locationTracking.location.accuracy_meters?.toFixed(0) ?? '-'} m</p>
              </div>
            ) : (
              <p className="mt-2 text-sm text-ink/60">Ambil titik GPS sekali saat dibutuhkan. Tidak ada tracking berjalan terus-menerus.</p>
            )}
            {locationTracking.errorMessage ? <p className="mt-2 text-sm font-bold text-clay">{locationTracking.errorMessage}</p> : null}
            <button
              className="mt-3 inline-flex min-h-12 w-full items-center justify-center rounded bg-secondary px-4 py-3 text-sm font-black text-white"
              onClick={locationTracking.refreshLocation}
              data-testid="location-tracking-toggle"
              type="button"
            >
              {locationTracking.isTracking ? 'Mengambil lokasi...' : locationTracking.location ? 'Ambil ulang lokasi saat ini' : 'Ambil lokasi saat ini'}
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <MiniStat label="Status area" value={String(markers.filter((item) => item.status === 'potensial').length)} />
            <MiniStat label="Bagus" value={String(markers.filter((item) => item.status === 'bagus').length)} />
            <MiniStat label="Kurang" value={String(markers.filter((item) => item.status === 'kurang_prospektif').length)} />
          </div>
          <p className="sr-only" data-testid="tracker-marker-count">{markers.length}</p>
          {isMarkerFormOpen ? (
            <div className="rounded border border-secondary/30 bg-white p-4" data-testid="marker-form">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase text-ink/45">Marker lokasi saat ini</p>
                  <p className="mt-2 text-sm font-bold text-ink/70">
                    {markerCoordinateMode === 'manual'
                      ? markerCoordinateInput || 'Isi koordinat manual'
                      : capturedMarkerLocation
                        ? `${capturedMarkerLocation.latitude.toFixed(6)}, ${capturedMarkerLocation.longitude.toFixed(6)}`
                        : 'Menunggu GPS aktif'}
                  </p>
                </div>
                <button
                  aria-label="Tutup form marker"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-surface-low text-ink"
                  onClick={() => setIsMarkerFormOpen(false)}
                  type="button"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-1 rounded border border-outline bg-surface-low p-1">
                <button
                  className={`min-h-11 rounded px-3 py-2 text-sm font-black ${markerCoordinateMode === 'gps' ? 'bg-secondary text-white' : 'bg-white text-ink/70'}`}
                  onClick={() => {
                    setMarkerCoordinateMode('gps')
                    setMarkerFormError(null)
                  }}
                  type="button"
                >
                  Pakai GPS
                </button>
                <button
                  className={`min-h-11 rounded px-3 py-2 text-sm font-black ${markerCoordinateMode === 'manual' ? 'bg-secondary text-white' : 'bg-white text-ink/70'}`}
                  onClick={() => {
                    setMarkerCoordinateMode('manual')
                    setMarkerFormError(null)
                  }}
                  type="button"
                >
                  Input koordinat
                </button>
              </div>
              {markerCoordinateMode === 'manual' ? (
                <>
                  <label className="mt-4 block text-xs font-black uppercase text-ink/50" htmlFor="marker-coordinate">Koordinat Google Maps</label>
                  <input
                    className="mt-2 min-h-12 w-full rounded border border-outline bg-white px-3 py-3"
                    id="marker-coordinate"
                    inputMode="decimal"
                    onChange={(event) => setMarkerCoordinateInput(event.target.value)}
                    placeholder="-6.9277, 106.9296"
                    value={markerCoordinateInput}
                  />
                </>
              ) : null}
              <label className="mt-4 block text-xs font-black uppercase text-ink/50" htmlFor="marker-status">Status area</label>
              <select
                className="mt-2 min-h-12 w-full rounded border border-outline bg-white px-3 py-3"
                id="marker-status"
                onChange={(event) => setMarkerStatus(event.target.value as AreaStatus)}
                value={markerStatus}
              >
                <option value="potensial">Potensial</option>
                <option value="bagus">Bagus</option>
                <option value="kurang_prospektif">Kurang prospektif</option>
              </select>
              <label className="mt-4 block text-xs font-black uppercase text-ink/50" htmlFor="marker-notes">Penjelasan lokasi</label>
              <textarea
                className="mt-2 min-h-24 w-full resize-none rounded border border-outline bg-white px-3 py-3"
                id="marker-notes"
                onChange={(event) => setMarkerNotes(event.target.value)}
                placeholder="Contoh: warung padat transaksi, dekat pasar, banyak usaha harian."
                value={markerNotes}
              />
              <label className="mt-4 block text-xs font-black uppercase text-ink/50" htmlFor="marker-photo">Foto bukti optional</label>
              <label className="mt-2 flex min-h-16 cursor-pointer items-center justify-center gap-2 rounded border border-dashed border-outline bg-surface-low px-3 py-3 text-sm font-bold text-ink/70" htmlFor="marker-photo">
                <Camera size={18} />
                {markerPhotoName ?? 'Pilih / ambil foto'}
              </label>
              <input
                accept="image/*"
                capture="environment"
                className="sr-only"
                id="marker-photo"
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null
                  setMarkerPhotoFile(file)
                  setMarkerPhotoName(file?.name ?? null)
                }}
                type="file"
              />
              {markerFormError ? <p className="mt-3 text-sm font-bold text-clay">{markerFormError}</p> : null}
              <button
                className="mt-4 inline-flex min-h-12 w-full items-center justify-center rounded bg-primary px-4 py-3 text-sm font-black text-white"
                data-testid="marker-form-submit"
                disabled={isMarkerSubmitting}
                onClick={submitMarkerForm}
                type="button"
              >
                {isMarkerSubmitting ? 'Mengupload...' : 'Simpan marker lokasi ini'}
              </button>
            </div>
          ) : null}
          {markers.map((marker) => (
            <div key={marker.id} className="rounded border border-outline bg-white p-3" data-testid="tracker-marker-card">
              <span className={`rounded-full px-2 py-1 text-xs font-black ${areaStatusClass[marker.status]}`}>
                {areaStatusCopy[marker.status]}
              </span>
              <p className="mt-3 text-sm font-bold">{marker.notes}</p>
              <p className="mt-1 text-xs text-ink/55">{marker.latitude}, {marker.longitude}</p>
            </div>
          ))}
          <button
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded bg-primary px-4 py-3 text-sm font-black text-white"
            onClick={openMarkerForm}
            data-testid="tracker-add-marker"
            type="button"
          >
            <Plus size={18} />
            Tambah marker di lokasi saya
          </button>
          {!isMarkerFormOpen && markerFormError ? <p className="text-sm font-bold text-clay">{markerFormError}</p> : null}
        </div>
      </div>
    </div>
  )
}

function NasabahWorkspace({
  nasabah,
  currentUser,
  role,
  onCreate,
  onExport,
  onMoveToHiatus,
  onReactivate,
  onReview,
  surveyorOptions,
}: {
  nasabah: Nasabah[]
  currentUser: Profile
  role: UserRole
  onCreate: (input: NasabahFormInput) => Promise<void>
  onExport: () => void
  onMoveToHiatus: (id: string) => Promise<void>
  onReactivate: (id: string) => Promise<void>
  onReview: (id: string, decision: 'approved' | 'rejected') => Promise<void>
  surveyorOptions: Pick<Profile, 'id' | 'full_name'>[]
}) {
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [isSubmittingNasabah, setIsSubmittingNasabah] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [form, setForm] = useState({
    nama: '',
    alamat: '',
    jumlahPinjaman: '2000000',
    tanggalMulai: '2026-06-14',
    tenorBulan: '10',
    angsuran: '220000',
    tglJatuhTempo: '10',
    surveyorId: role === 'owner' ? '' : currentUser.id,
    paymentFrequency: 'weekly' as PaymentFrequency,
    interestAmount: '0',
  })
  const approvedNasabah = nasabah.filter((item) => item.review_status === 'approved')
  const draftNasabah = nasabah.filter((item) => item.review_status === 'draft')
  const rejectedNasabah = nasabah.filter((item) => item.review_status === 'rejected')
  const activeNasabah = approvedNasabah.filter((item) => item.status !== 'hiatus')
  const hiatusNasabah = approvedNasabah.filter((item) => item.status === 'hiatus')
  const visibleArchive = role === 'owner' ? [...hiatusNasabah, ...rejectedNasabah] : rejectedNasabah
  const normalizedSearch = searchQuery.trim().toLowerCase()
  const matchesSearch = (item: Nasabah) => {
    if (!normalizedSearch) return true
    return [item.nama, item.alamat, item.review_status, item.status, item.score_label]
      .filter(Boolean)
      .some((value) => value.toLowerCase().includes(normalizedSearch))
  }
  const filteredActiveNasabah = activeNasabah.filter(matchesSearch)
  const filteredDraftNasabah = draftNasabah.filter(matchesSearch)
  const filteredArchiveNasabah = visibleArchive.filter(matchesSearch)

  function updateForm(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  async function submitNasabahForm() {
    const jumlahPinjaman = Number(form.jumlahPinjaman)
    const tenorBulan = Number(form.tenorBulan)
    const angsuran = Number(form.angsuran)
    const tglJatuhTempo = Number(form.tglJatuhTempo)
    const interestAmount = Number(form.interestAmount)
    const paymentFrequency = form.paymentFrequency
    const installmentAmount = paymentFrequency === 'weekly' ? angsuran : 0
    const monthlyDueDay = paymentFrequency === 'monthly' ? tglJatuhTempo : null
    const weeklyDueDay = paymentFrequency === 'weekly' ? new Date(`${form.tanggalMulai}T00:00:00`).getDay() : null

    if (!form.nama.trim() || !form.alamat.trim()) {
      setFormError('Nama dan alamat wajib diisi.')
      return
    }
    if (!jumlahPinjaman || jumlahPinjaman <= 0 || !tenorBulan || tenorBulan <= 0 || !angsuran || angsuran <= 0) {
      setFormError('Pinjaman, tenor, dan angsuran harus lebih dari nol.')
      return
    }
    if (!tglJatuhTempo || tglJatuhTempo < 1 || tglJatuhTempo > 28) {
      setFormError('Tanggal jatuh tempo harus 1 sampai 28.')
      return
    }
    if (role === 'owner' && !form.surveyorId.trim()) {
      setFormError('ID surveyor wajib diisi untuk nasabah baru dari bos.')
      return
    }
    if (paymentFrequency === 'monthly' && interestAmount < 0) {
      setFormError('Bunga bulanan tidak boleh negatif.')
      return
    }

    setIsSubmittingNasabah(true)
    setActionError(null)
    try {
      await onCreate({
        nama: form.nama,
        alamat: form.alamat,
        jumlahPinjaman,
        tanggalMulai: form.tanggalMulai,
        tenorBulan,
        angsuran,
        tglJatuhTempo,
        surveyorId: form.surveyorId.trim(),
        paymentFrequency,
        installmentAmount,
        interestAmount,
        principalAmount: jumlahPinjaman,
        monthlyDueDay,
        weeklyDueDay,
      })
      setForm((current) => ({
        ...current,
        nama: '',
        alamat: '',
        jumlahPinjaman: '2000000',
        tenorBulan: '10',
        angsuran: '220000',
        tglJatuhTempo: '10',
        paymentFrequency: 'weekly',
        interestAmount: '0',
      }))
      setFormError(null)
      setIsFormOpen(false)
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Gagal menyimpan nasabah.')
    } finally {
      setIsSubmittingNasabah(false)
    }
  }

  async function runNasabahAction(action: () => Promise<void>) {
    setActionError(null)
    try {
      await action()
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Aksi nasabah gagal.')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <PageTitle
          eyebrow="Operasi pinjaman"
          title="Nasabah"
          subtitle={role === 'owner' ? 'Bos dapat input langsung, verifikasi draft, dan arsip hiatus' : 'Surveyor membuat draft untuk diverifikasi bos'}
        />
        <div className="grid gap-2 sm:flex">
          <button className="inline-flex min-h-12 items-center justify-center gap-2 rounded bg-primary px-4 py-3 text-sm font-black text-white" onClick={() => setIsFormOpen((value) => !value)} type="button">
            <Plus size={18} />
            Tambah Nasabah
          </button>
          <button className="inline-flex min-h-12 items-center justify-center gap-2 rounded border border-outline bg-white px-4 py-3 text-sm font-black text-primary" onClick={onExport} type="button">
            <Download size={18} />
            Export CSV
          </button>
        </div>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink/45" size={18} />
        <input
          className="min-h-12 w-full rounded border border-outline bg-white py-3 pl-10 pr-3 text-sm font-semibold"
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Cari nama, alamat, status, atau skor..."
          value={searchQuery}
        />
      </div>

      {isFormOpen ? (
        <div className="rounded border border-secondary/25 bg-white p-4">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="grid gap-2 text-sm font-bold md:col-span-2">
              Tipe angsuran
              <div className="grid grid-cols-2 gap-1 rounded border border-outline bg-surface-low p-1">
                <button
                  className={`min-h-11 rounded px-3 text-sm font-black ${form.paymentFrequency === 'weekly' ? 'bg-primary text-white' : 'bg-white text-ink/70'}`}
                  onClick={() => updateForm('paymentFrequency', 'weekly')}
                  type="button"
                >
                  Mingguan 6x
                </button>
                <button
                  className={`min-h-11 rounded px-3 text-sm font-black ${form.paymentFrequency === 'monthly' ? 'bg-primary text-white' : 'bg-white text-ink/70'}`}
                  onClick={() => updateForm('paymentFrequency', 'monthly')}
                  type="button"
                >
                  Bulanan
                </button>
              </div>
            </label>
            <label className="grid gap-2 text-sm font-bold">
              Nama
              <input className="min-h-12 rounded border border-outline px-3" value={form.nama} onChange={(event) => updateForm('nama', event.target.value)} />
            </label>
            <label className="grid gap-2 text-sm font-bold">
              Alamat
              <input className="min-h-12 rounded border border-outline px-3" value={form.alamat} onChange={(event) => updateForm('alamat', event.target.value)} />
            </label>
            <label className="grid gap-2 text-sm font-bold">
              Jumlah pinjaman
              <input className="min-h-12 rounded border border-outline px-3" inputMode="numeric" value={form.jumlahPinjaman} onChange={(event) => updateForm('jumlahPinjaman', event.target.value)} />
            </label>
            <label className="grid gap-2 text-sm font-bold">
              Tanggal mulai
              <input className="min-h-12 rounded border border-outline px-3" type="date" value={form.tanggalMulai} onChange={(event) => updateForm('tanggalMulai', event.target.value)} />
            </label>
            <label className="grid gap-2 text-sm font-bold">
              Tenor bulan
              <input className="min-h-12 rounded border border-outline px-3" inputMode="numeric" value={form.tenorBulan} onChange={(event) => updateForm('tenorBulan', event.target.value)} />
            </label>
            <label className="grid gap-2 text-sm font-bold">
              {form.paymentFrequency === 'weekly' ? 'Angsuran per minggu' : 'Estimasi setoran bulanan'}
              <input className="min-h-12 rounded border border-outline px-3" inputMode="numeric" value={form.angsuran} onChange={(event) => updateForm('angsuran', event.target.value)} />
            </label>
            {form.paymentFrequency === 'monthly' ? (
              <label className="grid gap-2 text-sm font-bold">
                Bunga bulanan
                <input className="min-h-12 rounded border border-outline px-3" inputMode="numeric" value={form.interestAmount} onChange={(event) => updateForm('interestAmount', event.target.value)} />
              </label>
            ) : (
              <div className="rounded border border-outline bg-surface-low p-3 text-sm font-semibold text-ink/70">
                Jadwal otomatis dibuat 6 kali setiap minggu mulai dari tanggal mulai.
              </div>
            )}
            <label className="grid gap-2 text-sm font-bold">
              {form.paymentFrequency === 'weekly' ? 'Hari mulai jadwal' : 'Tanggal jatuh tempo bulanan'}
              <input className="min-h-12 rounded border border-outline px-3" inputMode="numeric" value={form.tglJatuhTempo} onChange={(event) => updateForm('tglJatuhTempo', event.target.value)} />
            </label>
            {role === 'owner' ? (
              <label className="grid gap-2 text-sm font-bold">
                Surveyor
                <select className="min-h-12 rounded border border-outline px-3" value={form.surveyorId} onChange={(event) => updateForm('surveyorId', event.target.value)}>
                  <option value="">{surveyorOptions.length === 0 ? 'Belum ada surveyor aktif' : 'Pilih surveyor'}</option>
                  {surveyorOptions.map((surveyor) => <option key={surveyor.id} value={surveyor.id}>{surveyor.full_name}</option>)}
                </select>
              </label>
            ) : null}
          </div>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
            <button className="inline-flex min-h-12 items-center justify-center rounded bg-primary px-4 py-3 text-sm font-black text-white" disabled={isSubmittingNasabah} onClick={submitNasabahForm} type="button">
              {isSubmittingNasabah ? 'Menyimpan...' : role === 'owner' ? 'Simpan sebagai aktif' : 'Kirim draft ke bos'}
            </button>
            <button className="inline-flex min-h-12 items-center justify-center rounded border border-outline bg-white px-4 py-3 text-sm font-black text-ink" onClick={() => setIsFormOpen(false)} type="button">
              Batal
            </button>
          </div>
          {formError ? <p className="mt-3 text-sm font-bold text-clay">{formError}</p> : null}
        </div>
      ) : null}

      <NasabahSection
        emptyCopy="Belum ada nasabah aktif."
        items={filteredActiveNasabah}
        onMoveToHiatus={role === 'owner' ? (id) => runNasabahAction(() => onMoveToHiatus(id)) : undefined}
        title="Data aktif"
        variant="active"
      />

      <NasabahSection
        emptyCopy={role === 'owner' ? 'Belum ada draft yang menunggu verifikasi.' : 'Belum ada draft yang dikirim.'}
        items={filteredDraftNasabah}
        onReview={role === 'owner' ? (id, decision) => runNasabahAction(() => onReview(id, decision)) : undefined}
        title={role === 'owner' ? 'Menunggu verifikasi bos' : 'Draft saya'}
        variant="draft"
      />
      {actionError ? <p className="rounded-lg border border-clay/30 bg-clay/10 p-3 text-sm font-bold text-clay">{actionError}</p> : null}

      {filteredArchiveNasabah.length > 0 ? (
        <NasabahSection
          emptyCopy=""
          items={filteredArchiveNasabah}
          onReactivate={role === 'owner' ? (id) => runNasabahAction(() => onReactivate(id)) : undefined}
          title={role === 'owner' ? 'Record arsip' : 'Draft ditolak'}
          variant="archive"
        />
      ) : null}
    </div>
  )
}

function NasabahSection({
  emptyCopy,
  items,
  onMoveToHiatus,
  onReactivate,
  onReview,
  title,
  variant,
}: {
  emptyCopy: string
  items: Nasabah[]
  onMoveToHiatus?: (id: string) => void | Promise<void>
  onReactivate?: (id: string) => void | Promise<void>
  onReview?: (id: string, decision: 'approved' | 'rejected') => void | Promise<void>
  title: string
  variant: 'active' | 'draft' | 'archive'
}) {
  const titleClass = variant === 'draft' ? 'text-river' : variant === 'archive' ? 'text-ink/55' : 'text-ink'

  return (
    <section>
      <div className="flex items-center justify-between gap-3">
        <h3 className={`text-sm font-black ${titleClass}`}>{title}</h3>
        <span className="rounded-full bg-surface-low px-2 py-1 text-xs font-black text-ink/50">{items.length}</span>
      </div>
      {items.length === 0 ? <p className="mt-3 rounded border border-dashed border-outline bg-white p-4 text-sm font-bold text-ink/55">{emptyCopy}</p> : null}
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {items.map((item) => (
          <div
            key={item.id}
            className={`rounded border bg-white p-3 ${
              variant === 'draft'
                ? 'border-dashed border-outline'
                : variant === 'archive'
                  ? 'border-outline bg-surface-low/70 opacity-75'
                  : 'border-outline'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h4 className={`text-base font-black ${variant === 'archive' ? 'text-ink/70' : 'text-ink'}`}>{item.nama}</h4>
                <p className="mt-1 line-clamp-2 text-xs font-semibold text-ink/55">{item.alamat}</p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2">
                {item.review_status === 'approved' ? <ScoreBadge label={item.score_label} score={item.score} /> : <ReviewBadge status={item.review_status} />}
              </div>
            </div>
            <div className="my-3 h-px bg-outline/60" />
            <div className="grid grid-cols-2 gap-3 text-sm">
              <MiniFact label="Pinjaman" value={formatRupiah(item.jumlah_pinjaman)} />
              <MiniFact label="Angsuran" value={formatRupiah(item.angsuran)} />
              <MiniFact label="Produk" value={(item.payment_frequency ?? 'weekly') === 'weekly' ? `Mingguan ${item.installment_count ?? 6}x` : 'Bulanan'} />
              <MiniFact label="Jatuh tempo" value={(item.payment_frequency ?? 'weekly') === 'weekly' ? 'Mulai tanggal awal' : `Tanggal ${item.monthly_due_day ?? item.tgl_jatuh_tempo}`} />
              <MiniFact label="Status" value={getNasabahLifecycleLabel({ reviewStatus: item.review_status, status: item.status })} />
            </div>
            {item.review_notes ? <p className="mt-3 text-sm font-bold text-ink/60">{item.review_notes}</p> : null}
            {onReview ? (
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <button className="min-h-11 rounded bg-primary px-3 py-2 text-sm font-black text-white" onClick={() => onReview(item.id, 'approved')} type="button">
                  Verifikasi
                </button>
                <button className="min-h-11 rounded bg-clay px-3 py-2 text-sm font-black text-white" onClick={() => onReview(item.id, 'rejected')} type="button">
                  Tolak
                </button>
              </div>
            ) : null}
            {onMoveToHiatus && item.review_status === 'approved' && item.status !== 'hiatus' ? (
              <button className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded border border-outline bg-surface-low px-3 py-2 text-sm font-black text-ink" onClick={() => onMoveToHiatus(item.id)} type="button">
                <Archive size={16} />
                Pindahkan ke hiatus
              </button>
            ) : null}
            {onReactivate && canReactivateNasabah({ reviewStatus: item.review_status, status: item.status }) ? (
              <button className="mt-4 min-h-11 w-full rounded bg-secondary px-3 py-2 text-sm font-black text-white" onClick={() => onReactivate(item.id)} type="button">
                Aktifkan kembali
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  )
}

function SetoranWorkspace({
  nasabah,
  setoran,
  schedules,
  selectedNasabahId,
  selectedScheduleId,
  jumlahDibayar,
  setoranTanggal,
  setoranNotes,
  setoranProofFile,
  setoranPaymentType,
  setoranError,
  isSetoranSubmitting,
  isOfflineMode,
  onNasabahChange,
  onScheduleChange,
  onAmountChange,
  onTanggalChange,
  onNotesChange,
  onProofFileChange,
  onPaymentTypeChange,
  onMoveScheduleForHoliday,
  onSubmit,
}: {
  nasabah: Nasabah[]
  setoran: Setoran[]
  schedules: PaymentSchedule[]
  selectedNasabahId: string
  selectedScheduleId: string
  jumlahDibayar: string
  setoranTanggal: string
  setoranNotes: string
  setoranProofFile: File | null
  setoranPaymentType: SetoranPaymentType
  setoranError: string | null
  isSetoranSubmitting: boolean
  isOfflineMode: boolean
  onNasabahChange: (value: string) => void
  onScheduleChange: (value: string) => void
  onAmountChange: (value: string) => void
  onTanggalChange: (value: string) => void
  onNotesChange: (value: string) => void
  onProofFileChange: (value: File | null) => void
  onPaymentTypeChange: (value: SetoranPaymentType) => void
  onMoveScheduleForHoliday: (schedule: PaymentSchedule, weekOffset: number) => void | Promise<void>
  onSubmit: () => void | Promise<void>
}) {
  const selected = nasabah.find((item) => item.id === selectedNasabahId) ?? nasabah[0]
  const selectedPaymentFrequency = selected?.payment_frequency ?? 'weekly'
  const selectedSchedules = schedules
    .filter((item) => item.nasabah_id === selected?.id)
    .sort((a, b) => a.installment_number - b.installment_number)
  const selectedSchedule = selectedSchedules.find((item) => item.id === selectedScheduleId) ?? selectedSchedules.find((item) => item.status === 'scheduled') ?? selectedSchedules[0]
  const monthlyBreakdown = selected
    ? getMonthlyPaymentBreakdown({
        interestAmount: selected.interest_amount ?? 0,
        paymentType: setoranPaymentType === 'installment' ? 'interest_only' : setoranPaymentType,
        principalAmount: selected.principal_amount ?? selected.jumlah_pinjaman,
      })
    : { interestPaid: 0, principalPaid: 0, totalPaid: 0 }
  const previewAmount = normalizeSetoranAmount(jumlahDibayar)
  const effectivePreviewAmount = selectedPaymentFrequency === 'monthly' ? monthlyBreakdown.totalPaid : selectedSchedule?.amount_due ?? previewAmount
  const previewDueDate = selectedPaymentFrequency === 'weekly' && selectedSchedule
    ? selectedSchedule.due_date
    : selected
      ? getSetoranDueDate({ tanggal: setoranTanggal, tglJatuhTempo: selected.monthly_due_day ?? selected.tgl_jatuh_tempo })
      : ''
  const recentSetoran = setoran.slice(0, 6)

  useEffect(() => {
    if (selectedPaymentFrequency !== 'weekly') return
    if (!selectedSchedule) return
    if (selectedSchedule.id !== selectedScheduleId) {
      onScheduleChange(selectedSchedule.id)
    }
    if (jumlahDibayar !== String(selectedSchedule.amount_due)) {
      onAmountChange(String(selectedSchedule.amount_due))
    }
    if (setoranTanggal !== selectedSchedule.due_date) {
      onTanggalChange(selectedSchedule.due_date)
    }
  }, [jumlahDibayar, onAmountChange, onScheduleChange, onTanggalChange, selectedPaymentFrequency, selectedSchedule, selectedScheduleId, setoranTanggal])

  useEffect(() => {
    if (selectedPaymentFrequency !== 'monthly') return
    if (setoranPaymentType === 'installment') {
      onPaymentTypeChange('interest_only')
      return
    }
    if (jumlahDibayar !== String(monthlyBreakdown.totalPaid)) {
      onAmountChange(String(monthlyBreakdown.totalPaid))
    }
  }, [jumlahDibayar, monthlyBreakdown.totalPaid, onAmountChange, onPaymentTypeChange, selectedPaymentFrequency, setoranPaymentType])

  return (
    <div className="space-y-4">
      <PageTitle
        eyebrow="Koleksi harian"
        title="Input setoran"
        subtitle="Setoran dicatat ke Supabase dan bukti gambar disimpan di Storage bila dilampirkan."
      />
      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <div className="rounded border border-outline bg-white p-4">
          <label className="text-xs font-black uppercase text-ink/50">Nasabah</label>
          <select className="mt-2 min-h-12 w-full rounded border border-outline bg-white px-3 py-3" value={selectedNasabahId} onChange={(event) => onNasabahChange(event.target.value)}>
            {nasabah.map((item) => <option key={item.id} value={item.id}>{item.nama}</option>)}
          </select>
          {nasabah.length === 0 ? <p className="mt-2 text-sm font-bold text-clay">Belum ada nasabah approved aktif untuk setoran.</p> : null}
          {selected && selectedPaymentFrequency === 'weekly' ? (
            <div className="mt-4">
              <div className="flex items-center justify-between gap-3">
                <label className="text-xs font-black uppercase text-ink/50" htmlFor="payment-schedule">Kalender 6 angsuran</label>
                <span className="rounded-full bg-moss/15 px-2 py-1 text-[11px] font-black text-primary">
                  {selectedSchedules.filter((item) => item.status === 'paid').length}/6 lunas
                </span>
              </div>
              <select
                className="mt-2 min-h-12 w-full rounded border border-outline bg-white px-3 py-3"
                id="payment-schedule"
                value={selectedSchedule?.id ?? ''}
                onChange={(event) => {
                  const nextSchedule = selectedSchedules.find((item) => item.id === event.target.value)
                  onScheduleChange(event.target.value)
                  if (nextSchedule) {
                    onTanggalChange(nextSchedule.due_date)
                    onAmountChange(String(nextSchedule.amount_due))
                  }
                }}
              >
                {selectedSchedules.map((schedule) => (
                  <option key={schedule.id} value={schedule.id}>
                    #{schedule.installment_number} · {schedule.due_date} · {formatRupiah(schedule.amount_due)}{schedule.is_holiday ? ' · Libur' : ''}{schedule.status === 'paid' ? ' · Lunas' : ''}
                  </option>
                ))}
              </select>
              <div className="mt-3 grid gap-2">
                {selectedSchedules.map((schedule) => (
                  <div key={schedule.id} className={`rounded border p-3 ${schedule.id === selectedSchedule?.id ? 'border-primary bg-moss/10' : 'border-outline bg-surface-low'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-black">Angsuran #{schedule.installment_number}</p>
                        <p className="mt-1 text-xs font-semibold text-ink/55">
                          {schedule.due_date}
                          {schedule.is_holiday ? ` · ${schedule.holiday_label ?? 'Libur'} dari ${schedule.original_due_date}` : ''}
                        </p>
                      </div>
                      <span className={`rounded-full px-2 py-1 text-[11px] font-black uppercase ${schedule.status === 'paid' ? 'bg-moss/15 text-primary' : 'bg-surface-container text-ink/60'}`}>
                        {schedule.status === 'paid' ? 'Lunas' : 'Terjadwal'}
                      </span>
                    </div>
                    {schedule.status !== 'paid' ? (
                      <button
                        className="mt-2 min-h-9 rounded border border-outline bg-white px-3 text-xs font-black text-primary"
                        onClick={() => void onMoveScheduleForHoliday(schedule, schedule.is_holiday ? 0 : 1)}
                        type="button"
                      >
                        {schedule.is_holiday ? 'Balik ke tanggal normal' : 'Tandai libur, mundur 1 minggu'}
                      </button>
                    ) : null}
                  </div>
                ))}
                {selectedSchedules.length === 0 ? (
                  <p className="rounded border border-dashed border-outline bg-surface-low p-3 text-sm font-bold text-clay">
                    Kalender angsuran belum terbentuk untuk nasabah ini.
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}
          {selected && selectedPaymentFrequency === 'monthly' ? (
            <div className="mt-4">
              <p className="text-xs font-black uppercase text-ink/50">Pilihan pembayaran bulanan</p>
              <div className="mt-2 grid grid-cols-2 gap-1 rounded border border-outline bg-surface-low p-1">
                <button
                  className={`min-h-11 rounded px-2 text-sm font-black ${setoranPaymentType === 'interest_only' ? 'bg-primary text-white' : 'bg-white text-ink/70'}`}
                  onClick={() => onPaymentTypeChange('interest_only')}
                  type="button"
                >
                  Bunga saja
                </button>
                <button
                  className={`min-h-11 rounded px-2 text-sm font-black ${setoranPaymentType === 'interest_principal' ? 'bg-primary text-white' : 'bg-white text-ink/70'}`}
                  onClick={() => onPaymentTypeChange('interest_principal')}
                  type="button"
                >
                  Bunga + pokok
                </button>
              </div>
              <div className="mt-3 rounded bg-surface-low p-3 text-sm font-semibold text-ink/70">
                Bunga: {formatRupiah(monthlyBreakdown.interestPaid)} · Pokok: {formatRupiah(monthlyBreakdown.principalPaid)}
              </div>
            </div>
          ) : null}
          <label className="mt-4 block text-xs font-black uppercase text-ink/50">Tanggal setoran</label>
          <input className="mt-2 min-h-12 w-full rounded border border-outline bg-white px-3 py-3" type="date" value={setoranTanggal} onChange={(event) => onTanggalChange(event.target.value)} />
          <label className="mt-4 block text-xs font-black uppercase text-ink/50">Jumlah dibayar</label>
          <input className="mt-2 min-h-12 w-full rounded border border-outline bg-white px-3 py-3" value={jumlahDibayar} onChange={(event) => onAmountChange(event.target.value)} inputMode="numeric" placeholder="Rp 0" />
          <label className="mt-4 block text-xs font-black uppercase text-ink/50">Foto bukti</label>
          <label className="mt-2 flex min-h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded border border-dashed border-outline bg-surface-low px-3 py-5 text-center text-sm font-bold text-ink/70" htmlFor="setoran-proof">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-moss/15 text-primary">
              <UploadCloud size={20} />
            </span>
            {setoranProofFile ? setoranProofFile.name : 'Ambil atau unggah foto bukti'}
            <span className="text-xs font-semibold text-ink/45">JPG, PNG, WEBP maksimal 5MB</span>
          </label>
          <input
            id="setoran-proof"
            className="sr-only"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            onChange={(event) => onProofFileChange(event.target.files?.[0] ?? null)}
          />
          <label className="mt-4 block text-xs font-black uppercase text-ink/50">Catatan</label>
          <textarea className="mt-2 min-h-24 w-full rounded border border-outline bg-white px-3 py-3" value={setoranNotes} onChange={(event) => onNotesChange(event.target.value)} placeholder="Tambahkan catatan opsional..." />
          <div className="mt-4 rounded bg-surface-low p-3 text-sm">
            <strong>Preview status:</strong>{' '}
            {selected ? determineStatusBayar(setoranTanggal, previewDueDate, effectivePreviewAmount, selectedSchedule?.amount_due ?? selected.angsuran) : '-'}
          </div>
          {setoranError ? <p className="mt-3 rounded border border-clay/30 bg-clay/10 p-3 text-sm font-bold text-clay">{setoranError}</p> : null}
          <button
            className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded bg-primary px-4 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:bg-ink/35"
            disabled={isSetoranSubmitting || nasabah.length === 0}
            onClick={() => void onSubmit()}
            type="button"
          >
            <CheckCircle2 size={18} />
            {isSetoranSubmitting ? 'Menyimpan...' : isOfflineMode ? 'Simpan ke queue offline' : 'Catat setoran'}
          </button>
        </div>
        <div className="rounded border border-outline bg-white p-4">
          <h3 className="text-sm font-black">Aktivitas terakhir</h3>
          <div className="mt-3 space-y-3">
            {recentSetoran.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-3 rounded border border-outline p-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-moss/15 text-primary">
                    <ReceiptText size={17} />
                  </div>
                  <div className="min-w-0">
                  <p className="font-bold">{nasabah.find((customer) => customer.id === item.nasabah_id)?.nama ?? '-'}</p>
                  <p className="text-sm text-ink/55">{item.tanggal} · {formatRupiah(item.jumlah_dibayar)}</p>
                  {item.foto_bukti_url ? <p className="text-xs font-bold text-moss">Bukti tersimpan</p> : null}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-black text-primary">+{formatRupiah(item.jumlah_dibayar)}</p>
                  <PaymentBadge status={item.status_bayar} />
                </div>
              </div>
            ))}
            {setoran.length === 0 ? <p className="rounded border border-dashed border-outline bg-surface-low p-4 text-sm font-bold text-ink/55">Belum ada riwayat setoran.</p> : null}
          </div>
        </div>
      </div>
    </div>
  )
}

function AuditWorkspace({
  events,
  queue,
  projection,
  onSync,
}: {
  events: AuditEvent[]
  queue: OfflineQueueItem[]
  projection: ReturnType<typeof projectOfflineQueue>
  onSync: () => void
}) {
  return (
    <div className="space-y-4">
      <PageTitle eyebrow="Kontrol owner" title="Audit & sync" subtitle="Simulasi audit log dan queue offline untuk MVP lokal" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric icon={<ReceiptText size={16} />} label="Pending" value={String(projection.pending)} />
        <Metric icon={<RefreshCw size={16} />} label="Syncing" value={String(projection.syncing)} />
        <Metric icon={<ShieldCheck size={16} />} label="Failed" value={String(projection.failed)} tone="danger" />
        <Metric icon={<FileCheck2 size={16} />} label="Total queue" value={String(projection.total)} />
      </div>
      <button className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded bg-primary px-4 py-3 text-sm font-black text-white sm:w-auto" disabled={queue.length === 0} onClick={onSync} type="button">
        <Cloud size={18} />
        Sync queue demo
      </button>
      <div className="rounded border border-outline bg-white p-4">
        <h3 className="text-sm font-black">Audit terbaru</h3>
        <div className="mt-3 space-y-3">
          {events.map((event) => (
            <div key={event.id} className="grid gap-2 rounded border border-outline p-3 text-sm sm:grid-cols-[1fr_120px_140px]">
              <strong>{event.actor}</strong>
              <span>{event.action}</span>
              <span className="text-ink/55">{event.table_name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function PageTitle({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle: string }) {
  return (
    <div>
      <p className="text-xs font-black uppercase text-primary">{eyebrow}</p>
      <h2 className="mt-1 text-xl font-black text-ink">{title}</h2>
      <p className="mt-1 max-w-2xl text-sm leading-6 text-ink/60">{subtitle}</p>
    </div>
  )
}

function Metric({ icon, label, value, tone = 'default' }: { icon?: React.ReactNode; label: string; value: string; tone?: 'default' | 'danger' }) {
  return (
    <div className={`rounded border p-3 ${tone === 'danger' ? 'border-clay/30 bg-clay/10' : 'border-outline bg-white'}`}>
      <div className="flex items-center justify-between gap-2">
        <p className={`text-xs font-black ${tone === 'danger' ? 'text-clay' : 'text-ink/55'}`}>{label}</p>
        {icon ? <span className={tone === 'danger' ? 'text-clay' : 'text-primary'}>{icon}</span> : null}
      </div>
      <p className="mt-3 break-words text-lg font-black sm:text-xl">{value}</p>
    </div>
  )
}

function MiniFact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-black text-ink/45">{label}</p>
      <p className="mt-1 text-sm font-semibold text-ink">{value}</p>
    </div>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-outline bg-white p-3">
      <p className="text-[11px] font-black uppercase text-ink/45">{label}</p>
      <p className="mt-2 text-lg font-black">{value}</p>
    </div>
  )
}

function ScoreBadge({ label, score }: { label: string; score: number }) {
  const className = label === 'Excellent' ? 'bg-moss/15 text-primary' : label === 'Good' ? 'bg-river/15 text-secondary' : label === 'Fair' ? 'bg-maize/20 text-tertiary' : 'bg-clay/10 text-clay'
  return <span className={`rounded-full px-2 py-1 text-[11px] font-black uppercase ${className}`}>Skor {label} · {score}</span>
}

function ReviewBadge({ status }: { status: Nasabah['review_status'] }) {
  const className = status === 'approved' ? 'bg-moss/15 text-primary' : status === 'draft' ? 'bg-maize/20 text-tertiary' : 'bg-clay/10 text-clay'
  const label = status === 'approved' ? 'Approved' : status === 'draft' ? 'Draft' : 'Rejected'
  return <span className={`rounded-full px-2 py-1 text-[11px] font-black uppercase ${className}`}>{label}</span>
}

function PaymentBadge({ status }: { status: Setoran['status_bayar'] }) {
  const className = status === 'tepat_waktu' ? 'bg-moss/15 text-primary' : status === 'terlambat' ? 'bg-maize/20 text-tertiary' : 'bg-clay/10 text-clay'
  return <span className={`mt-1 inline-flex rounded-full px-2 py-1 text-[11px] font-black uppercase ${className}`}>{status.replace('_', ' ')}</span>
}
