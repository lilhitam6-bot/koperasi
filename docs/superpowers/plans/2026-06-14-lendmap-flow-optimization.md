# LendMap Flow Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the current LendMap MVP from mostly working UI flows into reliable Supabase-backed business flows for setoran, markers, nasabah lifecycle, security, testing, and reporting.

**Architecture:** Keep the existing Next.js/Supabase architecture. Move core operational data out of component-local state and into Supabase as the source of truth, while keeping UI state only for forms, loading, optimistic feedback, and offline queue previews. Strengthen business rules at the database/RLS layer first, then wire UI actions to those rules.

**Tech Stack:** Next.js 16, React 19, TypeScript, Supabase Auth/Database/Storage/RLS, Vitest, Playwright.

---

## Scope and Order

This plan follows the audit priority order:

1. Setoran end-to-end to Supabase.
2. Marker persistence to `area_markers`.
3. Nasabah lifecycle hardening.
4. Supabase RLS/storage/auth bootstrap hardening.
5. Integration and E2E tests.
6. Dashboard, report, and export cleanup.

Do not mix phases casually. Each phase should end with tests and a working app state.

## Current Source-of-Truth Problems

| Area | Current state | Target state |
| --- | --- | --- |
| Setoran | UI/local state simulation | Supabase `setoran` insert/read with storage proof upload |
| Marker | Photo uploads, marker record mostly local | Supabase `area_markers` read/write, trigger-owned `area_status_history` |
| Nasabah | Draft/review/hiatus exists | Formal state helpers, owner-only transitions, revision/reactivation rules |
| Security | RLS exists but docs/tests thin | RLS/storage/auth rules covered by migration assertions and integration path |
| QA | Helper tests only | Role-based E2E and smoke matrix |
| Reports | Dashboard partly derived from local arrays | Dashboard/export derived from Supabase-backed datasets |

## File Map

Expected files to create:

- `src/lib/setoran.ts` - setoran payload building, due-date/status helpers, idempotency helpers.
- `src/lib/markers.ts` - marker payload building and Supabase row mapping.
- `src/lib/nasabah-lifecycle.ts` - lifecycle transition helpers and UI labels.
- `src/lib/supabase-rls-contract.test.ts` - migration text assertions for critical policies/functions.
- `tests/e2e/auth-role-isolation.spec.ts` - Playwright coverage for owner/surveyor login and nav boundaries.
- `tests/e2e/nasabah-lifecycle.spec.ts` - Playwright coverage for draft/approve/reject/hiatus.
- `tests/e2e/setoran-marker.spec.ts` - Playwright coverage for setoran and marker happy paths.
- `docs/ops/release-smoke-checklist.md` - manual release gate.
- `docs/ops/supabase-runbook.md` - migration, backup, restore, rollback runbook.

Expected files to modify:

- `src/components/lendmap-app.tsx` - replace local-only setoran/marker flows with Supabase-backed reads/writes.
- `src/types/index.ts` - add sync/idempotency fields if the DB migration adds them.
- `src/lib/domain.ts` - keep pure domain calculations only; move operational payload builders to dedicated files.
- `src/lib/storage.ts` - add file validation before upload.
- `supabase/migrations/*.sql` - add one new migration for hardening fields/policies.
- `package.json` - add Playwright scripts if E2E is implemented.
- `README.md` or `docs/supabase-foundation.md` - update env and current source-of-truth notes.

---

### Task 1: Setoran End-to-End Source of Truth

**Files:**

- Create: `src/lib/setoran.ts`
- Create: `src/lib/setoran.test.ts`
- Modify: `src/components/lendmap-app.tsx`
- Modify: `src/types/index.ts`
- Modify: `supabase/migrations/20260614160000_setoran_flow_hardening.sql`

- [ ] **Step 1: Add migration for setoran idempotency and safer proof handling**

Create `supabase/migrations/20260614160000_setoran_flow_hardening.sql`:

