import { useState } from 'react'
import AdminLayout from './AdminLayout'
import AdminRequestsPage from './AdminRequestsPage'
import AdminServicesPage from './AdminServicesPage'
import AdminStatsPage from './AdminStatsPage'
import AdminAuditLogsPage from './AdminAuditLogsPage'

function AdminDashboard({ user }) {
  const [activeMenu, setActiveMenu] = useState('requests')

  return (
    <AdminLayout
      user={user}
      activeMenu={activeMenu}
      setActiveMenu={setActiveMenu}
    >
      {activeMenu === 'requests' && <AdminRequestsPage user={user} />}
      {activeMenu === 'services' && <AdminServicesPage user={user} />}
      {activeMenu === 'stats' && <AdminStatsPage user={user} />}
      {activeMenu === 'logs' && <AdminAuditLogsPage user={user} />}
    </AdminLayout>
  )
}

export default AdminDashboard