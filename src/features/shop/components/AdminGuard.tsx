import { useEffect, useState } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { getShopSupabase } from '../lib/supabase'

export default function AdminGuard() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null)

  useEffect(() => {
    let active = true
    const supabase = getShopSupabase()
    void supabase.auth.getSession().then(({ data }) => {
      if (active) setSignedIn(!!data.session)
    }).catch(() => { if (active) setSignedIn(false) })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setSignedIn(!!session)
    })
    return () => { active = false; listener.subscription.unsubscribe() }
  }, [])

  if (signedIn === null) return null
  return signedIn ? <Outlet /> : <Navigate to="/shop/admin/login" replace />
}
