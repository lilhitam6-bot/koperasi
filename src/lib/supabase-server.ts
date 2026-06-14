import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getSupabaseBrowserEnv, getSupabaseServerEnv } from './supabase-env'

export async function createLendMapServerClient() {
  const cookieStore = await cookies()
  const env = getSupabaseBrowserEnv()

  return createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          try {
            cookieStore.set(name, value, options)
          } catch {
            return
          }
        })
      },
    },
  })
}

export function createLendMapServiceRoleClient() {
  const env = getSupabaseServerEnv()

  return createServerClient(env.url, env.serviceRoleKey, {
    cookies: {
      getAll() {
        return []
      },
      setAll() {
        return
      },
    },
  })
}
