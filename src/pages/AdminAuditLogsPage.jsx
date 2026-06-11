import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import Pagination from '../components/Pagination'

function AdminAuditLogsPage() {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ action: '', role: '', requestId: '', keyword: '' })
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const fetchLogs = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5000)

    if (error) {
      alert('Gagal mengambil log aktivitas: ' + error.message)
      setLogs([])
    } else {
      setLogs(data || [])
    }
    setLoading(false)
  }

  useEffect(() => { fetchLogs() }, [])
  useEffect(() => { setPage(1) }, [filters, pageSize])

  const formatTanggal = (tanggal) => tanggal ? new Date(tanggal).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'
  const actionOptions = Array.from(new Set(logs.map((log) => log.action).filter(Boolean)))

  const filteredLogs = logs.filter((log) => {
    const searchable = [log.action, log.description, log.actor_email, log.actor_role, log.request_id].join(' ').toLowerCase()
    if (filters.action && log.action !== filters.action) return false
    if (filters.role && log.actor_role !== filters.role) return false
    if (filters.requestId && String(log.request_id || '') !== filters.requestId.trim()) return false
    if (filters.keyword.trim() && !searchable.includes(filters.keyword.trim().toLowerCase())) return false
    return true
  })

  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const pagedLogs = filteredLogs.slice((safePage - 1) * pageSize, safePage * pageSize)

  return (
    <div className="p-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-6">
        <div>
          <p className="text-xs text-gray-400 mb-1">Admin / Log Aktivitas</p>
          <h2 className="text-2xl font-bold text-gray-900">Log Aktivitas</h2>
          <p className="text-sm text-gray-500 mt-1">Riwayat aktivitas penting pada request, file, payment, dan layanan.</p>
        </div>
        <button onClick={fetchLogs} className="bg-gray-900 text-white px-5 py-3 rounded-xl text-sm hover:bg-gray-800">Refresh Log</button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm p-5 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Action</label>
            <select value={filters.action} onChange={(e) => setFilters({ ...filters, action: e.target.value })} className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm"><option value="">Semua action</option>{actionOptions.map((action) => <option key={action} value={action}>{action}</option>)}</select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Role</label>
            <select value={filters.role} onChange={(e) => setFilters({ ...filters, role: e.target.value })} className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm"><option value="">Semua role</option><option value="admin">Admin</option><option value="client">Client</option><option value="freelancer">Freelancer</option></select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Request ID</label>
            <input value={filters.requestId} onChange={(e) => setFilters({ ...filters, requestId: e.target.value })} className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm" placeholder="ID request" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Keyword</label>
            <input value={filters.keyword} onChange={(e) => setFilters({ ...filters, keyword: e.target.value })} className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm" placeholder="Cari log..." />
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-4">Menampilkan {filteredLogs.length} dari {logs.length} log.</p>
      </div>

      {loading && <div className="bg-white rounded-2xl shadow-sm p-10 text-center text-gray-400">Memuat log aktivitas...</div>}

      {!loading && filteredLogs.length === 0 && (
        <div className="bg-white rounded-2xl shadow-sm p-10 text-center">
          <p className="text-4xl mb-3">🕒</p>
          <p className="text-gray-500">Belum ada log aktivitas sesuai filter.</p>
        </div>
      )}

      {!loading && filteredLogs.length > 0 && (
        <div className="space-y-4">
          {pagedLogs.map((log) => (
            <div key={log.id} className="bg-white rounded-2xl shadow-sm p-5">
              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                <div>
                  <p className="font-bold text-gray-800">{log.action}</p>
                  <p className="text-sm text-gray-600 mt-1">{log.description || '-'}</p>
                </div>
                <div className="text-left md:text-right">
                  <p className="text-xs text-gray-400">{formatTanggal(log.created_at)}</p>
                  {log.request_id && <p className="text-xs text-blue-500 mt-1">Request ID: {log.request_id}</p>}
                </div>
              </div>
              <div className="flex flex-wrap gap-2 text-xs text-gray-500 mt-3">
                <span className="bg-gray-100 px-3 py-1 rounded-full">Role: {log.actor_role || '-'}</span>
                <span className="bg-gray-100 px-3 py-1 rounded-full">Actor: {log.actor_email || '-'}</span>
              </div>
              {log.metadata && Object.keys(log.metadata).length > 0 && (
                <details className="mt-3">
                  <summary className="text-xs text-gray-400 cursor-pointer">Lihat metadata</summary>
                  <pre className="mt-2 bg-gray-50 rounded-xl p-3 text-xs text-gray-600 overflow-x-auto">{JSON.stringify(log.metadata, null, 2)}</pre>
                </details>
              )}
            </div>
          ))}
        </div>
      )}

      <Pagination page={safePage} pageSize={pageSize} totalItems={filteredLogs.length} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1) }} />
    </div>
  )
}

export default AdminAuditLogsPage
