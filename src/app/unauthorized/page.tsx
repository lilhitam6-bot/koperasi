import { ShieldAlert } from 'lucide-react'
import { SignOutButton } from './sign-out-button'

export default function UnauthorizedPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10 text-ink">
      <section className="w-full max-w-lg rounded-lg border border-ink/10 bg-[#fffaf0] p-5 shadow-line sm:p-7">
        <div className="flex items-start gap-3">
          <div className="rounded-md bg-clay/10 p-3 text-clay">
            <ShieldAlert size={24} />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-clay">Akses ditahan</p>
            <h1 className="mt-2 text-2xl font-black">Profil belum aktif</h1>
            <p className="mt-2 text-sm leading-6 text-ink/70">
              Akun Supabase ini belum punya profile aktif untuk LendMap. Minta owner mengaktifkan profile atau mengatur role akun ini.
            </p>
          </div>
        </div>
        <SignOutButton />
      </section>
    </main>
  )
}
