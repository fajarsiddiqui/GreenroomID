import { useEffect, useState } from 'react'
import { Link, Navigate, Outlet } from 'react-router-dom'
import { supabase } from '../../../supabase'

export default function AdminGuard() {
  const [access, setAccess] = useState<'loading' | 'signed-out' | 'denied' | 'admin'>('loading')

  useEffect(() => {
    let active = true
    async function check(session: Awaited<ReturnType<typeof supabase.auth.getSession>>['data']['session']) {
      if (!session) { if (active) setAccess('signed-out'); return }
      const { data, error } = await supabase.rpc('is_admin')
      if (active) setAccess(!error && data === true ? 'admin' : 'denied')
    }
    void supabase.auth.getSession().then(({ data }) => check(data.session))
      .catch(() => { if (active) setAccess('signed-out') })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      void check(session)
    })
    return () => { active = false; listener.subscription.unsubscribe() }
  }, [])

  if (access === 'loading') return null
  if (access === 'signed-out') return <Navigate to="/" replace />
  if (access === 'denied') return <main className="min-h-screen bg-greenroom-bg p-6 font-greenroom-sans text-greenroom-ink"><h1>Akses ditolak</h1><Link to="/">Kembali ke beranda</Link></main>
  return <Outlet />
}
