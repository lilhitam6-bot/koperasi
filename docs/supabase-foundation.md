# Supabase Foundation Setup

**Status:** Ready to apply to a Supabase project  
**Scope:** Auth, database schema, RLS, storage buckets, audit triggers, scoring trigger, and frontend env wiring.

---

## 1. What Was Added

Files:
- `supabase/config.toml`
- `supabase/migrations/20260613150000_initial_foundation.sql`
- `supabase/migrations/20260614094500_surveyor_locations.sql`
- `src/lib/supabase-env.ts`
- `src/lib/supabase-browser.ts`
- `src/lib/supabase-server.ts`
- `src/lib/storage.ts`
- `src/lib/supabase-env.test.ts`
- `src/lib/supabase-migration.test.ts`
- `src/lib/storage.test.ts`

Packages:
- `@supabase/supabase-js`
- `@supabase/ssr`

---

## 2. Migration Contents

The migrations create:
- `profiles`
- `area_markers`
- `area_status_history`
- `nasabah`
- `setoran`
- `audit_log`
- `push_subscriptions`
- `surveyor_locations`

It also adds:
- Indexes for owner/surveyor queries
- RLS enabled and forced on all app tables
- Owner/surveyor policies
- Storage buckets:
  - `marker-photos`
  - `setoran-photos`
- Storage policies scoped by `{user_id}/filename`
- Audit triggers for:
  - `profiles`
  - `area_markers`
  - `nasabah`
  - `setoran`
- Area status history trigger
- Nasabah score recalculation trigger on setoran changes
- Auth user profile bootstrap trigger
- Realtime publication membership for `surveyor_locations`

---

## 3. Required Supabase Project Settings

In Supabase dashboard:

1. Create a new Supabase project.
2. Auth provider: email/password.
3. Disable public signup for production.
4. Password policy:
   - Minimum 8 characters
   - Require at least one number
5. JWT expiry:
   - 86400 seconds / 24 hours
6. Site URL:
   - Local: `http://localhost:3000`
   - Production: your Vercel domain
7. Redirect URLs:
   - `http://localhost:3000`
   - Production domain

---

## 4. Applying The Migration

With Supabase CLI:

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

Without Supabase CLI:

1. Open Supabase SQL Editor.
2. Copy `supabase/migrations/20260613150000_initial_foundation.sql`.
3. Run it once.
4. Confirm all tables, policies, functions, triggers, and buckets exist.

---

## 5. Environment Variables

Copy `.env.local.example` to `.env.local`:

```bash
cp .env.local.example .env.local
```

Fill:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
```

Rules:
- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are safe for browser use.
- `SUPABASE_SERVICE_ROLE_KEY` must never be imported in client components.
- VAPID keys can stay empty until Web Push is implemented.

---

## 6. Creating Users

Use Supabase dashboard Auth UI to create users.

The migration automatically creates a `profiles` row for every new Auth user.

Default role is:

```text
surveyor
```

To promote the owner:

```sql
update public.profiles
set role = 'owner',
    full_name = 'Owner Name'
where id = 'AUTH_USER_UUID';
```

To disable a resigned user:

```sql
update public.profiles
set is_active = false
where id = 'AUTH_USER_UUID';
```

---

## 7. Required Security Checks Before Real Data

Run these checks before inserting production borrower/payment data:

1. Login as Surveyor A.
2. Insert a marker for Surveyor A.
3. Confirm Surveyor A can read that marker.
4. Login as Surveyor B.
5. Confirm Surveyor B cannot read Surveyor A marker.
6. Login as Owner.
7. Confirm Owner can read both surveyors' markers.
8. Login as Surveyor A.
9. Try to read `audit_log`.
10. Confirm the result is empty/denied.
11. Login as Owner.
12. Confirm Owner can read `audit_log`.
13. Upload `marker-photos/{auth.uid()}/test.webp`.
14. Confirm another surveyor cannot read it.

Do not proceed to production data until those checks pass.

---

## 8. Current Integration Status

Done:
- Supabase packages installed.
- Env validation in place.
- Browser/server client factories added.
- Migration is test-covered for required schema/RLS/audit/storage features.
- Login UI wired to Supabase Auth.
- `surveyor_locations` table and Supabase Realtime publication.
- Marker photo upload helper wired to the marker form.
- Route guards and middleware.

Not done yet:
- Supabase Realtime channel subscription for owner-facing live surveyor GPS.
- Replacing seed data with Supabase queries.
- Setoran photo upload flow to Supabase Storage.
- IndexedDB offline queue sync to Supabase.
- Web Push Edge Functions.
- PDF/Excel export Edge Functions.
