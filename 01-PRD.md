# PRD — LendMap PWA
**Version:** 1.0.0
**Status:** Planning Baseline — Approved for v1.0 development planning
**Last Updated:** 2026-06-14
**Owner:** Engineering Lead

---

## 1. Problem Statement

Perusahaan kredit kecil beroperasi menggunakan komunikasi manual (WhatsApp, catatan fisik) untuk tracking survei lapangan, pencatatan setoran nasabah, dan monitoring performa karyawan. Tidak ada sumber data terpusat, tidak ada visibilitas real-time untuk bos, dan surveyor lapangan tidak punya alat untuk mendokumentasikan area survei secara terstruktur. Akibatnya: potensi nasabah terlewat, area tidak produktif masih dikunjungi berulang, dan performa usaha sulit diukur objektif.

---

## 2. Solution Overview

**LendMap** adalah Progressive Web App (PWA) internal berbasis peran yang menyatukan tiga fungsi utama:
1. **Peta survei lapangan real-time** — surveyor marking dan klasifikasikan area langsung dari GPS device.
2. **Manajemen nasabah & setoran** — pencatatan, tracking jadwal, dan bukti foto setoran.
3. **Dashboard analitik** — bos mendapat visibilitas penuh atas performa karyawan, nasabah, dan keuangan usaha.

---

## 3. Users & Roles

### 3.1 Role Matrix

| Role | Jumlah (saat ini) | Scale target | Deskripsi |
|------|-------------------|--------------|-----------|
| `surveyor` | 2 | ~ratusan | Karyawan lapangan — input data & tracking |
| `owner` | 1 | 1–5 | Pemilik bisnis — read-all + konfigurasi |

> **Catatan arsitektur:** Role `admin` dieliminasi dari v1.0. Verifikasi setoran cukup berbasis bukti foto. Jika kebutuhan human-review muncul di v2.0, admin role dapat ditambahkan tanpa perubahan skema besar karena RBAC dibangun modular.

### 3.2 Permission Matrix

| Fitur | `surveyor` | `owner` |
|-------|-----------|---------|
| Lihat peta area | ✅ (area sendiri) | ✅ (semua area) |
| Tambah marker area | ✅ | ✅ |
| Update status area | ✅ (area sendiri) | ✅ (semua) |
| Upload foto marker | ✅ | ✅ |
| Tambah nasabah | ✅ | ✅ |
| Lihat daftar nasabah | ✅ (nasabah sendiri) | ✅ (semua) |
| Input setoran + foto bukti | ✅ | ✅ |
| Lihat scoring nasabah | ✅ (read-only) | ✅ (full) |
| Set batas nasabah per surveyor | ❌ | ✅ |
| Dashboard performa karyawan | ❌ | ✅ |
| Export laporan (PDF/Excel/CSV) | ❌ | ✅ |
| Manajemen user (invite, suspend) | ❌ | ✅ |
| Lihat audit log | ❌ | ✅ |

### 3.3 Current Role Isolation Rules

Implementasi saat ini memisahkan workspace berdasarkan role setelah login:

- `owner` masuk ke Dashboard dan melihat menu Dashboard, Peta, Nasabah, Audit.
- `surveyor` masuk ke Peta dan melihat menu Peta, Nasabah, Setoran.
- `owner` dapat membuat nasabah langsung `approved`.
- `surveyor` hanya dapat membuat nasabah sebagai `draft`.
- `owner` dapat `approve` atau `reject` draft nasabah.
- `owner` dapat memindahkan nasabah approved ke `hiatus` dan mengaktifkannya kembali.
- `surveyor` tidak melihat nasabah `hiatus`.
- Setoran hanya bisa dibuat untuk nasabah `approved` dan `aktif`.

---

## 4. Feature Specifications

### 4.1 Map Tracker

**Deskripsi:** Peta interaktif berbasis GPS yang memungkinkan surveyor menandai dan mengklasifikasikan area survei.

**Fungsionalitas:**
- Surveyor dapat drop marker di posisi GPS saat ini atau tap manual di peta
- Setiap marker memiliki status area:
  - `potensial` — area terlihat aktif secara ekonomi
  - `bagus` — terbukti menghasilkan nasabah yang sustainable
  - `kurang_prospektif` — update downgrade dari `potensial`, area tidak berkembang setelah waktu berjalan
- Marker dapat dilengkapi foto (max 5MB per foto, format JPEG/PNG/WebP)
- Update status dan foto tersync real-time ke server, dengan antrian offline jika tidak ada koneksi
- Owner melihat seluruh marker dari semua surveyor di satu peta terpadu
- Surveyor hanya melihat marker milik mereka sendiri

