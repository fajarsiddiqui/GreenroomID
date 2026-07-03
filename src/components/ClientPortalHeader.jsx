import { Link, useLocation } from 'react-router-dom'
import { supabase } from '../supabase'

const navigationItems = [
  { label: 'Beranda', to: '/' },
  { label: 'Layanan', to: '/layanan' },
  { label: 'Layanan Gratis', to: '/layanan-gratis' },
  { label: 'Ruang Belajar', to: '/ruang-belajar' },
  { label: 'Request Saya', to: '/dashboard' }
]

function ClientPortalHeader({ user, subtitle = 'Portal Client' }) {
  const location = useLocation()

  const isActive = (to) => {
    if (to === '/') return location.pathname === '/'
    return location.pathname === to || location.pathname.startsWith(`${to}/`)
  }

  return (
    <header className="bg-white shadow-sm border-b border-gray-100">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
        <Link to="/" className="flex min-w-0 items-center gap-3" aria-label="Kembali ke Beranda GreenroomID">
          <img src="/greenroomid-icon.png" alt="GreenroomID" className="h-9 w-9 rounded-xl object-contain" />
          <div className="min-w-0">
            <p className="text-base font-black text-gray-900 leading-none">GreenroomID</p>
            <p className="text-[11px] text-gray-400 mt-1 truncate">{subtitle}</p>
          </div>
        </Link>

        <div className="flex items-center gap-2 shrink-0">
          <Link
            to="/profile"
            className="hidden sm:inline-flex rounded-xl border border-gray-200 px-3 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50"
          >
            Profil Saya
          </Link>
          <button
            type="button"
            onClick={() => supabase.auth.signOut()}
            className="rounded-xl px-3 py-2 text-xs font-bold text-red-500 hover:bg-red-50"
          >
            Keluar
          </button>
        </div>
      </div>

      <nav className="border-t border-gray-100" aria-label="Navigasi GreenroomID untuk client">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 overflow-x-auto">
          <div className="flex min-w-max gap-1 py-2">
            {navigationItems.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={
                  'rounded-lg px-3 py-2 text-xs font-bold transition ' +
                  (isActive(item.to)
                    ? 'bg-green-50 text-green-800'
                    : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900')
                }
              >
                {item.label}
              </Link>
            ))}
            <Link
              to="/profile"
              className="sm:hidden rounded-lg px-3 py-2 text-xs font-bold text-gray-500 hover:bg-gray-50 hover:text-gray-900"
            >
              Profil
            </Link>
          </div>
        </div>
      </nav>

      {user?.email && (
        <div className="sr-only">Masuk sebagai {user.email}</div>
      )}
    </header>
  )
}

export default ClientPortalHeader
