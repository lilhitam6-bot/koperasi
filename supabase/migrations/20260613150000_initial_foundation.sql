-- LendMap Supabase foundation
-- Safe to run as the first production migration. Do not insert real data before this passes review.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role text not null check (role in ('surveyor', 'owner')),
  is_active boolean not null default true,
  max_nasabah integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.area_markers (
  id uuid primary key default extensions.gen_random_uuid(),
  surveyor_id uuid not null references public.profiles(id),
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  status text not null check (status in ('potensial', 'bagus', 'kurang_prospektif')),
  notes text,
  photo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.area_status_history (
  id uuid primary key default extensions.gen_random_uuid(),
  marker_id uuid not null references public.area_markers(id) on delete cascade,
  changed_by uuid not null references public.profiles(id),
  old_status text check (old_status is null or old_status in ('potensial', 'bagus', 'kurang_prospektif')),
  new_status text not null check (new_status in ('potensial', 'bagus', 'kurang_prospektif')),
  reason text,
  created_at timestamptz not null default now()
);

create table if not exists public.nasabah (
  id uuid primary key default extensions.gen_random_uuid(),
  surveyor_id uuid not null references public.profiles(id),
  nama text not null,
  alamat text not null,
  jumlah_pinjaman bigint not null check (jumlah_pinjaman > 0),
  tanggal_mulai date not null,
  tenor_bulan integer not null check (tenor_bulan > 0 and tenor_bulan <= 120),
  angsuran bigint not null check (angsuran > 0),
  tgl_jatuh_tempo integer not null check (tgl_jatuh_tempo between 1 and 28),
  status text not null default 'aktif' check (status in ('aktif', 'lunas', 'macet')),
  score numeric(5,2) not null default 0 check (score >= 0 and score <= 100),
  score_label text not null default 'At Risk' check (score_label in ('Excellent', 'Good', 'Fair', 'At Risk')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.setoran (
  id uuid primary key default extensions.gen_random_uuid(),
  nasabah_id uuid not null references public.nasabah(id) on delete cascade,
  surveyor_id uuid not null references public.profiles(id),
  tanggal date not null,
  jumlah_dibayar bigint not null check (jumlah_dibayar > 0),
  jatuh_tempo date not null,
  status_bayar text not null check (status_bayar in ('tepat_waktu', 'terlambat', 'kurang')),
  foto_bukti_url text not null,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_log (
  id uuid primary key default extensions.gen_random_uuid(),
  actor_id uuid references public.profiles(id),
  action text not null,
  table_name text not null,
  record_id uuid,
  old_data jsonb,
  new_data jsonb,
  ip_address inet,
  created_at timestamptz not null default now()
);

create table if not exists public.push_subscriptions (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_area_markers_surveyor on public.area_markers(surveyor_id);
create index if not exists idx_area_markers_status on public.area_markers(status);
create index if not exists idx_area_status_history_marker on public.area_status_history(marker_id, created_at desc);
create index if not exists idx_nasabah_surveyor on public.nasabah(surveyor_id);
create index if not exists idx_nasabah_status on public.nasabah(status);
create index if not exists idx_nasabah_score_label on public.nasabah(score_label);
create index if not exists idx_setoran_nasabah on public.setoran(nasabah_id);
create index if not exists idx_setoran_surveyor on public.setoran(surveyor_id);
create index if not exists idx_setoran_tanggal on public.setoran(tanggal);
create index if not exists idx_audit_log_actor on public.audit_log(actor_id);
create index if not exists idx_audit_log_table on public.audit_log(table_name, created_at desc);
create index if not exists idx_push_subscriptions_user on public.push_subscriptions(user_id);

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid() and is_active = true;
$$;

create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role() = 'owner', false);
$$;

create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(select 1 from public.profiles where id = auth.uid() and is_active = true);
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

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
    coalesce(nullif(new.raw_user_meta_data ->> 'role', ''), 'surveyor')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace function public.score_label_for(score_value numeric)
returns text
language sql
immutable
as $$
  select case
    when score_value >= 80 then 'Excellent'
    when score_value >= 60 then 'Good'
    when score_value >= 40 then 'Fair'
    else 'At Risk'
  end;
$$;

create or replace function public.recalculate_nasabah_score(target_nasabah_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  total_setoran integer;
  tepat_waktu integer;
  bulan_aktif numeric;
  score_value numeric;
begin
  select count(*), count(*) filter (where status_bayar = 'tepat_waktu')
    into total_setoran, tepat_waktu
  from public.setoran
  where nasabah_id = target_nasabah_id;

  select greatest(0, extract(year from age(current_date, tanggal_mulai)) * 12 + extract(month from age(current_date, tanggal_mulai)))
    into bulan_aktif
  from public.nasabah
  where id = target_nasabah_id;

  if total_setoran = 0 then
    score_value := 0;
  else
    score_value := round(
      ((0.70 * ((tepat_waktu::numeric / total_setoran::numeric) * 100)) +
      (0.30 * least((bulan_aktif / 12) * 100, 100)))::numeric,
      2
    );
  end if;

  update public.nasabah
  set score = score_value,
      score_label = public.score_label_for(score_value),
      updated_at = now()
  where id = target_nasabah_id;
end;
$$;

create or replace function public.recalculate_nasabah_score_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.recalculate_nasabah_score(new.nasabah_id);
  end if;

  if tg_op in ('UPDATE', 'DELETE') and (tg_op = 'DELETE' or old.nasabah_id <> new.nasabah_id) then
    perform public.recalculate_nasabah_score(old.nasabah_id);
  end if;

  return coalesce(new, old);
end;
$$;

create or replace function public.log_area_status_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.area_status_history (marker_id, changed_by, old_status, new_status, reason)
    values (new.id, auth.uid(), null, new.status, new.notes);
    return new;
  end if;

  if new.status is distinct from old.status then
    if old.status = 'kurang_prospektif' and new.status <> old.status and not public.is_owner() then
      raise exception 'Only owner can review terminal area status';
    end if;

    if new.status = 'kurang_prospektif' and coalesce(new.notes, '') = '' then
      raise exception 'Reason notes are required for downgrade to kurang_prospektif';
    end if;

    insert into public.area_status_history (marker_id, changed_by, old_status, new_status, reason)
    values (new.id, auth.uid(), old.status, new.status, new.notes);
  end if;

  return new;
end;
$$;

create or replace function public.log_audit_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_log (actor_id, action, table_name, record_id, old_data, new_data)
  values (
    auth.uid(),
    tg_op,
    tg_table_name,
    coalesce(new.id, old.id),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end
  );

  return coalesce(new, old);
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists area_markers_updated_at on public.area_markers;
create trigger area_markers_updated_at before update on public.area_markers
  for each row execute function public.set_updated_at();

drop trigger if exists nasabah_updated_at on public.nasabah;
create trigger nasabah_updated_at before update on public.nasabah
  for each row execute function public.set_updated_at();

drop trigger if exists area_status_history_on_marker_change on public.area_markers;
create trigger area_status_history_on_marker_change
  after insert or update of status on public.area_markers
  for each row execute function public.log_area_status_history();

drop trigger if exists recalculate_nasabah_score_on_setoran on public.setoran;
create trigger recalculate_nasabah_score_on_setoran
  after insert or update or delete on public.setoran
  for each row execute function public.recalculate_nasabah_score_trigger();

drop trigger if exists audit_area_markers on public.area_markers;
create trigger audit_area_markers after insert or update or delete on public.area_markers
  for each row execute function public.log_audit_event();

drop trigger if exists audit_nasabah on public.nasabah;
create trigger audit_nasabah after insert or update or delete on public.nasabah
  for each row execute function public.log_audit_event();

drop trigger if exists audit_setoran on public.setoran;
create trigger audit_setoran after insert or update or delete on public.setoran
  for each row execute function public.log_audit_event();

drop trigger if exists audit_profiles on public.profiles;
create trigger audit_profiles after insert or update or delete on public.profiles
  for each row execute function public.log_audit_event();

alter table public.profiles enable row level security;
alter table public.profiles force row level security;
alter table public.area_markers enable row level security;
alter table public.area_markers force row level security;
alter table public.area_status_history enable row level security;
alter table public.area_status_history force row level security;
alter table public.nasabah enable row level security;
alter table public.nasabah force row level security;
alter table public.setoran enable row level security;
alter table public.setoran force row level security;
alter table public.audit_log enable row level security;
alter table public.audit_log force row level security;
alter table public.push_subscriptions enable row level security;
alter table public.push_subscriptions force row level security;

drop policy if exists "users_read_own_profile" on public.profiles;
create policy "users_read_own_profile" on public.profiles
  for select using (auth.uid() = id and public.is_active_user());

drop policy if exists "owner_read_all_profiles" on public.profiles;
create policy "owner_read_all_profiles" on public.profiles
  for select using (public.is_owner());

drop policy if exists "owner_manage_profiles" on public.profiles;
create policy "owner_manage_profiles" on public.profiles
  for all using (public.is_owner())
  with check (public.is_owner());

drop policy if exists "surveyor_read_own_markers" on public.area_markers;
create policy "surveyor_read_own_markers" on public.area_markers
  for select using (surveyor_id = auth.uid() and public.is_active_user());

drop policy if exists "owner_read_all_markers" on public.area_markers;
create policy "owner_read_all_markers" on public.area_markers
  for select using (public.is_owner());

drop policy if exists "surveyor_insert_own_markers" on public.area_markers;
create policy "surveyor_insert_own_markers" on public.area_markers
  for insert with check (surveyor_id = auth.uid() and public.is_active_user());

drop policy if exists "owner_insert_any_markers" on public.area_markers;
create policy "owner_insert_any_markers" on public.area_markers
  for insert with check (public.is_owner());

drop policy if exists "surveyor_update_own_markers" on public.area_markers;
create policy "surveyor_update_own_markers" on public.area_markers
  for update using (surveyor_id = auth.uid() and public.is_active_user())
  with check (surveyor_id = auth.uid() and public.is_active_user());

drop policy if exists "owner_update_all_markers" on public.area_markers;
create policy "owner_update_all_markers" on public.area_markers
  for update using (public.is_owner())
  with check (public.is_owner());

drop policy if exists "surveyor_read_own_area_status_history" on public.area_status_history;
create policy "surveyor_read_own_area_status_history" on public.area_status_history
  for select using (
    public.is_active_user() and exists (
      select 1 from public.area_markers marker
      where marker.id = marker_id and marker.surveyor_id = auth.uid()
    )
  );

drop policy if exists "owner_read_all_area_status_history" on public.area_status_history;
create policy "owner_read_all_area_status_history" on public.area_status_history
  for select using (public.is_owner());

drop policy if exists "surveyor_read_own_nasabah" on public.nasabah;
create policy "surveyor_read_own_nasabah" on public.nasabah
  for select using (surveyor_id = auth.uid() and public.is_active_user());

drop policy if exists "owner_read_all_nasabah" on public.nasabah;
create policy "owner_read_all_nasabah" on public.nasabah
  for select using (public.is_owner());

drop policy if exists "surveyor_insert_own_nasabah" on public.nasabah;
create policy "surveyor_insert_own_nasabah" on public.nasabah
  for insert with check (surveyor_id = auth.uid() and public.is_active_user());

drop policy if exists "owner_manage_all_nasabah" on public.nasabah;
create policy "owner_manage_all_nasabah" on public.nasabah
  for all using (public.is_owner())
  with check (public.is_owner());

drop policy if exists "surveyor_update_own_nasabah" on public.nasabah;
create policy "surveyor_update_own_nasabah" on public.nasabah
  for update using (surveyor_id = auth.uid() and public.is_active_user())
  with check (surveyor_id = auth.uid() and public.is_active_user());

drop policy if exists "surveyor_read_own_setoran" on public.setoran;
create policy "surveyor_read_own_setoran" on public.setoran
  for select using (surveyor_id = auth.uid() and public.is_active_user());

drop policy if exists "owner_read_all_setoran" on public.setoran;
create policy "owner_read_all_setoran" on public.setoran
  for select using (public.is_owner());

drop policy if exists "surveyor_insert_own_setoran" on public.setoran;
create policy "surveyor_insert_own_setoran" on public.setoran
  for insert with check (
    surveyor_id = auth.uid()
    and public.is_active_user()
    and exists (
      select 1 from public.nasabah customer
      where customer.id = nasabah_id and customer.surveyor_id = auth.uid()
    )
  );

drop policy if exists "owner_insert_any_setoran" on public.setoran;
create policy "owner_insert_any_setoran" on public.setoran
  for insert with check (public.is_owner());

drop policy if exists "owner_read_audit_log" on public.audit_log;
create policy "owner_read_audit_log" on public.audit_log
  for select using (public.is_owner());

drop policy if exists "users_read_own_push_subscriptions" on public.push_subscriptions;
create policy "users_read_own_push_subscriptions" on public.push_subscriptions
  for select using (user_id = auth.uid() and public.is_active_user());

drop policy if exists "users_insert_own_push_subscriptions" on public.push_subscriptions;
create policy "users_insert_own_push_subscriptions" on public.push_subscriptions
  for insert with check (user_id = auth.uid() and public.is_active_user());

drop policy if exists "users_delete_own_push_subscriptions" on public.push_subscriptions;
create policy "users_delete_own_push_subscriptions" on public.push_subscriptions
  for delete using (user_id = auth.uid() and public.is_active_user());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('marker-photos', 'marker-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('setoran-photos', 'setoran-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "users_upload_own_marker_photos" on storage.objects;
create policy "users_upload_own_marker_photos" on storage.objects
  for insert with check (
    bucket_id = 'marker-photos'
    and public.is_active_user()
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "users_read_own_marker_photos" on storage.objects;
create policy "users_read_own_marker_photos" on storage.objects
  for select using (
    bucket_id = 'marker-photos'
    and public.is_active_user()
    and (auth.uid()::text = (storage.foldername(name))[1] or public.is_owner())
  );

drop policy if exists "users_update_own_marker_photos" on storage.objects;
create policy "users_update_own_marker_photos" on storage.objects
  for update using (
    bucket_id = 'marker-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
    and public.is_active_user()
  )
  with check (
    bucket_id = 'marker-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
    and public.is_active_user()
  );

drop policy if exists "users_upload_own_setoran_photos" on storage.objects;
create policy "users_upload_own_setoran_photos" on storage.objects
  for insert with check (
    bucket_id = 'setoran-photos'
    and public.is_active_user()
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "users_read_own_setoran_photos" on storage.objects;
create policy "users_read_own_setoran_photos" on storage.objects
  for select using (
    bucket_id = 'setoran-photos'
    and public.is_active_user()
    and (auth.uid()::text = (storage.foldername(name))[1] or public.is_owner())
  );

drop policy if exists "users_update_own_setoran_photos" on storage.objects;
create policy "users_update_own_setoran_photos" on storage.objects
  for update using (
    bucket_id = 'setoran-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
    and public.is_active_user()
  )
  with check (
    bucket_id = 'setoran-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
    and public.is_active_user()
  );

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage on all sequences in schema public to authenticated;