```sql
alter table public.setoran
  add column if not exists idempotency_key text,
  add column if not exists sync_status text not null default 'synced',
  add column if not exists source_device text;

alter table public.setoran drop constraint if exists setoran_sync_status_check;
alter table public.setoran
  add constraint setoran_sync_status_check check (sync_status in ('pending', 'synced', 'failed'));

create unique index if not exists idx_setoran_surveyor_idempotency
  on public.setoran(surveyor_id, idempotency_key)
  where idempotency_key is not null;

create index if not exists idx_setoran_nasabah_tanggal
  on public.setoran(nasabah_id, tanggal desc);

drop policy if exists "surveyor_insert_own_setoran" on public.setoran;
create policy "surveyor_insert_own_setoran" on public.setoran
  for insert with check (
    surveyor_id = auth.uid()
    and public.is_active_user()
    and exists (
      select 1 from public.nasabah customer
      where customer.id = nasabah_id
        and customer.surveyor_id = auth.uid()
        and customer.review_status = 'approved'
        and customer.status = 'aktif'
    )
  );
```

- [ ] **Step 2: Add domain helper tests for setoran payload**

Create `src/lib/setoran.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { buildSetoranIdempotencyKey, getSetoranDueDate, normalizeSetoranAmount } from './setoran'

describe('setoran helpers', () => {
  it('builds stable idempotency keys per surveyor, nasabah, date, and amount', () => {
    expect(
      buildSetoranIdempotencyKey({
        surveyorId: 'surveyor-1',
        nasabahId: 'nasabah-1',
        tanggal: '2026-06-14',
        jumlahDibayar: 50000,
      })
    ).toBe('surveyor-1:nasabah-1:2026-06-14:50000')
  })

  it('normalizes formatted rupiah input into an integer amount', () => {
    expect(normalizeSetoranAmount('Rp 50.000')).toBe(50000)
    expect(normalizeSetoranAmount('50000')).toBe(50000)
  })

  it('builds due date using nasabah due day and payment month', () => {
    expect(getSetoranDueDate({ tanggal: '2026-06-14', tglJatuhTempo: 10 })).toBe('2026-06-10')
  })
})
```

- [ ] **Step 3: Implement setoran helpers**

Create `src/lib/setoran.ts`:

```ts
export function normalizeSetoranAmount(value: string): number {
  const digits = value.replace(/\D/g, '')
  return Number(digits || 0)
}

export function buildSetoranIdempotencyKey({
  surveyorId,
  nasabahId,
  tanggal,
  jumlahDibayar,
}: {
  surveyorId: string
  nasabahId: string
  tanggal: string
  jumlahDibayar: number
}): string {
  return `${surveyorId}:${nasabahId}:${tanggal}:${jumlahDibayar}`
}

export function getSetoranDueDate({
  tanggal,
  tglJatuhTempo,
}: {
  tanggal: string
  tglJatuhTempo: number
}): string {
  const paymentDate = new Date(`${tanggal}T00:00:00`)
  const year = paymentDate.getFullYear()
  const month = String(paymentDate.getMonth() + 1).padStart(2, '0')
  const day = String(Math.min(Math.max(tglJatuhTempo, 1), 28)).padStart(2, '0')
  return `${year}-${month}-${day}`
}
```

- [ ] **Step 4: Run helper tests**

Run:

```bash
npm run test -- src/lib/setoran.test.ts
```

Expected: the new setoran helper tests pass.

- [ ] **Step 5: Wire setoran submit to Supabase**

Modify `src/components/lendmap-app.tsx` so `submitSetoran`:

1. Rejects missing `nasabah_id`.
2. Rejects amount `<= 0`.
3. Uploads optional proof file to `setoran-photos`.
4. Inserts into `public.setoran`.
5. Refreshes setoran state from Supabase after insert.

Insert payload shape:

```ts
{
  nasabah_id: selectedNasabah.id,
  surveyor_id: currentProfile.id,
  tanggal: setoranForm.tanggal,
  jumlah_dibayar: jumlahDibayar,
  jatuh_tempo: getSetoranDueDate({
    tanggal: setoranForm.tanggal,
    tglJatuhTempo: selectedNasabah.tgl_jatuh_tempo,
  }),
  status_bayar: determineStatusBayar(
    setoranForm.tanggal,
    jatuhTempo,
    jumlahDibayar,
    selectedNasabah.angsuran
  ),
  foto_bukti_url: uploadedPath,
  notes: setoranForm.notes || null,
  idempotency_key: buildSetoranIdempotencyKey(...),
  sync_status: 'synced',
}
```

