# agent.md — LendMap PWA
**Untuk:** Coding Agent (Claude Code, GitHub Copilot, Cursor, dsb)  
**Versi dokumen:** 1.0.0  
**Update dokumen ini** setiap kali ada perubahan scope, keputusan arsitektur baru, atau fitur yang dicancel/ditambah.

---

## Identitas Proyek

**Nama:** LendMap PWA  
**Deskripsi:** Internal Progressive Web App untuk perusahaan kredit kecil. Memiliki dua role: `surveyor` (karyawan lapangan) dan `owner`. Fitur utama: map tracker area survei, manajemen nasabah, tracking setoran dengan bukti foto, scoring nasabah otomatis, dan dashboard analitik untuk owner.  
**Stack:** Next.js 16 (App Router) + TypeScript + Tailwind CSS + Supabase + Zustand + TanStack Query + Leaflet.js + Workbox (PWA)  
**Hosting:** Vercel  
**Database:** Supabase PostgreSQL dengan RLS  
**Status repo saat ini:** MVP lokal Next.js tersedia dengan seed data. Supabase production foundation belum diterapkan.

---

## Aturan Wajib — Tidak Boleh Dilanggar

### 1. Keamanan Tidak Bisa Dikompromikan

```
WAJIB:
- Semua tabel Supabase HARUS punya RLS aktif sebelum data apapun masuk
- TIDAK PERNAH expose SUPABASE_SERVICE_ROLE_KEY ke client bundle
- TIDAK PERNAH gunakan dangerouslySetInnerHTML
- SELALU validasi input dengan Zod sebelum kirim ke Supabase
- Foto upload HARUS divalidasi type dan size sebelum upload
- TIDAK PERNAH simpan JWT atau secrets di localStorage
```

### 2. Audit Log Wajib Ada

```
SETIAP fitur yang menyentuh tabel sensitif (nasabah, setoran, area_markers, profiles)
HARUS memiliki DB trigger audit_log yang aktif sebelum fitur tersebut bisa dianggap selesai.

Cek dengan: SELECT tgname FROM pg_trigger WHERE tgrelid = '<table_name>'::regclass;
```

### 3. Kode Efisien — Tidak Boleh Verbose

```
- TIDAK BOLEH ada duplikasi logic — ekstrak ke hooks/ atau lib/
- TIDAK ADA business logic di JSX/TSX — hanya render dan event handlers
- Komponen harus single responsibility — jika komponen > 150 baris, pecah
- TIDAK ADA inline style kecuali nilai dinamis yang tidak bisa ditangani Tailwind
- Gunakan TypeScript strict mode — tidak ada 'any' kecuali truly unavoidable (comment alasannya)
```

### 4. Offline-First Mindset

```
Setiap form input yang dipakai surveyor lapangan HARUS bisa disubmit offline.
Jika membuat form baru untuk surveyor, SELALU tanya: "apakah ini perlu offline support?"
Jika ya, implementasikan IndexedDB queue SEBELUM form dianggap selesai.
```

### 5. RLS adalah Keamanan Sebenarnya

```
Route guard di middleware.ts adalah UX, bukan keamanan.
JANGAN anggap data aman hanya karena halaman tidak bisa diakses.
SELALU pastikan RLS policy menutup akses bahkan jika API dipanggil langsung.
```

---

## Scope Boundaries — Apa yang Boleh dan Tidak

### ✅ Dalam Scope

- Semua fitur yang ada di `01-PRD.md`
- Bug fix, performance improvement, refactor untuk fitur yang sudah ada
- Penambahan test untuk logic yang sudah ada
- UI/UX improvement yang tidak mengubah data model
- Konfigurasi Supabase (RLS, triggers, indexes, storage policies)

### ❌ Di Luar Scope (Jangan Implementasikan Tanpa Diskusi Eksplisit)

- Role `admin` — dieliminasi dari v1.0, jangan tambahkan
- Penyimpanan KTP, NIK, atau dokumen identitas nasabah
- OAuth / social login (Google, Facebook, dsb)
- Integrasi WhatsApp atau SMS gateway
- Multi-tenant (lebih dari satu perusahaan dalam satu database)
- Approval workflow untuk pinjaman baru
- Native mobile app (iOS/Android Expo/React Native)
- `dangerouslySetInnerHTML` dalam kondisi apapun
- Menyimpan data keuangan sensitif di localStorage atau cookie

---

## Konvensi Koding

### Penamaan

```typescript
// Komponen: PascalCase
export function NasabahCard() {}

// Hooks: camelCase dengan prefix 'use'
export function useNasabah() {}

// Utilities/lib: camelCase
export function calculateScore() {}

// Constants: SCREAMING_SNAKE_CASE
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024

// Tipe/Interface: PascalCase
interface Nasabah { id: string; nama: string }
type ScoreLabel = 'Excellent' | 'Good' | 'Fair' | 'At Risk'

// Supabase table names di kode: snake_case (sesuai DB)
// React state dan props: camelCase
```

### Struktur Komponen

```typescript
// Urutan yang benar dalam file komponen:
// 1. Imports
// 2. Types/interfaces (jika spesifik file ini)
// 3. Constants (jika spesifik file ini)
// 4. Komponen utama
// 5. Sub-komponen kecil (jika ada, < 30 baris)

// Contoh:
import { useState } from 'react'
import { useNasabah } from '@/hooks/useNasabah'
import type { Nasabah } from '@/types'

interface NasabahCardProps {
  nasabah: Nasabah
  onSelect: (id: string) => void
}

export function NasabahCard({ nasabah, onSelect }: NasabahCardProps) {
  // hanya render logic di sini
  return (...)
}
```

