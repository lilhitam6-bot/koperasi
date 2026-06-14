-- Persist the latest foreground surveyor GPS point for realtime map presence.

create table if not exists public.surveyor_locations (
  surveyor_id uuid primary key references public.profiles(id) on delete cascade,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  accuracy_meters double precision check (accuracy_meters is null or accuracy_meters >= 0),
  heading double precision check (heading is null or (heading >= 0 and heading < 360)),
  speed_mps double precision check (speed_mps is null or speed_mps >= 0),
  captured_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create index if not exists idx_surveyor_locations_captured_at on public.surveyor_locations(captured_at desc);

drop trigger if exists surveyor_locations_updated_at on public.surveyor_locations;
create trigger surveyor_locations_updated_at before update on public.surveyor_locations
  for each row execute function public.set_updated_at();

alter table public.surveyor_locations enable row level security;
alter table public.surveyor_locations force row level security;

drop policy if exists "owner_read_all_surveyor_locations" on public.surveyor_locations;
create policy "owner_read_all_surveyor_locations" on public.surveyor_locations
  for select using (public.is_owner());

drop policy if exists "surveyor_upsert_own_location" on public.surveyor_locations;
create policy "surveyor_upsert_own_location" on public.surveyor_locations
  for all using (surveyor_id = auth.uid() and public.is_active_user())
  with check (surveyor_id = auth.uid() and public.is_active_user());

grant select, insert, update, delete on public.surveyor_locations to authenticated;

do $$
begin
  create publication supabase_realtime;
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  alter publication supabase_realtime add table public.surveyor_locations;
exception
  when duplicate_object then null;
end;
$$;
