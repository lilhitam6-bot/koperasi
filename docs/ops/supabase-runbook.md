# Supabase Runbook

Use this for migration, verification, and rollback decisions on the LendMap Supabase project.

## Before Migration

- [ ] Confirm target project ref.
- [ ] Confirm local `.env.local` points to the target project.
- [ ] Confirm Vercel env points to the same target project for the intended environment.
- [ ] Export or snapshot the current schema/data from Supabase dashboard when production data exists.
- [ ] Confirm no production data import or manual correction is running.
- [ ] Review the SQL migration for destructive operations.

## Apply Migration

```bash
supabase link --project-ref seelloevkfehricvxxmt
supabase db push
```

## Verify Migration State

```bash
supabase migration list
```

Expected latest local migration after this optimization:

```text
20260614160000_setoran_flow_hardening.sql
```

## App Verification

Run local gates:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

Run E2E after starting the app or allowing Playwright to start it:

```bash
npm run e2e
```

## Manual SQL Spot Checks

Check setoran is restricted to approved active nasabah:

```sql
select id, nasabah_id, surveyor_id, tanggal, jumlah_dibayar, sync_status
from public.setoran
order by created_at desc
limit 10;
```

Check marker history:

```sql
select marker_id, old_status, new_status, reason, created_at
from public.area_status_history
order by created_at desc
limit 10;
```

Check new auth users default to surveyor:

```sql
select id, email, raw_user_meta_data
from auth.users
order by created_at desc
limit 5;

select id, full_name, role, is_active
from public.profiles
order by created_at desc
limit 5;
```

## Rollback Strategy

- For Vercel app regression, roll back to the previous Vercel deployment.
- For additive DB migration regression, ship a forward repair migration.
- For policy regression, ship a forward migration that restores the last known-good policy.
- For destructive DB regression, freeze writes, restore from Supabase backup, and verify owner/surveyor smoke flows before reopening access.

## Owner Promotion

New users should default to `surveyor`. Promote an owner only through admin SQL/service-role workflow:

```sql
update public.profiles
set role = 'owner'
where id = '<auth-user-id>';
```

Never rely on user-provided signup metadata for owner role assignment.
