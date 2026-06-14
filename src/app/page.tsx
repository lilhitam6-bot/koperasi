import { LendMapApp } from '@/components/lendmap-app'
import { requireActiveProfile } from '@/lib/auth'
import { createLendMapServerClient } from '@/lib/supabase-server'
import type { Profile } from '@/types'
import { redirect } from 'next/navigation'

export default async function Home() {
  const supabase = await createLendMapServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, role, is_active, max_nasabah, created_at, updated_at')
    .eq('id', user.id)
    .maybeSingle()

  const activeProfile = requireActiveProfile(profile as Profile | null)

  if (!activeProfile) {
    redirect('/unauthorized')
  }

  return <LendMapApp currentProfile={activeProfile} />
}
