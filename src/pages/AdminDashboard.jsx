import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase'
import { DEFAULT_SITE_BRANDING, SITE_BRANDING_KEYS, mergeSiteBrandingRows } from '../utils/siteBranding'

const initialCounts = {
  activeRequests: 0,
  waitingPayment: 0,
  paymentUploaded: 0,
  files: 0,
  deletedItems: 0,
  activeServices: 0,
  serviceCategories: 0,
  freeServiceUsage: 0,
  logs: 0,
  unreadMessages: 0,
  activeForms: 0,
  formResponses: 0,
  formDeleted: 0,
  learningEntries: 0,
  learningPublished: 0,
  learningReviewQueue: 0,
  learningPaymentQueue: 0,
  donationTransactions: 0,
  donationEnabled: 0,
  landingContentRows: 0,
  brandingRows: 0,
  revisionSettings: 0,
  accounts: 0,
  paymentProfileReady: 0
}

function asRows(result) {
  return result?.error ? [] : result?.data || []
}

function AdminDashboard({ user }) {
  const [counts, setCounts] = useState(initialCounts)
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

    const [
      requestsResult,
      filesResult,
      servicesResult,
      categoriesResult,
      freeUsageResult,
      logsResult,
      unreadResult,
      formsResult,
      formResponsesResult,
      learningResult,
      learningPaymentsResult,
      donationStatsResult,
      donationSettingsResult,
      landingContentResult,
      revisionSettingsResult,
      accountsResult,
      paymentProfileResult
    ] = await Promise.all([
      supabase.from('requests').select('id, status, deleted_at').limit(5000),
      supabase.from('request_files').select('id, deleted_at').limit(5000),
      supabase.from('service_items').select('id, is_active').limit(5000),
      supabase.from('service_categories').select('id, is_active').limit(5000),
      supabase.rpc('get_free_service_usage_total'),
      supabase.from('audit_logs').select('id').limit(5000),
      supabase.from('diskusi').select('id').eq('role', 'client').is('read_by_admin_at', null).limit(5000),
      supabase.from('forms').select('id, status, deleted_at').limit(5000),
      supabase.from('form_responses').select('id, deleted_at').limit(5000),
      supabase.from('learning_entries').select('id, status, published_at').limit(5000),
      supabase.from('learning_payments').select('id, status').limit(5000),
      supabase.rpc('get_admin_donation_stats'),
      supabase.from('donation_settings').select('is_enabled, show_donate_page').eq('id', 'default').maybeSingle(),
      supabase.from('landing_content').select('id, content_key').limit(5000),
      supabase.from('revision_settings').select('id').limit(5000),
      supabase.rpc('admin_list_accounts'),
      supabase.from('admin_payment_settings').select('id, qris_url, account_number').eq('id', 'default').maybeSingle()
    ])

    const requestRows = asRows(requestsResult)
    const fileRows = asRows(filesResult)
    const serviceRows = asRows(servicesResult)
    const categoryRows = asRows(categoriesResult)
    const logRows = asRows(logsResult)
    const unreadRows = asRows(unreadResult)
    const formRows = asRows(formsResult)
    const responseRows = asRows(formResponsesResult)
    const learningRows = asRows(learningResult)
    const learningPaymentRows = asRows(learningPaymentsResult)
    const landingRows = asRows(landingContentResult)
    const revisionRows = asRows(revisionSettingsResult)
    const accountRows = asRows(accountsResult)
    const donationStats = Array.isArray(donationStatsResult?.data) ? donationStatsResult.data[0] : donationStatsResult?.data
    const donationSettings = donationSettingsResult?.error ? null : donationSettingsResult?.data
    const paymentProfile = paymentProfileResult?.error ? null : paymentProfileResult?.data

    if (unreadResult.error) console.log('Gagal mengambil notifikasi pesan admin:', unreadResult.error.message)

    setCounts({
      activeRequests: requestRows.filter((item) => !item.deleted_at && String(item.status || '').toUpperCase() !== 'DONE').length,
      waitingPayment: requestRows.filter((item) => !item.deleted_at && item.status === 'WAITING PAYMENT').length,
      paymentUploaded: requestRows.filter((item) => !item.deleted_at && item.status === 'PAYMENT UPLOADED').length,
      files: fileRows.filter((item) => !item.deleted_at).length,
      deletedItems: requestRows.filter((item) => item.deleted_at).length + fileRows.filter((item) => item.deleted_at).length,
      activeServices: serviceRows.filter((item) => item.is_active).length,
      serviceCategories: categoryRows.filter((item) => item.is_active !== false).length,
      freeServiceUsage: freeUsageResult.error ? 0 : Number(freeUsageResult.data || 0),
      logs: logRows.length,
      unreadMessages: unreadResult.error ? 0 : unreadRows.length,
      activeForms: formRows.filter((item) => !item.deleted_at && item.status === 'active').length,
      formResponses: responseRows.filter((item) => !item.deleted_at).length,
      formDeleted: formRows.filter((item) => item.deleted_at || item.status === 'deleted_by_owner').length,
      learningEntries: learningRows.length,
      learningPublished: learningRows.filter((item) => item.status === 'published' || item.published_at).length,
      learningReviewQueue: learningRows.filter((item) => ['submitted', 'under_review', 'revision_requested', 'accepted_pending_payment'].includes(item.status)).length,
      learningPaymentQueue: learningPaymentRows.filter((item) => item.status === 'awaiting_verification').length,
      donationTransactions: Number(donationStats?.total_donations || donationStats?.paid_count || donationStats?.donation_count || 0),
      donationEnabled: donationSettings?.is_enabled !== false && donationSettings?.show_donate_page !== false ? 1 : 0,
      landingContentRows: landingRows.length,
      brandingRows: landingRows.filter((item) => SITE_BRANDING_KEYS.includes(item.content_key)).length,
      revisionSettings: revisionRows.length,
      accounts: accountRows.length,
      paymentProfileReady: paymentProfile?.qris_url || paymentProfile?.account_number ? 1 : 0
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
      to: '/admin/forms',
      icon: '🧾',
      title: 'Formulir Online',
      description: 'Pantau request link formulir, form aktif, respons, soft delete, dan hapus permanen.',
      counter: counts.activeForms,
      label: 'form aktif',
      color: 'bg-indigo-50 text-indigo-700'
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
      to: '/admin/ruang-belajar',
      icon: '📚',
      title: 'Ruang Belajar',
      description: 'Kelola artikel, sumber pembelajaran, status publikasi, dan arsip pengetahuan.',
      counter: counts.learningEntries,
      label: 'konten',
      color: 'bg-lime-50 text-lime-700'
    },
    {
      to: '/admin/ruang-belajar/review',
      icon: '🔎',
      title: 'Review Pembelajaran',
      description: 'Review kiriman pembelajaran client dan tentukan status editorial.',
      counter: counts.learningReviewQueue,
      label: 'antrean',
      color: counts.learningReviewQueue > 0 ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-600',
      highlight: counts.learningReviewQueue > 0
    },
    {
      to: '/admin/ruang-belajar/pembayaran',
      icon: '💳',
      title: 'Kontribusi Publikasi',
      description: 'Verifikasi pembayaran kontribusi publikasi hasil pembelajaran.',
      counter: counts.learningPaymentQueue,
      label: 'menunggu',
      color: counts.learningPaymentQueue > 0 ? 'bg-orange-50 text-orange-700' : 'bg-gray-100 text-gray-600',
      highlight: counts.learningPaymentQueue > 0
    },
    {
      to: '/admin/donations',
      icon: '💚',
      title: 'Donasi',
      description: 'Kelola pengaturan donasi, visibilitas halaman, dan data transaksi donatur.',
      counter: counts.donationTransactions,
      label: 'transaksi',
      color: counts.donationEnabled ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'
    },
    {
      to: '/admin/landing-content',
      icon: '✏️',
      title: 'Landing Page',
      description: 'Edit konten teks, CTA, dan bagian penting pada halaman depan website.',
      counter: counts.landingContentRows,
      label: 'konten',
      color: 'bg-cyan-50 text-cyan-700'
    },
    {
      to: '/admin/site-branding',
      icon: '🔎',
      title: 'Branding & SEO',
      description: 'Atur identitas situs, favicon, metadata SEO, dan tampilan brand utama.',
      counter: counts.brandingRows,
      label: 'field',
      color: 'bg-violet-50 text-violet-700'
    },
    {
      to: '/admin/revision-settings',
      icon: '⏳',
      title: 'Waktu Revisi',
      description: 'Atur batas masa revisi, jatah revisi, dan kebijakan revisi request.',
      counter: counts.revisionSettings,
      label: 'setelan',
      color: 'bg-yellow-50 text-yellow-700'
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
      counter: counts.deletedItems + counts.formDeleted,
      label: 'item terhapus',
      color: 'bg-red-50 text-red-700'
    },
    {
      to: '/admin/accounts',
      icon: '👥',
      title: 'Manajemen Akun',
      description: 'Lihat akun yang pernah login dan ubah role pengguna jika dibutuhkan.',
      counter: counts.accounts,
      label: 'akun',
      color: 'bg-slate-100 text-slate-700'
    },
    {
      to: '/admin/profile',
      icon: '💳',
      title: 'Profile Payment',
      description: 'Atur QRIS, rekening, instruksi pembayaran, dan profil penerima pembayaran.',
      counter: counts.paymentProfileReady,
      label: counts.paymentProfileReady ? 'siap' : 'belum siap',
      color: counts.paymentProfileReady ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700',
      highlight: !counts.paymentProfileReady
    }
  ]

  return (
    <div className="min-h-screen bg-gray-100 pt-14">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-6 rounded-3xl bg-gray-900 p-8 text-white">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-white/10">
                <img src={logoUrl} alt="Logo branding" className="h-11 w-11 object-contain" />
              </div>
              <div>
                <p className="mb-2 text-sm font-medium text-green-300">Dashboard Admin, {siteName}</p>
                <h1 className="text-3xl font-bold">Admin {siteName}</h1>
                <p className="mt-2 text-sm text-gray-300">Semua menu utama admin sekarang tersedia sebagai card agar lebih mudah dipantau tanpa membuka sidebar.</p>
              </div>
            </div>
            <div className="text-left lg:text-right">
              <p className="text-xs text-gray-400">Login sebagai</p>
              <p className="max-w-xs truncate text-sm font-medium">{user.email}</p>
              <button
                onClick={() => supabase.auth.signOut()}
                className="mt-3 rounded-xl bg-red-500 px-4 py-2 text-sm text-white transition hover:bg-red-600"
              >
                Keluar
              </button>
            </div>
          </div>
        </div>

        {loading && (
          <div className="rounded-2xl bg-white p-10 text-center text-gray-400 shadow-sm">Memuat dashboard admin...</div>
        )}

        {!loading && (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            {cards.map((card) => (
              <Link
                key={card.title}
                to={card.to}
                className={'block rounded-3xl bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ' + (card.highlight ? 'ring-2 ring-red-100' : '')}
              >
                <div className="mb-5 flex items-start justify-between gap-4">
                  <div className="text-4xl">{card.icon}</div>
                  <span className={'rounded-full px-3 py-1 text-xs font-semibold ' + card.color}>
                    {formatCounter(card.counter)} {card.label}
                  </span>
                </div>
                <h2 className="mb-2 text-xl font-bold text-gray-900">{card.title}</h2>
                <p className="min-h-[60px] text-sm leading-relaxed text-gray-500">{card.description}</p>
                <p className="mt-5 text-sm font-medium text-blue-600">Buka menu →</p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default AdminDashboard
