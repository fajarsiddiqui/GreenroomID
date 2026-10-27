import { lazy, Suspense, useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { supabase } from './supabase'
import PageMeta from './components/PageMeta'
import { PUBLIC_PAGE_META, PUBLIC_PAGE_SCHEMA } from './utils/publicPageMeta'
import { ADMIN_EMAIL, upsertCurrentUserProfile } from './utils/userProfile'
import { SITE_BRANDING_KEYS, applySiteBrandingToHead, mergeSiteBrandingRows } from './utils/siteBranding'

// Route-level lazy loading: each page is downloaded only when the route is opened.
const Login = lazy(() => import('./Login'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const RequestForm = lazy(() => import('./pages/RequestForm'))
const DetailRequest = lazy(() => import('./pages/DetailRequest'))
const ClientServicesPage = lazy(() => import('./pages/ClientServicesPage'))
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'))
const AdminLayout = lazy(() => import('./pages/AdminLayout'))
const AdminGambarinPage = lazy(() => import('./pages/AdminGambarinPage'))
const AdminRequestsPage = lazy(() => import('./pages/AdminRequestsPage'))
const AdminServicesPage = lazy(() => import('./pages/AdminServicesPage'))
const AdminInvoiceCatalogPage = lazy(() => import('./pages/AdminInvoiceCatalogPage'))
const AdminInvoicesPage = lazy(() => import('./pages/AdminInvoicesPage'))
const AdminInvoiceEditorPage = lazy(() => import('./pages/AdminInvoiceEditorPage'))
const AdminStatsPage = lazy(() => import('./pages/AdminStatsPage'))
const AdminAuditLogsPage = lazy(() => import('./pages/AdminAuditLogsPage'))
const AdminArchivePage = lazy(() => import('./pages/AdminArchivePage'))
const AdminDeletedItemsPage = lazy(() => import('./pages/AdminDeletedItemsPage'))
const AdminAccountsPage = lazy(() => import('./pages/AdminAccountsPage'))
const AdminProfilePage = lazy(() => import('./pages/AdminProfilePage'))
const AdminLandingContentPage = lazy(() => import('./pages/AdminLandingContentPage'))
const AdminRevisionSettingsPage = lazy(() => import('./pages/AdminRevisionSettingsPage'))
const AdminSiteBrandingPage = lazy(() => import('./pages/AdminSiteBrandingPage'))
const LandingPage = lazy(() => import('./pages/LandingPage'))
const HowItWorksPage = lazy(() => import('./pages/HowItWorksPage'))
const ServiceCategoriesPage = lazy(() => import('./pages/ServiceCategoriesPage'))
const ServiceItemsPage = lazy(() => import('./pages/ServiceItemsPage'))
const ServiceDetailPage = lazy(() => import('./pages/ServiceDetailPage'))
const FaqPage = lazy(() => import('./pages/FaqPage'))
const AboutPage = lazy(() => import('./pages/AboutPage'))
const ContactPage = lazy(() => import('./pages/ContactPage'))
const CustomerExperiencePage = lazy(() => import('./pages/CustomerExperiencePage'))
const PrivacyPolicyPage = lazy(() => import('./pages/PrivacyPolicyPage'))
const TermsConditionsPage = lazy(() => import('./pages/TermsConditionsPage'))
const RevisionPolicyPage = lazy(() => import('./pages/RevisionPolicyPage'))
const ComingSoonPage = lazy(() => import('./pages/ComingSoonPage'))
const ClientProfilePage = lazy(() => import('./pages/ClientProfilePage'))
const PublicDynamicFormPage = lazy(() => import('./pages/PublicDynamicFormPage'))
const ClientFormWorkspacePage = lazy(() => import('./pages/ClientFormWorkspacePage'))
const AdminFormsPage = lazy(() => import('./pages/AdminFormsPage'))
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'))
const ShopRoutes = lazy(() => import('./features/shop/ShopRoutes'))
const GambarinPage = lazy(() => import('./features/gambarin/GambarinPage'))
const TotpPage = lazy(() => import('./pages/TotpPage.jsx'))
const AdminTotpPage = lazy(() => import('./pages/AdminTotpPage.jsx'))


function ClientServicesRoute({ user }) {
  return <ClientServicesPage user={user} />
}

function withPageMeta(path, element) {
  return <PageMeta meta={PUBLIC_PAGE_META[path]} schema={PUBLIC_PAGE_SCHEMA[path]}>{element}</PageMeta>
}

function renderPublicRoutes() {
  return (
    <>
      <Route path="/" element={<LandingPage />} />
      <Route path="/GambarinAI" element={withPageMeta('/GambarinAI', <GambarinPage />)} />
      <Route path="/cara-kerja" element={withPageMeta('/cara-kerja', <HowItWorksPage />)} />
      <Route path="/layanan" element={withPageMeta('/layanan', <ServiceCategoriesPage />)} />
      <Route path="/layanan/:categorySlug/:serviceSlug" element={<ServiceDetailPage />} />
      <Route path="/layanan/:slug" element={<ServiceItemsPage />} />
      <Route path="/faq" element={withPageMeta('/faq', <FaqPage />)} />
      <Route path="/tentang-kami" element={withPageMeta('/tentang-kami', <AboutPage />)} />
      <Route path="/kontak" element={withPageMeta('/kontak', <ContactPage />)} />
      <Route path="/pengalaman-pelanggan" element={withPageMeta('/pengalaman-pelanggan', <CustomerExperiencePage />)} />
      <Route path="/kebijakan-privasi" element={withPageMeta('/kebijakan-privasi', <PrivacyPolicyPage />)} />
      <Route path="/syarat-ketentuan" element={withPageMeta('/syarat-ketentuan', <TermsConditionsPage />)} />
      <Route path="/kebijakan-revisi" element={withPageMeta('/kebijakan-revisi', <RevisionPolicyPage />)} />
      <Route path="/kritik-saran" element={withPageMeta('/kritik-saran', <ComingSoonPage />)} />
      <Route path="/akses-totp" element={<TotpPage view="choice" />} />
      <Route path="/akses-totp/publik" element={<TotpPage view="public" />} />
      <Route path="/akses-totp/greenroomid" element={<TotpPage view="greenroomid" />} />
      <Route path="/akses-totp/kode" element={<TotpPage view="code" />} />
      <Route path="/f/:slug" element={<PublicDynamicFormPage />} />
    </>
  )
}

function PageLoadingFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100 px-6" role="status" aria-live="polite">
      <div className="text-center">
        <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-gray-800" />
        <p className="text-sm text-gray-500">Memuat halaman...</p>
      </div>
    </div>
  )
}

function AppContent() {
  const location = useLocation()
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

  const privatePathPrefixes = [
    '/admin',
    '/dashboard',
    '/profile',
    '/client',
    '/request',
  ]
  const isPrivatePath = privatePathPrefixes.some((path) => (
    location.pathname === path || location.pathname.startsWith(`${path}/`)
  ))

  if (loading && isPrivatePath) {
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
        <Route path="/shop/*" element={<Suspense fallback={null}><ShopRoutes /></Suspense>} />
        {renderPublicRoutes()}
        <Route path="/admin" element={<AdminLayout user={user} />}>
          <Route path="forms" element={<AdminFormsPage user={user} />} />
          <Route path="totp" element={<AdminTotpPage />} />
          <Route index element={<AdminDashboard user={user} />} />
          <Route path="gambarin" element={<AdminGambarinPage />} />
          <Route path="requests" element={<AdminRequestsPage user={user} />} />
          <Route path="requests/:requestId" element={<AdminRequestsPage user={user} />} />
          <Route path="services" element={<AdminServicesPage user={user} />} />
          <Route path="invoices" element={<AdminInvoicesPage user={user} />} />
          <Route path="invoices/new" element={<AdminInvoiceEditorPage key={`new-${location.search}`} user={user} />} />
          <Route path="invoices/catalog" element={<AdminInvoiceCatalogPage user={user} />} />
          <Route path="invoices/:invoiceId" element={<AdminInvoiceEditorPage key={location.pathname} user={user} />} />
          <Route path="stats" element={<AdminStatsPage user={user} />} />
          <Route path="audit-logs" element={<AdminAuditLogsPage user={user} />} />
          <Route path="archive" element={<AdminArchivePage user={user} />} />
          <Route path="deleted-items" element={<AdminDeletedItemsPage user={user} />} />
          <Route path="accounts" element={<AdminAccountsPage user={user} />} />
          <Route path="profile" element={<AdminProfilePage user={user} />} />
          <Route path="landing-content" element={<AdminLandingContentPage user={user} />} />
          <Route path="revision-settings" element={<AdminRevisionSettingsPage user={user} />} />
          <Route path="site-branding" element={<AdminSiteBrandingPage user={user} />} />
        </Route>
        <Route path="*" element={isPrivatePath ? <Navigate to="/admin" replace /> : <NotFoundPage />} />
      </Routes>
    )
  }

  if (user) {
    return (
      <Routes>
        <Route path="/shop/*" element={<Suspense fallback={null}><ShopRoutes /></Suspense>} />
        {renderPublicRoutes()}
        <Route path="/dashboard" element={<Dashboard user={user} />} />
        <Route path="/profile" element={<ClientProfilePage user={user} />} />
        <Route path="/client/profile" element={<ClientProfilePage user={user} />} />
        <Route path="/client/services" element={<ClientServicesRoute user={user} />} />
        <Route path="/request/new" element={<RequestForm user={user} />} />
        <Route path="/request/:requestId" element={<DetailRequest user={user} />} />
        <Route path="/request/:requestId/form" element={<ClientFormWorkspacePage user={user} />} />
        <Route path="*" element={isPrivatePath ? <Navigate to="/dashboard" replace /> : <NotFoundPage />} />
      </Routes>
    )
  }

  return (
    <Routes>
      <Route path="/shop/*" element={<Suspense fallback={null}><ShopRoutes /></Suspense>} />
      {renderPublicRoutes()}
      <Route path="/login" element={<Login />} />
      <Route path="*" element={isPrivatePath ? <Navigate to="/" replace /> : <NotFoundPage />} />
    </Routes>
  )
}

function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<PageLoadingFallback />}>
        <AppContent />
      </Suspense>
    </BrowserRouter>
  )
}

export default App
