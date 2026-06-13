type RuntimeEnv = Record<string, string | undefined>

export interface SupabaseBrowserEnv {
  url: string
  anonKey: string
}

export interface SupabaseServerEnv {
  url: string
  serviceRoleKey: string
}

export function getSupabaseBrowserEnv(env: RuntimeEnv = process.env): SupabaseBrowserEnv {
  const url = env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    throw new Error('Missing Supabase browser environment: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required')
  }

  return { url, anonKey }
}

export function getSupabaseServerEnv(env: RuntimeEnv = process.env): SupabaseServerEnv {
  const url = env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRoleKey) {
    throw new Error('Missing Supabase server environment: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
  }

  return { url, serviceRoleKey }
}
