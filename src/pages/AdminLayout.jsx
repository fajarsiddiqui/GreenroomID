import { supabase } from '../supabase'

function AdminLayout({ user, activeMenu, setActiveMenu, children }) {
  const menus = [
    { key: 'requests', label: 'Request', icon: '📋' },
    { key: 'services', label: 'Layanan & Harga', icon: '💼' },
    { key: 'stats', label: 'Statistik', icon: '📊' },
    { key: 'logs', label: 'Log Aktivitas', icon: '🕒' }
  ]

  return (
    <div className="min-h-screen bg-gray-100 flex">
      <aside className="w-64 bg-gray-900 text-white min-h-screen p-5 hidden md:flex md:flex-col">
        <div className="mb-8">
          <h1 className="text-xl font-bold">GreenroomID</h1>
          <p className="text-xs text-gray-400 mt-1">Admin Panel</p>
        </div>

        <nav className="space-y-2 flex-1">
          {menus.map((menu) => (
            <button
              key={menu.key}
              onClick={() => setActiveMenu(menu.key)}
              className={
                'w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm text-left transition ' +
                (activeMenu === menu.key
                  ? 'bg-white text-gray-900'
                  : 'text-gray-300 hover:bg-gray-800 hover:text-white')
              }
            >
              <span>{menu.icon}</span>
              <span>{menu.label}</span>
            </button>
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

            <button
              onClick={() => supabase.auth.signOut()}
              className="text-xs bg-red-500 px-3 py-2 rounded-xl"
            >
              Keluar
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {menus.map((menu) => (
              <button
                key={menu.key}
                onClick={() => setActiveMenu(menu.key)}
                className={
                  'px-3 py-2 rounded-xl text-xs text-left ' +
                  (activeMenu === menu.key
                    ? 'bg-white text-gray-900'
                    : 'bg-gray-800 text-gray-300')
                }
              >
                {menu.icon} {menu.label}
              </button>
            ))}
          </div>
        </div>

        <main className="p-0">
          {children}
        </main>
      </div>
    </div>
  )
}

export default AdminLayout