import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { getShopSupabase } from '../../lib/supabase'

export default function AdminLogin() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    void getShopSupabase().auth.getSession().then(({ data }) => {
      if (active && data.session) navigate('/shop/admin/verifikasi', { replace: true })
    })
    return () => { active = false }
  }, [navigate])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    const { error: signInError } = await getShopSupabase().auth.signInWithPassword({ email, password })
    setBusy(false)
    if (signInError) { setError('Email atau kata sandi salah.'); return }
    navigate('/shop/admin/verifikasi', { replace: true })
  }

  return <main className="flex min-h-screen items-center justify-center bg-greenroom-bg px-5 font-greenroom-sans text-greenroom-ink">
    <form onSubmit={submit} className="w-full max-w-md space-y-5 rounded-greenroom-card border border-greenroom-border bg-white p-6">
      <h1 className="text-2xl font-extrabold">Masuk Admin</h1>
      <label className="block font-bold">Email
        <input type="email" required autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)}
          className="mt-2 min-h-11 w-full rounded-greenroom-control border border-greenroom-input-border p-3" />
      </label>
      <label className="block font-bold">Kata sandi
        <input type="password" required autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)}
          className="mt-2 min-h-11 w-full rounded-greenroom-control border border-greenroom-input-border p-3" />
      </label>
      {error && <p role="alert" className="text-greenroom-danger">{error}</p>}
      <button type="submit" disabled={busy} className="min-h-11 w-full rounded-greenroom-control bg-greenroom-primary px-5 font-bold text-white hover:bg-greenroom-primary-hover disabled:opacity-50">
        {busy ? 'Memproses…' : 'Masuk'}
      </button>
    </form>
  </main>
}
