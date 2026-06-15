import { Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { DEFAULT_LANDING_CONTENT, mergeLandingContentRows } from '../utils/landingContent'

function LandingPage() {
  const [content, setContent] = useState(DEFAULT_LANDING_CONTENT)
  const [stats, setStats] = useState({
    total_views: 0,
    total_requests: 0,
    completed_requests: 0,
    active_services: 0
  })

  useEffect(() => {
    const fetchLandingContent = async () => {
      const { data, error } = await supabase
        .from('landing_content')
        .select('content_key, content_value')

      if (!error && data) setContent(mergeLandingContentRows(data))
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

      const { data, error } = await supabase.rpc('get_public_stats')

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
          active_services: activeServices
        })
      }
    }

    fetchLandingContent()
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

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="max-w-6xl mx-auto px-6 py-6">
        <div className="flex items-center justify-between mb-14">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{content.brand_name}</h1>
            <p className="text-sm text-gray-500">{content.brand_tagline}</p>
          </div>

          <button
            onClick={handleGoogleLogin}
            className="bg-gray-900 text-white px-5 py-2 rounded-xl text-sm hover:bg-gray-800 transition"
          >
            {content.login_button}
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-start mb-16">
          <div className="pt-6">
            <p className="inline-block bg-green-100 text-green-700 text-xs font-medium px-3 py-1 rounded-full mb-4">
              {content.hero_badge}
            </p>

            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 leading-tight mb-5">
              {content.hero_title}
            </h2>

            <p className="text-gray-600 text-lg mb-8 leading-relaxed">
              {content.hero_description}
            </p>

            <div>
            <div className="flex flex-col sm:flex-row gap-3 mb-4">
                <button
                onClick={handleGoogleLogin}
                className="bg-blue-600 text-white px-6 py-3 rounded-xl text-sm font-medium hover:bg-blue-700 transition"
                >
                {content.primary_cta}
                </button>

                <Link
                  to="/cara-kerja"
                  className="bg-white text-gray-700 border border-gray-200 px-6 py-3 rounded-xl text-sm font-medium hover:bg-gray-50 transition text-center"
                >
                  {content.secondary_cta}
                </Link>
            </div>

            <div className="bg-white border border-gray-200 rounded-2xl px-4 py-3 inline-block shadow-sm">
                <p className="text-xs text-gray-400 mb-1">{content.contact_label}</p>
                <a
                href={content.contact_url}
                target="_blank"
                rel="noreferrer"
                className="text-sm font-medium text-green-600 hover:underline"
                >
                {content.contact_text}
                </a>
            </div>
            </div>
          </div>

          <div className="space-y-5">
            <div className="bg-white rounded-3xl shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-bold text-gray-900">{content.stats_title}</h3>
                  <p className="text-xs text-gray-400">{content.stats_subtitle}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-50 rounded-2xl p-4">
                  <p className="text-2xl font-bold text-gray-900">{stats.total_views}</p>
                  <p className="text-xs text-gray-500">{content.stats_total_views}</p>
                </div>

                <div className="bg-gray-50 rounded-2xl p-4">
                  <p className="text-2xl font-bold text-gray-900">{stats.total_requests}</p>
                  <p className="text-xs text-gray-500">{content.stats_total_requests}</p>
                </div>

                <div className="bg-gray-50 rounded-2xl p-4">
                  <p className="text-2xl font-bold text-gray-900">{stats.completed_requests}</p>
                  <p className="text-xs text-gray-500">{content.stats_completed_requests}</p>
                </div>

                <Link
                  to="/layanan"
                  className="bg-green-50 border border-green-200 rounded-2xl p-4 text-left hover:bg-green-100 transition cursor-pointer"
                >
                  <p className="text-2xl font-bold text-green-700">{stats.active_services}</p>
                  <p className="text-xs text-gray-500">{content.stats_active_services}</p>
                  <p className="text-[11px] text-green-700 mt-2 font-semibold">{content.stats_services_hint}</p>
                </Link>
              </div>
            </div>

            <div className="bg-white rounded-3xl shadow-sm p-6">
              <div className="bg-gray-50 rounded-2xl p-5 mb-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="font-bold text-gray-800">{content.sample_request_title}</p>
                  <span className="text-xs bg-yellow-100 text-yellow-700 px-3 py-1 rounded-full">
                    {content.sample_request_status}
                  </span>
                </div>
                <p className="text-sm text-gray-500 mb-3">
                  {content.sample_request_description}
                </p>
                <div className="flex gap-2 text-xs text-gray-400">
                  <span>{content.sample_request_category}</span>
                  <span>{content.sample_request_file}</span>
                </div>
              </div>

              <div className="bg-blue-50 rounded-2xl p-5 mb-4">
                <p className="font-bold text-blue-800 mb-2">{content.discussion_title}</p>
                <p className="text-sm text-blue-700">
                  {content.discussion_description}
                </p>
              </div>

              <div className="bg-green-50 rounded-2xl p-5">
                <p className="font-bold text-green-800 mb-2">{content.result_title}</p>
                <p className="text-sm text-green-700">
                  {content.result_description}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-gray-900 rounded-3xl p-8 text-center">
          <h2 className="text-2xl font-bold text-white mb-3">
            {content.bottom_cta_title}
          </h2>
          <p className="text-gray-300 mb-6">
            {content.bottom_cta_description}
          </p>
          <button
            onClick={handleGoogleLogin}
            className="bg-white text-gray-900 px-6 py-3 rounded-xl text-sm font-medium hover:bg-gray-100 transition"
          >
            {content.bottom_cta_button}
          </button>
        </div>

        <div className="py-8 text-center text-xs text-gray-400">
          © {new Date().getFullYear()} {content.footer_text}
        </div>
      </div>
    </div>
  )
}

export default LandingPage