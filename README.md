# LendMap PWA

Internal Progressive Web App untuk perusahaan kredit kecil. Aplikasi ini ditujukan untuk menyatukan kerja surveyor lapangan dan owner: peta survei area, manajemen nasabah, pencatatan setoran dengan bukti foto, scoring otomatis, dashboard analitik, export laporan, push notification, dan offline mode.

## Status Saat Ini

**Status:** MVP lokal sedang tersedia sebagai Next.js app. Integrasi Supabase production masih fase berikutnya.

Folder ini berisi dokumen produk, arsitektur, security, sprint plan, panduan agent, kontrak TypeScript, scoring algorithm, dan MVP lokal berbasis seed data.

Konsekuensinya, development production berikutnya harus melanjutkan **Sprint 0B — Supabase Foundation** sebelum CRUD sensitif disambungkan ke backend nyata.

## Dokumen Utama

| File | Fungsi |
| --- | --- |
| `01-PRD.md` | Product requirement dan batas scope v1.0 |
| `02-ARCHITECTURE.md` | Arsitektur frontend, Supabase, database, PWA, deployment |
| `03-SECURITY.md` | Threat model, auth, RLS, storage policy, audit log, checklist security |
| `04-SPRINT-PLAN.md` | Sprint plan resmi dari Foundation sampai Launch |
| `05-agent.md` | Instruksi kerja untuk coding agent |
| `06-types-index.ts` | Draft awal type contract |
| `07-scoring.ts` | Draft awal scoring utility |
| `08-CHANGELOG.md` | Changelog project, saat ini mencatat dokumentasi awal |
| `09-OPTIMAL-ROADMAP.md` | Roadmap eksekusi optimal dari kondisi folder saat ini |
| `docs/supabase-foundation.md` | Cara apply Supabase schema, RLS, storage, dan env |

## Keputusan Final v1.0

- Stack MVP: Next.js 16 App Router + React 19 + TypeScript + Tailwind CSS + seeded local state.
- Stack production target: Supabase + Zustand + TanStack Query + Leaflet + Workbox.
- Auth: Supabase email/password, tanpa OAuth.
- Role: hanya `surveyor` dan `owner`.
- Map: Leaflet + OpenStreetMap.
- Security: RLS adalah enforcement utama; route guard hanya UX.
- Audit: mutation ke tabel sensitif wajib masuk `audit_log`.
- Offline: input surveyor untuk marker dan setoran wajib bisa queue ke IndexedDB.
- Export PDF: Supabase Edge Function dengan jsPDF + autotable.
- Launch path: sprint-gated, tidak melompat fitur sebelum foundation security selesai.

## Cara Menjalankan MVP

```bash
npm install
npm run dev
```

Quality gates:

```bash
npm run test
npm run lint
npm run typecheck
npm run build
```

Supabase foundation:

```bash
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

Lihat [docs/supabase-foundation.md](docs/supabase-foundation.md) sebelum memasukkan data asli.

## Catatan Penting

Jangan menyambungkan data production sebelum Supabase migrations, RLS policies, storage policies, dan audit triggers dibuat serta dites negatif antar surveyor.
