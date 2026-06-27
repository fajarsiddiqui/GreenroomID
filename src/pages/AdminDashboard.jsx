import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase'
import { DEFAULT_SITE_BRANDING, SITE_BRANDING_KEYS, mergeSiteBrandingRows } from '../utils/siteBranding'

function AdminDashboard({ user }) {
  const [counts, setCounts] = useState({
    activeRequests: 0,
    waitingPayment: 0,
    paymentUploaded: 0,
    files: 0,
    deletedItems: 0,
    activeServices: 0,
    freeServiceUsage: 0,
    logs: 0,
    unreadMessages: 0
  })
  const [branding, setBranding] = useState(DEFAULT_SITE_BRANDING)
  const [loading, setLoading] = useState(true)

  const fetchBranding = async () => {
    const { data, error } = await supabase
      .from('landing_content')
      .select('content_key, content_value')
      .in('content_key', SITE_BRANDING_KEYS)

    if (!error && data) setBranding(mergeSiteBrandingRows(data))
  }

  const fetchCounts = async () => {
    setLoading(true)

    const [{ data: requests }, { data: files }, { data: services }, freeUsageResult, { data: logs }, unreadResult] = await Promise.all([
      supabase.from('requests').select('id, status, deleted_at').limit(5000),
      supabase.from('request_files').select('id, deleted_at').limit(5000),
      supabase.from('service_items').select('id, is_active').limit(5000),
      supabase.rpc('get_free_service_usage_total'),
      supabase.from('audit_logs').select('id').limit(5000),
      supabase.from('diskusi').select('id').eq('role', 'client').is('read_by_admin_at', null).limit(5000)
    ])

    const requestRows = requests || []
    const fileRows = files || []

    if (unreadResult.error) console.log('Gagal mengambil notifikasi pesan admin:', unreadResult.error.message)

    setCounts({
      activeRequests: requestRows.filter((item) => !item.deleted_at && String(item.status || '').toUpperCase() !== 'DONE').length,
      waitingPayment: requestRows.filter((item) => !item.deleted_at && item.status === 'WAITING PAYMENT').length,
      paymentUploaded: requestRows.filter((item) => !item.deleted_at && item.status === 'PAYMENT UPLOADED').length,
      files: fileRows.filter((item) => !item.deleted_at).length,
      deletedItems: requestRows.filter((item) => item.deleted_at).length + fileRows.filter((item) => item.deleted_at).length,
      activeServices: (services || []).filter((item) => item.is_active).length,
      freeServiceUsage: freeUsageResult.error ? 0 : Number(freeUsageResult.data || 0),
      logs: (logs || []).length,
      unreadMessages: unreadResult.error ? 0 : (unreadResult.data || []).length
    })

    setLoading(false)
  }

  useEffect(() => {
    fetchBranding()
    fetchCounts()
  }, [])

  const formatCounter = (value) => (Number(value) > 99 ? '99+' : value)
  const siteName = branding.site_name || 'GreenroomID'
  const logoUrl = branding.site_favicon_url || '/favicon.svg'

  const cards = [
    {
      to: '/admin/requests',
      icon: '📋',
      title: 'Request',
      description: 'Kelola request client, invoice, payment, file preview, dan file hasil.',
      counter: counts.activeRequests,
      label: 'request aktif',
      color: 'bg-blue-50 text-blue-700'
    },
    {
      to: '/admin/requests',
      icon: '💬',
      title: 'Pesan Baru',
      description: 'Buka daftar request untuk melihat badge pesan baru, lalu masuk ke detail request.',
      counter: counts.unreadMessages,
      label: 'pesan belum dibaca',
      color: counts.unreadMessages > 0 ? 'bg-red-50 text-red-700' : 'bg-gray-100 text-gray-600',
      highlight: counts.unreadMessages > 0
    },
    {
      to: '/admin/services',
      icon: '💼',
      title: 'Layanan & Harga',
      description: 'Tambah, edit, aktif/nonaktifkan kategori dan paket layanan.',
      counter: counts.activeServices,
      label: 'layanan aktif',
      color: 'bg-green-50 text-green-700'
    },

    {
      to: '/admin/free-services',
      icon: '🎁',
      title: 'Layanan Gratis',
      description: 'Pantau penggunaan tool gratis dan atur status aktif, nonaktif, atau maintenance.',
      counter: counts.freeServiceUsage,
      label: 'pemakaian',
      color: 'bg-emerald-50 text-emerald-700'
    },
    {
      to: '/admin/stats',
      icon: '📊',
      title: 'Statistik',
      description: 'Pantau request, revenue, status pembayaran, dan performa platform.',
      counter: counts.waitingPayment + counts.paymentUploaded,
      label: 'butuh perhatian',
      color: 'bg-amber-50 text-amber-700'
    },
    {
      to: '/admin/audit-logs',
      icon: '🕒',
      title: 'Log Aktivitas',
      description: 'Lihat jejak aktivitas request, pembayaran, upload file, dan status.',
      counter: counts.logs,
      label: 'log tercatat',
      color: 'bg-purple-50 text-purple-700'
    },
    {
      to: '/admin/archive',
      icon: '🗂️',
      title: 'Arsip',
      description: 'Lihat semua file yang diupload client dan admin dalam satu tempat.',
      counter: counts.files,
      label: 'file aktif',
      color: 'bg-sky-50 text-sky-700'
    },
    {
      to: '/admin/deleted-items',
      icon: '🗑️',
      title: 'Deleted Items',
      description: 'Pulihkan atau hapus permanen request dan file yang sudah dihapus.',
      counter: counts.deletedItems,
      label: 'item terhapus',
      color: 'bg-red-50 text-red-700'
    }
  ]

  return (
    <div className="min-h-screen bg-gray-100 pt-14">
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="bg-gray-900 rounded-3xl p-8 mb-6 text-white">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
            <div className="flex items-center gap-4">
              <div className="h-16 w-16 rounded-2xl bg-white/10 border border-white/10 flex items-center justify-center overflow-hidden shrink-0">
                <img src={logoUrl} alt="Logo branding" className="h-11 w-11 object-contain" />
              </div>
              <div>
                <p className="text-green-300 text-sm font-medium mb-2">Dashboard Admin, {siteName}</p>
                <h1 className="text-3xl font-bold">Admin {siteName}</h1>
                <p className="text-gray-300 text-sm mt-2">Pilih menu utama untuk mengelola request, layanan, file, dan aktivitas platform.</p>
              </div>
            </div>
            <div className="text-left lg:text-right">
              <p className="text-xs text-gray-400">Login sebagai</p>
              <p className="text-sm font-medium truncate max-w-xs">{user.email}</p>
              <button
                onClick={() => supabase.auth.signOut()}
                className="mt-3 bg-red-500 text-white px-4 py-2 rounded-xl text-sm transition hover:bg-red-600"
              >
                Keluar
              </button>
            </div>
          </div>
        </div>

        {loading && (
          <div className="bg-white rounded-2xl shadow-sm p-10 text-center text-gray-400">Memuat dashboard admin...</div>
        )}

        {!loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {cards.map((card) => (
              <Link
                key={card.title}
                to={card.to}
                className={'bg-white rounded-3xl shadow-sm p-6 hover:shadow-md hover:-translate-y-0.5 transition block ' + (card.highlight ? 'ring-2 ring-red-100' : '')}
              >
                <div className="flex items-start justify-between gap-4 mb-5">
                  <div className="text-4xl">{card.icon}</div>
                  <span className={'text-xs font-semibold px-3 py-1 rounded-full ' + card.color}>
                    {formatCounter(card.counter)} {card.label}
                  </span>
                </div>
                <h2 className="text-xl font-bold text-gray-900 mb-2">{card.title}</h2>
                <p className="text-sm text-gray-500 leading-relaxed">{card.description}</p>
                <p className="text-sm text-blue-600 font-medium mt-5">Buka menu →</p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default AdminDashboard
