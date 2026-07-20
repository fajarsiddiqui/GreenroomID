import { useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import AdminNotificationCenter from '../components/AdminNotificationCenter'
import '../styles/admin-modern.css'

const THEME_STORAGE_KEY = 'greenroomid_admin_theme_v4'

const menuGroups = [
  {
    label: 'Overview',
    items: [
      { to: '/admin', label: 'Dashboard', icon: 'dashboard', end: true },
      { to: '/admin/stats', label: 'Statistik', icon: 'chart' }
    ]
  },
  {
    label: 'Operasional',
    items: [
      { to: '/admin/requests', label: 'Request', icon: 'inbox' },
      { to: '/admin/forms', label: 'Formulir Online', icon: 'forms' },
      { to: '/admin/services', label: 'Layanan & Harga', icon: 'briefcase' },
      { to: '/admin/free-services', label: 'Layanan Gratis', icon: 'sparkles' }
    ]
  },
  {
    label: 'Ruang Belajar',
    items: [
      { to: '/admin/ruang-belajar', label: 'Konten Pembelajaran', icon: 'book' },
      { to: '/admin/ruang-belajar/review', label: 'Review Pembelajaran', icon: 'review' },
      { to: '/admin/ruang-belajar/pembayaran', label: 'Kontribusi Publikasi', icon: 'wallet' }
    ]
  },
  {
    label: 'Website',
    items: [
      { to: '/admin/landing-content', label: 'Landing Page', icon: 'globe' },
      { to: '/admin/site-branding', label: 'Branding & SEO', icon: 'palette' },
      { to: '/admin/donations', label: 'Donasi', icon: 'heart' }
    ]
  },
  {
    label: 'Sistem',
    items: [
      { to: '/admin/revision-settings', label: 'Waktu Revisi', icon: 'clock' },
      { to: '/admin/accounts', label: 'Manajemen Akun', icon: 'users' },
      { to: '/admin/profile', label: 'Profile Payment', icon: 'credit-card' },
      { to: '/admin/audit-logs', label: 'Log Aktivitas', icon: 'activity' },
      { to: '/admin/archive', label: 'Arsip', icon: 'archive' },
      { to: '/admin/deleted-items', label: 'Deleted Items', icon: 'trash' }
    ]
  }
]

function resolveInitialTheme() {
  if (typeof window === 'undefined') return 'dark'
  const saved = window.localStorage.getItem(THEME_STORAGE_KEY)
  if (saved === 'light' || saved === 'dark') return saved
  return 'dark'
}

function Icon({ name, size = 18, strokeWidth = 1.8 }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true
  }

  const paths = {
    dashboard: <><rect x="3" y="3" width="7" height="7" rx="2" /><rect x="14" y="3" width="7" height="7" rx="2" /><rect x="3" y="14" width="7" height="7" rx="2" /><rect x="14" y="14" width="7" height="7" rx="2" /></>,
    chart: <><path d="M4 19V9" /><path d="M10 19V5" /><path d="M16 19v-7" /><path d="M22 19H2" /></>,
    inbox: <><path d="M4 4h16v13H4z" /><path d="M4 13h4l2 3h4l2-3h4" /></>,
    forms: <><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 8h6M9 12h6M9 16h3" /></>,
    briefcase: <><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18M10 12v2h4v-2" /></>,
    sparkles: <><path d="m12 3 1.1 3.2L16 7.5l-2.9 1.3L12 12l-1.1-3.2L8 7.5l2.9-1.3z" /><path d="m18.5 13 .7 2 1.8.8-1.8.8-.7 2-.7-2-1.8-.8 1.8-.8z" /><path d="m5.5 13 .9 2.5L9 16.6l-2.6 1.1-.9 2.5-.9-2.5L2 16.6l2.6-1.1z" /></>,
    book: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v16H6.5A2.5 2.5 0 0 0 4 21.5z" /><path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H13v16h4.5a2.5 2.5 0 0 1 2.5 2.5z" /></>,
    review: <><path d="M4 4h16v13H9l-5 4z" /><path d="m9 10 2 2 4-4" /></>,
    wallet: <><path d="M4 6h14a2 2 0 0 1 2 2v10H4a2 2 0 0 1-2-2V6a3 3 0 0 1 3-3h12" /><path d="M16 11h6v4h-6a2 2 0 0 1 0-4z" /></>,
    globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></>,
    palette: <><path d="M12 3a9 9 0 0 0 0 18h1.5a1.5 1.5 0 0 0 0-3H12a2 2 0 0 1 0-4h2a7 7 0 0 0-2-11z" /><circle cx="7.5" cy="10" r="1" /><circle cx="9" cy="6.5" r="1" /><circle cx="14" cy="6.5" r="1" /><circle cx="17" cy="10" r="1" /></>,
    heart: <path d="M20.8 4.6a5.4 5.4 0 0 0-7.6 0L12 5.8l-1.2-1.2a5.4 5.4 0 1 0-7.6 7.6L12 21l8.8-8.8a5.4 5.4 0 0 0 0-7.6z" />,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" /></>,
    'credit-card': <><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20M6 15h4" /></>,
    activity: <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />,
    archive: <><path d="M3 6h18v4H3z" /><path d="M5 10v10h14V10M9 14h6" /></>,
    trash: <><path d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15M10 10v7M14 10v7" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    menu: <><path d="M4 7h16M4 12h16M4 17h16" /></>,
    collapse: <><path d="m15 18-6-6 6-6" /></>,
    expand: <><path d="m9 18 6-6-6-6" /></>,
    logout: <><path d="M10 17l5-5-5-5M15 12H3" /><path d="M21 19V5a2 2 0 0 0-2-2h-6" /></>,
    close: <><path d="M6 6l12 12M18 6 6 18" /></>,
    chevron: <path d="m9 18 6-6-6-6" />,
    moon: <><path d="M21 12.7A8.5 8.5 0 1 1 11.3 3 6.7 6.7 0 0 0 21 12.7z" /></>,
    sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41" /></>
  }

  return <svg {...common}>{paths[name] || paths.dashboard}</svg>
}

