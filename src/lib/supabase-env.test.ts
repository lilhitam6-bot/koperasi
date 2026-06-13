import { describe, expect, it } from 'vitest'
import { getSupabaseBrowserEnv, getSupabaseServerEnv } from './supabase-env'

describe('getSupabaseBrowserEnv', () => {
  it('returns public Supabase URL and anon key when both are present', () => {
    const env = getSupabaseBrowserEnv({
      NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
    })

    expect(env).toEqual({
      url: 'https://project.supabase.co',
      anonKey: 'anon-key',
    })
  })

  it('throws a clear setup error when public Supabase env is missing', () => {
    expect(() => getSupabaseBrowserEnv({})).toThrow('Missing Supabase browser environment')
  })
})

describe('getSupabaseServerEnv', () => {
  it('keeps the service role key server-only', () => {
    const env = getSupabaseServerEnv({
      NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
    })

    expect(env).toEqual({
      url: 'https://project.supabase.co',
      serviceRoleKey: 'service-role-key',
    })
  })
})
