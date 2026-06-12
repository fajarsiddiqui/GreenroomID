import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { badgeClass, statusLabel } from '../utils/status'

function AdminStatsPage() {
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    totalViews: 0,
    totalRequests: 0,
    pending: 0,
    waitingPayment: 0,
    paymentUploaded: 0,
    delivered: 0,
    done: 0,
    dispute: 0,
    verifiedRevenue: 0,
    activeCategories: 0,
    inactiveCategories: 0,
    activeServices: 0,
    inactiveServices: 0
  })

  const [recentRequests, setRecentRequests] = useState([])

  const formatRupiah = (angka) => {
    if (!angka) return 'Rp0'
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(angka)
  }

  const formatTanggal = (tanggal) => {
    if (!tanggal) return '-'
    return new Date(tanggal).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    })
  }

  const fetchStats = async () => {
    setLoading(true)

    const { data: publicStats } = await supabase.rpc('get_public_stats')

    const { data: requestsData, error: requestsError } = await supabase
      .from('requests')
      .select('id, created_at, judul, client_email, kategori, status, harga, payment_status, invoice_status, service_snapshot, deleted_at')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(5000)

    const { data: categoriesData, error: categoriesError } = await supabase
      .from('service_categories')
      .select('id, is_active')

    const { data: servicesData, error: servicesError } = await supabase
      .from('service_items')
      .select('id, is_active')

    if (requestsError) {
      alert('Gagal mengambil statistik request: ' + requestsError.message)
      setLoading(false)
      return
    }

    if (categoriesError) {
      alert('Gagal mengambil statistik kategori: ' + categoriesError.message)
      setLoading(false)
      return
    }

    if (servicesError) {
      alert('Gagal mengambil statistik layanan: ' + servicesError.message)
      setLoading(false)
      return
    }

    const requests = requestsData || []
    const categories = categoriesData || []
    const services = servicesData || []

    const countStatus = (statusName) => {
      return requests.filter((item) => item.status === statusName).length
    }

    const verifiedRevenue = requests
      .filter((item) => item.payment_status === 'VERIFIED' || item.invoice_status === 'PAID')
      .reduce((total, item) => total + (Number(item.harga) || 0), 0)

    setStats({
      totalViews: publicStats?.total_views || 0,
      totalRequests: requests.length,
      pending: countStatus('PENDING'),
      waitingPayment: countStatus('WAITING PAYMENT'),
      paymentUploaded: countStatus('PAYMENT UPLOADED'),
      delivered: countStatus('DELIVERED'),
      done: countStatus('DONE'),
      dispute: countStatus('DISPUTE'),
      verifiedRevenue,
      activeCategories: categories.filter((item) => item.is_active).length,
      inactiveCategories: categories.filter((item) => !item.is_active).length,
      activeServices: services.filter((item) => item.is_active).length,
      inactiveServices: services.filter((item) => !item.is_active).length
    })

    setRecentRequests(requests.slice(0, 8))
    setLoading(false)
  }

  useEffect(() => {
    fetchStats()
  }, [])

  const statCards = [
    { label: 'Total Kunjungan', value: stats.totalViews, note: 'Dari tracking landing page', color: 'border-slate-100 bg-white' },
    { label: 'Total Request', value: stats.totalRequests, note: 'Semua request masuk', color: 'border-blue-100 bg-blue-50' },
    { label: 'Pending', value: stats.pending, note: 'Belum direview admin', color: 'border-yellow-100 bg-yellow-50' },
    { label: 'Waiting Payment', value: stats.waitingPayment, note: 'Menunggu pembayaran', color: 'border-amber-100 bg-amber-50' },
    { label: 'Payment Uploaded', value: stats.paymentUploaded, note: 'Bukti bayar menunggu verifikasi', color: 'border-indigo-100 bg-indigo-50' },
    { label: 'Delivered', value: stats.delivered, note: 'File hasil sudah dikirim', color: 'border-green-100 bg-green-50' },
    { label: 'Done', value: stats.done, note: 'Request selesai', color: 'border-emerald-100 bg-emerald-50' },
    { label: 'Dispute', value: stats.dispute, note: 'Butuh penanganan admin', color: 'border-red-100 bg-red-50' }
  ]

  const serviceCards = [
    {
      label: 'Kategori Aktif',
      value: stats.activeCategories,
      note: 'Tampil di halaman layanan'
    },
    {
      label: 'Kategori Nonaktif',
      value: stats.inactiveCategories,
      note: 'Tidak tampil ke user'
    },
    {
      label: 'Layanan Aktif',
      value: stats.activeServices,
      note: 'Bisa dipilih user'
    },
    {
      label: 'Layanan Nonaktif',
      value: stats.inactiveServices,
      note: 'Disembunyikan sementara'
    }
  ]

  return (
    <div className="p-6">
      <div className="mb-6">
        <p className="inline-block bg-green-50 text-green-600 text-xs font-medium px-3 py-1 rounded-full mb-3">
          Statistik
        </p>

        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">
              Statistik Platform
            </h2>

            <p className="text-sm text-gray-500 mt-2">
              Ringkasan performa request, pembayaran, layanan, dan aktivitas platform.
            </p>
          </div>

        </div>
      </div>

      {loading && (
        <div className="bg-white rounded-2xl shadow-sm p-10 text-center">
          <p className="text-gray-400">Memuat statistik...</p>
        </div>
      )}

      {!loading && (
        <>
          <div className="bg-gray-900 rounded-3xl p-6 mb-6">
            <p className="text-gray-300 text-sm mb-2">Estimasi Revenue Terverifikasi</p>
            <h3 className="text-3xl font-bold text-white">
              {formatRupiah(stats.verifiedRevenue)}
            </h3>
            <p className="text-gray-400 text-xs mt-2">
              Dihitung dari request dengan payment_status VERIFIED atau invoice_status PAID.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
            {statCards.map((card) => (
              <div key={card.label} className={(card.color || 'bg-white border-gray-100') + " rounded-2xl shadow-sm p-5 border"}>
                <p className="text-2xl font-bold text-gray-900">{card.value}</p>
                <p className="text-sm font-medium text-gray-700 mt-1">{card.label}</p>
                <p className="text-xs text-gray-400 mt-2">{card.note}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
            {serviceCards.map((card) => (
              <div key={card.label} className={(card.color || 'bg-white border-gray-100') + " rounded-2xl shadow-sm p-5 border"}>
                <p className="text-2xl font-bold text-gray-900">{card.value}</p>
                <p className="text-sm font-medium text-gray-700 mt-1">{card.label}</p>
                <p className="text-xs text-gray-400 mt-2">{card.note}</p>
              </div>
            ))}
          </div>

          <div className="bg-white rounded-2xl shadow-sm p-6">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <h3 className="font-bold text-gray-800">Request Terbaru</h3>
                <p className="text-xs text-gray-400 mt-1">
                  Menampilkan 8 request terbaru.
                </p>
              </div>
            </div>

            {recentRequests.length === 0 && (
              <div className="border border-gray-200 rounded-2xl p-8 text-center">
                <p className="text-gray-400">Belum ada request.</p>
              </div>
            )}

            {recentRequests.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-left text-xs text-gray-400">
                      <th className="py-3 pr-4 font-medium">Tanggal</th>
                      <th className="py-3 pr-4 font-medium">Judul</th>
                      <th className="py-3 pr-4 font-medium">Client</th>
                      <th className="py-3 pr-4 font-medium">Kategori</th>
                      <th className="py-3 pr-4 font-medium">Status</th>
                      <th className="py-3 pr-4 font-medium">Harga</th>
                    </tr>
                  </thead>

                  <tbody>
                    {recentRequests.map((request) => (
                      <tr key={request.id} className="border-b border-gray-50">
                        <td className="py-3 pr-4 text-gray-500 whitespace-nowrap">
                          {formatTanggal(request.created_at)}
                        </td>

                        <td className="py-3 pr-4">
                          <p className="font-medium text-gray-800 line-clamp-1">
                            {request.judul}
                          </p>

                          {request.service_snapshot?.service_name && (
                            <p className="text-xs text-blue-500 mt-1 line-clamp-1">
                              {request.service_snapshot.service_name}
                            </p>
                          )}
                        </td>

                        <td className="py-3 pr-4 text-gray-500">
                          {request.client_email || '-'}
                        </td>

                        <td className="py-3 pr-4 text-gray-500">
                          {request.kategori || '-'}
                        </td>

                        <td className="py-3 pr-4">
                          <span className={badgeClass(request.status)}>
                            {statusLabel(request.status)}
                          </span>
                        </td>

                        <td className="py-3 pr-4 text-gray-500 whitespace-nowrap">
                          {formatRupiah(request.harga)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

export default AdminStatsPage