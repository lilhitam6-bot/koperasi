# Optimal Implementation Roadmap — LendMap PWA

**Version:** 1.0.0  
**Status:** Ready for execution planning  
**Last Updated:** 2026-06-13  

---

## 1. Starting Point

Folder ini adalah planning package, belum codebase aplikasi.

Yang sudah tersedia:
- PRD v1.0
- Arsitektur sistem
- Security policy
- Sprint plan
- Instruksi agent
- Draft TypeScript types
- Draft scoring utility

Yang belum tersedia:
- Git repository
- Next.js project
- Supabase migration files
- `.env.local.example`
- `src/`
- tests
- CI/build scripts
- deployment config

Roadmap optimal harus mengubah paket dokumen ini menjadi aplikasi production-ready tanpa mengabaikan security foundation.

---

## 2. Execution Strategy

Gunakan pendekatan **foundation-first, sprint-gated, demoable increment**.

Artinya:
1. Sprint 0 harus benar-benar selesai dulu: app scaffold, database schema, RLS, audit trigger, env, lint, test, build.
2. Setiap sprint setelahnya menghasilkan flow yang bisa didemokan.
3. Tidak ada CRUD sensitif sebelum audit trigger dan RLS aktif.
4. Offline support dikerjakan ketika core form sudah stabil, tetapi kontrak datanya disiapkan sejak awal.
5. Changelog hanya mencatat pekerjaan yang benar-benar sudah dilakukan.

---

## 3. Recommended Sprint Flow

### Phase A — Project Foundation

**Sprint 0A: Repo & App Scaffold**
- Inisialisasi git repository.
- Scaffold Next.js App Router + TypeScript.
- Setup Tailwind, ESLint, Prettier, Vitest.
- Setup path alias `@/*`.
- Tambahkan `.gitignore`, `.env.local.example`, dan README setup.
- Pindahkan `06-types-index.ts` ke `src/types/index.ts`.
- Pindahkan `07-scoring.ts` ke `src/lib/scoring.ts`.
- Pecah inline scoring test menjadi `src/lib/scoring.test.ts`.
- Pastikan `npm run lint`, `npm run test`, dan `npm run build` berjalan.

**Sprint 0B: Supabase Foundation**
- Buat migration SQL untuk schema dari `02-ARCHITECTURE.md`.
- Buat RLS policies untuk `profiles`, `area_markers`, `nasabah`, `setoran`, `audit_log`, dan `push_subscriptions`.
- Buat storage buckets `marker-photos` dan `setoran-photos`.
- Buat storage policies sesuai `03-SECURITY.md`.
- Buat audit trigger untuk tabel sensitif.
- Seed minimal owner dan surveyor untuk local/dev.
- Dokumentasikan cara apply migration.

**Sprint 0C: App Foundation Integration**
- Buat Supabase browser/server client.
- Setup TanStack Query provider.
- Setup Zustand store dasar.
- Setup PWA config awal tanpa offline sync kompleks.
- Setup security headers.
- Buat halaman index sederhana yang membuktikan build, style, dan env terbaca.

Gate keluar Phase A:
- Build sukses.
- Test scoring sukses.
- RLS dan audit trigger tersedia dalam migration.
- Changelog mencatat Foundation yang benar-benar selesai.

---

### Phase B — Identity & Role Shell

**Sprint 1: Auth & Navigation**
- Login email/password dengan Zod validation.
- Fetch profile dan role setelah login.
- Redirect role: surveyor ke `/map`, owner ke `/dashboard`.
- Route protection via middleware/layout guard.
- Layout surveyor mobile-first dengan bottom nav.
- Layout owner dashboard dengan side nav.
- Idle timeout 15 menit.
- Session refresh handling.
- Unauthorized page.

Gate:
- Owner dan surveyor tidak masuk ke halaman role lain.
- Session expired/idle logout tidak merusak UX.
- Route guard ada, tetapi RLS tetap jadi security utama.

---

### Phase C — Field Operations Core

**Sprint 2: Map Tracker**
- Leaflet map dengan SSR-safe dynamic import.
- Current location button.
- Marker CRUD.
- Upload foto marker.
- Status color.
- Status transition rules.
- Area status history.
- Owner all-marker map dengan filter surveyor/status dan clustering.

