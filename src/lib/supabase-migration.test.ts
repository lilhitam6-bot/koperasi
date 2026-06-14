import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationsDir = join(process.cwd(), 'supabase/migrations')

describe('Supabase foundation migration', () => {
  const sql = () =>
    readdirSync(migrationsDir)
      .filter((file) => file.endsWith('.sql'))
      .sort()
      .map((file) => readFileSync(join(migrationsDir, file), 'utf8'))
      .join('\n')

  it('creates the core lending tables', () => {
    const text = sql()

    for (const table of ['profiles', 'area_markers', 'area_status_history', 'nasabah', 'nasabah_payment_schedules', 'setoran', 'audit_log', 'push_subscriptions']) {
      expect(text).toContain(`create table if not exists public.${table}`)
    }
  })

  it('enables RLS and owner/surveyor access policies', () => {
    const text = sql()

    for (const table of ['profiles', 'area_markers', 'area_status_history', 'nasabah', 'nasabah_payment_schedules', 'setoran', 'audit_log', 'push_subscriptions']) {
      expect(text).toContain(`alter table public.${table} enable row level security`)
      expect(text).toContain(`alter table public.${table} force row level security`)
    }

    expect(text).toContain('create policy "owner_read_all_markers"')
    expect(text).toContain('create policy "surveyor_read_own_markers"')
    expect(text).toContain('create policy "owner_read_audit_log"')
  })

  it('adds audit triggers and storage policies for marker and setoran evidence', () => {
    const text = sql()

    expect(text).toContain('create or replace function public.log_audit_event()')
    expect(text).toContain('create trigger audit_area_markers')
    expect(text).toContain('create trigger audit_nasabah')
    expect(text).toContain('create trigger audit_setoran')
    expect(text).toContain("values ('marker-photos'")
    expect(text).toContain("values ('setoran-photos'")
    expect(text).toContain('create policy "users_upload_own_marker_photos"')
    expect(text).toContain('create policy "users_upload_own_setoran_photos"')
  })

  it('persists the latest foreground surveyor location for realtime map presence', () => {
    const text = sql()

    expect(text).toContain('create table if not exists public.surveyor_locations')
    expect(text).toContain('accuracy_meters double precision')
    expect(text).toContain('captured_at timestamptz not null')
    expect(text).toContain('alter table public.surveyor_locations enable row level security')
    expect(text).toContain('create policy "surveyor_upsert_own_location"')
    expect(text).toContain('create publication supabase_realtime')
    expect(text).toContain('alter publication supabase_realtime add table public.surveyor_locations')
  })

  it('adds owner review workflow for nasabah drafts and hiatus records', () => {
    const text = sql()

    expect(text).toContain("alter table public.nasabah add column if not exists review_status text not null default 'approved'")
    expect(text).toContain("status in ('aktif', 'lunas', 'macet', 'hiatus')")
    expect(text).toContain("review_status in ('draft', 'approved', 'rejected')")
    expect(text).toContain('create policy "surveyor_insert_own_nasabah"')
    expect(text).toContain("review_status = 'draft'")
    expect(text).toContain("status <> 'hiatus'")
    expect(text).toContain('create policy "surveyor_update_own_draft_nasabah"')
    expect(text).toContain("customer.review_status = 'approved'")
    expect(text).toContain("customer.status = 'aktif'")
  })

  it('adds payment product fields and weekly payment schedules', () => {
    const text = sql()

    expect(text).toContain("payment_frequency text not null default 'weekly'")
    expect(text).toContain('installment_count integer not null default 6')
    expect(text).toContain('create table if not exists public.nasabah_payment_schedules')
    expect(text).toContain('original_due_date date not null')
    expect(text).toContain('is_holiday boolean not null default false')
    expect(text).toContain("payment_type text not null default 'installment'")
    expect(text).toContain("payment_type in ('installment', 'interest_only', 'interest_principal')")
  })
})