**Status transition rules:**
```
potensial → bagus          (ketika nasabah di area tersebut terbukti aktif ≥3 bulan)
potensial → kurang_prospektif (manual, dengan catatan wajib)
bagus → kurang_prospektif  (manual, perlu approval owner — flag untuk review)
kurang_prospektif → potensial ❌ (tidak diperbolehkan — area yang sudah diturunkan tidak bisa naik kembali tanpa review manual owner)
```

### 4.2 Manajemen Nasabah

**Fungsionalitas:**
- Input nasabah: nama, alamat teks, jumlah pinjaman, tanggal mulai, tipe angsuran (`weekly`/`monthly`), besaran angsuran, bunga, dan jadwal jatuh tempo.
- Tipe `weekly` selalu membentuk kalender 6 kali angsuran mingguan dari tanggal mulai.
- Tipe `monthly` dibayar sekali per bulan dengan pilihan setoran `bunga saja` atau `bunga + pokok`.
- Setiap nasabah terhubung ke satu surveyor (assigned_to)
- Owner dapat reassign nasabah antar surveyor
- Owner dapat set batas maksimal nasabah aktif per surveyor (default: unlimited)
- Status nasabah: `aktif`, `lunas`, `macet`, `hiatus`
- Review status nasabah: `draft`, `approved`, `rejected`
- Notifikasi push ke surveyor H-1 dan H+0 jatuh tempo tagihan

**Lifecycle rules saat ini:**

```text
surveyor create -> draft
owner create    -> approved + aktif
draft           -> approved | rejected
approved aktif  -> hiatus
approved hiatus -> aktif
```

Business rules:

- Data nasabah dari surveyor tidak otomatis masuk data aktif; harus diverifikasi owner.
- Data nasabah dari owner menjadi data aktif tanpa review tambahan.
- Data `hiatus` tetap tersimpan sebagai arsip owner, tetapi tidak muncul di workflow surveyor/karyawan.
- Nasabah `draft`, `rejected`, dan `hiatus` tidak boleh dipakai untuk setoran.
- Revisi nasabah `rejected` sudah ditetapkan sebagai kebutuhan produk: surveyor dapat memperbaiki lalu mengirim kembali sebagai `draft`. Form edit revisi belum menjadi bagian implementasi penuh saat ini.

### 4.3 Tracking Setoran

**Fungsionalitas:**
- Surveyor input setoran per nasabah: tanggal, jumlah dibayar, catatan, dan foto bukti opsional
- Sistem otomatis menandai setoran sebagai `tepat_waktu`, `terlambat`, atau `kurang`
- Setoran yang kurang dari jumlah angsuran dicatat sebagai partial payment
- Riwayat setoran per nasabah tersedia untuk surveyor (milik sendiri) dan owner (semua)
- Setoran disimpan ke Supabase `setoran`, bukan local-only state.
- Bukti setoran disimpan di Supabase Storage bucket `setoran-photos`.
- Setoran memakai `idempotency_key` untuk menekan risiko submit ganda.
- Setoran weekly terhubung ke `nasabah_payment_schedules`; jadwal bisa ditandai libur dan dimundurkan.
- Setoran monthly menyimpan breakdown `interest_paid` dan `principal_paid`.

**Acceptance criteria:**

- Surveyor tidak dapat mencatat setoran tanpa memilih nasabah approved dan aktif.
- Surveyor tidak dapat mencatat nominal `<= 0`.
- Jika bukti foto dilampirkan, file harus JPG/PNG/WEBP dan maksimal 5MB.
- Setelah submit sukses, riwayat setoran tetap muncul setelah refresh.
- RLS menolak insert setoran untuk nasabah draft, rejected, hiatus, lunas, atau macet.
- Kalender weekly menampilkan 6 jadwal, status paid/scheduled, tanggal original, tanggal aktual, dan flag libur.

### 4.4 Scoring Nasabah (Otomatis)

**Formula scoring (0–100):**

```
score = (bobot_konsistensi × skor_konsistensi) + (bobot_durasi × skor_durasi)

bobot_konsistensi = 0.70
bobot_durasi      = 0.30

skor_konsistensi  = (jumlah_setoran_tepat_waktu / total_setoran) × 100
skor_durasi       = min((bulan_aktif_pinjam / 12) × 100, 100)
```

**Klasifikasi:**
| Score | Label | Warna |
|-------|-------|-------|
| 80–100 | Excellent | Hijau |
| 60–79 | Good | Biru |
| 40–59 | Fair | Kuning |
| 0–39 | At Risk | Merah |

Scoring dihitung ulang otomatis setiap kali ada update setoran.