### Data Fetching Pattern

```typescript
// SELALU gunakan TanStack Query untuk server state
// JANGAN fetch langsung di komponen atau useEffect tanpa TanStack Query

// hooks/useNasabah.ts
export function useNasabah(surveyorId?: string) {
  return useQuery({
    queryKey: ['nasabah', surveyorId],
    queryFn: () => fetchNasabah(surveyorId),
    staleTime: 5 * 60 * 1000, // 5 menit
  })
}

// Untuk mutations, selalu invalidate query yang relevan setelah success
export function useAddSetoran() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: addSetoran,
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['setoran', variables.nasabah_id] })
      queryClient.invalidateQueries({ queryKey: ['nasabah', variables.nasabah_id] })
    }
  })
}
```

### Error Handling

```typescript
// SELALU handle error state di UI
// JANGAN biarkan error state silent

// Contoh pola yang benar:
const { data, isLoading, error } = useNasabah()

if (isLoading) return <LoadingSkeleton />
if (error) return <ErrorState message="Gagal memuat data nasabah" onRetry={refetch} />
if (!data?.length) return <EmptyState message="Belum ada nasabah" />
return <NasabahList items={data} />
```

### Supabase Queries

```typescript
// SELALU gunakan parameterized queries via Supabase client
// TIDAK PERNAH string concatenation untuk query

// ✅ Benar
const { data } = await supabase
  .from('nasabah')
  .select('*')
  .eq('surveyor_id', userId)
  .eq('status', 'aktif')

// ❌ Salah
const { data } = await supabase.rpc(`SELECT * FROM nasabah WHERE surveyor_id = '${userId}'`)
```

---

## Struktur File — Jangan Diubah Tanpa Alasan

```
src/
├── app/                    # HANYA routing dan page components
│   ├── (auth)/
│   ├── (surveyor)/
│   └── (owner)/
├── components/
│   ├── ui/                 # Atomic, reusable UI atoms
│   ├── map/
│   ├── nasabah/
│   ├── setoran/
│   └── dashboard/
├── hooks/                  # Custom hooks, data fetching
├── lib/                    # Pure utilities, no React
├── store/                  # Zustand stores
└── types/                  # TypeScript types, no logic
```

**Aturan:** Jika bingung taruh di mana, tanya: apakah ini React-specific? → `hooks/`. Apakah ini pure logic? → `lib/`. Apakah ini shared UI? → `components/ui/`.

---

## CHANGELOG — Wajib Diupdate

Format entry `08-CHANGELOG.md`:

```markdown
## [Sprint N] YYYY-MM-DD

### Added
- Deskripsi fitur baru

### Changed
- Deskripsi perubahan pada fitur yang sudah ada

### Fixed
- Deskripsi bug yang diperbaiki

### Security
- Deskripsi perubahan terkait keamanan (SELALU tulis ini jika ada)

### Debt
- Technical debt yang disengaja + alasannya
```

**WAJIB:** Setiap PR / commit batch harus disertai update `08-CHANGELOG.md`. Tidak ada exception.

---

## Checklist Sebelum Dianggap "Done"

Sebelum mengklaim task selesai, agent HARUS verifikasi:

```
[ ] TypeScript: tidak ada error `tsc --noEmit`
[ ] Build: `npm run build` sukses tanpa warning
[ ] RLS: jika fitur menyentuh DB, cek policy sudah ada
[ ] Audit log: jika fitur mutate data sensitif, cek trigger aktif
[ ] Offline: jika form surveyor, apakah offline support ada?
[ ] Validation: semua input punya Zod schema
[ ] Error state: semua fetch state punya loading, error, empty handler
[ ] `08-CHANGELOG.md`: entry ditambahkan
```

---

## Keputusan Arsitektur yang Sudah Final

Jangan tanyakan lagi, langsung implementasikan sesuai ini:

| Keputusan | Pilihan Final | Alasan |
|-----------|--------------|--------|
| Admin role | Tidak ada di v1.0 | Jobdesk bisa ditangani algoritma scoring |
| Map provider | Leaflet + OpenStreetMap | Gratis, no API key |
| State management | Zustand (global) + TanStack Query (server) | Pisah concern |
| Offline storage | IndexedDB via `lib/offline.ts` | Persistent across refresh |
| Push notification | Web Push + VAPID | No third-party cost |
| Auth | Supabase Auth (email+password) | No OAuth untuk kurangi attack surface |
| Session lock | 15 menit idle | Keamanan lapangan |
| Scoring formula | Konsistensi 70% + Durasi 30% | Lihat `01-PRD.md` section 4.4 |
| Export PDF | jsPDF di Edge Function | No headless browser overhead |
| Photo max size | 5MB | Balance kualitas vs storage cost |
| Nasabah baru | Score 0, label At Risk, helper text "Belum ada histori setoran" | Konsisten dengan tabel klasifikasi score |

---

## Kontak Dokumen

Jika ada ambiguitas yang tidak tercakup di dokumen ini, **berhenti dan tanyakan ke developer** — jangan asumsikan sendiri untuk keputusan yang menyangkut: security, schema DB, atau perubahan scope.
