-- Add owner review workflow for surveyor-submitted nasabah drafts.

alter table public.nasabah drop constraint if exists nasabah_status_check;
alter table public.nasabah
  add constraint nasabah_status_check check (status in ('aktif', 'lunas', 'macet', 'hiatus'));

alter table public.nasabah add column if not exists review_status text not null default 'approved';
alter table public.nasabah add column if not exists submitted_by uuid references public.profiles(id);
alter table public.nasabah add column if not exists reviewed_by uuid references public.profiles(id);
alter table public.nasabah add column if not exists reviewed_at timestamptz;
alter table public.nasabah add column if not exists review_notes text;

alter table public.nasabah drop constraint if exists nasabah_review_status_check;
alter table public.nasabah
  add constraint nasabah_review_status_check check (review_status in ('draft', 'approved', 'rejected'));

update public.nasabah
set submitted_by = coalesce(submitted_by, surveyor_id),
    reviewed_at = coalesce(reviewed_at, created_at)
where submitted_by is null or reviewed_at is null;

create index if not exists idx_nasabah_review_status on public.nasabah(review_status);
create index if not exists idx_nasabah_submitted_by on public.nasabah(submitted_by);

drop policy if exists "surveyor_read_own_nasabah" on public.nasabah;
create policy "surveyor_read_own_nasabah" on public.nasabah
  for select using (
    surveyor_id = auth.uid()
    and public.is_active_user()
    and status <> 'hiatus'
  );

drop policy if exists "surveyor_insert_own_nasabah" on public.nasabah;
create policy "surveyor_insert_own_nasabah" on public.nasabah
  for insert with check (
    surveyor_id = auth.uid()
    and submitted_by = auth.uid()
    and review_status = 'draft'
    and status = 'aktif'
    and public.is_active_user()
  );

drop policy if exists "surveyor_update_own_nasabah" on public.nasabah;
drop policy if exists "surveyor_update_own_draft_nasabah" on public.nasabah;
create policy "surveyor_update_own_draft_nasabah" on public.nasabah
  for update using (
    surveyor_id = auth.uid()
    and submitted_by = auth.uid()
    and review_status = 'draft'
    and status <> 'hiatus'
    and public.is_active_user()
  )
  with check (
    surveyor_id = auth.uid()
    and submitted_by = auth.uid()
    and review_status = 'draft'
    and status = 'aktif'
    and public.is_active_user()
  );

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