**Sprint 3: Nasabah Management**
- Nasabah CRUD.
- Zod form validation.
- Pagination/list/detail.
- Score badge.
- Owner filter, reassign, dan max nasabah per surveyor.
- Score recalculation path.

**Sprint 4: Setoran**
- Input setoran dengan foto wajib.
- Photo validation type/size.
- Auto status bayar.
- Setoran history.
- Audit verification for setoran mutation.
- Push subscription setup dan daily reminder function.

Gate Phase C:
- Surveyor bisa menjalankan core daily workflow online.
- Owner bisa melihat data lintas surveyor.
- Foto dan audit berjalan untuk marker/setoran.

---

### Phase D — Offline & Reliability

**Sprint 5: Offline Mode**
- IndexedDB stores untuk pending marker dan pending setoran.
- Offline queue state di Zustand.
- Submit marker/setoran offline.
- Background sync saat online.
- Retry foto upload dengan backoff.
- Cached markers read-only.
- Cache OSM tiles yang terakhir dibuka.
- Sync status indicator penuh.

Gate:
- Airplane mode test: tambah marker dan setoran, online lagi, data tersinkron.
- Tidak ada JWT atau full sensitive dataset di IndexedDB.

---

### Phase E — Owner Intelligence

**Sprint 6: Dashboard & Audit**
- Summary cards.
- Tren setoran 12 bulan.
- Distribusi score.
- Distribusi status area.
- Tabel performa surveyor.
- Suspend/activate surveyor.
- Audit log view dan CSV export.
- Global period/surveyor filters.

Gate:
- Owner bisa review operasional mingguan dari dashboard.
- Audit log bisa difilter dan diexport.

---

### Phase F — Reporting & Launch

**Sprint 7: Export Reports**
- CSV/XLSX nasabah aktif.
- PDF report via Edge Function dengan jsPDF + autotable.
- Progress state saat generate.
- Owner-only access.

**Sprint 8: Hardening & Launch**
- Full security checklist.
- RLS negative tests.
- Lighthouse PWA/performance audit.
- Manual QA di mobile device.
- Push notification test Android Chrome dan iOS Safari.
- README setup final.
- Env documentation.
- Supabase backup.
- Vercel production deploy.

Gate:
- Production deploy live.
- Owner dan 2 surveyor onboarded.
- No known critical security gap.

---

## 4. Critical Risks

| Risk | Why it matters | Mitigation |
| --- | --- | --- |
| Changelog mengklaim fitur belum ada | Agent berikutnya bisa mulai dari sprint salah | Changelog harus faktual dan diverifikasi |
| RLS policy kurang ketat | Surveyor bisa akses data surveyor lain | RLS negative tests di setiap data feature |
| Offline menyimpan data sensitif berlebihan | Risiko kebocoran di device lapangan | Simpan hanya pending mutation dan minimal referensi |
| Foto upload gagal saat offline sync | Core evidence setoran hilang | Queue foto dengan retry dan status gagal eksplisit |
| Map tile fair use OSM | Traffic besar bisa kena limit | Cache tile, monitor traffic, siapkan tileserver v2 |
| Push notification iOS berbeda behavior | Reminder bisa tidak reliable | Test device nyata, fallback dashboard due list |
| Edge Function service role bocor | Full database compromise | Env separation dan build review |

---

## 5. Planning Rules for Agents

- Jangan lompat sprint.
- Jangan implementasi CRUD sensitif sebelum RLS dan audit trigger tersedia.
- Jangan pakai `any` kecuali ada komentar alasan.
- Jangan taruh business logic di JSX.
- Jangan simpan JWT atau secrets di localStorage.
- Jangan update changelog untuk pekerjaan yang belum benar-benar selesai.
- Setiap sprint harus punya demo path, test path, dan rollback/debt notes.

---

## 6. First Concrete Next Step

Buat implementation plan detail untuk **Sprint 0A: Repo & App Scaffold**.

Output yang diharapkan:
- Project Next.js berjalan.
- Type/scoring draft masuk ke lokasi final.
- Scoring punya unit test terpisah.
- Lint/test/build script tersedia.
- README setup dasar tersedia.
- Changelog mencatat scaffold yang benar-benar dilakukan.
