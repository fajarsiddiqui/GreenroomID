import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase'
import { badgeClass, statusLabel } from '../utils/status'

const DEFAULT_REVENUE_SHARES = { freelance: 70, admin: 10, owner: 20 }

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
  const [showRevenueSettings, setShowRevenueSettings] = useState(false)
  const [revenueShares, setRevenueShares] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('greenroomid_revenue_shares') || 'null')
      return saved ? { ...DEFAULT_REVENUE_SHARES, ...saved } : DEFAULT_REVENUE_SHARES
    } catch {
      return DEFAULT_REVENUE_SHARES
    }
  })

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

  const revenueSplit = useMemo(() => {
    const total = Number(stats.verifiedRevenue) || 0
    return {
      freelance: Math.round(total * (Number(revenueShares.freelance) || 0) / 100),
      admin: Math.round(total * (Number(revenueShares.admin) || 0) / 100),
      owner: Math.round(total * (Number(revenueShares.owner) || 0) / 100)
    }
  }, [stats.verifiedRevenue, revenueShares])

  const revenueShareTotal = Number(revenueShares.freelance || 0) + Number(revenueShares.admin || 0) + Number(revenueShares.owner || 0)

  const fetchStats = async () => {
    setLoading(true)

    const { data: publicStats } = await supabase.rpc('get_public_stats')

    const { data: requestsData, error: requestsError } = await supabase
      .from('requests')
      .select('*')
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

    const countStatus = (statusName) => requests.filter((item) => item.status === statusName).length

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

    setRecentRequests(requests.sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at)).slice(0, 8))
    setLoading(false)
  }

  useEffect(() => {
    fetchStats()
  }, [])

  const updateShare = (field, value) => {
    setRevenueShares((current) => ({ ...current, [field]: value }))
  }

  const saveRevenueShares = () => {
    const normalized = {
      freelance: Math.max(0, Number(revenueShares.freelance) || 0),
      admin: Math.max(0, Number(revenueShares.admin) || 0),
      owner: Math.max(0, Number(revenueShares.owner) || 0)
    }
    localStorage.setItem('greenroomid_revenue_shares', JSON.stringify(normalized))
    setRevenueShares(normalized)
    setShowRevenueSettings(false)
  }

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
    { label: 'Kategori Aktif', value: stats.activeCategories, note: 'Tampil di halaman layanan' },
    { label: 'Kategori Nonaktif', value: stats.inactiveCategories, note: 'Tidak tampil ke user' },
    { label: 'Layanan Aktif', value: stats.activeServices, note: 'Bisa dipilih user' },
    { label: 'Layanan Nonaktif', value: stats.inactiveServices, note: 'Disembunyikan sementara' }
  ]

  return (
    <div className="p-6 pt-20">
      <div className="mb-6">
        <p className="inline-block bg-green-50 text-green-600 text-xs font-medium px-3 py-1 rounded-full mb-3">
          Statistik
        </p>

        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Statistik Platform</h2>
            <p className="text-sm text-gray-500 mt-2">Ringkasan performa request, pembayaran, layanan, dan aktivitas platform.</p>
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
          <div className="bg-gray-900 rounded-3xl p-6 mb-6 text-white relative overflow-hidden">
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-5">
              <div>
                <p className="text-gray-300 text-sm mb-2">Revenue Terverifikasi</p>
                <h3 className="text-3xl font-bold">{formatRupiah(stats.verifiedRevenue)}</h3>
                <p className="text-gray-400 text-xs mt-2">Dihitung dari request dengan payment_status VERIFIED atau invoice_status PAID.</p>
              </div>
              <button onClick={() => setShowRevenueSettings(true)} className="bg-white/10 border border-white/10 text-white px-4 py-3 rounded-xl text-sm transition hover:bg-white/15">
                Pengaturan Persentase
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
              <div className="rounded-2xl bg-white/10 border border-white/10 p-4">
                <p className="text-xs text-gray-300">Total Revenue</p>
                <p className="text-xl font-bold mt-2">{formatRupiah(stats.verifiedRevenue)}</p>
              </div>
              <div className="rounded-2xl bg-white/10 border border-white/10 p-4">
                <p className="text-xs text-gray-300">Revenue Freelance ({revenueShares.freelance}%)</p>
                <p className="text-xl font-bold mt-2">{formatRupiah(revenueSplit.freelance)}</p>
              </div>
              <div className="rounded-2xl bg-white/10 border border-white/10 p-4">
                <p className="text-xs text-gray-300">Revenue Admin ({revenueShares.admin}%)</p>
                <p className="text-xl font-bold mt-2">{formatRupiah(revenueSplit.admin)}</p>
              </div>
              <div className="rounded-2xl bg-white/10 border border-white/10 p-4">
                <p className="text-xs text-gray-300">Revenue Owner ({revenueShares.owner}%)</p>
                <p className="text-xl font-bold mt-2">{formatRupiah(revenueSplit.owner)}</p>
              </div>
            </div>
          </div>

          {showRevenueSettings && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 admin-fade-in">
              <div className="w-full max-w-lg bg-white rounded-3xl shadow-xl overflow-hidden admin-pop-panel">
                <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
                  <div>
                    <h3 className="font-bold text-gray-900">Pengaturan Persentase Revenue</h3>
                    <p className="text-xs text-gray-400 mt-1">Nilai disimpan di browser admin ini.</p>
                  </div>
                  <button onClick={() => setShowRevenueSettings(false)} className="text-gray-400 hover:text-gray-700 text-xl">×</button>
                </div>
                <div className="p-6 space-y-4">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Freelance (%)</label>
                    <input type="number" min="0" value={revenueShares.freelance} onChange={(event) => updateShare('freelance', event.target.value)} className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Admin (%)</label>
                    <input type="number" min="0" value={revenueShares.admin} onChange={(event) => updateShare('admin', event.target.value)} className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Owner (%)</label>
                    <input type="number" min="0" value={revenueShares.owner} onChange={(event) => updateShare('owner', event.target.value)} className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm" />
                  </div>
                  <p className={'text-xs ' + (revenueShareTotal === 100 ? 'text-green-600' : 'text-amber-600')}>Total persentase: {revenueShareTotal}%. Rekomendasi total 100%.</p>
                  <div className="flex justify-end gap-2 pt-2">
                    <button onClick={() => setRevenueShares(DEFAULT_REVENUE_SHARES)} className="bg-gray-100 text-gray-700 px-5 py-3 rounded-xl text-sm hover:bg-gray-200">Default</button>
                    <button onClick={saveRevenueShares} className="bg-gray-900 text-white px-5 py-3 rounded-xl text-sm hover:bg-gray-800">Simpan</button>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
            {statCards.map((card) => (
              <div key={card.label} className={(card.color || 'bg-white border-gray-100') + ' rounded-2xl shadow-sm p-5 border'}>
                <p className="text-2xl font-bold text-gray-900">{card.value}</p>
                <p className="text-sm font-medium text-gray-700 mt-1">{card.label}</p>
                <p className="text-xs text-gray-400 mt-2">{card.note}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
            {serviceCards.map((card) => (
              <div key={card.label} className={(card.color || 'bg-white border-gray-100') + ' rounded-2xl shadow-sm p-5 border'}>
                <p className="text-2xl font-bold text-gray-900">{card.value}</p>
                <p className="text-sm font-medium text-gray-700 mt-1">{card.label}</p>
                <p className="text-xs text-gray-400 mt-2">{card.note}</p>
              </div>
            ))}
          </div>

          <div className="bg-white rounded-2xl shadow-sm p-6">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <h3 className="font-bold text-gray-800">Request Terbaru Diedit</h3>
                <p className="text-xs text-gray-400 mt-1">Menampilkan 8 request berdasarkan aktivitas edit terbaru.</p>
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
                        <td className="py-3 pr-4 text-gray-500 whitespace-nowrap">{formatTanggal(request.updated_at || request.created_at)}</td>
                        <td className="py-3 pr-4">
                          <p className="font-medium text-gray-800 line-clamp-1">{request.judul}</p>
                          {request.service_snapshot?.service_name && <p className="text-xs text-blue-500 mt-1 line-clamp-1">{request.service_snapshot.service_name}</p>}
                        </td>
                        <td className="py-3 pr-4 text-gray-500">{request.client_email || '-'}</td>
                        <td className="py-3 pr-4 text-gray-500">{request.kategori || '-'}</td>
                        <td className="py-3 pr-4"><span className={badgeClass(request.status)}>{statusLabel(request.status)}</span></td>
                        <td className="py-3 pr-4 text-gray-500 whitespace-nowrap">{formatRupiah(request.harga)}</td>
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
