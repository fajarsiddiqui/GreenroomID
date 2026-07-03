import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { supabase } from '../supabase'

const navigationItems = [
  { label: 'Beranda', to: '/' },
  { label: 'Layanan', to: '/layanan' },
  { label: 'Layanan Gratis', to: '/layanan-gratis' },
  { label: 'Ruang Belajar', to: '/ruang-belajar' },
  { label: 'Pembelajaran Saya', to: '/ruang-belajar/saya' },
  { label: 'Request Saya', to: '/dashboard' },
  { label: '+ Buat Request', to: '/request/new', primary: true }
]

const formatPhoneForWhatsApp = (value) => {
  const cleaned = String(value || '').replace(/[^0-9]/g, '')
  if (!cleaned) return ''
  if (cleaned.startsWith('0')) return `62${cleaned.slice(1)}`
  return cleaned
}

function ClientPortalHeader({ user, subtitle = 'Portal Client' }) {
  const location = useLocation()
  const [adminWhatsAppUrl, setAdminWhatsAppUrl] = useState('')

  const isActive = (to) => {
    if (to === '/') return location.pathname === '/'
    return location.pathname === to || location.pathname.startsWith(`${to}/`)
  }

  useEffect(() => {
    let isMounted = true

    const fetchAdminPhone = async () => {
      const { data, error } = await supabase
        .from('admin_payment_settings')
        .select('admin_phone')
        .eq('id', 'default')
        .maybeSingle()

      if (error || !isMounted) return

      const phone = formatPhoneForWhatsApp(data?.admin_phone)
      setAdminWhatsAppUrl(phone ? `https://wa.me/${phone}` : '')
    }

    fetchAdminPhone()

    return () => {
      isMounted = false
    }
  }, [])

  return (
    <header className="bg-white shadow-sm border-b border-gray-100">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
        <Link to="/" className="flex min-w-0 items-center gap-3" aria-label="Kembali ke Beranda GreenroomID">
          <img src="/greenroomid-icon.png" alt="GreenroomID" className="h-9 w-9 rounded-xl object-contain" />
          <div className="min-w-0">
            <p className="text-base font-black text-gray-900 leading-none">GreenroomID</p>
            <p className="text-[11px] text-gray-400 mt-1 truncate">{subtitle}</p>
          </div>
        </Link>

        <div className="flex items-center gap-1.5 shrink-0">
          {adminWhatsAppUrl ? (
            <a
              href={adminWhatsAppUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center rounded-xl border border-green-100 bg-green-50 px-2.5 sm:px-3 py-2 text-[11px] sm:text-xs font-bold text-green-700 hover:bg-green-100"
            >
              <span className="sm:hidden">Chat</span>
              <span className="hidden sm:inline">Chat Admin</span>
            </a>
          ) : (
            <span
              title="Nomor WhatsApp admin belum tersedia."
              className="inline-flex cursor-not-allowed items-center rounded-xl border border-gray-100 bg-gray-50 px-2.5 sm:px-3 py-2 text-[11px] sm:text-xs font-bold text-gray-400"
            >
              <span className="sm:hidden">Chat</span>
              <span className="hidden sm:inline">Chat Admin</span>
            </span>
          )}

          <Link
            to="/profile"
            className="inline-flex rounded-xl border border-gray-200 px-2.5 sm:px-3 py-2 text-[11px] sm:text-xs font-bold text-gray-700 hover:bg-gray-50"
          >
            <span className="sm:hidden">Profil</span>
            <span className="hidden sm:inline">Profil Saya</span>
          </Link>

          <button
            type="button"
            onClick={() => supabase.auth.signOut()}
            className="rounded-xl px-2.5 sm:px-3 py-2 text-[11px] sm:text-xs font-bold text-red-500 hover:bg-red-50"
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
                  (item.primary
                    ? 'bg-green-700 text-white hover:bg-green-800'
                    : isActive(item.to)
                      ? 'bg-green-50 text-green-800'
                      : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900')
                }
              >
                {item.label}
              </Link>
            ))}
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
