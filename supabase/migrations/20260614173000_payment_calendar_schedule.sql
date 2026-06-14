-- Add payment product shape and a weekly installment calendar.

alter table public.nasabah
  add column if not exists payment_frequency text not null default 'weekly',
  add column if not exists installment_count integer not null default 6,
  add column if not exists installment_amount bigint not null default 0,
  add column if not exists interest_amount bigint not null default 0,
  add column if not exists principal_amount bigint not null default 0,
  add column if not exists monthly_due_day integer,
  add column if not exists weekly_due_day integer;

alter table public.nasabah drop constraint if exists nasabah_payment_frequency_check;
alter table public.nasabah
  add constraint nasabah_payment_frequency_check check (payment_frequency in ('weekly', 'monthly'));

alter table public.nasabah drop constraint if exists nasabah_installment_count_check;
alter table public.nasabah
  add constraint nasabah_installment_count_check check (installment_count > 0 and installment_count <= 120);

alter table public.nasabah drop constraint if exists nasabah_amount_breakdown_check;
alter table public.nasabah
  add constraint nasabah_amount_breakdown_check check (
    installment_amount >= 0
    and interest_amount >= 0
    and principal_amount >= 0
  );

alter table public.nasabah drop constraint if exists nasabah_due_day_calendar_check;
alter table public.nasabah
  add constraint nasabah_due_day_calendar_check check (
    (monthly_due_day is null or monthly_due_day between 1 and 28)
    and (weekly_due_day is null or weekly_due_day between 0 and 6)
  );

update public.nasabah
set installment_amount = angsuran,
    principal_amount = jumlah_pinjaman,
    monthly_due_day = tgl_jatuh_tempo
where installment_amount = 0
   or principal_amount = 0
   or monthly_due_day is null;

create table if not exists public.nasabah_payment_schedules (
  id uuid primary key default extensions.gen_random_uuid(),
  nasabah_id uuid not null references public.nasabah(id) on delete cascade,
  installment_number integer not null check (installment_number > 0),
  original_due_date date not null,
  due_date date not null,
  amount_due bigint not null check (amount_due > 0),
  status text not null default 'scheduled' check (status in ('scheduled', 'paid', 'missed')),
  is_holiday boolean not null default false,
  holiday_label text,
  paid_at timestamptz,
  setoran_id uuid references public.setoran(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (nasabah_id, installment_number)
);

create index if not exists idx_payment_schedules_nasabah_due
  on public.nasabah_payment_schedules(nasabah_id, due_date);

alter table public.setoran
  add column if not exists schedule_id uuid references public.nasabah_payment_schedules(id) on delete set null,
  add column if not exists payment_type text not null default 'installment',
  add column if not exists installment_number integer,
  add column if not exists interest_paid bigint not null default 0,
  add column if not exists principal_paid bigint not null default 0;

alter table public.setoran drop constraint if exists setoran_payment_type_check;
alter table public.setoran
  add constraint setoran_payment_type_check check (payment_type in ('installment', 'interest_only', 'interest_principal'));

alter table public.setoran drop constraint if exists setoran_amount_breakdown_check;
alter table public.setoran
  add constraint setoran_amount_breakdown_check check (interest_paid >= 0 and principal_paid >= 0);

create index if not exists idx_setoran_schedule on public.setoran(schedule_id);

drop trigger if exists set_payment_schedules_updated_at on public.nasabah_payment_schedules;
create trigger set_payment_schedules_updated_at
  before update on public.nasabah_payment_schedules
  for each row execute function public.set_updated_at();

drop trigger if exists audit_payment_schedules on public.nasabah_payment_schedules;
create trigger audit_payment_schedules after insert or update or delete on public.nasabah_payment_schedules
  for each row execute function public.log_audit_event();

alter table public.nasabah_payment_schedules enable row level security;
alter table public.nasabah_payment_schedules force row level security;

drop policy if exists "owner_read_all_payment_schedules" on public.nasabah_payment_schedules;
create policy "owner_read_all_payment_schedules" on public.nasabah_payment_schedules
  for select using (public.is_owner());

drop policy if exists "surveyor_read_own_payment_schedules" on public.nasabah_payment_schedules;
create policy "surveyor_read_own_payment_schedules" on public.nasabah_payment_schedules
  for select using (
    exists (
      select 1 from public.nasabah customer
      where customer.id = nasabah_id
        and customer.surveyor_id = auth.uid()
    )
  );

drop policy if exists "owner_write_all_payment_schedules" on public.nasabah_payment_schedules;
create policy "owner_write_all_payment_schedules" on public.nasabah_payment_schedules
  for all using (public.is_owner())
  with check (public.is_owner());

drop policy if exists "surveyor_write_own_payment_schedules" on public.nasabah_payment_schedules;
create policy "surveyor_write_own_payment_schedules" on public.nasabah_payment_schedules
  for all using (
    public.is_active_user()
    and exists (
      select 1 from public.nasabah customer
      where customer.id = nasabah_id
        and customer.surveyor_id = auth.uid()
    )
  )
  with check (
    public.is_active_user()
    and exists (
      select 1 from public.nasabah customer
      where customer.id = nasabah_id
        and customer.surveyor_id = auth.uid()
    )
  );
