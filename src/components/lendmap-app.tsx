'use client'

import {
  Activity,
  Cloud,
  Download,
  MapPinned,
  Menu,
  Plus,
  ReceiptText,
  ShieldCheck,
  Users,
  WifiOff,
} from 'lucide-react'
import dynamic from 'next/dynamic'
import { useMemo, useState } from 'react'
import { auditSeed, markerSeed, nasabahSeed, offlineSeed, profiles, setoranSeed } from '@/data/seed'
import { useForegroundLocationTracking } from '@/hooks/use-foreground-location-tracking'
import {
  calculateDashboardSummary,
  determineStatusBayar,
  formatRupiah,
  getCurrentMonth,
  projectOfflineQueue,
  toCsv,
} from '@/lib/domain'
import { formatLastSeen, locationStatusLabel } from '@/lib/location'
import { createDemoSukabumiMarker } from '@/lib/map'
import type { AreaMarker, AreaStatus, AuditEvent, Nasabah, OfflineQueueItem, Setoran, UserRole } from '@/types'

type ViewKey = 'dashboard' | 'map' | 'nasabah' | 'setoran' | 'audit'

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

export function LendMapApp() {
  const [role, setRole] = useState<UserRole>('owner')
  const [activeView, setActiveView] = useState<ViewKey>('dashboard')
  const [nasabah] = useState<Nasabah[]>(nasabahSeed)
  const [markers, setMarkers] = useState<AreaMarker[]>(markerSeed)
  const [setoran, setSetoran] = useState<Setoran[]>(setoranSeed)
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>(auditSeed)
  const [offlineQueue, setOfflineQueue] = useState<OfflineQueueItem[]>(offlineSeed)
  const [selectedNasabahId, setSelectedNasabahId] = useState(nasabahSeed[0]?.id ?? '')
  const [jumlahDibayar, setJumlahDibayar] = useState('220000')
  const [isOfflineMode, setIsOfflineMode] = useState(false)

  const currentUser = role === 'owner' ? profiles[0] : profiles[1]
  const trackingSurveyorId = role === 'owner' ? 'surveyor-1' : currentUser.id
  const locationTracking = useForegroundLocationTracking(trackingSurveyorId)
  const views = role === 'owner' ? ownerViews : surveyorViews
  const safeView = views.includes(activeView) ? activeView : views[0]
  const visibleNasabah = role === 'owner' ? nasabah : nasabah.filter((item) => item.surveyor_id === currentUser.id)
  const visibleMarkers = role === 'owner' ? markers : markers.filter((item) => item.surveyor_id === currentUser.id)
  const visibleSetoran = role === 'owner' ? setoran : setoran.filter((item) => item.surveyor_id === currentUser.id)
  const summary = useMemo(() => calculateDashboardSummary(nasabah, setoran, getCurrentMonth(new Date('2026-06-13'))), [nasabah, setoran])
  const queueProjection = useMemo(() => projectOfflineQueue(offlineQueue), [offlineQueue])

  function switchRole(nextRole: UserRole) {
    setRole(nextRole)
    setActiveView(nextRole === 'owner' ? 'dashboard' : 'map')
  }

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

  function addTrackerMarker() {
    const marker = createDemoSukabumiMarker({
      existingCount: markers.length,
      surveyorId: role === 'owner' ? 'surveyor-1' : currentUser.id,
      createdAt: new Date('2026-06-13T10:00:00.000Z').toISOString(),
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

  return (
    <main className="min-h-screen px-3 pb-28 pt-3 text-ink sm:px-6 sm:py-4 lg:px-8 lg:pb-4">
      <div className="mx-auto flex max-w-7xl flex-col gap-4">
        <Header
          role={role}
          userName={currentUser.full_name}
          queueTotal={queueProjection.total}
          isOfflineMode={isOfflineMode}
          onRoleChange={switchRole}
          onOfflineToggle={() => setIsOfflineMode((value) => !value)}
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
  onRoleChange,
  onOfflineToggle,
}: {
  role: UserRole
  userName: string
  queueTotal: number
  isOfflineMode: boolean
  onRoleChange: (role: UserRole) => void
  onOfflineToggle: () => void
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
          <div className="grid grid-cols-2 rounded-lg border border-ink/10 bg-white p-1 sm:flex">
            <button
              className={`rounded-md px-3 py-2 text-sm font-bold ${role === 'owner' ? 'bg-moss text-white' : 'text-ink/70'}`}
              onClick={() => onRoleChange('owner')}
            >
              Owner
            </button>
            <button
              className={`rounded-md px-3 py-2 text-sm font-bold ${role === 'surveyor' ? 'bg-moss text-white' : 'text-ink/70'}`}
              onClick={() => onRoleChange('surveyor')}
            >
              Surveyor
            </button>
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
        </div>
      </div>
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
  onAddMarker: () => void
  locationTracking: ReturnType<typeof useForegroundLocationTracking>
}) {
  return (
    <div className="space-y-5">
      <SectionTitle
        icon={<MapPinned size={20} />}
        title="Peta survei Sukabumi"
        subtitle={role === 'owner' ? 'OpenStreetMap untuk semua marker area Sukabumi' : 'OpenStreetMap untuk marker Sukabumi milik surveyor aktif'}
      />
      <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
        <SukabumiLeafletMap markers={markers} surveyorLocation={locationTracking.location} />
        <div className="space-y-3">
          <div className="rounded-lg border border-ink/10 bg-white p-4">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-ink/45">Live location</p>
            <p className="mt-2 text-lg font-black">{locationStatusLabel(locationTracking.status)}</p>
            {locationTracking.location ? (
              <div className="mt-2 space-y-1 text-sm text-ink/65">
                <p>Last seen: {formatLastSeen(locationTracking.location.captured_at)}</p>
                <p>Akurasi: {locationTracking.location.accuracy_meters?.toFixed(0) ?? '-'} m</p>
              </div>
            ) : (
              <p className="mt-2 text-sm text-ink/60">Tracking hanya aktif saat app terbuka dan permission lokasi diizinkan.</p>
            )}
            {locationTracking.errorMessage ? <p className="mt-2 text-sm font-bold text-clay">{locationTracking.errorMessage}</p> : null}
            <button
              className={`mt-3 inline-flex min-h-12 w-full items-center justify-center rounded-lg px-4 py-3 text-sm font-black text-white ${
                locationTracking.isTracking ? 'bg-clay' : 'bg-river'
              }`}
              onClick={locationTracking.isTracking ? locationTracking.stopTracking : locationTracking.startTracking}
              data-testid="location-tracking-toggle"
            >
              {locationTracking.isTracking ? 'Stop tracking' : 'Mulai tracking lokasi'}
            </button>
          </div>
          <div className="rounded-lg border border-ink/10 bg-white p-4">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-ink/45">Tracker aktif</p>
            <p className="mt-2 text-2xl font-black" data-testid="tracker-marker-count">{markers.length}</p>
            <p className="mt-1 text-sm text-ink/60">Marker terlihat di peta Sukabumi</p>
          </div>
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
            onClick={onAddMarker}
            data-testid="tracker-add-marker"
          >
            <Plus size={18} />
            Tambah marker Sukabumi
          </button>
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