function AdminLayout({ user }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [search, setSearch] = useState('')
  const [theme, setTheme] = useState(resolveInitialTheme)
  const searchRef = useRef(null)
  const location = useLocation()
  const navigate = useNavigate()

  const allMenus = useMemo(() => menuGroups.flatMap((group) => group.items), [])
  const activeMenu = useMemo(() => {
    return [...allMenus]
      .sort((a, b) => b.to.length - a.to.length)
      .find((item) => item.end ? location.pathname === item.to : location.pathname.startsWith(item.to))
  }, [allMenus, location.pathname])

  const searchResults = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    if (!keyword) return []
    return allMenus.filter((item) => item.label.toLowerCase().includes(keyword)).slice(0, 7)
  }, [allMenus, search])

  useEffect(() => {
    setSidebarOpen(false)
  }, [location.pathname])

  useEffect(() => {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme)
    document.documentElement.style.colorScheme = theme
  }, [theme])

  useEffect(() => {
    const handleShortcut = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  }, [])

  const initials = String(user?.email || 'Admin')
    .split('@')[0]
    .split(/[._\-\s]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'AD'

  const handleSearchSelect = (to) => {
    setSearch('')
    searchRef.current?.blur()
    navigate(to)
  }

  const handleLogout = async () => {
    try {
      await supabase.rpc('disable_all_push_subscriptions')
    } catch {
      // Notification foundation may not be installed yet; logout must still work.
    }
    await supabase.auth.signOut()
  }

  const renderNavigation = (mobile = false) => (
    <nav className="admin-modern-nav" aria-label="Navigasi admin">
      {menuGroups.map((group) => (
        <div className="admin-modern-nav-group" key={group.label}>
          <p className="admin-modern-nav-label">{group.label}</p>
          <div className="admin-modern-nav-items">
            {group.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={() => mobile && setSidebarOpen(false)}
                className={({ isActive }) => `admin-modern-nav-link${isActive ? ' is-active' : ''}`}
                title={collapsed && !mobile ? item.label : undefined}
              >
                <span className="admin-modern-nav-icon"><Icon name={item.icon} /></span>
                <span className="admin-modern-nav-text">{item.label}</span>
                <span className="admin-modern-nav-arrow"><Icon name="chevron" size={14} /></span>
              </NavLink>
            ))}
          </div>
        </div>
      ))}
    </nav>
  )

  return (
    <div className={`admin-modern-shell${collapsed ? ' is-collapsed' : ''}`} data-theme={theme}>
      <aside className="admin-modern-sidebar" aria-label="Sidebar admin">
        <div className="admin-modern-sidebar-aurora" aria-hidden="true" />
        <div className="admin-modern-brand">
          <div className="admin-modern-brand-mark">
            G
            <span className="admin-modern-status-dot" title="Sistem aktif" />
          </div>
          <div className="admin-modern-brand-copy">
            <strong>GreenroomID</strong>
            <span>Control center</span>
          </div>
          <button
            type="button"
            className="admin-modern-collapse-button"
            onClick={() => setCollapsed((value) => !value)}
            aria-label={collapsed ? 'Perbesar sidebar' : 'Perkecil sidebar'}
          >
            <Icon name={collapsed ? 'expand' : 'collapse'} size={17} />
          </button>
        </div>

        <div className="admin-modern-sidebar-body">{renderNavigation()}</div>

        <div className="admin-modern-sidebar-footer">
          <div className="admin-modern-environment-pill">
            <i /> <span>Production</span>
          </div>
          <div className="admin-modern-account">
            <div className="admin-modern-avatar">{initials}</div>
            <div className="admin-modern-account-copy">
              <strong>Administrator</strong>
              <span>{user?.email || 'admin@greenroomid.com'}</span>
            </div>
            <button type="button" className="admin-modern-logout-icon" onClick={handleLogout} aria-label="Keluar">
              <Icon name="logout" size={18} />
            </button>
          </div>
        </div>
      </aside>

      {sidebarOpen && (
        <div className="admin-modern-mobile-overlay" onClick={() => setSidebarOpen(false)}>
          <aside className="admin-modern-mobile-sidebar" onClick={(event) => event.stopPropagation()}>
            <div className="admin-modern-mobile-head">
              <div className="admin-modern-brand-mark">G<span className="admin-modern-status-dot" /></div>
              <div>
                <strong>GreenroomID</strong>
                <span>Control center</span>
              </div>
              <button type="button" onClick={() => setSidebarOpen(false)} aria-label="Tutup menu">
                <Icon name="close" size={19} />
              </button>
            </div>
            <div className="admin-modern-mobile-nav">{renderNavigation(true)}</div>
            <button type="button" className="admin-modern-mobile-logout" onClick={handleLogout}>
              <Icon name="logout" size={18} /> Keluar dari akun
            </button>
          </aside>
        </div>
      )}

      <div className="admin-modern-workspace">
        <header className="admin-modern-topbar">
          <div className="admin-modern-topbar-left">
            <button
              type="button"
              className="admin-modern-mobile-menu-button"
              onClick={() => setSidebarOpen(true)}
              aria-label="Buka menu admin"
            >
              <Icon name="menu" size={20} />
            </button>
            <div className="admin-modern-breadcrumb">
              <span>Workspace</span>
              <Icon name="chevron" size={13} />
              <strong>{activeMenu?.label || 'Dashboard'}</strong>
            </div>
          </div>

          <div className={`admin-modern-search-wrap${search ? ' has-value' : ''}`}>
            <Icon name="search" size={17} />
            <input
              ref={searchRef}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && searchResults[0]) handleSearchSelect(searchResults[0].to)
                if (event.key === 'Escape') {
                  setSearch('')
                  event.currentTarget.blur()
                }
              }}
              placeholder="Cari menu atau fitur..."
              aria-label="Cari menu admin"
            />
            <kbd>Ctrl K</kbd>
            {searchResults.length > 0 && (
              <div className="admin-modern-search-results">
                <div className="admin-modern-search-results-label">Hasil pencarian</div>
                {searchResults.map((item) => (
                  <button key={item.to} type="button" onClick={() => handleSearchSelect(item.to)}>
                    <span><Icon name={item.icon} size={17} /></span>
                    <span>{item.label}</span>
                    <Icon name="chevron" size={13} />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="admin-modern-topbar-actions">
            <AdminNotificationCenter user={user} />
            <button
              type="button"
              className="admin-modern-theme-toggle"
              onClick={() => setTheme((current) => current === 'dark' ? 'light' : 'dark')}
              aria-label={theme === 'dark' ? 'Gunakan mode terang' : 'Gunakan mode gelap'}
              title={theme === 'dark' ? 'Mode terang' : 'Mode gelap'}
            >
              <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={18} />
              <span>{theme === 'dark' ? 'Terang' : 'Gelap'}</span>
            </button>
            <button type="button" className="admin-modern-profile-button" onClick={() => navigate('/admin/profile')}>
              <span className="admin-modern-avatar small">{initials}</span>
              <span className="admin-modern-profile-copy">
                <strong>Admin</strong>
                <small>GreenroomID</small>
              </span>
              <Icon name="chevron" size={13} />
            </button>
          </div>
        </header>

        <main className="admin-modern-main">
          <div className="admin-modern-page-slot">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}

export default AdminLayout
