import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import { badgeClass, statusLabel } from '../utils/status'
import ClientPortalHeader from '../components/ClientPortalHeader'

function Dashboard({ user }) {
  const navigate = useNavigate()
  const [requests, setRequests] = useState([])
  const [unreadByRequest, setUnreadByRequest] = useState({})
  const [loading, setLoading] = useState(true)

  const fetchUnreadMessages = async (requestRows) => {
    const ids = requestRows.map((item) => String(item.id))
    if (ids.length === 0) {
      setUnreadByRequest({})
      return
    }

    const { data, error } = await supabase
      .from('diskusi')
      .select('id, request_id')
      .in('request_id', ids)
      .eq('role', 'admin')
      .is('read_by_client_at', null)

    if (error) {
      console.log('Gagal mengambil notifikasi pesan client:', error.message)
      setUnreadByRequest({})
      return
    }

    const counts = (data || []).reduce((acc, item) => {
      const key = String(item.request_id)
      acc[key] = (acc[key] || 0) + 1
      return acc
    }, {})
    setUnreadByRequest(counts)
  }

  const fetchRequests = async () => {
    setLoading(true)

    const { data, error } = await supabase
      .from('requests')
      .select('*')
      .eq('client_id', user.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })

    const requestRows = error ? [] : data || []
    setRequests(requestRows)
    await fetchUnreadMessages(requestRows)
    setLoading(false)
  }

  useEffect(() => {
    fetchRequests()

    const storedService = localStorage.getItem('greenroomid_pending_service')
    if (storedService) navigate('/request/new')
  }, [])

  const totalUnread = Object.values(unreadByRequest).reduce((total, count) => total + count, 0)

  return (
    <div className="min-h-screen bg-gray-100">
      <ClientPortalHeader user={user} subtitle="Portal Client · Request Saya" />

      <div className="max-w-4xl mx-auto p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-gray-700">Request Saya</h2>
              {totalUnread > 0 && (
                <span className="inline-flex items-center rounded-full bg-red-500 px-2 py-0.5 text-[11px] font-bold text-white">
                  {totalUnread > 99 ? '99+' : totalUnread} pesan baru
                </span>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-1">Kelola request, invoice, diskusi, dan hasil dari satu dashboard.</p>
          </div>

        </div>

        {loading && <p className="text-center text-gray-400 py-10">Memuat...</p>}

        {!loading && requests.length === 0 && (
          <div className="bg-white rounded-2xl shadow-sm p-10 text-center">
            <p className="text-4xl mb-3">📋</p>
            <p className="text-gray-500">Belum ada request.</p>
            <p className="text-gray-400 text-sm mt-1">
              Gunakan tombol + Buat Request pada header untuk memulai.
            </p>
          </div>
        )}

        {!loading && requests.length > 0 && (
          <div className="space-y-4">
            {requests.map((req) => {
              const serviceName = req.service_snapshot?.service_name
              const unreadCount = unreadByRequest[String(req.id)] || 0

              return (
                <button
                  key={req.id}
                  onClick={() => navigate(`/request/${req.id}`)}
                  className="w-full bg-white rounded-2xl shadow-sm p-6 text-left cursor-pointer hover:shadow-md transition"
                >
                  <div className="flex items-start justify-between mb-2 gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-bold text-gray-800">{req.judul}</h3>
                        {unreadCount > 0 && (
                          <span className="inline-flex items-center rounded-full bg-red-500 px-2 py-0.5 text-[11px] font-bold text-white">
                            {unreadCount > 99 ? '99+' : unreadCount} baru
                          </span>
                        )}
                      </div>
                      {serviceName && (
                        <p className="text-xs text-blue-500 mt-1">Layanan: {serviceName}</p>
                      )}
                    </div>
                    <span className={badgeClass(req.status)}>{statusLabel(req.status)}</span>
                  </div>

                  <p className="text-sm text-gray-500 mb-2 line-clamp-2">{req.deskripsi}</p>

                  <div className="flex flex-wrap items-center gap-4 text-xs text-gray-400">
                    <span>Kategori: {req.kategori}</span>
                    <span>Tanggal: {new Date(req.created_at).toLocaleDateString('id-ID')}</span>
                    {req.deadline_at && <span>Deadline: {new Date(req.deadline_at).toLocaleDateString('id-ID')}</span>}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export default Dashboard
