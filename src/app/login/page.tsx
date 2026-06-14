import { LoginForm } from './login-form'
import { getPostLoginPath } from '@/lib/auth'

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const params = await searchParams
  const nextPath = getPostLoginPath(params.next ?? null)

  return (
    <main className="flex min-h-screen items-center justify-center bg-field px-4 py-10 text-ink">
      <section className="w-full max-w-md rounded border border-outline bg-white p-5 shadow-line sm:p-7">
        <div className="mb-6">
          <p className="text-xs font-black uppercase text-primary">LendMap PWA</p>
          <h1 className="mt-2 text-2xl font-black">Masuk ke operasi lapangan</h1>
          <p className="mt-2 text-sm leading-6 text-ink/70">Gunakan akun Supabase yang dibuat owner untuk mengakses workspace.</p>
        </div>
        <LoginForm nextPath={nextPath} />
      </section>
    </main>
  )
}
