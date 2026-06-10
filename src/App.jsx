import { useState, useEffect } from 'react'
import { supabase } from './supabase'
import Login from './Login'
import Dashboard from './pages/Dashboard'
import AdminDashboard from './pages/AdminDashboard'
import LandingPage from './pages/LandingPage'

const ADMIN_EMAIL = 'fajarsiddiqui00@gmail.com'

function App() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => {
      listener?.subscription?.unsubscribe()
    }
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center h-screen bg-gray-100">
      <p className="text-gray-400">Memuat...</p>
    </div>
  )

  if (!user) return <LandingPage />

  if (user.email === ADMIN_EMAIL) {
    return <AdminDashboard user={user} />
  }

  return <Dashboard user={user} />
}

export default App