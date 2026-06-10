import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './supabase'
import Dashboard from './pages/Dashboard'
import AdminDashboard from './pages/AdminDashboard'
import LandingPage from './pages/LandingPage'
import HowItWorksPage from './pages/HowItWorksPage'
import ServiceCategoriesPage from './pages/ServiceCategoriesPage'
import ServiceItemsPage from './pages/ServiceItemsPage'

const ADMIN_EMAIL = 'fajarsiddiqui00@gmail.com'

function AppContent() {
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-100">
        <p className="text-gray-400">Memuat...</p>
      </div>
    )
  }

  if (user) {
    if (user.email === ADMIN_EMAIL) {
      return <AdminDashboard user={user} />
    }

    return <Dashboard user={user} />
  }

    return (
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/cara-kerja" element={<HowItWorksPage />} />
        <Route path="/layanan" element={<ServiceCategoriesPage />} />
        <Route path="/layanan/:slug" element={<ServiceItemsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    )
}

function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  )
}

export default App