# Sprint Plan — LendMap PWA
**Version:** 1.0.0  
**Metodologi:** Agile Sprint (1 sprint = 1 minggu)  
**Target Launch:** Sprint 8 (8 minggu dari kickoff)  
**Developer:** 1 engineer + coding agent  
**Starting Reality:** MVP lokal Next.js tersedia. Production backend foundation tetap wajib dilanjutkan sebelum data sensitif nyata.

---

## Aturan Sprint (Wajib Diikuti Agent)

1. **Tidak boleh melompat sprint** — fitur sprint N+1 tidak boleh disentuh sebelum sprint N selesai
2. **Definition of Done per task:** kode berjalan, tidak ada TypeScript error, ada minimal 1 test untuk logic kritis
3. **70% ship threshold** — jika fitur 70% selesai dan core functionality jalan, move on dan buat task debt di sprint berikutnya
4. **Setiap akhir sprint:** update `08-CHANGELOG.md` dan jalankan `npm run build` — tidak boleh ada build error masuk sprint berikutnya
5. **Audit log trigger** harus aktif sebelum fitur apapun yang menyentuh data sensitif di-merge

---

## Sprint 0 — Foundation (Minggu 0, sebelum development)

**Goal:** Semua prerequisites siap sebelum satu baris kode ditulis.

- [ ] Inisialisasi git repository
- [x] Inisialisasi repo Next.js 16 + TypeScript untuk MVP lokal
- [x] Tambahkan `.gitignore`, `.env.local.example`, dan README setup development
- [ ] Setup Supabase project, konfigurasi Auth (email+password, password policy)
- [ ] Jalankan semua SQL migration (schema dari `02-ARCHITECTURE.md`)
- [ ] Aktifkan RLS di semua tabel
- [ ] Aktifkan audit log trigger untuk tabel sensitif sebelum CRUD app dibuat
- [ ] Setup Vercel project, connect ke GitHub repo
- [ ] Konfigurasi environment variables di Vercel dan `.env.local`
- [ ] Setup `next-pwa`, Tailwind CSS, Zustand, TanStack Query
- [ ] Buat `src/lib/supabase.ts` — client + server instance
- [x] Pindahkan kontrak type utama ke `src/types/index.ts`
- [x] Implementasikan domain scoring/payment/dashboard/offline di `src/lib/domain.ts`
- [x] Pisahkan unit test domain ke `src/lib/domain.test.ts`
- [ ] Setup ESLint + Prettier dengan rules yang ketat
- [ ] Jalankan `npm run lint`, `npm run test`, dan `npm run build`

**Deliverable:** Repo bersih, app bisa di-deploy ke Vercel (halaman index kosong), Supabase terhubung.

---

## Sprint 1 — Auth & Shell (Minggu 1)

**Goal:** User bisa login, app tahu role-nya, routing sudah terlindungi.

### Tasks

**Auth Flow**
- [ ] Halaman `/login` — form email + password dengan Zod validation
- [ ] `hooks/useAuth.ts` — login, logout, get current user + profile
- [ ] Auto-fetch `profiles` setelah login untuk dapat role
- [ ] Zustand store: `authStore` dengan `user`, `profile`, `isLoading`
- [ ] Redirect post-login berdasarkan role: `surveyor` → `/map`, `owner` → `/dashboard`

**Route Protection**
- [ ] `middleware.ts` — intercept semua route, cek session, cek role
- [ ] `/unauthorized` page
- [ ] Layout terpisah: `(surveyor)/layout.tsx` dan `(owner)/layout.tsx`

**Session Management**
- [ ] Idle timeout 15 menit (implementasi dari `03-SECURITY.md`)
- [ ] Silent token refresh setiap 20 menit
- [ ] Handle expired session gracefully (redirect ke login + pesan informatif)

