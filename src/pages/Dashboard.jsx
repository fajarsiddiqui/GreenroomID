import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import RequestForm from './RequestForm'
import DetailRequest from './DetailRequest'
import ClientServicesPage from './ClientServicesPage'

function Dashboard({ user }) {
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [showServices, setShowServices] = useState(false)
  const [selectedId, setSelectedId] = useState(null)
  const [pendingService, setPendingService] = useState(null)

  const fetchRequests = async () => {
    setLoading(true)

    const { data, error } = await supabase
      .from('requests')
      .select('*')
      .eq('client_id', user.id)
      .order('created_at', { ascending: false })

    if (!error) setRequests(data || [])

    setLoading(false)
  }

  useEffect(() => {
    fetchRequests()

    const storedService = localStorage.getItem('greenroomid_pending_service')

    if (storedService) {
      try {
        const parsedService = JSON.parse(storedService)
        setPendingService(parsedService)
        setShowForm(true)
      } catch {
        localStorage.removeItem('greenroomid_pending_service')
      }
    }
  }, [])

  const openManualForm = () => {
    setPendingService(null)
    setShowForm(true)
  }

  const closeForm = () => {
    setShowForm(false)
    setPendingService(null)
    localStorage.removeItem('greenroomid_pending_service')
    fetchRequests()
  }

  const openServices = () => {
    setShowServices(true)
    setShowForm(false)
    setSelectedId(null)
  }

  const chooseServiceFromClientPage = (serviceSnapshot) => {
    setPendingService(serviceSnapshot)
    setShowServices(false)
    setShowForm(true)
  }

  const getStatusColor = (status) => {
    if (status === 'PENDING') return 'bg-yellow-100 text-yellow-700'
    if (status === 'OPEN') return 'bg-blue-100 text-blue-700'
    if (status === 'ON PROGRESS') return 'bg-purple-100 text-purple-700'
    if (status === 'REVIEW') return 'bg-orange-100 text-orange-700'
    if (status === 'WAITING PAYMENT') return 'bg-red-100 text-red-700'
    if (status === 'PAYMENT UPLOADED') return 'bg-indigo-100 text-indigo-700'
    if (status === 'DELIVERED') return 'bg-green-100 text-green-700'
    if (status === 'DONE') return 'bg-gray-100 text-gray-700'
    if (status === 'DISPUTE') return 'bg-red-200 text-red-800'
    return 'bg-gray-100 text-gray-600'
  }

  if (showServices) return (
    <ClientServicesPage
      user={user}
      onBack={() => {
        setShowServices(false)
        fetchRequests()
      }}
      onChooseService={chooseServiceFromClientPage}
    />
  )

  if (showForm) return (
    <RequestForm
      user={user}
      initialService={pendingService}
      onBack={closeForm}
    />
  )

  if (selectedId) return (
    <DetailRequest
      user={user}
      requestId={selectedId}
      onBack={() => {
        setSelectedId(null)
        fetchRequests()
      }}
    />
  )

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
          <h2 className="text-lg font-bold text-gray-700">Request Saya</h2>

          <div className="flex flex-col sm:flex-row gap-2">
            <button
              onClick={openServices}
              className="bg-white text-gray-700 border border-gray-200 text-sm px-5 py-2 rounded-xl hover:bg-gray-50 transition"
            >
              Layanan & Harga
            </button>

            <button
              onClick={openManualForm}
              className="bg-blue-600 text-white text-sm px-5 py-2 rounded-xl hover:bg-blue-700 transition"
            >
              + Buat Request Manual
            </button>
          </div>
        </div>

        {loading && (
          <p className="text-center text-gray-400 py-10">Memuat...</p>
        )}

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
                <div
                  key={req.id}
                  onClick={() => setSelectedId(req.id)}
                  className="bg-white rounded-2xl shadow-sm p-6 cursor-pointer hover:shadow-md transition"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h3 className="font-bold text-gray-800">{req.judul}</h3>

                      {serviceName && (
                        <p className="text-xs text-blue-500 mt-1">
                          Layanan: {serviceName}
                        </p>
                      )}
                    </div>

                    <span className={'text-xs font-medium px-3 py-1 rounded-full ' + getStatusColor(req.status)}>
                      {req.status}
                    </span>
                  </div>

                  <p className="text-sm text-gray-500 mb-2 line-clamp-2">
                    {req.deskripsi}
                  </p>

                  <div className="flex flex-wrap items-center gap-4 text-xs text-gray-400">
                    <span>Kategori: {req.kategori}</span>
                    <span>Tanggal: {new Date(req.created_at).toLocaleDateString('id-ID')}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export default Dashboard