- [ ] **Step 6: Add setoran loading and error states**

In `src/components/lendmap-app.tsx`, add state for:

```ts
const [setoranError, setSetoranError] = useState<string | null>(null)
const [isSetoranSubmitting, setIsSetoranSubmitting] = useState(false)
```

Acceptance:

- Duplicate submit button press is blocked while `isSetoranSubmitting`.
- Supabase error is shown in the setoran panel.
- Successful submit clears the form and shows the new row in recent history.

- [ ] **Step 7: Verify**

Run:

```bash
npm run test
npm run typecheck
npm run build
```

Expected: all pass.

---

### Task 2: Marker Persistence to Supabase

**Files:**

- Create: `src/lib/markers.ts`
- Create: `src/lib/markers.test.ts`
- Modify: `src/components/lendmap-app.tsx`
- Modify: `src/types/index.ts`

- [ ] **Step 1: Add marker mapping tests**

Create `src/lib/markers.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { buildMarkerInsertPayload } from './markers'

describe('marker helpers', () => {
  it('builds an area_markers insert payload', () => {
    expect(
      buildMarkerInsertPayload({
        surveyorId: 'surveyor-1',
        latitude: -6.92,
        longitude: 106.92,
        status: 'potensial',
        notes: 'Dekat pasar',
        photoPath: 'surveyor-1/photo.webp',
      })
    ).toEqual({
      surveyor_id: 'surveyor-1',
      latitude: -6.92,
      longitude: 106.92,
      status: 'potensial',
      notes: 'Dekat pasar',
      photo_url: 'surveyor-1/photo.webp',
    })
  })
})
```

- [ ] **Step 2: Implement marker helper**

Create `src/lib/markers.ts`:

```ts
import type { AreaStatus } from '@/types'

export function buildMarkerInsertPayload({
  surveyorId,
  latitude,
  longitude,
  status,
  notes,
  photoPath,
}: {
  surveyorId: string
  latitude: number
  longitude: number
  status: AreaStatus
  notes: string
  photoPath: string | null
}) {
  return {
    surveyor_id: surveyorId,
    latitude,
    longitude,
    status,
    notes: notes.trim() || null,
    photo_url: photoPath,
  }
}
```

- [ ] **Step 3: Replace local marker create with Supabase insert**

Modify `addTrackerMarker` in `src/components/lendmap-app.tsx`:

- Keep GPS/manual coordinate validation.
- Keep marker photo upload to `marker-photos`.
- Insert the marker row into `public.area_markers`.
- Use the returned row to update `markers`.

Query shape:

```ts
const { data, error } = await supabase
  .from('area_markers')
  .insert(buildMarkerInsertPayload(...))
  .select('id, surveyor_id, latitude, longitude, status, notes, photo_url, created_at, updated_at')
  .single()
```

- [ ] **Step 4: Load markers from Supabase on app startup**

In the existing data loading effect in `src/components/lendmap-app.tsx`, fetch:

```ts
supabase
  .from('area_markers')
  .select('id, surveyor_id, latitude, longitude, status, notes, photo_url, created_at, updated_at')
  .order('created_at', { ascending: false })
```

Acceptance:

- Owner sees all markers through RLS.
- Surveyor sees own markers through RLS.
- Refreshing the browser keeps markers visible.

- [ ] **Step 5: Verify area status history**

Manual SQL verification after inserting a marker:

```sql
select marker_id, old_status, new_status, reason
from public.area_status_history
order by created_at desc
limit 5;
```

Expected: inserting a marker creates a history row with `old_status = null`.

- [ ] **Step 6: Run tests**

```bash
npm run test -- src/lib/markers.test.ts
npm run typecheck
npm run build
```

---

### Task 3: Formalize Nasabah Lifecycle

**Files:**

- Create: `src/lib/nasabah-lifecycle.ts`
- Create: `src/lib/nasabah-lifecycle.test.ts`
- Modify: `src/components/lendmap-app.tsx`
- Modify: `docs/supabase-foundation.md`

- [ ] **Step 1: Add lifecycle tests**

