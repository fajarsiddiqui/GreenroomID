import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import RequestForm from './RequestForm'
import DetailRequest from './DetailRequest'

function Dashboard({ user }) {
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [selectedId, setSelectedId] = useState(null)

  const fetchRequests = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('requests')
      .select('*')
      .eq('client_id', user.id)
      .order('created_at', { ascending: false })
    if (!error) setRequests(data)
    setLoading(false)
  }

  useEffect(() => { fetchRequests() }, [])

  const getStatusColor = (status) => {
    if (status === 'PENDING') return 'bg-yellow-100 text-yellow-700'
    if (status === 'OPEN') return 'bg-blue-100 text-blue-700'
    if (status === 'ON PROGRESS') return 'bg-purple-100 text-purple-700'
    if (status === 'REVIEW') return 'bg-orange-100 text-orange-700'
    if (status === 'WAITING PAYMENT') return 'bg-red-100 text-red-700'
    if (status === 'DELIVERED') return 'bg-green-100 text-green-700'
    if (status === 'DONE') return 'bg-gray-100 text-gray-700'
    return 'bg-gray-100 text-gray-600'
  }

  if (showForm) return (
    <RequestForm user={user} onBack={() => { setShowForm(false); fetchRequests() }} />
  )

  if (selectedId) return (
    <DetailRequest user={user} requestId={selectedId} onBack={() => { setSelectedId(null); fetchRequests() }} />
  )

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="bg-white shadow-sm px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-800">GreenroomID</h1>
          <p className="text-xs text-gray-400">{user.email}</p>
        </div>
        <button onClick={() => supabase.auth.signOut()} className="text-sm text-red-400 hover:text-red-600 transition">Keluar</button>
      </div>
      <div className="max-w-3xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-gray-700">Request Saya</h2>
          <button onClick={() => setShowForm(true)} className="bg-blue-600 text-white text-sm px-5 py-2 rounded-xl hover:bg-blue-700 transition">+ Buat Request</button>
        </div>
        {loading && <p className="text-center text-gray-400 py-10">Memuat...</p>}
        {!loading && requests.length === 0 && (
          <div className="bg-white rounded-2xl shadow-sm p-10 text-center">
            <p className="text-4xl mb-3">📋</p>
            <p className="text-gray-500">Belum ada request.</p>
          </div>
        )}
        {!loading && requests.length > 0 && (
          <div className="space-y-4">
            {requests.map((req) => (
              <div key={req.id} onClick={() => setSelectedId(req.id)} className="bg-white rounded-2xl shadow-sm p-6 cursor-pointer hover:shadow-md transition">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-bold text-gray-800">{req.judul}</h3>
                  <span className={'text-xs font-medium px-3 py-1 rounded-full ' + getStatusColor(req.status)}>{req.status}</span>
                </div>
                <p className="text-sm text-gray-500 mb-2">{req.deskripsi}</p>
                <div className="flex items-center gap-4 text-xs text-gray-400">
                  <span>Kategori: {req.kategori}</span>
                  <span>Tanggal: {new Date(req.created_at).toLocaleDateString('id-ID')}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default Dashboard