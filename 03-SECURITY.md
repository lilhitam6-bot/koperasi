# Security Policy — LendMap PWA
**Version:** 1.0.0  
**Classification:** Internal — Engineering + QA + CyberSec Review  

---

## 1. Threat Model

### 1.1 Assets yang Dilindungi

| Asset | Sensitivity | Lokasi |
|-------|-------------|--------|
| Data nasabah (nama, alamat, jumlah pinjaman) | Tinggi | Supabase DB |
| Koordinat GPS area survei | Sedang | Supabase DB |
| Foto bukti setoran | Sedang | Supabase Storage |
| Data setoran dan histori pembayaran | Tinggi | Supabase DB |
| Kredensial user | Kritis | Supabase Auth |
| VAPID private key | Kritis | Env vars |

### 1.2 Threat Actors

| Actor | Kemampuan | Motivasi |
|-------|-----------|---------|
| Surveyor yang mengakses data surveyor lain | Low-tech, insider | Keingintahuan / sabotase |
| Mantan karyawan yang akun belum dinonaktifkan | Low-tech, insider | Akses pasca-resign |
| Attacker eksternal yang coba SQL injection via API | Med-tech, external | Data nasabah |
| Attacker yang intercept HTTP traffic | Med-tech, external | Kredensial |

### 1.3 Out of Scope Threats (v1.0)

- Advanced persistent threat (APT)
- Physical device compromise
- Supabase infrastructure breach (third-party risk, bukan in-scope)

---

## 2. Authentication

### 2.1 Mekanisme

- Provider: Supabase Auth (email + password)
- Token: JWT dengan expiry **24 jam**
- Refresh token: 7 hari, single-use rotating
- Password policy: minimum 8 karakter, wajib mengandung angka
- Tidak ada OAuth third-party (Google, dsb) untuk mengurangi attack surface

### 2.2 Session Management

```
Auto-lock:     15 menit idle → minta PIN/password ulang (frontend enforced)
Token expiry:  24 jam → auto-logout, redirect ke /login
Refresh:       Silent refresh setiap 20 menit jika user aktif
Revoke:        Owner dapat nonaktifkan akun dari dashboard → set profiles.is_active = false
               → semua request dari akun tersebut langsung 403 via RLS check
```

### 2.3 Concurrent Session

- Satu akun diperbolehkan login di maksimal **2 device** (HP + tablet, umum untuk surveyor lapangan)
- Lebih dari 2 device: session terlama otomatis di-revoke
- Implementasi: track `push_subscriptions` count per user sebagai proxy device count

### 2.4 Implementasi Frontend

```typescript
// hooks/useAuth.ts — idle timeout
const IDLE_TIMEOUT_MS = 15 * 60 * 1000

useEffect(() => {
  let timer: NodeJS.Timeout
  const reset = () => {
    clearTimeout(timer)
    timer = setTimeout(() => signOut(), IDLE_TIMEOUT_MS)
  }
  const events = ['mousemove', 'keydown', 'touchstart', 'scroll']
  events.forEach(e => window.addEventListener(e, reset))
  reset()
  return () => {
    clearTimeout(timer)
    events.forEach(e => window.removeEventListener(e, reset))
  }
}, [])
```

---

## 3. Authorization (RBAC)

### 3.1 Enforcement Layers

```
Layer 1 (Frontend):   Route guard berdasarkan role di middleware Next.js
                      → Redirect unauthorized user ke /unauthorized
Layer 2 (API):        Supabase RLS policies di setiap tabel
                      → Query yang tidak sesuai role return empty set, bukan error
Layer 3 (Storage):    Supabase Storage policies
                      → Foto hanya bisa diakses oleh owner foto + role owner
```

**Prinsip:** Frontend route guard adalah UX. RLS adalah keamanan sebenarnya. Jangan pernah mengandalkan hanya route guard.

### 3.2 Supabase Storage Policies

```sql
-- Foto marker: hanya surveyor yang upload + owner yang bisa baca
CREATE POLICY "surveyor_upload_marker_photo" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'marker-photos' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "read_marker_photo" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'marker-photos' AND (
      auth.uid()::text = (storage.foldername(name))[1] OR
      EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'owner')
    )
  );

-- Sama untuk setoran-photos bucket
```

---

## 4. Data Security

### 4.1 Data in Transit

- HTTPS enforced — Vercel dan Supabase default HTTPS, HTTP redirect ke HTTPS
- HSTS header: `Strict-Transport-Security: max-age=31536000; includeSubDomains`
- WebSocket (Supabase Realtime): WSS (TLS)

### 4.2 Data at Rest

- Supabase mengelola enkripsi at-rest (AES-256) untuk DB dan Storage
- Tidak ada data sensitif di localStorage browser — semua sensitive state di memory (Zustand) atau IndexedDB dengan prefix namespace

### 4.3 IndexedDB Security

```typescript
// lib/offline.ts — jangan simpan data sensitif di plain IndexedDB
// Yang boleh disimpan offline: form data setoran, koordinat marker, referensi ID
// Yang TIDAK boleh: token JWT, VAPID keys, full data nasabah list

const OFFLINE_DB_NAME = 'lendmap-offline-v1'
const ALLOWED_OFFLINE_STORES = ['pending_setoran', 'pending_markers', 'cached_nasabah_ids']
```

### 4.4 Photo Upload Security

