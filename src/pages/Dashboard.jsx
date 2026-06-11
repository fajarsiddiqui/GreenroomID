import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import { badgeClass } from '../utils/status'

function Dashboard({ user }) {
  const navigate = useNavigate()
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchRequests = async () => {
    setLoading(true)

    let query = supabase
      .from('requests')
      .select('*')
      .eq('client_id', user.id)
      .order('created_at', { ascending: false })

    // Request terhapus tidak ditampilkan ke client.
    query = query.is('deleted_at', null)

    const { data, error } = await query

    if (!error) setRequests(data || [])
    setLoading(false)
  }

  useEffect(() => {
    fetchRequests()

    const storedService = localStorage.getItem('greenroomid_pending_service')
    if (storedService) navigate('/request/new')
  }, [])

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="bg-white shadow-sm px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-800">GreenroomID</h1>
          <p className="text-xs text-gray-400">{user.email}</p>
        </div>

        <button
          onClick={() => supabase.auth.signOut()}
          className="text-sm text-red-400 hover:text-red-600 transition"
        >
          Keluar
        </button>
      </div>

      <div className="max-w-3xl mx-auto p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
          <div>
            <h2 className="text-lg font-bold text-gray-700">Request Saya</h2>
            <p className="text-xs text-gray-400 mt-1">Kelola request, invoice, diskusi, dan hasil dari satu dashboard.</p>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <button
              onClick={() => navigate('/client/services')}
              className="bg-white text-gray-700 border border-gray-200 text-sm px-5 py-2 rounded-xl hover:bg-gray-50 transition"
            >
              Layanan & Harga
            </button>

            <button
              onClick={() => navigate('/request/new')}
              className="bg-blue-600 text-white text-sm px-5 py-2 rounded-xl hover:bg-blue-700 transition"
            >
              + Buat Request Manual
            </button>
          </div>
        </div>

        {loading && <p className="text-center text-gray-400 py-10">Memuat...</p>}

        {!loading && requests.length === 0 && (
          <div className="bg-white rounded-2xl shadow-sm p-10 text-center">
            <p className="text-4xl mb-3">📋</p>
            <p className="text-gray-500">Belum ada request.</p>
            <p className="text-gray-400 text-sm mt-1">
              Pilih layanan atau buat request manual untuk memulai.
            </p>
          </div>
        )}

        {!loading && requests.length > 0 && (
          <div className="space-y-4">
            {requests.map((req) => {
              const serviceName = req.service_snapshot?.service_name

              return (
                <button
                  key={req.id}
                  onClick={() => navigate(`/request/${req.id}`)}
                  className="w-full bg-white rounded-2xl shadow-sm p-6 text-left cursor-pointer hover:shadow-md transition"
                >
                  <div className="flex items-start justify-between mb-2 gap-3">
                    <div>
                      <h3 className="font-bold text-gray-800">{req.judul}</h3>
                      {serviceName && (
                        <p className="text-xs text-blue-500 mt-1">Layanan: {serviceName}</p>
                      )}
                    </div>
                    <span className={badgeClass(req.status)}>{req.status}</span>
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
