'use client'

import {
  Activity,
  Camera,
  Cloud,
  Download,
  LocateFixed,
  LogOut,
  MapPinned,
  Menu,
  Plus,
  ReceiptText,
  ShieldCheck,
  Users,
  WifiOff,
  X,
} from 'lucide-react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { auditSeed, markerSeed, nasabahSeed, offlineSeed, setoranSeed } from '@/data/seed'
import { useForegroundLocationTracking } from '@/hooks/use-foreground-location-tracking'
import {
  calculateDashboardSummary,
  determineStatusBayar,
  formatRupiah,
  getCurrentMonth,
  projectOfflineQueue,
  toCsv,
} from '@/lib/domain'
import { formatLastSeen, locationStatusLabel, parseCoordinatePair } from '@/lib/location'
import { createTrackedSukabumiMarker } from '@/lib/map'
import { MARKER_PHOTOS_BUCKET, uploadEvidenceFile } from '@/lib/storage'
import { createLendMapBrowserClient } from '@/lib/supabase-browser'
import type { AreaMarker, AreaStatus, AuditEvent, Nasabah, OfflineQueueItem, Profile, Setoran, SurveyorLocation, UserRole } from '@/types'

type ViewKey = 'dashboard' | 'map' | 'nasabah' | 'setoran' | 'audit'
type TrackerMarkerFormInput = {
  location: SurveyorLocation
  status: AreaStatus
  notes: string
  photoFile: File | null
}
type MarkerCoordinateMode = 'gps' | 'manual'

const ownerViews: ViewKey[] = ['dashboard', 'map', 'nasabah', 'audit']
const surveyorViews: ViewKey[] = ['map', 'nasabah', 'setoran']

