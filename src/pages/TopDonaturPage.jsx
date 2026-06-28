import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../supabase'

const formatRupiah = (value) =>
  new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0
  }).format(Number(value || 0))

const formatDate = (value) => {
  if (!value) return '-'
  return new Date(value).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
}

function TopDonaturPage() {
  const [searchParams] = useSearchParams()
  const [period, setPeriod] = useState('all')
  const [summary, setSummary] = useState(null)
  const [topDonors, setTopDonors] = useState([])
  const [recentDonations, setRecentDonations] = useState([])
  const [loading, setLoading] = useState(true)
  const donationStatus = searchParams.get('donation')
  const orderId = searchParams.get('order_id')

  const fetchDonations = useCallback(async (nextPeriod = period, { silent = false } = {}) => {
    if (!silent) setLoading(true)
    const [summaryResult, topResult, recentResult] = await Promise.all([
      supabase.rpc('get_public_donation_summary'),
      supabase.rpc('get_public_top_donors', { p_period: nextPeriod }),
      supabase.rpc('get_public_recent_donations', { p_limit: 10 })
    ])

    setSummary(Array.isArray(summaryResult.data) ? summaryResult.data[0] : null)
    setTopDonors(topResult.error ? [] : topResult.data || [])
    setRecentDonations(recentResult.error ? [] : recentResult.data || [])
    if (!silent) setLoading(false)
  }, [period])

  useEffect(() => {
    fetchDonations(period)
  }, [period, fetchDonations])

  useEffect(() => {
    if (!donationStatus) return undefined

    let counter = 0
    const interval = window.setInterval(() => {
      counter += 1
      fetchDonations(period, { silent: true })
      if (counter >= 6) window.clearInterval(interval)
    }, 2500)

    return () => window.clearInterval(interval)
  }, [donationStatus, fetchDonations, period])

  const notice = donationStatus === 'success'
    ? `Pembayaran selesai. Top Donatur akan diperbarui otomatis setelah webhook Midtrans masuk${orderId ? ` untuk order ${orderId}` : ''}.`
    : donationStatus === 'pending'
      ? `Pembayaran masih pending. Selesaikan pembayaran agar donasi masuk Top Donatur${orderId ? ` untuk order ${orderId}` : ''}.`
      : ''

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-6">
          <div>
            <Link to="/" className="text-sm font-semibold text-green-700 hover:underline">
              ← Kembali ke Landing
            </Link>
            <h1 className="text-3xl sm:text-5xl font-black text-gray-900 mt-3">Top Donatur</h1>
            <p className="text-gray-500 mt-2 max-w-2xl">
              Daftar dukungan untuk GreenroomID yang sudah berhasil dibayar otomatis melalui payment gateway.
            </p>
          </div>
          <Link to="/donate-us" className="inline-flex items-center justify-center rounded-2xl bg-gray-950 px-5 py-3 text-sm font-black text-white hover:bg-gray-800">
            Donate Us
          </Link>
        </div>

        {notice && (
          <div className="mb-6 rounded-3xl border border-green-100 bg-green-50 p-4 text-sm text-green-800 leading-relaxed">
            {notice}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-3xl border border-gray-200 p-5 shadow-sm">
            <p className="text-xs text-gray-400 mb-1">Total donasi</p>
            <p className="text-2xl font-black text-gray-900">{formatRupiah(summary?.total_amount || 0)}</p>
          </div>
          <div className="bg-white rounded-3xl border border-gray-200 p-5 shadow-sm">
            <p className="text-xs text-gray-400 mb-1">Donasi berhasil</p>
            <p className="text-2xl font-black text-gray-900">{summary?.paid_count || 0}</p>
          </div>
          <div className="bg-white rounded-3xl border border-gray-200 p-5 shadow-sm">
            <p className="text-xs text-gray-400 mb-1">Identitas leaderboard</p>
            <p className="text-2xl font-black text-gray-900">{summary?.public_donor_count || 0}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6">
          <section className="bg-white rounded-[2rem] border border-gray-200 shadow-sm p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
              <h2 className="text-xl font-black text-gray-900">Ranking Donatur</h2>
              <div className="inline-flex rounded-2xl bg-gray-100 p-1">
                <button
                  type="button"
                  onClick={() => setPeriod('all')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold ${period === 'all' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
                >
                  Semua
                </button>
                <button
                  type="button"
                  onClick={() => setPeriod('month')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold ${period === 'month' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
                >
                  Bulan ini
                </button>
              </div>
            </div>

            {loading && <div className="py-10 text-center text-gray-400">Memuat donatur...</div>}

            {!loading && topDonors.length === 0 && (
              <div className="rounded-3xl border border-dashed border-gray-200 bg-gray-50 p-10 text-center text-gray-500">
                Belum ada donatur yang berhasil dibayar.
              </div>
            )}

            {!loading && topDonors.length > 0 && (
              <div className="space-y-3">
                {topDonors.map((donor, index) => (
                  <div key={`${donor.donor_name}-${index}`} className="flex items-center justify-between gap-4 rounded-3xl border border-gray-100 bg-gray-50 p-4">
                    <div className="flex items-center gap-4 min-w-0">
                      <div className={`h-11 w-11 shrink-0 rounded-2xl flex items-center justify-center font-black ${index === 0 ? 'bg-yellow-100 text-yellow-700' : index === 1 ? 'bg-gray-200 text-gray-700' : index === 2 ? 'bg-orange-100 text-orange-700' : 'bg-white text-gray-500 border border-gray-200'}`}>
                        #{index + 1}
                      </div>
                      <div className="min-w-0">
                        <p className="font-black text-gray-900 truncate">{donor.donor_name}</p>
                        <p className="text-xs text-gray-400">{donor.donation_count} donasi · terakhir {formatDate(donor.latest_paid_at)}</p>
                      </div>
                    </div>
                    <p className="font-black text-green-700 whitespace-nowrap">{formatRupiah(donor.total_amount)}</p>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="bg-white rounded-[2rem] border border-gray-200 shadow-sm p-6 h-fit">
            <h2 className="text-xl font-black text-gray-900 mb-5">Donasi Terbaru</h2>
            {recentDonations.length === 0 && <p className="text-sm text-gray-400">Belum ada donasi berhasil.</p>}
            <div className="space-y-3">
              {recentDonations.map((item, index) => (
                <div key={`${item.paid_at}-${index}`} className="rounded-3xl border border-gray-100 bg-gray-50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-black text-gray-900 truncate">{item.donor_name}</p>
                    <p className="text-sm font-black text-green-700 whitespace-nowrap">{formatRupiah(item.amount)}</p>
                  </div>
                  {item.donor_message && <p className="text-xs text-gray-500 mt-2 leading-relaxed">“{item.donor_message}”</p>}
                  <p className="text-[11px] text-gray-400 mt-2">{formatDate(item.paid_at)}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

export default TopDonaturPage
