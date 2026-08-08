import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { supabase } from '../supabase'
import {
  DEFAULT_LANDING_CONTENT,
  mergeLandingContentRows
} from '../utils/landingContent'
import PublicFooter from '../components/PublicFooter'
import '../styles/landing-v3.css'

const HOME_CARDS = [
  {
    to: '/layanan',
    label: 'Layanan',
    description: 'Bantuan untuk kebutuhan Anda.',
    icon: '/landing/layanan-icon.svg'
  },
  {
    to: '/tools-gratis',
    label: 'Tools Gratis',
    description: 'Alat praktis yang langsung digunakan.',
    icon: '/landing/tools-gratis-icon.svg'
  },
  {
    to: '/ai-tools',
    label: 'AI Tools',
    description: 'Bekerja lebih cepat dengan bantuan AI.',
    icon: '/landing/ai-tools-icon.svg'
  },
  {
    to: '/ruang-belajar',
    label: 'Ruang Belajar',
    description: 'Panduan dan materi untuk dipelajari.',
    icon: '/landing/ruang-belajar-icon.svg'
  },
  {
    to: '/studio-artikel',
    label: 'Studio Artikel',
    description: 'Artikel dan publikasi pilihan.',
    icon: '/landing/studio-artikel-icon.svg'
  }
]

function HeaderIcon({ type }) {
  if (type === 'dashboard') {
    return (
      <svg
        aria-hidden="true"
        className="gr-home-header-icon"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <rect x="3" y="3" width="7" height="7" rx="2" />
        <rect x="14" y="3" width="7" height="7" rx="2" />
        <rect x="3" y="14" width="7" height="7" rx="2" />
        <rect x="14" y="14" width="7" height="7" rx="2" />
      </svg>
    )
  }

  return (
    <svg
      aria-hidden="true"
      className="gr-home-header-icon"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </svg>
  )
}

function LandingPage() {
  const navigate = useNavigate()
  const [content, setContent] = useState(DEFAULT_LANDING_CONTENT)

  useEffect(() => {
    let active = true

    const fetchLandingContent = async () => {
      const { data, error } = await supabase
        .from('landing_content')
        .select('content_key, content_value')

      if (active && !error && data) {
        setContent(mergeLandingContentRows(data))
      }
    }

    fetchLandingContent()

    return () => {
      active = false
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

  const logoUrl =
    content.site_logo_url ||
    content.site_favicon_url ||
    content.logo_url ||
    '/favicon.svg'

  return (
    <div className="gr-home-page">
      <header className="gr-home-header">
        <div className="gr-home-header-inner">
          <Link to="/" className="gr-home-brand" aria-label="GreenroomID beranda">
            <span className="gr-home-brand-logo">
              <img
                src={logoUrl}
                alt=""
                onError={(event) => {
                  event.currentTarget.src = '/favicon.svg'
                }}
              />
            </span>

            <span className="gr-home-brand-copy">
              <strong>{content.brand_name || 'GreenroomID'}</strong>
              <small>{content.brand_workspace_label || 'Digital workspace'}</small>
            </span>
          </Link>

          <div className="gr-home-header-actions">
            <button
              type="button"
              onClick={handleDashboardClick}
              aria-label={content.dashboard_button || 'Dashboard'}
              className="gr-home-dashboard-button"
            >
              <HeaderIcon type="dashboard" />
              <span>{content.dashboard_button || 'Dashboard'}</span>
            </button>

            <button
              type="button"
              onClick={handleGoogleLogin}
              aria-label={content.login_button || 'Login'}
              className="gr-home-login-button"
            >
              <HeaderIcon type="user" />
              <span>{content.login_button || 'Login'}</span>
            </button>
          </div>
        </div>
      </header>

      <main className="gr-home-main">
        <section className="gr-home-directory" aria-labelledby="gr-home-title">
          <h1 id="gr-home-title">Apa yang ingin Anda kerjakan?</h1>

          <div className="gr-home-grid">
            {HOME_CARDS.map((card) => (
              <Link key={card.to} to={card.to} className="gr-home-card">
                <img
                  src={card.icon}
                  alt=""
                  aria-hidden="true"
                  className="gr-home-card-icon"
                />

                <span className="gr-home-card-copy">
                  <strong>{card.label}</strong>
                  <span>{card.description}</span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  )
}

export default LandingPage
