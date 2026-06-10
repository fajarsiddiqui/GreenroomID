import { useEffect, useState } from 'react'
import { supabase } from '../supabase'

function AdminAuditLogsPage() {
  const [logs, setLogs] = useState([])
  const [filteredLogs, setFilteredLogs] = useState([])
  const [loading, setLoading] = useState(true)

  const [filters, setFilters] = useState({
    action: '',
    actor_role: '',
    request_id: '',
    keyword: ''
  })

  const fetchLogs = async () => {
    setLoading(true)

    const { data, error } = await supabase
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500)

    if (error) {
      alert('Gagal mengambil log aktivitas: ' + error.message)
      setLogs([])
      setFilteredLogs([])
    } else {
      setLogs(data || [])
      setFilteredLogs(data || [])
    }

    setLoading(false)
  }

  useEffect(() => {
    fetchLogs()
  }, [])

  useEffect(() => {
    let result = [...logs]

    if (filters.action) {
      result = result.filter((log) => log.action === filters.action)
    }

    if (filters.actor_role) {
      result = result.filter((log) => log.actor_role === filters.actor_role)
    }

    if (filters.request_id.trim()) {
      result = result.filter((log) => String(log.request_id || '') === filters.request_id.trim())
    }

    if (filters.keyword.trim()) {
      const keyword = filters.keyword.toLowerCase()

      result = result.filter((log) => {
        const text = [
          log.actor_email,
          log.action,
          log.description,
          JSON.stringify(log.metadata || {})
        ]
          .join(' ')
          .toLowerCase()

        return text.includes(keyword)
      })
    }

    setFilteredLogs(result)
  }, [filters, logs])

  const formatTanggal = (tanggal) => {
    if (!tanggal) return '-'

    return new Date(tanggal).toLocaleString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getActionLabel = (action) => {
    const labels = {
      REQUEST_CREATED: 'Request dibuat',
      STATUS_CHANGED: 'Status diubah',
      REQUEST_UPDATED: 'Request diperbarui',
      INVOICE_CREATED: 'Invoice dibuat',
      PAYMENT_UPLOADED: 'Bukti bayar diupload',
      PAYMENT_VERIFIED: 'Pembayaran diverifikasi',
      PAYMENT_REJECTED: 'Pembayaran ditolak',
      RESULT_UPLOADED: 'File hasil diupload',
      ADMIN_MESSAGE_SENT: 'Pesan admin dikirim',
      CLIENT_MESSAGE_SENT: 'Pesan client dikirim',
      SERVICE_CATEGORY_CREATED: 'Kategori layanan dibuat',
      SERVICE_CATEGORY_UPDATED: 'Kategori layanan diedit',
      SERVICE_CATEGORY_STATUS_CHANGED: 'Status kategori diubah',
      SERVICE_CATEGORY_DELETED: 'Kategori layanan dihapus',
      SERVICE_ITEM_CREATED: 'Layanan dibuat',
      SERVICE_ITEM_UPDATED: 'Layanan diedit',
      SERVICE_ITEM_STATUS_CHANGED: 'Status layanan diubah',
      SERVICE_ITEM_DELETED: 'Layanan dihapus'
    }

    return labels[action] || action
  }

  const actionOptions = Array.from(new Set(logs.map((log) => log.action))).filter(Boolean)
  const roleOptions = Array.from(new Set(logs.map((log) => log.actor_role))).filter(Boolean)

  return (
    <div className="p-6">
      <div className="mb-6">
        <p className="inline-block bg-yellow-50 text-yellow-700 text-xs font-medium px-3 py-1 rounded-full mb-3">
          Log Aktivitas
        </p>

        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">
              Log Aktivitas Sistem
            </h2>

            <p className="text-sm text-gray-500 mt-2">
              Riwayat aktivitas penting dari request, pembayaran, layanan, dan admin.
            </p>
          </div>

          <button
            onClick={fetchLogs}
            className="bg-gray-900 text-white px-5 py-3 rounded-xl text-sm hover:bg-gray-800 transition"
          >
            Refresh Log
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm p-6 mb-6">
        <h3 className="font-bold text-gray-800 mb-4">Filter Log</h3>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Action</label>
            <select
              value={filters.action}
              onChange={(e) => setFilters({ ...filters, action: e.target.value })}
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm"
            >
              <option value="">Semua action</option>
              {actionOptions.map((action) => (
                <option key={action} value={action}>
                  {getActionLabel(action)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Role</label>
            <select
              value={filters.actor_role}
              onChange={(e) => setFilters({ ...filters, actor_role: e.target.value })}
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm"
            >
              <option value="">Semua role</option>
              {roleOptions.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Request ID</label>
            <input
              type="number"
              value={filters.request_id}
              onChange={(e) => setFilters({ ...filters, request_id: e.target.value })}
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm"
              placeholder="Contoh: 12"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Keyword</label>
            <input
              type="text"
              value={filters.keyword}
              onChange={(e) => setFilters({ ...filters, keyword: e.target.value })}
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm"
              placeholder="Cari email, deskripsi, metadata"
            />
          </div>
        </div>

        <button
          onClick={() => setFilters({ action: '', actor_role: '', request_id: '', keyword: '' })}
          className="mt-4 bg-gray-100 text-gray-700 px-4 py-2 rounded-xl text-sm hover:bg-gray-200"
        >
          Reset Filter
        </button>
      </div>

      {loading && (
        <div className="bg-white rounded-2xl shadow-sm p-10 text-center">
          <p className="text-gray-400">Memuat log aktivitas...</p>
        </div>
      )}

      {!loading && filteredLogs.length === 0 && (
        <div className="bg-white rounded-2xl shadow-sm p-10 text-center">
          <p className="text-4xl mb-3">🕒</p>
          <p className="text-gray-500">Belum ada log sesuai filter.</p>
        </div>
      )}

      {!loading && filteredLogs.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-gray-800">Daftar Log</h3>
            <p className="text-xs text-gray-400">
              Menampilkan {filteredLogs.length} dari {logs.length} log terakhir
            </p>
          </div>

          <div className="space-y-3">
            {filteredLogs.map((log) => (
              <div key={log.id} className="border border-gray-200 rounded-2xl p-4">
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3 mb-2">
                  <div>
                    <p className="font-bold text-gray-900">
                      {getActionLabel(log.action)}
                    </p>

                    <p className="text-sm text-gray-600 mt-1">
                      {log.description || '-'}
                    </p>
                  </div>

                  <div className="text-left md:text-right">
                    <p className="text-xs text-gray-400">
                      {formatTanggal(log.created_at)}
                    </p>

                    {log.request_id && (
                      <p className="text-xs text-blue-500 mt-1">
                        Request ID: {log.request_id}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 text-xs text-gray-500 mt-3">
                  <span className="bg-gray-100 px-3 py-1 rounded-full">
                    Role: {log.actor_role || '-'}
                  </span>

                  <span className="bg-gray-100 px-3 py-1 rounded-full">
                    Actor: {log.actor_email || '-'}
                  </span>

                  <span className="bg-gray-100 px-3 py-1 rounded-full">
                    Action: {log.action}
                  </span>
                </div>

                {log.metadata && Object.keys(log.metadata).length > 0 && (
                  <details className="mt-3">
                    <summary className="text-xs text-gray-400 cursor-pointer">
                      Lihat metadata
                    </summary>
                    <pre className="mt-2 bg-gray-50 rounded-xl p-3 text-xs text-gray-600 overflow-x-auto">
                      {JSON.stringify(log.metadata, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default AdminAuditLogsPage