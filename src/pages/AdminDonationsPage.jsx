import { useEffect, useState } from 'react'
import { supabase } from '../supabase'

const formatRupiah = (value) =>
  new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0
  }).format(Number(value || 0))

const formatDateTime = (value) => {
  if (!value) return '-'
  return new Date(value).toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

const statusClass = {
  pending: 'bg-yellow-50 text-yellow-700 border-yellow-100',
  paid: 'bg-green-50 text-green-700 border-green-100',
  failed: 'bg-red-50 text-red-700 border-red-100',
  expired: 'bg-gray-100 text-gray-600 border-gray-200',
  cancelled: 'bg-red-50 text-red-700 border-red-100',
  refunded: 'bg-blue-50 text-blue-700 border-blue-100'
}

function AdminDonationsPage() {
  const [stats, setStats] = useState(null)
  const [donations, setDonations] = useState([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  const fetchDonations = async () => {
    setLoading(true)
    setMessage('')

    const [statsResult, donationsResult] = await Promise.all([
      supabase.rpc('get_admin_donation_stats'),
      supabase.rpc('get_admin_donations', { p_limit: 80 })
    ])

    if (statsResult.error || donationsResult.error) {
      setMessage(
        'Gagal mengambil data donasi. Jalankan SQL supabase/h26-midtrans-donation-gateway.sql lalu supabase/h27-donation-anonymous-leaderboard.sql. Detail: ' +
          (statsResult.error?.message || donationsResult.error?.message)
      )
    }

    setStats(Array.isArray(statsResult.data) ? statsResult.data[0] : null)
    setDonations(donationsResult.error ? [] : donationsResult.data || [])
    setLoading(false)
  }

  useEffect(() => {
    fetchDonations()
  }, [])

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="bg-white rounded-3xl shadow-sm p-6 mb-6">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-green-700 mb-2">Midtrans Donation Gateway</p>
              <h1 className="text-3xl font-black text-gray-900">Donasi</h1>
              <p className="text-gray-500 mt-2 max-w-3xl">
                Monitoring donasi otomatis. Status <b>paid</b> hanya diubah oleh webhook Midtrans setelah pembayaran valid.
              </p>
            </div>
            <button
              type="button"
              onClick={fetchDonations}
              className="rounded-2xl bg-gray-900 px-5 py-3 text-sm font-bold text-white hover:bg-gray-800"
            >
              Refresh
            </button>
          </div>
        </div>

        {message && (
          <div className="bg-yellow-50 border border-yellow-100 text-yellow-700 rounded-2xl p-4 mb-6 text-sm leading-relaxed">
            {message}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
          <div className="bg-white rounded-3xl border border-gray-200 p-5 shadow-sm lg:col-span-2">
            <p className="text-xs text-gray-400 mb-1">Total donasi paid</p>
            <p className="text-2xl font-black text-gray-900">{formatRupiah(stats?.total_amount || 0)}</p>
          </div>
          <div className="bg-white rounded-3xl border border-gray-200 p-5 shadow-sm">
            <p className="text-xs text-gray-400 mb-1">Paid</p>
            <p className="text-2xl font-black text-green-700">{stats?.paid_count || 0}</p>
          </div>
          <div className="bg-white rounded-3xl border border-gray-200 p-5 shadow-sm">
            <p className="text-xs text-gray-400 mb-1">Pending</p>
            <p className="text-2xl font-black text-yellow-700">{stats?.pending_count || 0}</p>
          </div>
          <div className="bg-white rounded-3xl border border-gray-200 p-5 shadow-sm">
            <p className="text-xs text-gray-400 mb-1">Gagal/Expired</p>
            <p className="text-2xl font-black text-red-600">{Number(stats?.failed_count || 0) + Number(stats?.expired_count || 0)}</p>
          </div>
        </div>

        <div className="bg-white rounded-3xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-black text-gray-900">Riwayat Donasi</h2>
              <p className="text-xs text-gray-400 mt-1">Data terbaru dari tabel donations.</p>
            </div>
          </div>

          {loading && <div className="p-10 text-center text-gray-400">Memuat donasi...</div>}

          {!loading && donations.length === 0 && (
            <div className="p-10 text-center text-gray-400">Belum ada data donasi.</div>
          )}

          {!loading && donations.length > 0 && (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-400">
                  <tr>
                    <th className="px-5 py-3">Order</th>
                    <th className="px-5 py-3">Donatur</th>
                    <th className="px-5 py-3">Nominal</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3">Payment</th>
                    <th className="px-5 py-3">Waktu</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {donations.map((item) => (
                    <tr key={item.id} className="align-top">
                      <td className="px-5 py-4">
                        <p className="font-mono text-xs text-gray-700 whitespace-nowrap">{item.order_id}</p>
                        <p className="text-[11px] text-gray-400 mt-1">Created {formatDateTime(item.created_at)}</p>
                      </td>
                      <td className="px-5 py-4 min-w-56">
                        <p className="font-bold text-gray-900">{item.leaderboard_name || (item.show_public ? item.donor_name : 'Anonim')}</p>
                        <p className="text-xs text-gray-400 break-all">{item.display_mode === 'anonymous' ? 'Mode anonim' : item.donor_email || '-'}</p>
                        {item.donor_message && <p className="text-xs text-gray-500 mt-2 line-clamp-2">“{item.donor_message}”</p>}
                      </td>
                      <td className="px-5 py-4 font-black text-gray-900 whitespace-nowrap">{formatRupiah(item.amount)}</td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-bold ${statusClass[item.status] || statusClass.pending}`}>
                          {item.status}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-xs text-gray-500 whitespace-nowrap">
                        <p>{item.payment_method || '-'}</p>
                        <p className="mt-1">{item.midtrans_transaction_status || '-'}</p>
                        {item.midtrans_fraud_status && <p className="mt-1">Fraud: {item.midtrans_fraud_status}</p>}
                      </td>
                      <td className="px-5 py-4 text-xs text-gray-500 whitespace-nowrap">
                        <p>Paid: {formatDateTime(item.paid_at)}</p>
                        <p className="mt-1">Update: {formatDateTime(item.updated_at)}</p>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default AdminDonationsPage
