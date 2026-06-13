'use client'

import { createBrowserClient } from '@supabase/ssr'
import { getSupabaseBrowserEnv } from './supabase-env'

export function createLendMapBrowserClient() {
  const env = getSupabaseBrowserEnv()
  return createBrowserClient(env.url, env.anonKey)
}
