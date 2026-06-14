-- Harden setoran as a real synced business flow.

alter table public.setoran
  add column if not exists idempotency_key text,
  add column if not exists sync_status text not null default 'synced',
  add column if not exists source_device text;

alter table public.setoran
  alter column foto_bukti_url drop not null;

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
