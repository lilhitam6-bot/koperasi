# Release Smoke Checklist

Use this before pushing a production-facing deploy or after applying Supabase migrations.

## Automated

- [ ] `npm run lint`
- [ ] `npm run typecheck`
- [ ] `npm run test`
- [ ] `npm run build`
- [ ] `npm run e2e`

## Manual Owner Account

- [ ] Login owner.
- [ ] Owner dashboard loads.
- [ ] Owner can open the nasabah workspace.
- [ ] Owner can create an approved nasabah directly.
- [ ] Owner can approve a surveyor draft.
- [ ] Owner can reject a surveyor draft.
- [ ] Owner can move approved nasabah to hiatus.
- [ ] Owner can reactivate hiatus nasabah.
- [ ] Owner can view marker and setoran records after refresh.

## Manual Surveyor Account

- [ ] Login surveyor.
- [ ] Surveyor lands in the map workspace.
- [ ] Surveyor can open marker form.
- [ ] Surveyor can create marker with manual coordinate.
- [ ] Surveyor can upload marker image.
- [ ] Surveyor can create draft nasabah.
- [ ] Surveyor cannot approve or reject nasabah.
- [ ] Surveyor cannot see hiatus nasabah.
- [ ] Surveyor can create setoran for approved active nasabah.
- [ ] Surveyor cannot create setoran for draft, rejected, or hiatus nasabah.

## Supabase

- [ ] `supabase migration list` shows the expected remote state.
- [ ] Storage upload path is scoped to the authenticated user ID.
- [ ] RLS rejects cross-surveyor read/write attempts.
- [ ] `area_status_history` receives marker status history.
- [ ] `audit_log` receives nasabah, setoran, and marker changes.
- [ ] New signups default to `surveyor`; owner promotion is admin-controlled.

## Go / No-Go

Ship only when every automated check passes and the owner/surveyor smoke paths pass on the same Supabase project used by the deployment.
