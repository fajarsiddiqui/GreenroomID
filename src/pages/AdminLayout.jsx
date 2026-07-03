import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { supabase } from '../supabase'

function AdminLayout({ user }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const menus = [
    { to: '/admin', label: 'Dashboard', icon: '🏠', end: true },
    { to: '/admin/requests', label: 'Request', icon: '📋' },
    { to: '/admin/services', label: 'Layanan & Harga', icon: '💼' },
    { to: '/admin/free-services', label: 'Layanan Gratis', icon: '🎁' },
    { to: '/admin/ruang-belajar', label: 'Ruang Belajar', icon: '📚' },
    { to: '/admin/donations', label: 'Donasi', icon: '💚' },
    { to: '/admin/landing-content', label: 'Landing Page', icon: '✏️' },
    { to: '/admin/site-branding', label: 'Branding & SEO', icon: '🔎' },
    { to: '/admin/revision-settings', label: 'Waktu Revisi', icon: '⏳' },
    { to: '/admin/stats', label: 'Statistik', icon: '📊' },
    { to: '/admin/audit-logs', label: 'Log Aktivitas', icon: '🕒' },
    { to: '/admin/archive', label: 'Arsip', icon: '🗂️' },
    { to: '/admin/deleted-items', label: 'Deleted Items', icon: '🗑️' },
    { to: '/admin/accounts', label: 'Manajemen Akun', icon: '👥' },
    { to: '/admin/profile', label: 'Profile Payment', icon: '💳' }
  ]

  const navClass = ({ isActive }) =>
    'w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm text-left transition ' +
    (isActive
      ? 'bg-white text-gray-900 shadow-sm'
      : 'text-gray-300 hover:bg-gray-800 hover:text-white')

  const closeSidebar = () => setSidebarOpen(false)

  return (
    <div className="min-h-screen bg-gray-100">
      <button
        type="button"
        onClick={() => setSidebarOpen(true)}
        className="fixed left-4 top-4 z-40 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gray-900 text-white shadow-lg transition hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-500"
        aria-label="Buka sidebar admin"
        title="Buka menu"
      >
        <span className="flex flex-col gap-1.5">
          <span className="block h-0.5 w-4 rounded bg-white" />
          <span className="block h-0.5 w-4 rounded bg-white" />
          <span className="block h-0.5 w-4 rounded bg-white" />
        </span>
      </button>

      {sidebarOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 admin-fade-in" onClick={closeSidebar}>
          <aside
            className="h-screen w-72 max-w-[86vw] bg-gray-900 text-white shadow-2xl admin-slide-panel flex flex-col"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-800 px-5 py-5">
              <div>
                <h1 className="text-xl font-bold">GreenroomID</h1>
                <p className="text-xs text-gray-400 mt-1">Admin Panel</p>
              </div>
              <button
                type="button"
                onClick={closeSidebar}
                className="h-9 w-9 rounded-xl bg-gray-800 text-gray-300 transition hover:bg-gray-700 hover:text-white"
                aria-label="Tutup sidebar"
                title="Tutup"
              >
                ×
              </button>
            </div>

            <nav className="flex-1 space-y-2 overflow-y-auto px-5 py-5 admin-sidebar-scroll">
              {menus.map((menu) => (
                <NavLink key={menu.to} to={menu.to} end={menu.end} className={navClass} onClick={closeSidebar}>
                  <span>{menu.icon}</span>
                  <span>{menu.label}</span>
                </NavLink>
              ))}
            </nav>

            <div className="border-t border-gray-800 p-5">
              <p className="text-xs text-gray-400 mb-3 truncate">{user.email}</p>
              <button
                onClick={() => supabase.auth.signOut()}
                className="w-full bg-red-500 text-white px-4 py-2 rounded-xl text-sm transition hover:bg-red-600"
              >
                Keluar
              </button>
            </div>
          </aside>
        </div>
      )}

      <main className="min-w-0 pl-0">
        <Outlet />
      </main>
    </div>
  )
}

export default AdminLayout