Create `src/lib/nasabah-lifecycle.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { canReactivateNasabah, canReviseRejectedNasabah, getNasabahLifecycleLabel } from './nasabah-lifecycle'

describe('nasabah lifecycle', () => {
  it('labels draft, approved active, rejected, and hiatus states', () => {
    expect(getNasabahLifecycleLabel({ reviewStatus: 'draft', status: 'aktif' })).toBe('Draft menunggu review')
    expect(getNasabahLifecycleLabel({ reviewStatus: 'approved', status: 'aktif' })).toBe('Approved aktif')
    expect(getNasabahLifecycleLabel({ reviewStatus: 'rejected', status: 'aktif' })).toBe('Ditolak')
    expect(getNasabahLifecycleLabel({ reviewStatus: 'approved', status: 'hiatus' })).toBe('Hiatus')
  })

  it('allows rejected nasabah revision only before approval', () => {
    expect(canReviseRejectedNasabah({ reviewStatus: 'rejected', status: 'aktif' })).toBe(true)
    expect(canReviseRejectedNasabah({ reviewStatus: 'approved', status: 'aktif' })).toBe(false)
  })

  it('allows owner reactivation from hiatus into approved active', () => {
    expect(canReactivateNasabah({ reviewStatus: 'approved', status: 'hiatus' })).toBe(true)
    expect(canReactivateNasabah({ reviewStatus: 'draft', status: 'aktif' })).toBe(false)
  })
})
```

- [ ] **Step 2: Implement lifecycle helpers**

Create `src/lib/nasabah-lifecycle.ts`:

```ts
import type { NasabahReviewStatus, NasabahStatus } from '@/types'

export function getNasabahLifecycleLabel({
  reviewStatus,
  status,
}: {
  reviewStatus: NasabahReviewStatus
  status: NasabahStatus
}): string {
  if (reviewStatus === 'draft') return 'Draft menunggu review'
  if (reviewStatus === 'rejected') return 'Ditolak'
  if (reviewStatus === 'approved' && status === 'hiatus') return 'Hiatus'
  if (reviewStatus === 'approved' && status === 'aktif') return 'Approved aktif'
  if (reviewStatus === 'approved' && status === 'lunas') return 'Lunas'
  if (reviewStatus === 'approved' && status === 'macet') return 'Macet'
  return 'Status tidak dikenal'
}

export function canReviseRejectedNasabah({
  reviewStatus,
  status,
}: {
  reviewStatus: NasabahReviewStatus
  status: NasabahStatus
}): boolean {
  return reviewStatus === 'rejected' && status !== 'hiatus'
}

export function canReactivateNasabah({
  reviewStatus,
  status,
}: {
  reviewStatus: NasabahReviewStatus
  status: NasabahStatus
}): boolean {
  return reviewStatus === 'approved' && status === 'hiatus'
}
```

- [ ] **Step 3: Add owner-only reactivation action**

In `src/components/lendmap-app.tsx`, add owner action:

```ts
async function reactivateNasabah(nasabahId: string) {
  if (currentProfile.role !== 'owner') return
  const { error } = await supabase
    .from('nasabah')
    .update({ status: 'aktif' })
    .eq('id', nasabahId)
    .eq('review_status', 'approved')
    .eq('status', 'hiatus')

  if (error) {
    setNasabahError(error.message || 'Nasabah gagal diaktifkan kembali.')
    return
  }

  await refreshNasabah()
}
```

Acceptance:

- Owner can move approved active -> hiatus.
- Owner can move approved hiatus -> active.
- Surveyor cannot see hiatus and cannot reactivate.

- [ ] **Step 4: Define rejected revision behavior**

Implement one rule and document it:

- A rejected nasabah can be edited by the original surveyor.
- Saving a revision changes `review_status` back to `draft`.
- `review_notes`, `reviewed_by`, and `reviewed_at` remain visible to owner as last review metadata.

Required update payload:

```ts
{
  nama,
  alamat,
  jumlah_pinjaman,
  tanggal_mulai,
  tenor_bulan,
  angsuran,
  tgl_jatuh_tempo,
  review_status: 'draft',
  status: 'aktif',
}
```

- [ ] **Step 5: Run tests**

```bash
npm run test -- src/lib/nasabah-lifecycle.test.ts
npm run test
npm run typecheck
```

---

### Task 4: Supabase Hardening

