'use client'

import { LogOut } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { createLendMapBrowserClient } from '@/lib/supabase-browser'

export function SignOutButton() {
  const router = useRouter()
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isSigningOut, setIsSigningOut] = useState(false)

  async function signOut() {
    setErrorMessage(null)
    setIsSigningOut(true)

    const supabase = createLendMapBrowserClient()
    const { error } = await supabase.auth.signOut()

    setIsSigningOut(false)

    if (error) {
      setErrorMessage(error.message || 'Logout gagal. Coba lagi.')
      return
    }

    router.replace('/login')
    router.refresh()
  }

  return (
    <div className="mt-6 grid gap-3">
      <button
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded border border-outline bg-white px-4 text-sm font-black text-ink hover:bg-clay/10"
        onClick={signOut}
        type="button"
        disabled={isSigningOut}
      >
        <LogOut size={16} />
        {isSigningOut ? 'Keluar...' : 'Logout dan ganti akun'}
      </button>
      {errorMessage ? <p className="rounded border border-clay/30 bg-clay/10 px-3 py-2 text-sm font-semibold text-clay">{errorMessage}</p> : null}
    </div>
  )
}
