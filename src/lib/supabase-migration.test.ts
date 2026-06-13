import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationPath = join(process.cwd(), 'supabase/migrations/20260613150000_initial_foundation.sql')

describe('Supabase foundation migration', () => {
  const sql = () => readFileSync(migrationPath, 'utf8')

  it('creates the core lending tables', () => {
    const text = sql()

    for (const table of ['profiles', 'area_markers', 'area_status_history', 'nasabah', 'setoran', 'audit_log', 'push_subscriptions']) {
      expect(text).toContain(`create table if not exists public.${table}`)
    }
  })

  it('enables RLS and owner/surveyor access policies', () => {
    const text = sql()

    for (const table of ['profiles', 'area_markers', 'area_status_history', 'nasabah', 'setoran', 'audit_log', 'push_subscriptions']) {
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
})