**Files:**

- Modify: `src/lib/storage.ts`
- Modify: `src/lib/storage.test.ts`
- Create: `src/lib/supabase-rls-contract.test.ts`
- Modify: `supabase/migrations/20260614160000_setoran_flow_hardening.sql`
- Modify: `docs/ops/supabase-runbook.md`

- [ ] **Step 1: Add storage validation tests**

Extend `src/lib/storage.test.ts` with:

```ts
import { validateEvidenceFile } from './storage'

it('accepts jpg png and webp image uploads under 5MB', () => {
  const file = new File(['x'], 'bukti.webp', { type: 'image/webp' })
  expect(validateEvidenceFile(file)).toEqual({ ok: true })
})

it('rejects unsupported upload types', () => {
  const file = new File(['x'], 'bukti.pdf', { type: 'application/pdf' })
  expect(validateEvidenceFile(file)).toEqual({
    ok: false,
    message: 'File harus berupa JPG, PNG, atau WEBP.',
  })
})
```

- [ ] **Step 2: Implement storage validation**

Modify `src/lib/storage.ts`:

```ts
const ALLOWED_EVIDENCE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const MAX_EVIDENCE_FILE_SIZE = 5 * 1024 * 1024

export function validateEvidenceFile(file: File): { ok: true } | { ok: false; message: string } {
  if (!ALLOWED_EVIDENCE_MIME_TYPES.has(file.type)) {
    return { ok: false, message: 'File harus berupa JPG, PNG, atau WEBP.' }
  }

  if (file.size > MAX_EVIDENCE_FILE_SIZE) {
    return { ok: false, message: 'Ukuran file maksimal 5MB.' }
  }

  return { ok: true }
}
```

Call `validateEvidenceFile(file)` inside `uploadEvidenceFile` before building the path.

- [ ] **Step 3: Add migration contract tests**

Create `src/lib/supabase-rls-contract.test.ts` that reads all SQL migrations and asserts critical policies exist:

```ts
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationDir = join(process.cwd(), 'supabase/migrations')
const sql = readdirSync(migrationDir)
  .filter((file) => file.endsWith('.sql'))
  .sort()
  .map((file) => readFileSync(join(migrationDir, file), 'utf8'))
  .join('\n')

describe('Supabase RLS contract', () => {
  it('keeps surveyor setoran limited to approved active nasabah', () => {
    expect(sql).toContain("customer.review_status = 'approved'")
    expect(sql).toContain("customer.status = 'aktif'")
  })

  it('keeps marker and setoran storage buckets private and image-limited', () => {
    expect(sql).toContain("values ('marker-photos', 'marker-photos', false, 5242880")
    expect(sql).toContain("values ('setoran-photos', 'setoran-photos', false, 5242880")
    expect(sql).toContain("array['image/jpeg', 'image/png', 'image/webp']")
  })

  it('keeps new users defaulting to surveyor when role metadata is absent', () => {
    expect(sql).toContain("coalesce(nullif(new.raw_user_meta_data ->> 'role', ''), 'surveyor')")
  })
})
```

- [ ] **Step 4: Harden role bootstrap policy**

Recommended migration adjustment:

```sql
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1), 'User'),
    'surveyor'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
```

Owner promotion should be done by service-role/admin SQL only.

- [ ] **Step 5: Run tests**

```bash
npm run test -- src/lib/storage.test.ts src/lib/supabase-rls-contract.test.ts
npm run test
npm run typecheck
```

---

### Task 5: Integration and E2E Coverage

**Files:**

- Create: `playwright.config.ts`
- Create: `tests/e2e/auth-role-isolation.spec.ts`
- Create: `tests/e2e/nasabah-lifecycle.spec.ts`
- Create: `tests/e2e/setoran-marker.spec.ts`
- Modify: `package.json`

- [ ] **Step 1: Add Playwright scripts**

Modify `package.json`:

```json
{
  "scripts": {
    "e2e": "playwright test",
    "e2e:ui": "playwright test --ui"
  }
}
```

- [ ] **Step 2: Add Playwright config**

Create `playwright.config.ts`:

```ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium-desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chrome', use: { ...devices['Pixel 7'] } },
  ],
})
```

- [ ] **Step 3: Add auth role isolation tests**

