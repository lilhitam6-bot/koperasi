import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationDir = join(process.cwd(), 'supabase/migrations')
const sql = () =>
  readdirSync(migrationDir)
    .filter((file) => file.endsWith('.sql'))
    .sort()
    .map((file) => readFileSync(join(migrationDir, file), 'utf8'))
    .join('\n')
const hardeningSql = () => readFileSync(join(migrationDir, '20260614160000_setoran_flow_hardening.sql'), 'utf8')

describe('Supabase RLS contract', () => {
  it('keeps surveyor setoran limited to approved active nasabah', () => {
    const text = sql()

    expect(text).toContain("customer.review_status = 'approved'")
    expect(text).toContain("customer.status = 'aktif'")
  })

  it('keeps marker and setoran storage buckets private and image-limited', () => {
    const text = sql()

    expect(text).toContain("values ('marker-photos', 'marker-photos', false, 5242880")
    expect(text).toContain("values ('setoran-photos', 'setoran-photos', false, 5242880")
    expect(text).toContain("array['image/jpeg', 'image/png', 'image/webp']")
  })

  it('keeps new users defaulting to surveyor without trusting role metadata', () => {
    const text = hardeningSql()

    expect(text).toContain("coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1), 'User')")
    expect(text).toContain("'surveyor'")
    expect(text).not.toContain("coalesce(nullif(new.raw_user_meta_data ->> 'role', ''), 'surveyor')")
  })

  it('keeps payment schedules role-isolated with owner override', () => {
    const text = sql()

    expect(text).toContain('create policy "owner_read_all_payment_schedules"')
    expect(text).toContain('create policy "surveyor_read_own_payment_schedules"')
    expect(text).toContain('create policy "surveyor_write_own_payment_schedules"')
    expect(text).toContain('customer.surveyor_id = auth.uid()')
  })
})