const SukabumiLeafletMap = dynamic(
  () => import('@/components/sukabumi-leaflet-map').then((module) => module.SukabumiLeafletMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[58vh] min-h-[360px] items-center justify-center rounded-lg border border-ink/10 bg-field text-sm font-black text-ink/60 sm:h-[520px]">
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
  potensial: 'bg-maize text-ink',
  bagus: 'bg-moss text-white',
  kurang_prospektif: 'bg-clay text-white',
}

export function LendMapApp({ currentProfile }: { currentProfile: Profile }) {
  const router = useRouter()
  const role = currentProfile.role
  const [activeView, setActiveView] = useState<ViewKey>(() => (role === 'owner' ? 'dashboard' : 'map'))
  const [nasabah] = useState<Nasabah[]>(nasabahSeed)
  const [markers, setMarkers] = useState<AreaMarker[]>(markerSeed)
  const [setoran, setSetoran] = useState<Setoran[]>(setoranSeed)
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>(auditSeed)
  const [offlineQueue, setOfflineQueue] = useState<OfflineQueueItem[]>(offlineSeed)
  const [selectedNasabahId, setSelectedNasabahId] = useState(() => {
    if (role === 'owner') return nasabahSeed[0]?.id ?? ''
    return nasabahSeed.find((item) => item.surveyor_id === currentProfile.id)?.id ?? ''
  })
  const [jumlahDibayar, setJumlahDibayar] = useState('220000')
  const [isOfflineMode, setIsOfflineMode] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)

  const currentUser = currentProfile
  const trackingSurveyorId = role === 'owner' ? 'surveyor-1' : currentUser.id
  const locationTracking = useForegroundLocationTracking(trackingSurveyorId)
  const views = role === 'owner' ? ownerViews : surveyorViews
  const safeView = views.includes(activeView) ? activeView : views[0]
  const visibleNasabah = role === 'owner' ? nasabah : nasabah.filter((item) => item.surveyor_id === currentUser.id)
  const visibleMarkers = role === 'owner' ? markers : markers.filter((item) => item.surveyor_id === currentUser.id)
  const visibleSetoran = role === 'owner' ? setoran : setoran.filter((item) => item.surveyor_id === currentUser.id)
  const summary = useMemo(() => calculateDashboardSummary(nasabah, setoran, getCurrentMonth(new Date('2026-06-13'))), [nasabah, setoran])
  const queueProjection = useMemo(() => projectOfflineQueue(offlineQueue), [offlineQueue])

  function submitSetoran() {
    const customer = nasabah.find((item) => item.id === selectedNasabahId)
    if (!customer) return

    const amount = Number(jumlahDibayar)
    const payment: Setoran = {
      id: `setoran-${setoran.length + 1}`,
      nasabah_id: customer.id,
      surveyor_id: customer.surveyor_id,
      tanggal: '2026-06-13',
      jumlah_dibayar: amount,
      jatuh_tempo: `2026-06-${String(customer.tgl_jatuh_tempo).padStart(2, '0')}`,
      status_bayar: determineStatusBayar(
        '2026-06-13',
        `2026-06-${String(customer.tgl_jatuh_tempo).padStart(2, '0')}`,
        amount,
        customer.angsuran
      ),
      foto_bukti_url: '/proof/demo-local.jpg',
      notes: isOfflineMode ? 'Queued offline dari demo mode' : 'Input dari MVP lokal',
      created_at: new Date('2026-06-13T09:00:00.000Z').toISOString(),
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

    setSetoran((current) => [payment, ...current])
    setAuditEvents((current) => [
      {
        id: `audit-${current.length + 1}`,
        actor: currentUser.full_name,
        action: 'INSERT',
        table_name: 'setoran',
        created_at: payment.created_at,
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

    const marker = createTrackedSukabumiMarker({
      existingCount: markers.length,
      surveyorId: role === 'owner' ? 'surveyor-1' : currentUser.id,
      location: input.location,
      status: input.status,
      notes: input.notes,
      photoUrl,
      createdAt: new Date().toISOString(),
    })

    if (isOfflineMode) {
      setOfflineQueue((current) => [
        {
          localId: `offline-${current.length + 1}`,
          type: 'marker',
          payload: marker,
          status: 'pending',
          retryCount: 0,
          createdAt: marker.created_at,
        },
        ...current,
      ])
      return
    }

    setMarkers((current) => [marker, ...current])
    setAuditEvents((current) => [
      {
        id: `audit-${current.length + 1}`,
        actor: currentUser.full_name,
        action: 'INSERT',
        table_name: 'area_markers',
        created_at: marker.created_at,
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
    <main className="min-h-screen px-3 pb-28 pt-3 text-ink sm:px-6 sm:py-4 lg:px-8 lg:pb-4">
      <div className="mx-auto flex max-w-7xl flex-col gap-4">
        <Header
          role={role}
          userName={currentUser.full_name}
          queueTotal={queueProjection.total}
          isOfflineMode={isOfflineMode}
          onOfflineToggle={() => setIsOfflineMode((value) => !value)}
          onLogout={logout}
          authError={authError}
        />

        <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
          <Navigation role={role} activeView={safeView} onChange={setActiveView} />

          <section className="min-h-[calc(100vh-190px)] rounded-lg border border-ink/10 bg-[#fffaf0]/95 p-3 shadow-line sm:p-5 lg:min-h-[720px]">
            {safeView === 'dashboard' ? <OwnerDashboard summary={summary} nasabah={nasabah} setoran={setoran} /> : null}
            {safeView === 'map' ? (
              <MapWorkspace
                markers={visibleMarkers}
                role={role}
                onAddMarker={addTrackerMarker}
                locationTracking={locationTracking}
              />
            ) : null}
            {safeView === 'nasabah' ? <NasabahWorkspace nasabah={visibleNasabah} onExport={exportNasabah} role={role} /> : null}
            {safeView === 'setoran' ? (
              <SetoranWorkspace
                nasabah={visibleNasabah}
                setoran={visibleSetoran}
                selectedNasabahId={selectedNasabahId}
                jumlahDibayar={jumlahDibayar}
                isOfflineMode={isOfflineMode}
                onNasabahChange={setSelectedNasabahId}
                onAmountChange={setJumlahDibayar}
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
    <header className="rounded-lg border border-ink/10 bg-[#fffaf0] p-3 shadow-line sm:p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-moss">LendMap PWA</p>
          <h1 className="mt-1 text-xl font-black sm:text-3xl">Operasi lapangan</h1>
          <p className="mt-1 hidden max-w-2xl text-sm text-ink/70 sm:block">
            Workspace demo untuk owner dan surveyor: area, nasabah, setoran, audit, dan queue offline.
          </p>
        </div>
        <div className="grid gap-2 sm:flex sm:items-center">
          <div className="rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm font-black capitalize text-moss">
            {role}
          </div>
          <button
            className={`inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-bold ${
              isOfflineMode ? 'border-clay bg-clay text-white' : 'border-ink/10 bg-white text-ink'
            }`}
            onClick={onOfflineToggle}
          >
            {isOfflineMode ? <WifiOff size={16} /> : <Cloud size={16} />}
            {isOfflineMode ? 'Offline demo' : 'Online'}
          </button>
          <div className="flex items-center justify-between rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm sm:block">
            <strong className="truncate">{userName}</strong>
            <span className="ml-2 shrink-0 text-ink/60">Queue: {queueTotal}</span>
          </div>
          <button
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm font-bold text-ink hover:bg-clay/10"
            onClick={onLogout}
            type="button"
          >
            <LogOut size={16} />
            Logout
          </button>
        </div>
      </div>
      {authError ? <p className="mt-3 rounded-md border border-clay/30 bg-clay/10 px-3 py-2 text-sm font-semibold text-clay">{authError}</p> : null}
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
    <nav className="fixed inset-x-3 bottom-3 z-[700] rounded-lg border border-ink/10 bg-[#fffaf0]/95 p-2 shadow-line backdrop-blur lg:sticky lg:inset-auto lg:top-4 lg:h-fit lg:bg-[#fffaf0]">
      <div className="mb-2 hidden items-center gap-2 px-2 py-2 text-xs font-black uppercase tracking-[0.16em] text-ink/50 lg:flex">
        <Menu size={14} />
        Menu
      </div>
      <div className={`grid ${mobileGridClass} gap-2 lg:grid-cols-1`}>
        {views.map((view) => (
          <button
            key={view}
            className={`inline-flex min-h-12 flex-col items-center justify-center gap-1 rounded-md px-2 py-2 text-[11px] font-bold sm:text-sm lg:flex-row lg:justify-start lg:px-3 ${
              activeView === view ? 'bg-ink text-white' : 'bg-white text-ink/75 hover:bg-moss/10'
            }`}
            onClick={() => onChange(view)}
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

  return (
    <div className="space-y-5">
      <SectionTitle icon={<Activity size={20} />} title="Dashboard owner" subtitle="Ringkasan operasional bulan Juni 2026" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric label="Nasabah aktif" value={String(summary.totalNasabahAktif)} />
        <Metric label="Outstanding" value={formatRupiah(summary.totalOutstanding)} />
        <Metric label="Setoran bulan ini" value={formatRupiah(summary.totalSetoranBulanIni)} />
        <Metric label="Nasabah macet" value={String(summary.nasabahMacet)} tone="danger" />
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-lg border border-ink/10 bg-white p-4">
          <h3 className="text-base font-black">Tren setoran</h3>
          <div className="mt-4 flex h-56 items-end gap-3 border-b border-l border-ink/10 px-3">
            {[180000, 240000, 320000, 280000, 410000, summary.totalSetoranBulanIni].map((value, index) => (
              <div key={index} className="flex flex-1 flex-col items-center gap-2">
                <div className="w-full rounded-t bg-river" style={{ height: `${Math.max(28, value / 5000)}px` }} />
                <span className="text-xs text-ink/55">{index + 1}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-lg border border-ink/10 bg-white p-4">
          <h3 className="text-base font-black">Distribusi score</h3>
          <div className="mt-4 space-y-3">
            {scoreBuckets.map((bucket) => (
              <div key={bucket.label}>
                <div className="mb-1 flex justify-between text-sm">
                  <span>{bucket.label}</span>
                  <strong>{bucket.count}</strong>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-ink/10">
                  <div className={`h-full ${bucket.className}`} style={{ width: `${Math.max(8, bucket.count * 25)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="rounded-lg border border-ink/10 bg-white p-4">
        <h3 className="text-base font-black">Setoran terbaru</h3>
        <div className="mt-3 space-y-3 sm:hidden">
          {setoran.map((item) => (
            <div key={item.id} className="rounded-lg border border-ink/10 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-black">{nasabah.find((customer) => customer.id === item.nasabah_id)?.nama ?? '-'}</p>
                  <p className="mt-1 text-sm text-ink/55">{item.tanggal}</p>
                  <p className="mt-1 text-sm font-bold">{formatRupiah(item.jumlah_dibayar)}</p>
                </div>
                <PaymentBadge status={item.status_bayar} />
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 hidden overflow-x-auto sm:block">
          <table className="w-full min-w-[560px] border-collapse text-left text-sm">
            <thead className="border-b border-ink/10 text-xs uppercase text-ink/50">
              <tr>
                <th className="py-2">Tanggal</th>
                <th>Nasabah</th>
                <th>Jumlah</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {setoran.map((item) => (
                <tr key={item.id} className="border-b border-ink/5">
                  <td className="py-3">{item.tanggal}</td>
                  <td>{nasabah.find((customer) => customer.id === item.nasabah_id)?.nama ?? '-'}</td>
                  <td>{formatRupiah(item.jumlah_dibayar)}</td>
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
    <div className="space-y-5">
      <SectionTitle
        icon={<MapPinned size={20} />}
        title="Peta survei Sukabumi"
        subtitle={role === 'owner' ? 'OpenStreetMap untuk semua marker area Sukabumi' : 'OpenStreetMap untuk marker Sukabumi milik surveyor aktif'}
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
            className="absolute bottom-4 right-4 z-[500] inline-flex h-12 w-12 items-center justify-center rounded-full border border-ink/10 bg-white text-river shadow-line"
            data-testid="locate-device-button"
            onClick={locateDevice}
            type="button"
          >
            <LocateFixed size={22} />
          </button>
        </div>
        <div className="space-y-3">
          <div className="rounded-lg border border-ink/10 bg-white p-4">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-ink/45">Lokasi perangkat</p>
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
              className="mt-3 inline-flex min-h-12 w-full items-center justify-center rounded-lg bg-river px-4 py-3 text-sm font-black text-white"
              onClick={locationTracking.refreshLocation}
              data-testid="location-tracking-toggle"
              type="button"
            >
              {locationTracking.isTracking ? 'Mengambil lokasi...' : locationTracking.location ? 'Ambil ulang lokasi saat ini' : 'Ambil lokasi saat ini'}
            </button>
          </div>
          <div className="rounded-lg border border-ink/10 bg-white p-4">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-ink/45">Tracker aktif</p>
            <p className="mt-2 text-2xl font-black" data-testid="tracker-marker-count">{markers.length}</p>
            <p className="mt-1 text-sm text-ink/60">Marker terlihat di peta Sukabumi</p>
          </div>
          {isMarkerFormOpen ? (
            <div className="rounded-lg border border-river/30 bg-white p-4" data-testid="marker-form">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-ink/45">Marker lokasi saat ini</p>
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
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-field text-ink"
                  onClick={() => setIsMarkerFormOpen(false)}
                  type="button"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 rounded-lg border border-ink/10 bg-field p-1">
                <button
                  className={`min-h-11 rounded-md px-3 py-2 text-sm font-black ${markerCoordinateMode === 'gps' ? 'bg-river text-white' : 'bg-white text-ink/70'}`}
                  onClick={() => {
                    setMarkerCoordinateMode('gps')
                    setMarkerFormError(null)
                  }}
                  type="button"
                >
                  Pakai GPS
                </button>
                <button
                  className={`min-h-11 rounded-md px-3 py-2 text-sm font-black ${markerCoordinateMode === 'manual' ? 'bg-river text-white' : 'bg-white text-ink/70'}`}
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
                    className="mt-2 min-h-12 w-full rounded-lg border border-ink/15 bg-white px-3 py-3"
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
                className="mt-2 min-h-12 w-full rounded-lg border border-ink/15 bg-white px-3 py-3"
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
                className="mt-2 min-h-24 w-full resize-none rounded-lg border border-ink/15 bg-white px-3 py-3"
                id="marker-notes"
                onChange={(event) => setMarkerNotes(event.target.value)}
                placeholder="Contoh: warung padat transaksi, dekat pasar, banyak usaha harian."
                value={markerNotes}
              />
              <label className="mt-4 block text-xs font-black uppercase text-ink/50" htmlFor="marker-photo">Foto bukti optional</label>
              <label className="mt-2 flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-ink/20 bg-field px-3 py-3 text-sm font-bold text-ink/70" htmlFor="marker-photo">
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
                className="mt-4 inline-flex min-h-12 w-full items-center justify-center rounded-lg bg-moss px-4 py-3 text-sm font-black text-white"
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
            <div key={marker.id} className="rounded-lg border border-ink/10 bg-white p-4" data-testid="tracker-marker-card">
              <span className={`rounded-full px-2 py-1 text-xs font-black ${areaStatusClass[marker.status]}`}>
                {areaStatusCopy[marker.status]}
              </span>
              <p className="mt-3 text-sm font-bold">{marker.notes}</p>
              <p className="mt-1 text-xs text-ink/55">{marker.latitude}, {marker.longitude}</p>
            </div>
          ))}
          <button
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-moss px-4 py-3 text-sm font-black text-white"
            onClick={openMarkerForm}
            data-testid="tracker-add-marker"
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

function NasabahWorkspace({ nasabah, role, onExport }: { nasabah: Nasabah[]; role: UserRole; onExport: () => void }) {
  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SectionTitle icon={<Users size={20} />} title="Nasabah" subtitle={role === 'owner' ? 'Daftar semua nasabah dan scoring' : 'Daftar nasabah assign ke surveyor'} />
        <button className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-river px-4 py-3 text-sm font-black text-white" onClick={onExport}>
          <Download size={18} />
          Export CSV
        </button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {nasabah.map((item) => (
          <div key={item.id} className="rounded-lg border border-ink/10 bg-white p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h3 className="text-lg font-black">{item.nama}</h3>
                <p className="text-sm text-ink/60">{item.alamat}</p>
              </div>
              <ScoreBadge label={item.score_label} score={item.score} />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <MiniFact label="Pinjaman" value={formatRupiah(item.jumlah_pinjaman)} />
              <MiniFact label="Angsuran" value={formatRupiah(item.angsuran)} />
              <MiniFact label="Jatuh tempo" value={`Tanggal ${item.tgl_jatuh_tempo}`} />
              <MiniFact label="Status" value={item.status} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function SetoranWorkspace({
  nasabah,
  setoran,
  selectedNasabahId,
  jumlahDibayar,
  isOfflineMode,
  onNasabahChange,
  onAmountChange,
  onSubmit,
}: {
  nasabah: Nasabah[]
  setoran: Setoran[]
  selectedNasabahId: string
  jumlahDibayar: string
  isOfflineMode: boolean
  onNasabahChange: (value: string) => void
  onAmountChange: (value: string) => void
  onSubmit: () => void
}) {
  const selected = nasabah.find((item) => item.id === selectedNasabahId) ?? nasabah[0]

  return (
    <div className="space-y-5">
      <SectionTitle icon={<ReceiptText size={20} />} title="Input setoran" subtitle="Foto bukti disimulasikan di MVP lokal; Supabase Storage masuk fase integrasi." />
      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <div className="rounded-lg border border-ink/10 bg-white p-4">
          <label className="text-xs font-black uppercase text-ink/50">Nasabah</label>
          <select className="mt-2 min-h-12 w-full rounded-lg border border-ink/15 bg-white px-3 py-3" value={selectedNasabahId} onChange={(event) => onNasabahChange(event.target.value)}>
            {nasabah.map((item) => <option key={item.id} value={item.id}>{item.nama}</option>)}
          </select>
          <label className="mt-4 block text-xs font-black uppercase text-ink/50">Jumlah dibayar</label>
          <input className="mt-2 min-h-12 w-full rounded-lg border border-ink/15 bg-white px-3 py-3" value={jumlahDibayar} onChange={(event) => onAmountChange(event.target.value)} inputMode="numeric" />
          <div className="mt-4 rounded-lg bg-field p-3 text-sm">
            <strong>Preview status:</strong>{' '}
            {selected ? determineStatusBayar('2026-06-13', `2026-06-${String(selected.tgl_jatuh_tempo).padStart(2, '0')}`, Number(jumlahDibayar), selected.angsuran) : '-'}
          </div>
          <button className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-moss px-4 py-3 text-sm font-black text-white" onClick={onSubmit}>
            <Plus size={18} />
            {isOfflineMode ? 'Simpan ke queue offline' : 'Catat setoran'}
          </button>
        </div>
        <div className="rounded-lg border border-ink/10 bg-white p-4">
          <h3 className="text-base font-black">Riwayat setoran</h3>
          <div className="mt-3 space-y-3">
            {setoran.map((item) => (
              <div key={item.id} className="flex flex-col gap-3 rounded-lg border border-ink/10 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-bold">{nasabah.find((customer) => customer.id === item.nasabah_id)?.nama ?? '-'}</p>
                  <p className="text-sm text-ink/55">{item.tanggal} · {formatRupiah(item.jumlah_dibayar)}</p>
                </div>
                <PaymentBadge status={item.status_bayar} />
              </div>
            ))}
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
    <div className="space-y-5">
      <SectionTitle icon={<ShieldCheck size={20} />} title="Audit & sync" subtitle="Simulasi audit log dan queue offline untuk MVP lokal" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric label="Pending" value={String(projection.pending)} />
        <Metric label="Syncing" value={String(projection.syncing)} />
        <Metric label="Failed" value={String(projection.failed)} tone="danger" />
        <Metric label="Total queue" value={String(projection.total)} />
      </div>
      <button className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-moss px-4 py-3 text-sm font-black text-white sm:w-auto" disabled={queue.length === 0} onClick={onSync}>
        <Cloud size={18} />
        Sync queue demo
      </button>
      <div className="rounded-lg border border-ink/10 bg-white p-4">
        <h3 className="text-base font-black">Audit terbaru</h3>
        <div className="mt-3 space-y-3">
          {events.map((event) => (
            <div key={event.id} className="grid gap-2 rounded-lg border border-ink/10 p-3 text-sm sm:grid-cols-[1fr_120px_140px]">
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

function SectionTitle({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="rounded-lg bg-moss p-2 text-white">{icon}</div>
      <div>
        <h2 className="text-xl font-black">{title}</h2>
        <p className="mt-1 text-sm text-ink/60">{subtitle}</p>
      </div>
    </div>
  )
}

function Metric({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'danger' }) {
  return (
    <div className={`rounded-lg border p-4 ${tone === 'danger' ? 'border-clay/30 bg-clay/10' : 'border-ink/10 bg-white'}`}>
      <p className="text-xs font-black uppercase tracking-[0.16em] text-ink/50">{label}</p>
      <p className="mt-2 break-words text-xl font-black sm:text-2xl">{value}</p>
    </div>
  )
}

function MiniFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-field p-3">
      <p className="text-xs font-bold uppercase text-ink/45">{label}</p>
      <p className="mt-1 font-black">{value}</p>
    </div>
  )
}

function ScoreBadge({ label, score }: { label: string; score: number }) {
  const className = label === 'Excellent' ? 'bg-moss text-white' : label === 'Good' ? 'bg-river text-white' : label === 'Fair' ? 'bg-maize text-ink' : 'bg-clay text-white'
  return <span className={`rounded-full px-3 py-1 text-xs font-black ${className}`}>{label} · {score}</span>
}

function PaymentBadge({ status }: { status: Setoran['status_bayar'] }) {
  const className = status === 'tepat_waktu' ? 'bg-moss text-white' : status === 'terlambat' ? 'bg-maize text-ink' : 'bg-clay text-white'
  return <span className={`rounded-full px-3 py-1 text-xs font-black ${className}`}>{status.replace('_', ' ')}</span>
}