Create `tests/e2e/auth-role-isolation.spec.ts`:

```ts
import { expect, test } from '@playwright/test'

test('owner sees dashboard and audit navigation', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Email').fill('bos@kantor.com')
  await page.getByLabel('Password').fill('bos123')
  await page.getByRole('button', { name: /Masuk/i }).click()
  await expect(page.getByText(/Dashboard/i)).toBeVisible()
  await expect(page.getByText(/Audit/i)).toBeVisible()
})

test('surveyor does not see dashboard or audit navigation', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Email').fill('surveyor1@kantor.com')
  await page.getByLabel('Password').fill('surveyor123.')
  await page.getByRole('button', { name: /Masuk/i }).click()
  await expect(page.getByText(/Setoran/i)).toBeVisible()
  await expect(page.getByText(/Audit/i)).toHaveCount(0)
})
```

- [ ] **Step 4: Add nasabah lifecycle E2E**

Create `tests/e2e/nasabah-lifecycle.spec.ts` to cover:

- Surveyor creates draft.
- Owner sees draft.
- Owner approves draft.
- Approved nasabah appears as payable.
- Owner moves nasabah to hiatus.
- Surveyor no longer sees hiatus.

Use unique names with timestamp:

```ts
const nama = `E2E Nasabah ${Date.now()}`
```

- [ ] **Step 5: Add setoran and marker E2E**

Create `tests/e2e/setoran-marker.spec.ts` to cover:

- Marker manual coordinate create persists after refresh.
- Marker photo upload accepts WEBP/JPG/PNG.
- Setoran insert appears in recent history after refresh.

- [ ] **Step 6: Verify**

Run local dev server in one terminal:

```bash
npm run dev
```

Run E2E:

```bash
PLAYWRIGHT_BASE_URL=http://localhost:3000 npm run e2e
```

Expected: E2E passes on desktop and mobile projects.

---

### Task 6: Dashboard, Report, and Export Cleanup

**Files:**

- Modify: `src/lib/domain.ts`
- Modify: `src/components/lendmap-app.tsx`
- Modify: `src/lib/domain.test.ts`
- Modify: `docs/ops/release-smoke-checklist.md`

- [ ] **Step 1: Make dashboard summary use Supabase-backed setoran**

Acceptance:

- `totalSetoranBulanIni` comes from real `setoran` rows.
- `totalOutstanding` excludes draft, rejected, hiatus, lunas, and macet unless product explicitly changes this.
- `nasabahMacet` counts approved macet only.

- [ ] **Step 2: Add report filters**

In owner dashboard/report UI, support:

- Month filter.
- Surveyor filter.
- Nasabah status filter.
- Review status filter.

All filters should be applied to Supabase-backed data already loaded into state, unless result size grows enough to require server-side pagination.

- [ ] **Step 3: Update CSV export**

Use `toCsv` with fields:

```ts
{
  nama,
  surveyor,
  status,
  review_status,
  jumlah_pinjaman,
  angsuran,
  total_setoran_bulan_ini,
  score,
  score_label,
}
```

- [ ] **Step 4: Verify domain tests**

Add tests in `src/lib/domain.test.ts`:

```ts
it('excludes draft rejected and hiatus nasabah from active dashboard count', () => {
  const summary = calculateDashboardSummary(
    [
      approvedActiveNasabah,
      draftNasabah,
      rejectedNasabah,
      approvedHiatusNasabah,
    ],
    [],
    '2026-06'
  )

  expect(summary.totalNasabahAktif).toBe(1)
})
```

Run:

```bash
npm run test -- src/lib/domain.test.ts
npm run test
npm run typecheck
npm run build
```

---

### Task 7: Documentation and Release Gate

**Files:**

- Create: `docs/ops/release-smoke-checklist.md`
- Create: `docs/ops/supabase-runbook.md`
- Modify: `01-PRD.md`
- Modify: `02-ARCHITECTURE.md`
- Modify: `03-SECURITY.md`
- Modify: `docs/supabase-foundation.md`
- Modify: `docs/ui/mobile-first-stitch-brief.md`

- [ ] **Step 1: Add release smoke checklist**

Create `docs/ops/release-smoke-checklist.md` with this gate:

