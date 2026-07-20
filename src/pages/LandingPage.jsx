import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

import { supabase } from '../supabase'
import {
  DEFAULT_LANDING_CONTENT,
  LANDING_BACKGROUND_DEFAULT,
  mergeLandingContentRows
} from '../utils/landingContent'
import '../styles/landing-v3.css'

const SCENE_COUNT = 4
const ICON_PATHS = {
  arrow: (
    <>
      <path d="M5 12h14" />
      <path d="m14 7 5 5-5 5" />
    </>
  ),
  chevronLeft: <path d="m15 18-6-6 6-6" />,
  chevronRight: <path d="m9 18 6-6-6-6" />,
  check: <path d="m5 12 4 4L19 6" />,
  dashboard: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="2" />
      <rect x="14" y="3" width="7" height="7" rx="2" />
      <rect x="3" y="14" width="7" height="7" rx="2" />
      <rect x="14" y="14" width="7" height="7" rx="2" />
    </>
  ),
  services: (
    <>
      <path d="M4 7.5 12 3l8 4.5-8 4.5-8-4.5Z" />
      <path d="m4 12 8 4.5 8-4.5" />
      <path d="m4 16.5 8 4.5 8-4.5" />
    </>
  ),
  free: (
    <>
      <path d="M12 3v18" />
      <path d="M17.5 6.5c-.8-1-2.1-1.5-3.8-1.5-2.3 0-4.2 1.2-4.2 3.4 0 5.1 8.4 2.3 8.4 7.4 0 2.1-1.9 3.7-4.7 3.7-2 0-3.7-.7-4.7-2" />
    </>
  ),
  learning: (
    <>
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H12v17H6.5A2.5 2.5 0 0 0 4 22.5v-17Z" />
      <path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H12v17h5.5a2.5 2.5 0 0 1 2.5 2.5v-17Z" />
    </>
  ),
  message: (
    <>
      <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v8Z" />
      <path d="M8 9h8" />
      <path d="M8 13h5" />
    </>
  ),
  spark: (
    <>
      <path d="m12 3-1.25 3.75L7 8l3.75 1.25L12 13l1.25-3.75L17 8l-3.75-1.25L12 3Z" />
      <path d="m5 14-.75 2.25L2 17l2.25.75L5 20l.75-2.25L8 17l-2.25-.75L5 14Z" />
      <path d="m19 14-.75 2.25L16 17l2.25.75L19 20l.75-2.25L22 17l-2.25-.75L19 14Z" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>
  )
}

function Icon({ name, className = '' }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {ICON_PATHS[name] || ICON_PATHS.spark}
    </svg>
  )
}

