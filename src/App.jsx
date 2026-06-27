import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './supabase'
import Login from './Login'
import Dashboard from './pages/Dashboard'
import RequestForm from './pages/RequestForm'
import DetailRequest from './pages/DetailRequest'
import ClientServicesPage from './pages/ClientServicesPage'
import AdminDashboard from './pages/AdminDashboard'
import AdminLayout from './pages/AdminLayout'
import AdminRequestsPage from './pages/AdminRequestsPage'
import AdminServicesPage from './pages/AdminServicesPage'
import AdminStatsPage from './pages/AdminStatsPage'
import AdminAuditLogsPage from './pages/AdminAuditLogsPage'
import AdminArchivePage from './pages/AdminArchivePage'
import AdminDeletedItemsPage from './pages/AdminDeletedItemsPage'
import AdminAccountsPage from './pages/AdminAccountsPage'
import AdminProfilePage from './pages/AdminProfilePage'
import AdminLandingContentPage from './pages/AdminLandingContentPage'
import AdminRevisionSettingsPage from './pages/AdminRevisionSettingsPage'
import AdminSiteBrandingPage from './pages/AdminSiteBrandingPage'
import AdminFreeServicesPage from './pages/AdminFreeServicesPage'
import LandingPage from './pages/LandingPage'
import HowItWorksPage from './pages/HowItWorksPage'
import ServiceCategoriesPage from './pages/ServiceCategoriesPage'
import ServiceItemsPage from './pages/ServiceItemsPage'
import ComingSoonPage from './pages/ComingSoonPage'
import FreeServicesPage from './pages/FreeServicesPage'
import ImageToTablePage from './pages/ImageToTablePage'
import { ADMIN_EMAIL, upsertCurrentUserProfile } from './utils/userProfile'
import { SITE_BRANDING_KEYS, applySiteBrandingToHead, mergeSiteBrandingRows } from './utils/siteBranding'

function ClientServicesRoute({ user }) {
  return <ClientServicesPage user={user} />
}

function AppContent() {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchSiteBranding = async () => {
      const { data, error } = await supabase
        .from('landing_content')
        .select('content_key, content_value')
        .in('content_key', SITE_BRANDING_KEYS)

      if (!error && data) {
        applySiteBrandingToHead(mergeSiteBrandingRows(data))
      }
    }

    fetchSiteBranding()
  }, [])

  useEffect(() => {
    let active = true

    const syncSession = async (session) => {
      const sessionUser = session?.user ?? null
      const syncedProfile = sessionUser ? await upsertCurrentUserProfile(sessionUser) : null

      if (!active) return
      setUser(sessionUser)
      setProfile(syncedProfile)
      setLoading(false)
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      syncSession(session)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      syncSession(session)
    })

    return () => {
      active = false
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

  const isAdmin = user && (profile?.role === 'admin' || String(user.email || '').toLowerCase() === ADMIN_EMAIL.toLowerCase())

  if (isAdmin) {
    return (
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/cara-kerja" element={<HowItWorksPage />} />
        <Route path="/layanan" element={<ServiceCategoriesPage />} />
        <Route path="/layanan/:slug" element={<ServiceItemsPage />} />
        <Route path="/layanan-gratis" element={<FreeServicesPage />} />
        <Route path="/image-to-table" element={<ImageToTablePage />} />
        <Route path="/layanan-gratis/image-to-table" element={<ImageToTablePage />} />
        <Route path="/donate-us" element={<ComingSoonPage />} />
        <Route path="/top-donatur" element={<ComingSoonPage />} />
        <Route path="/kritik-saran" element={<ComingSoonPage />} />
        <Route path="/admin" element={<AdminLayout user={user} />}>
          <Route index element={<AdminDashboard user={user} />} />
          <Route path="requests" element={<AdminRequestsPage user={user} />} />
          <Route path="requests/:requestId" element={<AdminRequestsPage user={user} />} />
          <Route path="services" element={<AdminServicesPage user={user} />} />
          <Route path="stats" element={<AdminStatsPage user={user} />} />
          <Route path="audit-logs" element={<AdminAuditLogsPage user={user} />} />
          <Route path="archive" element={<AdminArchivePage user={user} />} />
          <Route path="deleted-items" element={<AdminDeletedItemsPage user={user} />} />
          <Route path="accounts" element={<AdminAccountsPage user={user} />} />
          <Route path="profile" element={<AdminProfilePage user={user} />} />
          <Route path="landing-content" element={<AdminLandingContentPage user={user} />} />
          <Route path="revision-settings" element={<AdminRevisionSettingsPage user={user} />} />
          <Route path="site-branding" element={<AdminSiteBrandingPage user={user} />} />
          <Route path="free-services" element={<AdminFreeServicesPage user={user} />} />
        </Route>
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
    )
  }

  if (user) {
    return (
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/cara-kerja" element={<HowItWorksPage />} />
        <Route path="/layanan" element={<ServiceCategoriesPage />} />
        <Route path="/layanan/:slug" element={<ServiceItemsPage />} />
        <Route path="/layanan-gratis" element={<FreeServicesPage />} />
        <Route path="/image-to-table" element={<ImageToTablePage />} />
        <Route path="/layanan-gratis/image-to-table" element={<ImageToTablePage />} />
        <Route path="/donate-us" element={<ComingSoonPage />} />
        <Route path="/top-donatur" element={<ComingSoonPage />} />
        <Route path="/kritik-saran" element={<ComingSoonPage />} />
        <Route path="/dashboard" element={<Dashboard user={user} />} />
        <Route path="/client/services" element={<ClientServicesRoute user={user} />} />
        <Route path="/request/new" element={<RequestForm user={user} />} />
        <Route path="/request/:requestId" element={<DetailRequest user={user} />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    )
  }

  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<Login />} />
      <Route path="/cara-kerja" element={<HowItWorksPage />} />
      <Route path="/layanan" element={<ServiceCategoriesPage />} />
      <Route path="/layanan/:slug" element={<ServiceItemsPage />} />
      <Route path="/layanan-gratis" element={<FreeServicesPage />} />
      <Route path="/image-to-table" element={<ImageToTablePage />} />
      <Route path="/layanan-gratis/image-to-table" element={<ImageToTablePage />} />
      <Route path="/donate-us" element={<ComingSoonPage />} />
      <Route path="/top-donatur" element={<ComingSoonPage />} />
      <Route path="/kritik-saran" element={<ComingSoonPage />} />
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