```md
# Release Smoke Checklist

## Automated

- [ ] `npm run lint`
- [ ] `npm run typecheck`
- [ ] `npm run test`
- [ ] `npm run build`
- [ ] `npm run e2e`

## Manual Owner Account

- [ ] Login owner.
- [ ] Owner dashboard loads.
- [ ] Owner creates approved nasabah.
- [ ] Owner approves surveyor draft.
- [ ] Owner rejects surveyor draft with notes.
- [ ] Owner moves approved nasabah to hiatus.
- [ ] Owner reactivates hiatus nasabah.

## Manual Surveyor Account

- [ ] Login surveyor.
- [ ] Surveyor creates marker with manual coordinate.
- [ ] Surveyor uploads marker image.
- [ ] Surveyor creates draft nasabah.
- [ ] Surveyor cannot approve/reject.
- [ ] Surveyor cannot see hiatus nasabah.
- [ ] Surveyor creates setoran for approved active nasabah.
- [ ] Surveyor cannot create setoran for draft/rejected/hiatus nasabah.

## Supabase

- [ ] Storage upload path is scoped to user ID.
- [ ] RLS rejects cross-surveyor read/write attempts.
- [ ] `area_status_history` receives marker status history.
- [ ] `audit_log` receives nasabah/setoran/marker changes.
```

- [ ] **Step 2: Add Supabase runbook**

Create `docs/ops/supabase-runbook.md` with:

```md
# Supabase Runbook

## Before Migration

- [ ] Confirm target project ref.
- [ ] Confirm local `.env.local` points to target project.
- [ ] Export current schema from Supabase dashboard or CLI.
- [ ] Confirm no production data import is running.

## Apply Migration

```bash
supabase db push
```

## Verify

```bash
supabase migration list
```

Run app gates:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

## Rollback Strategy

- For Vercel app regression, roll back to previous deployment in Vercel.
- For additive DB migration regression, ship a forward repair migration.
- For destructive DB regression, restore from Supabase backup and freeze writes until verified.
```

- [ ] **Step 3: Update formal docs**

Update docs to include:

- PRD: acceptance criteria per core flow.
- Architecture: current data flow with setoran/marker/nasabah lifecycle.
- Security: storage path, file validation, role bootstrap hardening, RLS matrix.
- Supabase foundation: latest migration and QA account matrix.
- UI brief: empty/error/loading/offline states per screen.

- [ ] **Step 4: Re-run flow audit PDF**

Run:

```bash
npm run docs:flows
```

Expected: flow audit PDF includes updated source-of-truth status and no stale "local-only" notes for setoran/marker after those phases are implemented.

---

## Execution Strategy

Recommended execution:

1. Create a branch: `git switch -c optimize/core-flows`.
2. Execute Task 1 and verify.
3. Execute Task 2 and verify.
4. Execute Task 3 and verify.
5. Execute Task 4 and verify.
6. Execute Task 5 and verify.
7. Execute Task 6 and verify.
8. Execute Task 7 and verify.

Commit boundary recommendation:

- Commit after each task passes its verification commands.
- Do not push until Task 1-4 pass at minimum, because those define the core data correctness.

## Final Acceptance Criteria

- Setoran is persisted to Supabase and survives refresh.
- Setoran proof upload uses `setoran-photos` and validates image type/size before upload.
- Marker is persisted to `area_markers` and survives refresh.
- Marker insert creates `area_status_history`.
- Nasabah lifecycle has explicit helpers and UI actions for draft, approved, rejected, hiatus, and reactivation.
- Surveyor cannot create setoran for draft/rejected/hiatus nasabah.
- Owner and surveyor role boundaries are covered by automated tests.
- Storage/RLS/auth bootstrap contracts are covered by tests.
- Dashboard summary uses real Supabase-backed nasabah and setoran state.
- Release smoke checklist and Supabase runbook exist.

## Self-Review

- Spec coverage: This plan covers all audit priority gaps in the requested order.
- Placeholder scan: The plan avoids open placeholders and defines exact files, commands, and expected behavior.
- Type consistency: The plan uses existing project types: `NasabahStatus`, `NasabahReviewStatus`, `AreaStatus`, `StatusBayar`, `Setoran`, `AreaMarker`.
