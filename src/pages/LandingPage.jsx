import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase'
import { DEFAULT_LANDING_CONTENT, mergeLandingContentRows } from '../utils/landingContent'

function LandingPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [content, setContent] = useState(DEFAULT_LANDING_CONTENT)
  const [stats, setStats] = useState({
    total_views: 0,
    total_requests: 0,
    completed_requests: 0,
    active_services: 0,
    free_service_usage: 0
  })
  const [donationVisibility, setDonationVisibility] = useState({
    show_donate_page: true,
    show_top_donors_page: true
  })

  useEffect(() => {
    const fetchLandingContent = async () => {
      const { data, error } = await supabase
        .from('landing_content')
        .select('content_key, content_value')

      if (!error && data) setContent(mergeLandingContentRows(data))
    }

    const fetchDonationVisibility = async () => {
      const { data, error } = await supabase.rpc('get_public_donation_settings')
      const row = Array.isArray(data) && data[0] ? data[0] : null

      if (!error && row) {
        setDonationVisibility({
          show_donate_page: row.show_donate_page !== false && row.is_enabled !== false,
          show_top_donors_page: row.show_top_donors_page !== false
        })
      }
    }

    const trackAndFetchStats = async () => {
      const isLocalhost =
        window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1'

      let visitorId = localStorage.getItem('greenroomid_visitor_id')

      if (!visitorId) {
        visitorId = crypto.randomUUID()
        localStorage.setItem('greenroomid_visitor_id', visitorId)
      }

      const alreadyTrackedThisSession = sessionStorage.getItem('greenroomid_landing_tracked')

      if (!isLocalhost && !alreadyTrackedThisSession) {
        await supabase.rpc('track_page_view', {
          p_visitor_id: visitorId,
          p_path: window.location.pathname
        })

        sessionStorage.setItem('greenroomid_landing_tracked', 'true')
      }

      const [{ data, error }, { data: freeUsageTotal, error: freeUsageError }] = await Promise.all([
        supabase.rpc('get_public_stats'),
        supabase.rpc('get_free_service_usage_total')
      ])

      if (!error && data) {
        let activeServices = data.active_services || data.service_categories || 0

        const { count } = await supabase
          .from('service_items')
          .select('id', { count: 'exact', head: true })
          .eq('is_active', true)

        if (typeof count === 'number') activeServices = count

        setStats({
          total_views: data.total_views || 0,
          total_requests: data.total_requests || 0,
          completed_requests: data.completed_requests || 0,
          active_services: activeServices,
          free_service_usage: freeUsageError ? 0 : Number(freeUsageTotal || 0)
        })
      }
    }

    fetchLandingContent()
    fetchDonationVisibility()
    trackAndFetchStats()
  }, [])

  const handleGoogleLogin = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/dashboard`
      }
    })

    if (error) alert('Error: ' + error.message)
  }

  const formatNumber = (value) => new Intl.NumberFormat('id-ID').format(Number(value || 0))

  const goToLanding = () => {
    if (location.pathname === '/' && !location.search && !location.hash) {
      window.location.reload()
      return
    }

    navigate('/')
  }

  const handleHeaderKeyDown = (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      goToLanding()
    }
  }

  const statItems = useMemo(() => [
    { label: content.stats_total_views, value: stats.total_views },
    { label: content.stats_total_requests, value: stats.total_requests },
    { label: content.stats_completed_requests, value: stats.completed_requests },
    { label: content.stats_active_services, value: stats.active_services },
    { label: content.stats_free_services_usage, value: stats.free_service_usage }
  ], [content, stats])

  const serviceDescription = String(content.menu_services_description || '')
    .replace('{count}', formatNumber(stats.active_services))

  const menuCards = [
    {
      to: '/layanan',
      icon: '💼',
      label: content.menu_services_label,
      description: serviceDescription
    },
    {
      to: '/layanan-gratis',
      icon: '🎁',
      label: content.menu_free_label,
      description: content.menu_free_description
    },
    ...(donationVisibility.show_donate_page !== false
      ? [{
          to: '/donate-us',
          icon: '🤝',
          label: content.menu_donate_label,
          description: content.menu_donate_description
        }]
      : []),
    ...(donationVisibility.show_top_donors_page !== false
      ? [{
          to: '/top-donatur',
          icon: '🏆',
          label: content.menu_top_donatur_label,
          description: content.menu_top_donatur_description
        }]
      : []),
    {
      to: '/kritik-saran',
      icon: '💬',
      label: content.menu_feedback_label,
      description: content.menu_feedback_description
    }
  ]

  const logoUrl = content.site_logo_url || content.site_favicon_url || content.logo_url || '/favicon.svg'

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5 sm:py-6">
        <div
          role="button"
          tabIndex={0}
          onClick={goToLanding}
          onKeyDown={handleHeaderKeyDown}
          className="bg-gray-950 text-white rounded-[2rem] p-4 sm:p-5 shadow-lg cursor-pointer transition hover:bg-black focus:outline-none focus:ring-2 focus:ring-gray-500"
          title="Kembali ke landing page"
        >
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-5">
            <div className="flex items-center gap-4 sm:gap-5 min-w-0">
              <div className="w-24 h-24 sm:w-28 sm:h-28 md:w-32 md:h-32 rounded-3xl bg-white p-2.5 shrink-0 shadow-sm">
                <img
                  src={logoUrl}
                  alt={`${content.brand_name} logo`}
                  onError={(event) => {
                    event.currentTarget.src = '/favicon.svg'
                  }}
                  className="w-full h-full object-contain"
                />
              </div>

              <div className="min-w-0">
                <h1 className="text-2xl sm:text-3xl font-black tracking-tight leading-tight">
                  {content.brand_name}
                </h1>
                <p className="text-sm sm:text-base text-green-300 font-medium mt-1">
                  {content.brand_tagline}
                </p>
                <p className="text-sm text-gray-300 mt-2 max-w-2xl leading-relaxed">
                  {content.header_description}
                </p>
              </div>
            </div>

            <button
              onClick={(event) => {
                event.stopPropagation()
                handleGoogleLogin()
              }}
              className="bg-white text-gray-950 px-5 py-3 rounded-2xl text-sm font-bold hover:bg-gray-100 transition shrink-0"
            >
              {content.login_button}
            </button>
          </div>
        </div>

        <section className="mt-6 bg-white border border-gray-200 rounded-3xl p-5 sm:p-6 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-2 mb-5">
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-gray-900">{content.stats_title}</h2>
              <p className="text-sm text-gray-500 mt-1">{content.stats_subtitle}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {statItems.map((item) => (
              <div key={item.label} className="rounded-2xl bg-gray-50 border border-gray-100 px-4 py-4">
                <p className="text-2xl font-black text-gray-900 leading-none">{formatNumber(item.value)}</p>
                <p className="text-xs text-gray-500 mt-2">{item.label}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-6">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2 mb-4">
            <div>
              <h2 className="text-xl font-bold text-gray-900">{content.menu_title}</h2>
              <p className="text-sm text-gray-500 mt-1">{content.menu_subtitle}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {menuCards.map((card) => (
              <Link
                key={card.to}
                to={card.to}
                className="group bg-white border border-gray-200 rounded-3xl p-5 min-h-44 shadow-sm hover:-translate-y-0.5 hover:shadow-md hover:border-gray-300 transition flex flex-col justify-between"
              >
                <div>
                  <div className="w-11 h-11 rounded-2xl bg-gray-100 flex items-center justify-center text-xl mb-4">
                    {card.icon}
                  </div>
                  <h3 className="font-bold text-gray-900 leading-snug">{card.label}</h3>
                  <p className="text-sm text-gray-500 mt-2 leading-relaxed">{card.description}</p>
                </div>
                <p className="text-xs font-semibold text-green-700 mt-5 group-hover:underline">
                  {content.menu_card_hint}
                </p>
              </Link>
            ))}
          </div>
        </section>

        <section className="mt-6 bg-gray-950 rounded-3xl p-6 sm:p-8 text-white shadow-sm">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
            <div className="max-w-2xl">
              <h2 className="text-2xl font-black mb-3">{content.bottom_cta_title}</h2>
              <p className="text-gray-300 leading-relaxed">{content.bottom_cta_description}</p>
              <div className="mt-4">
                <p className="text-xs text-gray-500 mb-1">{content.contact_label}</p>
                <a
                  href={content.contact_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm font-semibold text-green-300 hover:underline"
                >
                  {content.contact_text}
                </a>
              </div>
            </div>

            <button
              onClick={handleGoogleLogin}
              className="bg-white text-gray-950 px-6 py-3 rounded-2xl text-sm font-bold hover:bg-gray-100 transition shrink-0"
            >
              {content.bottom_cta_button}
            </button>
          </div>
        </section>

        <div className="py-8 text-center text-xs text-gray-400">
          © {new Date().getFullYear()} {content.footer_text}
        </div>
      </div>
    </div>
  )
}

export default LandingPage
