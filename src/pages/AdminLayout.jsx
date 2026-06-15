import { NavLink, Outlet } from 'react-router-dom'
import { supabase } from '../supabase'

function AdminLayout({ user }) {
  const menus = [
    { to: '/admin', label: 'Dashboard', icon: '🏠', end: true },
    { to: '/admin/requests', label: 'Request', icon: '📋' },
    { to: '/admin/services', label: 'Layanan & Harga', icon: '💼' },
    { to: '/admin/landing-content', label: 'Landing Page', icon: '✏️' },
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

  return (
    <div className="min-h-screen bg-gray-100 flex">
      <aside className="w-64 bg-gray-900 text-white min-h-screen p-5 hidden md:flex md:flex-col sticky top-0">
        <div className="mb-8">
          <h1 className="text-xl font-bold">GreenroomID</h1>
          <p className="text-xs text-gray-400 mt-1">Admin Panel</p>
        </div>

        <nav className="space-y-2 flex-1">
          {menus.map((menu) => (
            <NavLink key={menu.to} to={menu.to} end={menu.end} className={navClass}>
              <span>{menu.icon}</span>
              <span>{menu.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-gray-800 pt-4">
          <p className="text-xs text-gray-400 mb-3 truncate">{user.email}</p>
          <button
            onClick={() => supabase.auth.signOut()}
            className="w-full bg-red-500 text-white px-4 py-2 rounded-xl text-sm hover:bg-red-600 transition"
          >
            Keluar
          </button>
        </div>
      </aside>

      <div className="flex-1 min-w-0">
        <div className="md:hidden bg-gray-900 text-white p-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="font-bold">GreenroomID Admin</h1>
              <p className="text-xs text-gray-400">{user.email}</p>
            </div>
            <button onClick={() => supabase.auth.signOut()} className="text-xs bg-red-500 px-3 py-2 rounded-xl">
              Keluar
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {menus.map((menu) => (
              <NavLink key={menu.to} to={menu.to} end={menu.end} className={navClass}>
                {menu.icon} {menu.label}
              </NavLink>
            ))}
          </div>
        </div>

        <main className="p-0">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

export default AdminLayout