**UI Shell**
- [ ] Bottom navigation untuk surveyor (mobile-first): Map, Nasabah, Setoran
- [ ] Side navigation untuk owner (dashboard-oriented): Dashboard, Peta, Nasabah, Karyawan, Laporan
- [ ] Komponen `SyncStatusIndicator` — tampilkan status online/offline + pending items

**Deliverable:** Login berjalan, surveyor dan owner masuk ke halaman yang berbeda, logout berfungsi, idle timeout aktif.

---

## Sprint 2 — Map Tracker Core (Minggu 2)

**Goal:** Surveyor bisa lihat peta dan tambah marker area.

### Tasks

**Map Setup**
- [ ] Install `react-leaflet`, `leaflet`, `leaflet.markercluster`
- [ ] `components/map/MapContainer.tsx` — wrapper Leaflet dengan SSR disabled (`dynamic import`)
- [ ] Fix Leaflet icon default path issue (known Next.js issue)
- [ ] Tile layer OpenStreetMap
- [ ] Geolocation: tombol "lokasi saya" yang center peta ke posisi GPS device

**Marker CRUD**
- [ ] `hooks/useMarkers.ts` — fetch, create, update via Supabase
- [ ] Tap peta → modal "Tambah Area" dengan form: status (radio), notes (optional)
- [ ] Upload foto untuk marker (Supabase Storage, `marker-photos` bucket)
- [ ] Marker ditampilkan di peta dengan warna berbeda per status:
  - Potensial → kuning
  - Bagus → hijau  
  - Kurang prospektif → merah
- [ ] Tap marker existing → detail popup: status, notes, foto, tanggal dibuat, surveyor

**Status Rules**
- [ ] Implementasikan status transition rules dari PRD section 4.1
- [ ] Downgrade ke `kurang_prospektif` wajib isi `reason`
- [ ] `area_status_history` trigger aktif

**Owner Map View**
- [ ] Owner melihat semua marker semua surveyor
- [ ] Filter marker by surveyor (dropdown)
- [ ] Filter marker by status (checkbox)
- [ ] `LeafletMarkerCluster` aktif untuk performa saat banyak marker

**Deliverable:** Surveyor bisa marking area, owner bisa lihat semua area, warna status jelas.

---

## Sprint 3 — Nasabah Management (Minggu 3)

**Goal:** Surveyor bisa tambah, lihat, dan kelola nasabah.

### Tasks

**Nasabah CRUD**
- [ ] `hooks/useNasabah.ts` — fetch (dengan pagination), create, update
- [ ] Form tambah nasabah dengan Zod validation (semua field dari schema)
- [ ] Kalkulasi otomatis `angsuran` jika user input `jumlah_pinjaman` dan `tenor`
- [ ] Daftar nasabah: card list dengan nama, status, score badge, jatuh tempo berikutnya
- [ ] Detail nasabah: semua data + histori setoran + score chart mini

**Scoring Algorithm**
- [ ] `lib/scoring.ts` — pure function, fully tested
  ```typescript
  function calculateScore(totalSetoran: number, tepatWaktu: number, bulanAktif: number): number
  function getScoreLabel(score: number): ScoreLabel
  ```
- [ ] Supabase Edge Function `recalculate-scores` — trigger saat setoran insert/update
- [ ] Score badge di setiap nasabah card (warna sesuai label)

**Owner Nasabah View**
- [ ] Lihat semua nasabah semua surveyor
- [ ] Filter by surveyor, status, score range
- [ ] Tombol reassign nasabah ke surveyor lain
- [ ] Set `max_nasabah` per surveyor dari halaman karyawan

**Deliverable:** Surveyor bisa kelola nasabah sendiri, scoring berjalan otomatis.

---

## Sprint 4 — Setoran & Notifikasi (Minggu 4)

**Goal:** Core business flow selesai — setoran tercatat dengan bukti foto.

### Tasks