```typescript
// Validasi di frontend sebelum upload
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_SIZE_BYTES = 5 * 1024 * 1024 // 5MB

function validatePhoto(file: File): { valid: boolean; error?: string } {
  if (!ALLOWED_TYPES.includes(file.type)) return { valid: false, error: 'Format tidak didukung' }
  if (file.size > MAX_SIZE_BYTES) return { valid: false, error: 'Ukuran file melebihi 5MB' }
  return { valid: true }
}

// Naming convention di Storage: {user_id}/{timestamp}_{random}.jpg
// Mencegah path traversal dan file overwrite
```

---

## 5. Input Validation & Injection Prevention

### 5.1 General Rules

- Semua input dari user di-sanitize sebelum dikirim ke Supabase
- Gunakan Supabase client library (parameterized queries) — jangan pernah string concatenation untuk query
- Angka keuangan (`jumlah_pinjaman`, `angsuran`, `jumlah_dibayar`) harus divalidasi sebagai integer positif, bukan string

### 5.2 Validation Library

```typescript
// Gunakan Zod untuk semua form schema
import { z } from 'zod'

export const setoranSchema = z.object({
  nasabah_id:     z.string().uuid(),
  tanggal:        z.string().date(),
  jumlah_dibayar: z.number().int().positive().max(999_999_999),
  jatuh_tempo:    z.string().date(),
  notes:          z.string().max(500).optional(),
})

export const markerSchema = z.object({
  latitude:  z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  status:    z.enum(['potensial', 'bagus', 'kurang_prospektif']),
  notes:     z.string().max(1000).optional(),
})
```

### 5.3 XSS Prevention

- React default escapes HTML di JSX — tidak perlu `dangerouslySetInnerHTML` di mana pun
- Jika ada kebutuhan render HTML dari user input (catatan panjang) — gunakan `DOMPurify`

---

## 6. Audit Log

### 6.1 Event yang Dicatat

| Event | Tabel | Detail |
|-------|-------|--------|
| User login | - | Via Supabase Auth hooks |
| User logout | - | Via Supabase Auth hooks |
| Tambah/edit/hapus nasabah | `nasabah` | old_data + new_data |
| Input setoran | `setoran` | full record |
| Update status area | `area_markers` | old_status + new_status |
| Perubahan profil user | `profiles` | old + new |
| Revoke akun | `profiles` | is_active change |

### 6.2 Implementasi via DB Trigger

```sql
CREATE OR REPLACE FUNCTION log_audit()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO audit_log (actor_id, action, table_name, record_id, old_data, new_data)
  VALUES (
    auth.uid(),
    TG_OP,
    TG_TABLE_NAME,
    COALESCE(NEW.id, OLD.id),
    CASE WHEN TG_OP = 'DELETE' OR TG_OP = 'UPDATE' THEN row_to_json(OLD) ELSE NULL END,
    CASE WHEN TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN row_to_json(NEW) ELSE NULL END
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach ke tabel-tabel sensitif
CREATE TRIGGER audit_nasabah AFTER INSERT OR UPDATE OR DELETE ON nasabah
  FOR EACH ROW EXECUTE FUNCTION log_audit();

CREATE TRIGGER audit_setoran AFTER INSERT OR UPDATE OR DELETE ON setoran
  FOR EACH ROW EXECUTE FUNCTION log_audit();

CREATE TRIGGER audit_markers AFTER INSERT OR UPDATE OR DELETE ON area_markers
  FOR EACH ROW EXECUTE FUNCTION log_audit();

CREATE TRIGGER audit_profiles AFTER INSERT OR UPDATE OR DELETE ON profiles
  FOR EACH ROW EXECUTE FUNCTION log_audit();
```

### 6.3 Retensi Log

- Audit log disimpan minimum **1 tahun**
- Setelah 1 tahun, pindahkan ke tabel arsip atau export ke CSV sebelum delete
- Owner dapat export audit log dari dashboard (format CSV)

---

## 7. API Security Headers

```typescript
// next.config.js — Security headers
const securityHeaders = [
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)' },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-eval'",      // unsafe-eval diperlukan Next.js dev
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://*.supabase.co https://*.tile.openstreetmap.org",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
      "font-src 'self'",
    ].join('; ')
  },
]
```

---

## 8. VAPID Key Management (Web Push)

```
VAPID keys: di-generate sekali, disimpan sebagai environment variable di Vercel
VAPID_PUBLIC_KEY  → NEXT_PUBLIC (aman di frontend)
VAPID_PRIVATE_KEY → server-side only (Edge Function), TIDAK pernah expose ke client

Rotasi key: lakukan jika terjadi compromise. Semua push subscriptions akan invalid
dan user perlu subscribe ulang (otomatis saat buka app berikutnya).
```

---

## 9. Checklist Audit

### Pre-Launch Security Checklist

- [ ] RLS diaktifkan di semua tabel
- [ ] Storage policies dikonfigurasi untuk semua bucket
- [ ] HTTPS enforced, HTTP redirect
- [ ] Security headers terpasang dan diverifikasi via securityheaders.com
- [ ] VAPID keys di env vars, tidak di-commit ke repo
- [ ] `.env.local` ada di `.gitignore`
- [ ] Supabase service role key tidak pernah expose ke client bundle
- [ ] Audit log trigger aktif di semua tabel sensitif
- [ ] Password policy dikonfigurasi di Supabase Auth settings
- [ ] Zod validation pada semua form inputs
- [ ] Photo upload validation (type + size) sebelum upload
- [ ] Auto-lock 15 menit idle diimplementasikan
- [ ] Owner dapat revoke akun dari dashboard
- [ ] CSP header dikonfigurasi dan tidak menggunakan `unsafe-inline` untuk script