**Catatan nasabah baru:** Nasabah tanpa histori setoran memiliki `score = 0` dan `score_label = 'At Risk'` secara formula. UI boleh menampilkan helper text "Belum ada histori setoran" agar tidak disalahartikan sebagai performa buruk final.

### 4.5 Dashboard Owner

**Fungsionalitas:**
- Summary cards: total nasabah aktif, total outstanding pinjaman, total setoran bulan ini, nasabah macet
- Peta terpadu semua marker semua surveyor
- Tabel performa per surveyor: jumlah nasabah, rata-rata score nasabah, total setoran bulan berjalan
- Grafik tren setoran bulanan (line chart 12 bulan terakhir)
- Grafik distribusi status area (pie chart)
- Grafik distribusi score nasabah (bar chart)
- Filter periode untuk semua data
- Summary dashboard hanya menghitung nasabah `approved`.
- Nasabah aktif dashboard mengecualikan `draft`, `rejected`, dan `hiatus`.

### 4.6 Export Laporan

| Format | Isi | Penerima |
|--------|-----|---------|
| PDF | Summary eksekutif, grafik tren, tabel nasabah dengan score, performa per surveyor, peta screenshot area status | Owner |
| Excel / CSV | Raw data nasabah aktif: nama, alamat, pinjaman, angsuran, total setoran, score, status | Owner / arsip |

Current CSV export fields:

- nama
- alamat
- pinjaman
- angsuran
- status
- review_status
- lifecycle
- score
- label

### 4.7 Notifikasi Push

- Surveyor: H-1 dan H+0 jatuh tempo per nasabah
- Surveyor: notifikasi ketika batas nasabah hampir tercapai (90% dari limit)
- Owner: weekly summary digest (opsional, toggle di settings)
- Engine: Web Push API + VAPID keys (Supabase Edge Function sebagai sender)

### 4.8 Offline Mode

- Data yang diinput offline (setoran, marker baru) disimpan di IndexedDB
- Saat koneksi pulih, sync otomatis ke Supabase dengan conflict resolution: server wins untuk status area, local wins untuk setoran baru
- Indikator status koneksi dan pending sync items selalu tampil di UI
- Peta cache tile terakhir yang diakses untuk offline viewing

---

## 5. Non-Functional Requirements

| Kategori | Requirement |
|----------|-------------|
| Performance | First Contentful Paint < 2s pada 4G. Lighthouse PWA score ≥ 90 |
| Offline | Semua form input tersedia offline. Map tiles cached |
| Scalability | Arsitektur mendukung ratusan surveyor. DB diindeks untuk query filter per user |
| Security | RLS aktif di semua tabel Supabase. No sensitive PII beyond nama + alamat teks |
| Maintainability | Codebase dioptimalkan untuk agent coding — komponen atomic, no logic di JSX, semua business logic di hooks/utils |
| Auditability | Setiap mutation dicatat di audit_log table |
| Exportability | Stack dapat di-self-host, tidak ada vendor lock-in selain Supabase (dapat diganti dengan PostgREST + PostgreSQL) |

---

## 6. Out of Scope (v1.0)

- Penyimpanan dokumen KTP/identitas nasabah
- Integrasi WhatsApp/SMS gateway
- Mobile native app (iOS/Android — PWA cukup)
- Role admin terpisah
- Multi-tenant (lebih dari satu perusahaan)
- Approval workflow untuk pinjaman baru

---

## 7. Success Metrics

| Metrik | Target |
|--------|--------|
| Semua surveyor onboarded dan aktif | Minggu 2 post-launch |
| 100% setoran tercatat via app (bukan WA) | Minggu 4 post-launch |
| Owner menggunakan dashboard untuk review mingguan | Bulan 2 |
| Zero data loss pada offline-sync scenario | 100% |

---

## 8. Current Acceptance Criteria Snapshot

Core flows considered required before production data:

- Owner and surveyor login with isolated workspaces.
- Owner can create approved nasabah directly.
- Surveyor can create draft nasabah.
- Owner can approve/reject draft nasabah.
- Owner can move approved nasabah to hiatus and reactivate it.
- Surveyor cannot see hiatus nasabah.
- Surveyor can create marker with GPS or manual coordinate.
- Marker records persist to `area_markers` and survive refresh.
- Marker photo upload goes to `marker-photos`.
- Surveyor can create setoran for approved active nasabah.
- Setoran records persist to `setoran` and survive refresh.
- Setoran photo upload goes to `setoran-photos`.
- Upload files are limited to JPG/PNG/WEBP and 5MB.
- Automated gates pass: lint, typecheck, unit tests, build, and Playwright E2E.
