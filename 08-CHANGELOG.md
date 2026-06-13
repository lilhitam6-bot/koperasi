# CHANGELOG — LendMap PWA

Format: [Sprint N] YYYY-MM-DD  
Semua perubahan signifikan WAJIB didokumentasikan di sini.  
Lihat `05-agent.md` untuk format wajib entry.

---

## [Planning Package] 2026-06-13

### Added
- Dokumen PRD, arsitektur, security policy, sprint plan, dan instruksi agent.
- Draft `06-types-index.ts` untuk dipindahkan ke `src/types/index.ts` saat Sprint 0.
- Draft `07-scoring.ts` untuk dipindahkan ke `src/lib/scoring.ts` saat Sprint 0.
- `README.md` sebagai index dokumen dan status project.
- `09-OPTIMAL-ROADMAP.md` sebagai roadmap eksekusi dari kondisi folder saat ini.

### Changed
- Koreksi status project: codebase aplikasi belum diinisialisasi.
- Koreksi referensi security dari `04-SECURITY.md` ke `03-SECURITY.md`.
- Finalisasi PDF generation memakai jsPDF + autotable.
- Nasabah baru sekarang konsisten dengan klasifikasi score: `score = 0`, label `At Risk`.

### Security
- Security policy dan requirement RLS/audit sudah terdokumentasi.
- RLS policies, storage policies, dan audit triggers belum diterapkan karena codebase dan Supabase migrations belum dibuat.

### Debt
- Sprint 0 harus dijalankan secara faktual sebelum Sprint 1.
- Changelog berikutnya hanya boleh mencatat pekerjaan yang benar-benar sudah diimplementasikan dan diverifikasi.

---

<!-- Sprint berikutnya ditambahkan di bawah sini -->
## [MVP Local] 2026-06-13

### Added
- Next.js App Router MVP lokal dengan role switch owner/surveyor.
- Dashboard owner dengan summary, tren setoran, distribusi score, dan riwayat setoran.
- Peta area visual dengan marker status `potensial`, `bagus`, dan `kurang_prospektif`.
- Daftar nasabah dengan score badge dan export CSV.
- Form setoran surveyor dengan status bayar otomatis dan mode offline queue.
- Audit & sync demo untuk queue offline.
- Unit tests untuk scoring, status bayar, dashboard summary, queue projection, dan CSV escaping.
- PWA manifest, app icon, `.env.local.example`, ESLint flat config, dan security headers dasar.
- OpenStreetMap/Leaflet map untuk area Sukabumi dengan marker status dan popup.
- Dokumen handoff mobile-first untuk Stitch/UI designer di `docs/ui/mobile-first-stitch-brief.md`.
- Tracker marker action yang menambah marker Sukabumi secara online atau masuk offline queue saat offline mode aktif.
- Script `npm run check:tracker` untuk regression check tracker via Playwright.
- Supabase foundation migration dengan schema, RLS, storage buckets, audit triggers, status history trigger, dan score recalculation trigger.
- Supabase env validation dan browser/server client factories.
- Dokumentasi apply Supabase foundation di `docs/supabase-foundation.md`.
- Tests untuk Supabase env validation dan migration content.
- Foreground live location tracking while the PWA is open, with permission/error states, accuracy, last seen, and live map marker.

### Changed
- Stack implementasi MVP menggunakan Next.js 16 + React 19 karena Next.js 14 yang awalnya direncanakan ditandai rentan oleh npm.
- README diubah dari planning-only menjadi instruksi menjalankan MVP lokal.
- Peta demo visual diganti menjadi peta OpenStreetMap khusus Sukabumi.
- Layout MVP dioptimalkan mobile-first: bottom navigation fixed, header lebih ringkas, metric 2 kolom, map height responsif, dan daftar setoran mobile-card.
- Tracker regression check now validates mocked geolocation and live tracking UI.

### Security
- Supabase production credentials tetap env-only dan belum digunakan di client bundle.
- Production RLS/storage/audit trigger masih wajib dibuat di Sprint 0B sebelum data nyata digunakan.

### Debt
- MVP saat ini memakai seed data lokal, belum Supabase Auth/Postgres/Storage/Realtime.
- Map MVP masih visual local map, belum Leaflet/OpenStreetMap.

<!-- Format:
## [Sprint N] YYYY-MM-DD

### Added
-

### Changed
-

### Fixed
-

### Security
-

### Debt
-
-->
