'use client'

import { LogIn } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { createLendMapBrowserClient } from '@/lib/supabase-browser'

export function LoginForm({ nextPath }: { nextPath: string }) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function submitLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorMessage(null)
    setIsSubmitting(true)

    const supabase = createLendMapBrowserClient()
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })

    setIsSubmitting(false)

    if (error) {
      setErrorMessage(error.message || 'Login gagal. Periksa email dan password.')
      return
    }

    router.replace(nextPath)
    router.refresh()
  }

  return (
    <form className="grid gap-4" onSubmit={submitLogin}>
      <label className="grid gap-2 text-sm font-bold">
        Email
        <input
          className="min-h-12 rounded-md border border-ink/15 bg-white px-3 text-base outline-none ring-moss/25 focus:ring-4"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
      </label>

      <label className="grid gap-2 text-sm font-bold">
        Password
        <input
          className="min-h-12 rounded-md border border-ink/15 bg-white px-3 text-base outline-none ring-moss/25 focus:ring-4"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
      </label>

      {errorMessage ? (
        <p className="rounded-md border border-clay/30 bg-clay/10 px-3 py-2 text-sm font-semibold text-clay">{errorMessage}</p>
      ) : null}

      <button
        className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-moss px-4 py-3 text-sm font-black text-white hover:bg-moss/90"
        type="submit"
        disabled={isSubmitting}
      >
        <LogIn size={18} />
        {isSubmitting ? 'Memeriksa...' : 'Masuk'}
      </button>
    </form>
  )
}