**Input Setoran**
- [ ] Form input setoran per nasabah: tanggal, jumlah, foto bukti (wajib)
- [ ] Validasi foto sebelum upload (type + size dari `03-SECURITY.md`)
- [ ] Auto-kalkulasi `status_bayar`: tepat waktu / terlambat / kurang
- [ ] Upload foto ke Supabase Storage bucket `setoran-photos`
- [ ] Histori setoran per nasabah: chronological list dengan thumbnail foto

**Audit Log**
- [ ] Pastikan semua DB triggers dari `03-SECURITY.md` aktif dan ditest
- [ ] Test: input setoran → cek `audit_log` punya record yang benar

**Web Push Notifications**
- [ ] Generate VAPID keys, simpan di env vars
- [ ] `lib/push.ts` — subscribe user ke push, save ke `push_subscriptions`
- [ ] Edge Function `daily-payment-reminder` — CRON 08:00 WIB
  - Query nasabah jatuh tempo hari ini dan besok
  - Kirim push ke surveyor yang handle
- [ ] Komponen `NotificationPrompt` — minta permission push saat pertama login
- [ ] Test push di device nyata (bukan hanya browser desktop)

**Deliverable:** Flow lengkap setoran dengan bukti foto. Notifikasi jatuh tempo berjalan.

---

## Sprint 5 — Offline Mode (Minggu 5)

**Goal:** App tetap bisa dipakai tanpa internet.

### Tasks

**IndexedDB Setup**
- [ ] `lib/offline.ts` — wrapper IndexedDB untuk stores: `pending_setoran`, `pending_markers`
- [ ] Zustand `offlineStore`: `isOnline`, `pendingCount`, `syncStatus`
- [ ] `SyncStatusIndicator` komponen — update realtime (pindah dari Sprint 1 stub ke implementasi penuh)

**Offline Input**
- [ ] Form setoran dapat disubmit offline → masuk IndexedDB queue
- [ ] Form marker baru dapat disubmit offline → masuk IndexedDB queue
- [ ] UI clearly indicates item tersimpan offline, belum terkirim

**Sync Engine**
- [ ] Service Worker background sync — trigger saat koneksi pulih
- [ ] Conflict resolution: server wins untuk status, local wins untuk setoran baru (UUID client-generated)
- [ ] Retry dengan exponential backoff untuk upload foto yang gagal
- [ ] Toast notification: "X item berhasil disinkronkan" setelah sync

**Map Offline**
- [ ] Workbox CacheFirst untuk OSM tiles
- [ ] Cached markers dari last fetch tersedia offline (read-only)

**Deliverable:** Demo skenario: airplane mode → input setoran + marker → kembali online → auto-sync.

---

## Sprint 6 — Owner Dashboard & Analytics (Minggu 6)

**Goal:** Owner punya visibilitas penuh dan bisa ambil keputusan dari app.

### Tasks

**Dashboard Overview**
- [ ] 4 stat cards: total nasabah aktif, total outstanding, setoran bulan ini, nasabah macet
- [ ] Line chart: tren setoran 12 bulan terakhir (Recharts)
- [ ] Bar chart: distribusi score nasabah (4 kategori)
- [ ] Pie chart: distribusi status area

**Halaman Karyawan**
- [ ] Tabel performa per surveyor: jumlah nasabah, avg score, total setoran bulan ini, trend
- [ ] Set `max_nasabah` per surveyor inline
- [ ] Suspend / aktifkan akun surveyor (set `is_active`)

**Audit Log View**
- [ ] Tabel audit log yang bisa difilter by: tanggal, actor, tabel, action
- [ ] Export audit log ke CSV

**Filter Global**
- [ ] Filter periode (bulan/tahun) yang berlaku untuk semua analytics
- [ ] Filter per surveyor

**Deliverable:** Owner dashboard fully functional.

---

## Sprint 7 — Export Laporan (Minggu 7)

**Goal:** Owner bisa export data dalam 3 format.

### Tasks