function SceneArrowIcon({ direction }) {
  const isLeft = direction === 'left'
  const gradientId = `gr-scene-arrow-gradient-${direction}`

  return (
    <svg
      aria-hidden="true"
      className="gr-scene-arrow-icon"
      viewBox="0 0 32 48"
      fill="none"
    >
      <defs>
        <linearGradient
          id={gradientId}
          x1={isLeft ? '28' : '4'}
          y1="5"
          x2={isLeft ? '4' : '28'}
          y2="43"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.48" stopColor="#d8e0e1" />
          <stop offset="1" stopColor="#050708" />
        </linearGradient>
      </defs>
      <path
        d={isLeft ? 'M23 7 8 24l15 17' : 'M9 7l15 17L9 41'}
        stroke={`url(#${gradientId})`}
        strokeWidth="4.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value))
}

function LandingPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const scrollAreaRef = useRef(null)
  const stageRef = useRef(null)
  const activeSceneRef = useRef(0)

  const [activeScene, setActiveScene] = useState(0)
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
    let active = true

    const fetchLandingContent = async () => {
      const { data, error } = await supabase
        .from('landing_content')
        .select('content_key, content_value')

      if (active && !error && data) setContent(mergeLandingContentRows(data))
    }

    const fetchDonationVisibility = async () => {
      const { data, error } = await supabase.rpc('get_public_donation_settings')
      const row = Array.isArray(data) && data[0] ? data[0] : null

      if (active && !error && row) {
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
        visitorId =
          typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
            ? crypto.randomUUID()
            : `visitor-${Date.now()}-${Math.random().toString(16).slice(2)}`
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
        if (!active) return

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

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let animationFrame = 0

    const updateScrollScene = () => {
      animationFrame = 0
      const scrollArea = scrollAreaRef.current
      const stage = stageRef.current
      if (!scrollArea || !stage) return

      const rect = scrollArea.getBoundingClientRect()
      const scrollableDistance = Math.max(1, scrollArea.offsetHeight - window.innerHeight)
      const progress = clamp(-rect.top / scrollableDistance, 0, 1)
      const nextScene = clamp(Math.round(progress * (SCENE_COUNT - 1)), 0, SCENE_COUNT - 1)

      stage.style.setProperty('--landing-progress', progress.toFixed(4))
      stage.style.setProperty('--landing-shift', `${(-10 * progress).toFixed(2)}px`)
      stage.style.setProperty('--landing-scale', (1.035 + progress * 0.012).toFixed(4))

      if (activeSceneRef.current !== nextScene) {
        activeSceneRef.current = nextScene
        setActiveScene(nextScene)
      }
    }

    const scheduleUpdate = () => {
      if (!animationFrame) animationFrame = window.requestAnimationFrame(updateScrollScene)
    }

    updateScrollScene()
    window.addEventListener('scroll', scheduleUpdate, { passive: true })
    window.addEventListener('resize', scheduleUpdate)

    return () => {
      window.removeEventListener('scroll', scheduleUpdate)
      window.removeEventListener('resize', scheduleUpdate)
      if (animationFrame) window.cancelAnimationFrame(animationFrame)
    }
  }, [])

  const handleGoogleLogin = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/dashboard`
      }
    })

    if (error) alert(`Error: ${error.message}`)
  }

  const handleDashboardClick = async () => {
    const { data, error } = await supabase.auth.getSession()

    if (!error && data?.session?.user) {
      navigate('/dashboard')
      return
    }

    navigate('/login')
  }

  const formatNumber = (value) => new Intl.NumberFormat('id-ID').format(Number(value || 0))

  const scrollToScene = (sceneIndex) => {
    const scrollArea = scrollAreaRef.current
    if (!scrollArea) return

    const scrollableDistance = Math.max(1, scrollArea.offsetHeight - window.innerHeight)
    const targetTop = scrollArea.offsetTop + (scrollableDistance * sceneIndex) / (SCENE_COUNT - 1)
    window.scrollTo({ top: targetTop, behavior: 'smooth' })
  }

  const showPreviousScene = () => {
    scrollToScene(Math.max(0, activeSceneRef.current - 1))
  }

  const showNextScene = () => {
    scrollToScene(Math.min(SCENE_COUNT - 1, activeSceneRef.current + 1))
  }

  const goToLanding = () => {
    if (location.pathname === '/' && !location.search && !location.hash) {
      scrollToScene(0)
      return
    }
    navigate('/')
  }

  const handlePointerMove = (event) => {
    const stage = stageRef.current
    if (!stage) return

    const rect = stage.getBoundingClientRect()
    const pointerX = ((event.clientX - rect.left) / rect.width) * 100
    const pointerY = ((event.clientY - rect.top) / rect.height) * 100
    stage.style.setProperty('--pointer-x', `${pointerX.toFixed(2)}%`)
    stage.style.setProperty('--pointer-y', `${pointerY.toFixed(2)}%`)
  }

  const statItems = useMemo(
    () => [
      { label: content.stats_total_views, value: stats.total_views },
      { label: content.stats_total_requests, value: stats.total_requests },
      { label: content.stats_completed_requests, value: stats.completed_requests },
      { label: content.stats_active_services, value: stats.active_services },
      { label: content.stats_free_services_usage, value: stats.free_service_usage }
    ],
    [content, stats]
  )

  const serviceDescription = String(content.menu_services_description || '').replace(
    '{count}',
    formatNumber(stats.active_services)
  )

  const menuCards = useMemo(
    () => [
      {
        to: '/layanan',
        icon: 'services',
        label: content.menu_services_label,
        description: serviceDescription
      },
      {
        to: '/layanan-gratis',
        icon: 'free',
        label: content.menu_free_label,
        description: content.menu_free_description
      },
      {
        to: '/ruang-belajar',
        icon: 'learning',
        label: content.menu_learning_label || 'Ruang Belajar',
        description:
          content.menu_learning_description ||
          'Baca hasil pembelajaran artikel ilmiah yang dipublikasikan.'
      },
      ...(donationVisibility.show_donate_page !== false
        ? [
            {
              to: '/donate-us',
              icon: 'spark',
              label: content.menu_donate_label,
              description: content.menu_donate_description
            }
          ]
        : []),
      ...(donationVisibility.show_top_donors_page !== false
        ? [
            {
              to: '/top-donatur',
              icon: 'spark',
              label: content.menu_top_donatur_label,
              description: content.menu_top_donatur_description
            }
          ]
        : []),
      {
        to: '/kritik-saran',
        icon: 'message',
        label: content.menu_feedback_label,
        description: content.menu_feedback_description
      }
    ],
    [content, donationVisibility, serviceDescription]
  )

  const logoUrl =
    content.site_logo_url || content.site_favicon_url || content.logo_url || '/favicon.svg'

  const sceneLabels = [
    content.nav_home_label,
    content.nav_services_label,
    content.nav_workspace_label,
    content.nav_activity_label
  ]

  const trustItems = [
    content.trust_point_1,
    content.trust_point_2,
    content.trust_point_3
  ].filter(Boolean)

  const freeUsageDescription = String(content.free_usage_template || '{count} penggunaan tercatat').replace(
    '{count}',
    formatNumber(stats.free_service_usage)
  )

  const backgroundUrl = content.landing_background_url || LANDING_BACKGROUND_DEFAULT
  const backgroundPosition = content.landing_background_position || 'center center'

  return (
    <div
      ref={scrollAreaRef}
      className="gr-landing-scroll"
      style={{ minHeight: `${SCENE_COUNT * 100}svh` }}
    >
      <div
        ref={stageRef}
        className="gr-landing-stage"
        onPointerMove={handlePointerMove}
      >
        <div className="gr-scene-background" aria-hidden="true">
          <img
            src={backgroundUrl}
            alt=""
            style={{ objectPosition: backgroundPosition }}
            onError={(event) => {
              if (event.currentTarget.getAttribute('src') === LANDING_BACKGROUND_DEFAULT) return
              event.currentTarget.src = LANDING_BACKGROUND_DEFAULT
            }}
          />
        </div>
        <div className="gr-scene-shade" aria-hidden="true" />
        <div className="gr-scene-fog gr-scene-fog--one" aria-hidden="true" />
        <div className="gr-scene-fog gr-scene-fog--two" aria-hidden="true" />
        <div className="gr-rain gr-rain--far" aria-hidden="true" />
        <div className="gr-rain gr-rain--near" aria-hidden="true" />

        <div className="gr-main-frame">
          <header className="gr-frame-header">
            <button
              type="button"
              onClick={goToLanding}
              className="gr-brand"
              aria-label="Kembali ke tampilan awal"
            >
              <span className="gr-brand-logo">
                <img
                  src={logoUrl}
                  alt=""
                  onError={(event) => {
                    event.currentTarget.src = '/favicon.svg'
                  }}
                />
              </span>
              <span className="gr-brand-copy">
                <strong>{content.brand_name}</strong>
                <small>{content.brand_workspace_label}</small>
              </span>
            </button>

            <nav className="gr-frame-nav" aria-label="Navigasi landing page">
              {sceneLabels.map((label, index) => (
                <button
                  key={`${label}-${index}`}
                  type="button"
                  onClick={() => scrollToScene(index)}
                  className={activeScene === index ? 'is-active' : ''}
                  aria-current={activeScene === index ? 'page' : undefined}
                >
                  {label}
                </button>
              ))}
            </nav>

            <div className="gr-header-actions">
              <button
                type="button"
                onClick={handleDashboardClick}
                className="gr-header-dashboard"
                aria-label="Buka dashboard"
              >
                <Icon name="dashboard" className="gr-icon" />
                <span>{content.dashboard_button}</span>
              </button>
              <button type="button" onClick={handleGoogleLogin} className="gr-login-button">
                <Icon name="user" className="gr-icon" />
                <span>{content.login_button}</span>
              </button>
            </div>
          </header>

          <button
            type="button"
            className="gr-scene-arrow gr-scene-arrow--left"
            onClick={showPreviousScene}
            disabled={activeScene === 0}
            aria-label="Tampilkan informasi sebelumnya"
          >
            <SceneArrowIcon direction="left" />
          </button>

          <button
            type="button"
            className="gr-scene-arrow gr-scene-arrow--right"
            onClick={showNextScene}
            disabled={activeScene === SCENE_COUNT - 1}
            aria-label="Tampilkan informasi berikutnya"
          >
            <SceneArrowIcon direction="right" />
          </button>

          <main className="gr-frame-body">
            <section className="gr-copy-column" aria-live="polite">
              <div className="gr-copy-scenes">
                <article className={`gr-copy-scene ${activeScene === 0 ? 'is-active' : ''}`}>
                  <p className="gr-eyebrow">
                    <span className="gr-live-dot" />
                    {content.brand_tagline}
                  </p>
                  <h1 className="gr-display-title">
                    <span className="gr-title-line">{content.home_title_line_1}</span>
                    <span className="gr-title-line gr-title-line--accent">
                      {content.home_title_line_2}
                    </span>
                  </h1>
                  <p className="gr-scene-description">{content.header_description}</p>
                  <div className="gr-trust-list">
                    {trustItems.map((item) => (
                      <span key={item}>
                        <Icon name="check" className="gr-icon" />
                        {item}
                      </span>
                    ))}
                  </div>
                </article>

                <article className={`gr-copy-scene ${activeScene === 1 ? 'is-active' : ''}`}>
                  <p className="gr-eyebrow">{content.services_eyebrow}</p>
                  <h2 className="gr-display-title">
                    <span className="gr-title-line">{content.services_title_line_1}</span>
                    <span className="gr-title-line gr-title-line--accent">
                      {content.services_title_line_2}
                    </span>
                  </h2>
                  <p className="gr-scene-description">{serviceDescription}</p>
                  <div className="gr-feature-row">
                    {menuCards.slice(0, 3).map((card) => (
                      <Link key={card.to} to={card.to} className="gr-feature-card">
                        <Icon name={card.icon} className="gr-feature-icon" />
                        <span>
                          <strong>{card.label}</strong>
                          <small>{card.description}</small>
                        </span>
                      </Link>
                    ))}
                  </div>
                </article>

                <article className={`gr-copy-scene ${activeScene === 2 ? 'is-active' : ''}`}>
                  <p className="gr-eyebrow">{content.workspace_eyebrow}</p>
                  <h2 className="gr-display-title">
                    <span className="gr-title-line">{content.workspace_title_line_1}</span>
                    <span className="gr-title-line gr-title-line--accent">
                      {content.workspace_title_line_2}
                    </span>
                  </h2>
                  <p className="gr-scene-description">{content.workspace_description}</p>
                  <div className="gr-highlight-grid">
                    <Link to="/ruang-belajar" className="gr-highlight-card">
                      <Icon name="learning" className="gr-highlight-icon" />
                      <span>
                        <strong>{content.menu_learning_label || 'Ruang Belajar'}</strong>
                        <small>{content.menu_learning_description}</small>
                      </span>
                    </Link>
                    <Link to="/layanan-gratis" className="gr-highlight-card">
                      <Icon name="free" className="gr-highlight-icon" />
                      <span>
                        <strong>{content.menu_free_label}</strong>
                        <small>{freeUsageDescription}</small>
                      </span>
                    </Link>
                  </div>
                </article>

                <article className={`gr-copy-scene ${activeScene === 3 ? 'is-active' : ''}`}>
                  <p className="gr-eyebrow">{content.stats_title}</p>
                  <h2 className="gr-display-title">
                    <span className="gr-title-line">{content.activity_title_line_1}</span>
                    <span className="gr-title-line gr-title-line--accent">
                      {content.activity_title_line_2}
                    </span>
                  </h2>
                  <p className="gr-scene-description">{content.stats_subtitle}</p>
                  <div className="gr-stat-grid">
                    {statItems.map((item) => (
                      <div key={item.label} className="gr-stat-card">
                        <strong>{formatNumber(item.value)}</strong>
                        <span>{item.label}</span>
                      </div>
                    ))}
                  </div>
                  <div className="gr-utility-links">
                    {menuCards.slice(3).map((card) => (
                      <Link key={card.to} to={card.to}>
                        {card.label}
                        <Icon name="arrow" className="gr-icon" />
                      </Link>
                    ))}
                  </div>
                </article>
              </div>

              <div className="gr-persistent-actions">
                <Link to="/layanan" className="gr-primary-action">
                  {content.primary_action_label}
                  <Icon name="arrow" className="gr-icon" />
                </Link>
                <button type="button" onClick={handleGoogleLogin} className="gr-secondary-action">
                  {content.bottom_cta_button}
                </button>
              </div>
            </section>

          </main>

          <footer className="gr-frame-footer">
            <div className="gr-scene-pagination" aria-label="Posisi konten">
              {sceneLabels.map((label, index) => (
                <button
                  key={`${label}-${index}`}
                  type="button"
                  onClick={() => scrollToScene(index)}
                  className={activeScene === index ? 'is-active' : ''}
                  aria-label={`Tampilkan ${label}`}
                >
                  <span />
                </button>
              ))}
            </div>

            <p className="gr-frame-copyright">
              © {new Date().getFullYear()} {content.brand_name}
            </p>
          </footer>
        </div>
      </div>
    </div>
  )
}

export default LandingPage
