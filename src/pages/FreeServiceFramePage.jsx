import { Link } from 'react-router-dom'
import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../supabase'

function getVisitorId() {
  let visitorId = localStorage.getItem('greenroomid_visitor_id')

  if (!visitorId) {
    visitorId = crypto.randomUUID()
    localStorage.setItem('greenroomid_visitor_id', visitorId)
  }

  return visitorId
}

function FreeServiceFramePage({ serviceSlug, title, description, appSrc }) {
  const iframeRef = useRef(null)
  const [serviceStatus, setServiceStatus] = useState({
    status: 'active',
    status_message: 'Layanan bisa digunakan.'
  })
  const [logoUrl, setLogoUrl] = useState('/favicon.svg')
  const [loading, setLoading] = useState(true)

  const postBrandingToIframe = useCallback((targetWindow = iframeRef.current?.contentWindow) => {
    if (!targetWindow) return

    targetWindow.postMessage({
      type: 'greenroomid-branding',
      logoUrl
    }, window.location.origin)
  }, [logoUrl])

  useEffect(() => {
    const fetchPageData = async () => {
      setLoading(true)

      const [{ data: services, error: serviceError }, { data: branding, error: brandingError }] = await Promise.all([
        supabase.rpc('get_public_free_services'),
        supabase
          .from('landing_content')
          .select('content_key, content_value')
          .in('content_key', ['site_logo_url', 'site_favicon_url', 'logo_url'])
      ])

      if (!serviceError && Array.isArray(services)) {
        const service = services.find((item) => item.slug === serviceSlug)
        if (service) setServiceStatus(service)
      }

      if (!brandingError && Array.isArray(branding)) {
        const brandingMap = Object.fromEntries(branding.map((item) => [item.content_key, item.content_value]))
        setLogoUrl(brandingMap.site_logo_url || brandingMap.site_favicon_url || brandingMap.logo_url || '/favicon.svg')
      }

      setLoading(false)
    }

    fetchPageData()
  }, [serviceSlug])

  useEffect(() => {
    postBrandingToIframe()
  }, [postBrandingToIframe])

  useEffect(() => {
    const handleUsageEvent = async (event) => {
      if (event.origin !== window.location.origin) return
      const payload = event.data || {}

      if (payload.type === 'greenroomid-tool-ready' && payload.service === serviceSlug) {
        postBrandingToIframe(event.source)
        return
      }

      if (payload.type !== 'greenroomid-free-service-event') return
      if (payload.service !== serviceSlug) return

      await supabase.rpc('track_free_service_usage', {
        p_service_slug: serviceSlug,
        p_action: payload.action || 'use',
        p_visitor_id: getVisitorId()
      })
    }

    window.addEventListener('message', handleUsageEvent)
    return () => window.removeEventListener('message', handleUsageEvent)
  }, [postBrandingToIframe, serviceSlug])

  const isAvailable = (serviceStatus.status || 'active') === 'active'

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="max-w-[1600px] mx-auto px-3 sm:px-5 py-4 sm:py-5">
        <div className="bg-white border border-gray-200 rounded-3xl shadow-sm p-4 sm:p-5 mb-4">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            <div>
              <Link to="/layanan-gratis" className="text-sm font-semibold text-green-700 hover:underline">
                ← Kembali ke Layanan Gratis
              </Link>
              <h1 className="text-2xl sm:text-3xl font-black text-gray-900 mt-2">{title}</h1>
              <p className="text-sm text-gray-500 mt-1 max-w-3xl">{description}</p>
              <p className="text-xs sm:text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-2xl px-4 py-3 mt-3 max-w-4xl">
                File dan isi dokumen tidak tersimpan di database atau server GreenroomID. Semua proses berjalan di browser kamu, jadi simpan hasil download/print dengan baik.
              </p>
            </div>
          </div>
        </div>

        {loading && (
          <div className="bg-white border border-gray-200 rounded-3xl shadow-sm p-10 text-center text-gray-400">
            Memuat aplikasi...
          </div>
        )}

        {!loading && !isAvailable && (
          <div className="bg-white border border-gray-200 rounded-3xl shadow-sm p-10 text-center">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-600 mb-3">
              {serviceStatus.status === 'maintenance' ? 'Maintenance' : 'Nonaktif'}
            </p>
            <h2 className="text-2xl font-black text-gray-900 mb-3">{title} belum tersedia</h2>
            <p className="text-gray-500 max-w-xl mx-auto">
              {serviceStatus.status_message || 'Layanan sedang belum bisa digunakan.'}
            </p>
          </div>
        )}

        {!loading && isAvailable && (
          <div className="bg-white border border-gray-200 rounded-3xl shadow-sm overflow-hidden">
            <iframe
              ref={iframeRef}
              title={title}
              src={appSrc}
              onLoad={() => postBrandingToIframe()}
              className="w-full h-[calc(100vh-210px)] min-h-[720px] border-0 bg-white"
            />
          </div>
        )}
      </div>
    </div>
  )
}

export default FreeServiceFramePage
