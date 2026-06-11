import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import Pagination from '../components/Pagination'

function AdminAuditLogsPage() {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ action: '', role: '', requestId: '', keyword: '' })
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [showFilterModal, setShowFilterModal] = useState(false)

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
  const resetFilters = () => setFilters({ action: '', role: '', requestId: '', keyword: '' })
  const activeFilterCount = Object.values(filters).filter((value) => String(value || '').trim()).length

  const roleClass = (role) => {
    if (role === 'admin') return 'bg-blue-50 text-blue-700'
    if (role === 'client') return 'bg-green-50 text-green-700'
    if (role === 'freelancer') return 'bg-purple-50 text-purple-700'
    return 'bg-gray-100 text-gray-600'
  }

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
      <div className="mb-6">
        <p className="text-xs text-gray-400 mb-1">Admin / Log Aktivitas</p>
        <h2 className="text-2xl font-bold text-gray-900">Log Aktivitas</h2>
        <p className="text-sm text-gray-500 mt-1">Riwayat aktivitas penting pada request, file, payment, dan layanan.</p>
      </div>

      <div className="bg-white rounded-2xl shadow-sm p-4 mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-gray-800">{filteredLogs.length} log ditampilkan</p>
          <p className="text-xs text-gray-400">Dari total {logs.length} log. Filter dipindahkan ke popup agar halaman tetap ringkas.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setShowFilterModal(true)} className="inline-flex items-center gap-2 bg-gray-900 text-white px-5 py-3 rounded-xl text-sm hover:bg-gray-800">
            <span>🔎</span>
            Filter
            {activeFilterCount > 0 && <span className="bg-white text-gray-900 text-[10px] px-2 py-0.5 rounded-full">{activeFilterCount}</span>}
          </button>
          {activeFilterCount > 0 && <button onClick={resetFilters} className="bg-gray-100 text-gray-700 px-4 py-3 rounded-xl text-sm hover:bg-gray-200">Reset</button>}
        </div>
      </div>

      {showFilterModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl bg-white rounded-3xl shadow-xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <div>
                <h3 className="font-bold text-gray-900">Filter Log Aktivitas</h3>
                <p className="text-xs text-gray-400 mt-1">Pilih parameter log yang ingin ditampilkan.</p>
              </div>
              <button onClick={() => setShowFilterModal(false)} className="text-gray-400 hover:text-gray-700 text-xl">×</button>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
              <div className="flex justify-end gap-2 mt-6">
                <button onClick={resetFilters} className="bg-gray-100 text-gray-700 px-5 py-3 rounded-xl text-sm hover:bg-gray-200">Reset</button>
                <button onClick={() => setShowFilterModal(false)} className="bg-gray-900 text-white px-5 py-3 rounded-xl text-sm hover:bg-gray-800">Terapkan</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {loading && <div className="bg-white rounded-2xl shadow-sm p-10 text-center text-gray-400">Memuat log aktivitas...</div>}

      {!loading && filteredLogs.length === 0 && (
        <div className="bg-white rounded-2xl shadow-sm p-10 text-center">
          <p className="text-4xl mb-3">🕒</p>
          <p className="text-gray-500">Belum ada log aktivitas sesuai filter.</p>
        </div>
      )}

      {!loading && filteredLogs.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs text-gray-400 bg-gray-50">
                  <th className="px-5 py-3 font-medium">Waktu</th>
                  <th className="px-5 py-3 font-medium">Action</th>
                  <th className="px-5 py-3 font-medium">Deskripsi</th>
                  <th className="px-5 py-3 font-medium">Actor</th>
                  <th className="px-5 py-3 font-medium">Request</th>
                </tr>
              </thead>
              <tbody>
                {pagedLogs.map((log) => (
                  <tr key={log.id} className="border-b border-gray-50 align-top hover:bg-gray-50/60">
                    <td className="px-5 py-4 text-xs text-gray-500 whitespace-nowrap">{formatTanggal(log.created_at)}</td>
                    <td className="px-5 py-4"><span className="bg-gray-100 text-gray-700 text-[11px] px-2 py-1 rounded-full font-medium">{log.action || '-'}</span></td>
                    <td className="px-5 py-4 text-gray-700 max-w-xl">{log.description || '-'}</td>
                    <td className="px-5 py-4">
                      <span className={'text-[11px] px-2 py-1 rounded-full ' + roleClass(log.actor_role)}>{log.actor_role || '-'}</span>
                      <p className="text-xs text-gray-400 mt-1">{log.actor_email || '-'}</p>
                    </td>
                    <td className="px-5 py-4 text-xs text-blue-500 whitespace-nowrap">{log.request_id || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Pagination page={safePage} pageSize={pageSize} totalItems={filteredLogs.length} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1) }} />
    </div>
  )
}

export default AdminAuditLogsPage