**Excel & CSV Export**
- [ ] Library: `xlsx` (SheetJS)
- [ ] Content: daftar nasabah aktif (nama, alamat, pinjaman, angsuran, total setoran, score, status, surveyor)
- [ ] Tombol export di halaman nasabah (owner only)
- [ ] File naming: `lendmap-nasabah-YYYY-MM.xlsx`

**PDF Report**
- [ ] Edge Function `generate-pdf-report` menggunakan jsPDF + autotable
- [ ] Content PDF:
  - Cover: nama perusahaan, periode, tanggal generate
  - Section 1: Summary Eksekutif (4 stat cards)
  - Section 2: Grafik tren setoran bulanan
  - Section 3: Distribusi score nasabah (bar chart)
  - Section 4: Distribusi status area (pie chart)
  - Section 5: Tabel performa karyawan
  - Section 6: Daftar nasabah lengkap dengan score
  - Section 7: Ringkasan area survei per status
- [ ] File naming: `lendmap-laporan-YYYY-MM.pdf`
- [ ] Progress indicator saat generate (bisa 5–15 detik)

**Deliverable:** Semua 3 format export berjalan dan isi sesuai spesifikasi.

---

## Sprint 8 — Hardening & Launch (Minggu 8)

**Goal:** Production-ready. Lulus checklist security dan performa.

### Tasks

**Security Hardening**
- [ ] Jalankan checklist lengkap dari `03-SECURITY.md` — semua item harus centang
- [ ] Test RLS: login sebagai surveyor A, pastikan tidak bisa akses data surveyor B via console
- [ ] Verify security headers via securityheaders.com
- [ ] Pastikan tidak ada secrets di git history

**Performance**
- [ ] Lighthouse audit: PWA score ≥ 90, Performance ≥ 80
- [ ] Lazy load semua halaman yang bukan `/login` dan `/(surveyor)/map`
- [ ] Image optimization: compress foto sebelum upload (canvas API)
- [ ] Bundle size analysis: `npm run build -- --analyze`

**Testing**
- [ ] Unit test `lib/scoring.ts` — semua edge cases
- [ ] Integration test: full setoran flow (offline → online → sync)
- [ ] Manual QA: semua user story dari PRD dicek di mobile device nyata
- [ ] Test push notification di Android (Chrome) dan iOS (Safari 16.4+)

**Documentation**
- [ ] `README.md` lengkap dengan setup instructions
- [ ] `08-CHANGELOG.md` up to date
- [ ] Env vars documentation

**Launch**
- [ ] Domain custom (opsional)
- [ ] Supabase backup dikonfigurasi (daily)
- [ ] Vercel analytics diaktifkan
- [ ] Onboarding 2 surveyor + owner

**Deliverable:** App live di production. Semua checklist hijau.

---

## Dependency Map

```
Sprint 0 (Foundation)
    └── Sprint 1 (Auth)
            ├── Sprint 2 (Map)
            ├── Sprint 3 (Nasabah)
            │       └── Sprint 4 (Setoran + Notifikasi)
            │               └── Sprint 5 (Offline)
            │                       └── Sprint 6 (Dashboard)
            │                               └── Sprint 7 (Export)
            │                                       └── Sprint 8 (Launch)
            └── Sprint 6 (Dashboard) — partial dependency
```

---

## Debt Register (Known Trade-offs)

| Item | Keputusan v1.0 | Rencana v2.0 |
|------|---------------|--------------|
| Admin role | Dieliminasi | Tambah jika ada usecase verifikasi setoran |
| Foto compression | Canvas API client-side | Edge Function server-side processing |
| Map tiles | OpenStreetMap (fair use) | Self-host tileserver jika traffic tinggi |
| PDF generation | jsPDF di Edge Function | Headless Chrome jika layout lebih kompleks |
| Multi-device session | 2 device limit proxy | Proper session table |
| Test coverage | Critical paths only | Full coverage sebelum team scaling |
