import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase'
import { DEFAULT_SITE_BRANDING, SITE_BRANDING_KEYS, mergeSiteBrandingRows } from '../utils/siteBranding'

const DEFAULT_REVENUE_SHARES = { freelance: 70, admin: 10, owner: 20 }

const initialCounts = {
  totalViews: 0,
  totalRequests: 0,
  completedRequests: 0,
  activeRequests: 0,
  waitingPayment: 0,
  paymentUploaded: 0,
  verifiedRevenue: 0,
  paidRequests: 0,
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

const activitySeries = [
  { key: 'landing_views', label: 'Kunjungan beranda', color: '#18b981', soft: 'rgba(24, 185, 129, 0.18)' },
  { key: 'requests_created', label: 'Request dibuat', color: '#4f8ff7', soft: 'rgba(79, 143, 247, 0.16)' },
  { key: 'form_responses', label: 'Respons formulir', color: '#a66ee8', soft: 'rgba(166, 110, 232, 0.14)' },
  { key: 'learning_entries', label: 'Konten belajar', color: '#e3a22b', soft: 'rgba(227, 162, 43, 0.14)' }
]

function asRows(result) {
  return result?.error ? [] : result?.data || []
}

function DashboardIcon({ name, size = 20 }) {
  const props = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true
  }

  const paths = {
    request: <><path d="M4 4h16v13H9l-5 4z" /><path d="M8 9h8M8 13h5" /></>,
    message: <><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" /><path d="M8 9h8M8 13h5" /></>,
    form: <><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 8h6M9 12h6M9 16h3" /></>,
    review: <><path d="M4 4h16v13H9l-5 4z" /><path d="m9 10 2 2 4-4" /></>,
    payment: <><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20M6 15h4" /></>,
    trash: <><path d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15" /></>,
    service: <><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18" /></>,
    learning: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v16H6.5A2.5 2.5 0 0 0 4 21.5z" /><path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H13v16h4.5a2.5 2.5 0 0 1 2.5 2.5z" /></>,
    globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.9" /></>,
    activity: <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />,
    arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
    refresh: <><path d="M20 11a8 8 0 1 0-2.3 5.7" /><path d="M20 4v7h-7" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    warning: <><path d="M12 3 2.5 20h19z" /><path d="M12 9v4M12 17h.01" /></>,
    chevron: <path d="m9 18 6-6-6-6" />,
    revenue: <><path d="M4 19V5" /><path d="M4 19h16" /><path d="m7 15 4-4 3 2 5-6" /><path d="M16 7h3v3" /></>,
    eye: <><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z" /><circle cx="12" cy="12" r="2.5" /></>,
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>
  }

  return <svg {...props}>{paths[name] || paths.activity}</svg>
}

function clampPercent(value) {
  return Math.max(0, Math.min(100, Number(value) || 0))
}

function formatRupiah(value) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0
  }).format(Number(value || 0))
}

function readRevenueShares() {
  try {
    const saved = JSON.parse(window.localStorage.getItem('greenroomid_revenue_shares') || 'null')
    return saved ? { ...DEFAULT_REVENUE_SHARES, ...saved } : DEFAULT_REVENUE_SHARES
  } catch {
    return DEFAULT_REVENUE_SHARES
  }
}

function periodStart(value, granularity) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  date.setHours(0, 0, 0, 0)
  if (granularity === 'week') {
    const day = date.getDay() || 7
    date.setDate(date.getDate() - day + 1)
  } else if (granularity === 'month') {
    date.setDate(1)
  } else {
    date.setMonth(0, 1)
  }
  return date
}

function addPeriod(date, granularity, amount = 1) {
  const next = new Date(date)
  if (granularity === 'week') next.setDate(next.getDate() + amount * 7)
  else if (granularity === 'month') next.setMonth(next.getMonth() + amount)
  else next.setFullYear(next.getFullYear() + amount)
  return next
}

function periodKey(date) {
  return date.toISOString().slice(0, 10)
}

function buildFallbackActivity(raw, granularity) {
  const source = {
    landing_views: (raw.pageViews || []).filter((item) => !item.path || item.path === '/' || item.path === '/home'),
    requests_created: (raw.requests || []).filter((item) => !item.deleted_at),
    form_responses: (raw.formResponses || []).filter((item) => !item.deleted_at),
    learning_entries: raw.learningEntries || []
  }

  const dates = Object.values(source)
    .flat()
    .map((item) => periodStart(item.created_at, granularity))
    .filter(Boolean)

  const today = periodStart(new Date(), granularity)
  const earliest = dates.length > 0
    ? new Date(Math.min(...dates.map((date) => date.getTime())))
    : addPeriod(today, granularity, granularity === 'week' ? -11 : granularity === 'month' ? -5 : -2)

  const buckets = new Map()
  for (let cursor = earliest; cursor <= today; cursor = addPeriod(cursor, granularity)) {
    buckets.set(periodKey(cursor), {
      period_start: periodKey(cursor),
      landing_views: 0,
      requests_created: 0,
      form_responses: 0,
      learning_entries: 0
    })
  }

  Object.entries(source).forEach(([seriesKey, rows]) => {
    rows.forEach((item) => {
      const start = periodStart(item.created_at, granularity)
      if (!start) return
      const key = periodKey(start)
      const bucket = buckets.get(key)
      if (bucket) bucket[seriesKey] += 1
    })
  })

  return Array.from(buckets.values())
}

function formatPeriodLabel(value, granularity, compact = true) {
  const date = new Date(`${value}T00:00:00`)
  if (granularity === 'week') {
    return compact
      ? date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })
      : `Minggu ${date.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`
  }
  if (granularity === 'month') {
    return date.toLocaleDateString('id-ID', compact
      ? { month: 'short', year: '2-digit' }
      : { month: 'long', year: 'numeric' })
  }
  return date.toLocaleDateString('id-ID', { year: 'numeric' })
}

function buildSmoothPath(points) {
  if (!points.length) return ''
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`
  let path = `M ${points[0].x} ${points[0].y}`
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]
    const current = points[index]
    const middleX = (previous.x + current.x) / 2
    path += ` C ${middleX} ${previous.y}, ${middleX} ${current.y}, ${current.x} ${current.y}`
  }
  return path
}

function AdminDashboard({ user }) {
  const [counts, setCounts] = useState(initialCounts)
  const [branding, setBranding] = useState(DEFAULT_SITE_BRANDING)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [rawActivity, setRawActivity] = useState({ pageViews: [], requests: [], formResponses: [], learningEntries: [] })
  const [activityVersion, setActivityVersion] = useState(0)
  const [activityGranularity, setActivityGranularity] = useState('month')
  const [activityData, setActivityData] = useState([])
  const [activityLoading, setActivityLoading] = useState(true)
  const [activityNotice, setActivityNotice] = useState('')
  const [visibleSeries, setVisibleSeries] = useState(() => Object.fromEntries(activitySeries.map((item) => [item.key, true])))
  const [healthOpen, setHealthOpen] = useState(false)
  const [revenueShares] = useState(readRevenueShares)

  useEffect(() => {
    let active = true

    const loadDashboard = async () => {
      setErrorMessage('')
      if (reloadKey > 0) setRefreshing(true)
      else setLoading(true)

      try {
        const [
          brandingResult,
          publicStatsResult,
          pageViewsResult,
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
          supabase.from('landing_content').select('content_key, content_value').in('content_key', SITE_BRANDING_KEYS),
          supabase.rpc('get_public_stats'),
          supabase.from('page_views').select('id, path, created_at').order('created_at', { ascending: true }).limit(10000),
          supabase.from('requests').select('id, status, deleted_at, payment_status, invoice_status, harga, created_at, updated_at').limit(5000),
          supabase.from('request_files').select('id, deleted_at').limit(5000),
          supabase.from('service_items').select('id, is_active').limit(5000),
          supabase.from('service_categories').select('id, is_active').limit(5000),
          supabase.rpc('get_free_service_usage_total'),
          supabase.from('audit_logs').select('id').limit(5000),
          supabase.from('diskusi').select('id').eq('role', 'client').is('read_by_admin_at', null).limit(5000),
          supabase.from('forms').select('id, status, deleted_at').limit(5000),
          supabase.from('form_responses').select('id, deleted_at, created_at').limit(5000),
          supabase.from('learning_entries').select('id, status, published_at, created_at').limit(5000),
          supabase.from('learning_payments').select('id, status').limit(5000),
          supabase.rpc('get_admin_donation_stats'),
          supabase.from('donation_settings').select('is_enabled, show_donate_page').eq('id', 'default').maybeSingle(),
          supabase.from('landing_content').select('id, content_key').limit(5000),
          supabase.from('revision_settings').select('id').limit(5000),
          supabase.rpc('admin_list_accounts'),
          supabase.from('admin_payment_settings').select('id, qris_url, account_number').eq('id', 'default').maybeSingle()
        ])

        if (!active) return

        if (!brandingResult.error && brandingResult.data) {
          setBranding(mergeSiteBrandingRows(brandingResult.data))
        }

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
        const pageViewRows = asRows(pageViewsResult)
        const publicStats = publicStatsResult?.error ? null : publicStatsResult?.data
        const donationStats = Array.isArray(donationStatsResult?.data)
          ? donationStatsResult.data[0]
          : donationStatsResult?.data
        const donationSettings = donationSettingsResult?.error ? null : donationSettingsResult?.data
        const paymentProfile = paymentProfileResult?.error ? null : paymentProfileResult?.data
        const verifiedRequests = requestRows.filter((item) => !item.deleted_at && (item.payment_status === 'VERIFIED' || item.invoice_status === 'PAID'))

        setRawActivity({
          pageViews: pageViewRows,
          requests: requestRows,
          formResponses: responseRows,
          learningEntries: learningRows
        })
        setActivityVersion((value) => value + 1)

        setCounts({
          totalViews: Number(publicStats?.total_views || pageViewRows.length || 0),
          totalRequests: requestRows.filter((item) => !item.deleted_at).length,
          completedRequests: requestRows.filter((item) => !item.deleted_at && String(item.status || '').toUpperCase() === 'DONE').length,
          activeRequests: requestRows.filter((item) => !item.deleted_at && String(item.status || '').toUpperCase() !== 'DONE').length,
          waitingPayment: requestRows.filter((item) => !item.deleted_at && item.status === 'WAITING PAYMENT').length,
          paymentUploaded: requestRows.filter((item) => !item.deleted_at && item.status === 'PAYMENT UPLOADED').length,
          verifiedRevenue: verifiedRequests.reduce((total, item) => total + (Number(item.harga) || 0), 0),
          paidRequests: verifiedRequests.length,
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
      } catch (error) {
        if (active) setErrorMessage(error?.message || 'Dashboard gagal dimuat. Silakan coba lagi.')
      } finally {
        if (active) {
          setLoading(false)
          setRefreshing(false)
        }
      }
    }

    loadDashboard()

    return () => {
      active = false
    }
  }, [reloadKey])

  useEffect(() => {
    let active = true

    const loadActivity = async () => {
      setActivityLoading(true)
      setActivityNotice('')
      const { data, error } = await supabase.rpc('get_admin_dashboard_activity', {
        p_granularity: activityGranularity
      })

      if (!active) return

      if (!error && Array.isArray(data)) {
        setActivityData(data.map((item) => ({
          period_start: item.period_start,
          landing_views: Number(item.landing_views || 0),
          requests_created: Number(item.requests_created || 0),
          form_responses: Number(item.form_responses || 0),
          learning_entries: Number(item.learning_entries || 0)
        })))
      } else {
        setActivityData(buildFallbackActivity(rawActivity, activityGranularity))
        setActivityNotice('Grafik memakai fallback data lokal. Jalankan SQL analytics agar histori kunjungan terbaca penuh.')
      }
      setActivityLoading(false)
    }

    loadActivity()
    return () => {
      active = false
    }
  }, [activityGranularity, activityVersion, rawActivity])

  const siteName = branding.site_name || 'GreenroomID'
  const logoUrl = branding.site_favicon_url || '/favicon.svg'
  const todayLabel = new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' })

  const revenueSplit = useMemo(() => ({
    freelance: Math.round(counts.verifiedRevenue * (Number(revenueShares.freelance) || 0) / 100),
    admin: Math.round(counts.verifiedRevenue * (Number(revenueShares.admin) || 0) / 100),
    owner: Math.round(counts.verifiedRevenue * (Number(revenueShares.owner) || 0) / 100)
  }), [counts.verifiedRevenue, revenueShares])

  const currentMonthRevenue = useMemo(() => {
    const current = new Date()
    return (rawActivity.requests || [])
      .filter((item) => {
        const date = new Date(item.created_at)
        return !item.deleted_at
          && (item.payment_status === 'VERIFIED' || item.invoice_status === 'PAID')
          && date.getMonth() === current.getMonth()
          && date.getFullYear() === current.getFullYear()
      })
      .reduce((total, item) => total + (Number(item.harga) || 0), 0)
  }, [rawActivity.requests])

  const summaryCards = [
    {
      label: 'Kunjungan landing',
      value: counts.totalViews,
      helper: 'Session kunjungan tercatat',
      icon: 'eye',
      tone: 'green',
      to: '/admin/stats'
    },
    {
      label: 'Request aktif',
      value: counts.activeRequests,
      helper: `${counts.waitingPayment + counts.paymentUploaded} butuh perhatian`,
      icon: 'request',
      tone: 'cyan',
      to: '/admin/requests'
    },
    {
      label: 'Form aktif',
      value: counts.activeForms,
      helper: `${counts.formResponses} respons terkumpul`,
      icon: 'form',
      tone: 'blue',
      to: '/admin/forms'
    },
    {
      label: 'Antrean review',
      value: counts.learningReviewQueue,
      helper: `${counts.learningPublished} konten terbit`,
      icon: 'review',
      tone: 'amber',
      to: '/admin/ruang-belajar/review'
    }
  ]

  const priorities = [
    {
      label: 'Menunggu pembayaran',
      value: counts.waitingPayment,
      detail: 'Request belum dibayar',
      to: '/admin/requests',
      tone: counts.waitingPayment > 0 ? 'warning' : 'success'
    },
    {
      label: 'Bukti pembayaran masuk',
      value: counts.paymentUploaded,
      detail: 'Perlu verifikasi admin',
      to: '/admin/requests',
      tone: counts.paymentUploaded > 0 ? 'warning' : 'success'
    },
    {
      label: 'Pesan belum dibaca',
      value: counts.unreadMessages,
      detail: 'Percakapan dari client',
      to: '/admin/requests',
      tone: counts.unreadMessages > 0 ? 'warning' : 'success'
    },
    {
      label: 'Kontribusi publikasi',
      value: counts.learningPaymentQueue,
      detail: 'Menunggu verifikasi',
      to: '/admin/ruang-belajar/pembayaran',
      tone: counts.learningPaymentQueue > 0 ? 'warning' : 'success'
    }
  ]

  const readiness = [
    {
      label: 'Katalog layanan',
      value: clampPercent(counts.activeServices > 0 ? 100 : 0),
      caption: `${counts.activeServices} layanan / ${counts.serviceCategories} kategori`,
      to: '/admin/services'
    },
    {
      label: 'Branding website',
      value: clampPercent((counts.brandingRows / Math.max(SITE_BRANDING_KEYS.length, 1)) * 100),
      caption: `${counts.brandingRows} field tersimpan`,
      to: '/admin/site-branding'
    },
    {
      label: 'Profil pembayaran',
      value: counts.paymentProfileReady ? 100 : 20,
      caption: counts.paymentProfileReady ? 'Siap digunakan' : 'Belum lengkap',
      to: '/admin/profile'
    },
    {
      label: 'Donasi publik',
      value: counts.donationEnabled ? 100 : 25,
      caption: counts.donationEnabled ? 'Halaman aktif' : 'Dinonaktifkan',
      to: '/admin/donations'
    }
  ]

  const readinessScore = Math.round(readiness.reduce((total, item) => total + item.value, 0) / readiness.length)
  const incompleteReadiness = readiness.filter((item) => item.value < 100).sort((a, b) => a.value - b.value)
  const attentionTotal = priorities.reduce((total, item) => total + Number(item.value || 0), 0)

  const quickModules = [
    { to: '/admin/services', label: 'Layanan & Harga', caption: `${counts.activeServices} aktif`, icon: 'service', tone: 'green' },
    { to: '/admin/ruang-belajar', label: 'Ruang Belajar', caption: `${counts.learningEntries} konten`, icon: 'learning', tone: 'lime' },
    { to: '/admin/landing-content', label: 'Landing Page', caption: `${counts.landingContentRows} field`, icon: 'globe', tone: 'cyan' },
    { to: '/admin/accounts', label: 'Manajemen Akun', caption: `${counts.accounts} akun`, icon: 'users', tone: 'blue' },
    { to: '/admin/audit-logs', label: 'Log Aktivitas', caption: `${counts.logs} log`, icon: 'activity', tone: 'violet' },
    { to: '/admin/deleted-items', label: 'Deleted Items', caption: `${counts.deletedItems + counts.formDeleted} item`, icon: 'trash', tone: 'slate' }
  ]

  const activeSeries = activitySeries.filter((item) => visibleSeries[item.key])

  const chartModel = useMemo(() => {
    const width = Math.max(880, activityData.length * 76)
    const height = 330
    const padding = { top: 26, right: 30, bottom: 54, left: 58 }
    const plotWidth = width - padding.left - padding.right
    const plotHeight = height - padding.top - padding.bottom
    const allValues = activityData.flatMap((row) => activeSeries.map((series) => Number(row[series.key] || 0)))
    const maxValue = Math.max(...allValues, 1)
    const roundedMax = maxValue <= 5 ? 5 : Math.ceil(maxValue / 5) * 5
    const stepX = activityData.length > 1 ? plotWidth / (activityData.length - 1) : plotWidth
    const baseline = padding.top + plotHeight
    const labelEvery = Math.max(1, Math.ceil(activityData.length / 12))

    const series = activeSeries.map((definition) => {
      const points = activityData.map((row, index) => ({
        x: padding.left + index * stepX,
        y: padding.top + plotHeight - (Number(row[definition.key] || 0) / roundedMax) * plotHeight,
        value: Number(row[definition.key] || 0),
        label: row.period_start
      }))
      const linePath = buildSmoothPath(points)
      const areaPath = points.length > 0
        ? `${linePath} L ${points[points.length - 1].x} ${baseline} L ${points[0].x} ${baseline} Z`
        : ''
      return { ...definition, points, linePath, areaPath }
    })

    return {
      width,
      height,
      padding,
      plotHeight,
      baseline,
      roundedMax,
      labelEvery,
      series,
      gridValues: [0, 0.25, 0.5, 0.75, 1].map((ratio) => ({
        value: Math.round(roundedMax * (1 - ratio)),
        y: padding.top + plotHeight * ratio
      }))
    }
  }, [activityData, activeSeries])

  const activityTotals = useMemo(() => Object.fromEntries(activitySeries.map((series) => [
    series.key,
    activityData.reduce((total, row) => total + Number(row[series.key] || 0), 0)
  ])), [activityData])

  const rangeLabel = activityData.length > 0
    ? `${formatPeriodLabel(activityData[0].period_start, activityGranularity, false)} — ${formatPeriodLabel(activityData[activityData.length - 1].period_start, activityGranularity, false)}`
    : 'Belum ada rentang data'

  const toggleSeries = (key) => {
    setVisibleSeries((current) => {
      const activeCount = Object.values(current).filter(Boolean).length
      if (current[key] && activeCount === 1) return current
      return { ...current, [key]: !current[key] }
    })
  }

  return (
    <section className="admin-dashboard-modern admin-dashboard-v4">
      <div className="admin-dashboard-heading">
        <div>
          <div className="admin-dashboard-eyebrow">
            <img src={logoUrl} alt="" onError={(event) => { event.currentTarget.src = '/favicon.svg' }} />
            <span>{siteName} workspace</span>
          </div>
          <h1>Dashboard</h1>
          <p>Ringkasan operasional, pendapatan, aktivitas, dan kesiapan sistem.</p>
        </div>
        <div className="admin-dashboard-heading-actions">
          <button
            type="button"
            className="admin-dashboard-refresh"
            onClick={() => setReloadKey((value) => value + 1)}
            disabled={loading || refreshing}
          >
            <DashboardIcon name="refresh" size={16} />
            {refreshing ? 'Memperbarui...' : 'Sinkronkan'}
          </button>
          <Link to="/admin/requests" className="admin-dashboard-primary-action">
            Request baru <DashboardIcon name="arrow" size={16} />
          </Link>
        </div>
      </div>

      {errorMessage && (
        <div className="admin-dashboard-error">
          <DashboardIcon name="warning" size={18} />
          <span>{errorMessage}</span>
          <button type="button" onClick={() => setReloadKey((value) => value + 1)}>Coba lagi</button>
        </div>
      )}

      <div className="admin-dashboard-summary-grid">
        {summaryCards.map((card) => (
          <Link to={card.to} className={`admin-dashboard-summary-card tone-${card.tone}`} key={card.label}>
            <div className="admin-dashboard-summary-top">
              <span>{card.label}</span>
              <span className="admin-dashboard-summary-icon"><DashboardIcon name={card.icon} size={18} /></span>
            </div>
            <strong>{loading ? '—' : Number(card.value || 0).toLocaleString('id-ID')}</strong>
            <small>{loading ? 'Memuat data...' : card.helper}</small>
            <span className="admin-dashboard-card-line" />
          </Link>
        ))}
      </div>

      <div className="admin-dashboard-v4-main-grid">
        <article className="admin-dashboard-panel admin-dashboard-analytics-panel">
          <div className="admin-dashboard-analytics-head">
            <div>
              <span className="admin-dashboard-panel-kicker">Project analytics</span>
              <h2>Aktivitas platform</h2>
              <p>Perbandingan trafik dan pekerjaan berdasarkan periode.</p>
            </div>
            <div className="admin-dashboard-period-switch" aria-label="Pilih periode grafik">
              {[
                { value: 'week', label: 'Mingguan' },
                { value: 'month', label: 'Bulanan' },
                { value: 'year', label: 'Tahunan' }
              ].map((item) => (
                <button
                  type="button"
                  key={item.value}
                  onClick={() => setActivityGranularity(item.value)}
                  className={activityGranularity === item.value ? 'is-active' : ''}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="admin-dashboard-analytics-meta">
            <span><DashboardIcon name="calendar" size={14} /> {rangeLabel}</span>
            <span className="admin-dashboard-live-pill"><i /> {activityLoading ? 'Memuat' : 'Data langsung'}</span>
          </div>

          <div className="admin-dashboard-series-legend">
            {activitySeries.map((series) => (
              <button
                type="button"
                key={series.key}
                onClick={() => toggleSeries(series.key)}
                className={visibleSeries[series.key] ? 'is-active' : ''}
                style={{ '--series-color': series.color }}
              >
                <i />
                <span>{series.label}</span>
                <strong>{activityLoading ? '—' : Number(activityTotals[series.key] || 0).toLocaleString('id-ID')}</strong>
              </button>
            ))}
          </div>

          {activityNotice && <div className="admin-dashboard-analytics-notice"><DashboardIcon name="info" size={15} /> {activityNotice}</div>}

          <div className="admin-dashboard-chart-scroll">
            <svg
              className="admin-dashboard-layer-chart"
              viewBox={`0 0 ${chartModel.width} ${chartModel.height}`}
              style={{ minWidth: `${chartModel.width}px` }}
              role="img"
              aria-label="Grafik perkembangan aktivitas platform"
            >
              <defs>
                {chartModel.series.map((series) => (
                  <linearGradient key={series.key} id={`activity-gradient-${series.key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={series.color} stopOpacity="0.22" />
                    <stop offset="100%" stopColor={series.color} stopOpacity="0.01" />
                  </linearGradient>
                ))}
              </defs>

              {chartModel.gridValues.map((grid) => (
                <g key={grid.y}>
                  <line
                    x1={chartModel.padding.left}
                    x2={chartModel.width - chartModel.padding.right}
                    y1={grid.y}
                    y2={grid.y}
                    className="activity-grid-line"
                  />
                  <text x={chartModel.padding.left - 12} y={grid.y + 4} textAnchor="end" className="activity-axis-value">
                    {grid.value}
                  </text>
                </g>
              ))}

              {chartModel.series.map((series) => (
                <g key={series.key}>
                  <path d={series.areaPath} fill={`url(#activity-gradient-${series.key})`} />
                  <path d={series.linePath} fill="none" stroke={series.color} className="activity-series-line" />
                  {series.points.map((point, index) => (
                    <circle key={`${series.key}-${point.x}`} cx={point.x} cy={point.y} r="3.5" fill={series.color} className="activity-series-point">
                      <title>{`${series.label}: ${point.value} · ${formatPeriodLabel(activityData[index]?.period_start, activityGranularity, false)}`}</title>
                    </circle>
                  ))}
                </g>
              ))}

              {activityData.map((row, index) => {
                if (index % chartModel.labelEvery !== 0 && index !== activityData.length - 1) return null
                const x = activityData.length > 1
                  ? chartModel.padding.left + index * ((chartModel.width - chartModel.padding.left - chartModel.padding.right) / (activityData.length - 1))
                  : chartModel.padding.left
                return (
                  <text key={row.period_start} x={x} y={chartModel.height - 22} textAnchor="middle" className="activity-axis-label">
                    {formatPeriodLabel(row.period_start, activityGranularity)}
                  </text>
                )
              })}
            </svg>
          </div>
        </article>

        <div className="admin-dashboard-v4-side-stack">
          <article className="admin-dashboard-health-card">
            <div className="admin-dashboard-health-head">
              <div>
                <span>Kesiapan workspace</span>
                <strong>{loading ? '—' : `${readinessScore}%`}</strong>
              </div>
              <span className="admin-dashboard-health-icon"><DashboardIcon name="check" size={17} /></span>
            </div>

            <div
              className={`admin-dashboard-health-interactive${healthOpen ? ' is-open' : ''}`}
              onMouseEnter={() => setHealthOpen(true)}
              onMouseLeave={() => setHealthOpen(false)}
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) setHealthOpen(false)
              }}
            >
              <button
                type="button"
                className="admin-dashboard-health-ring"
                style={{ '--health-score': `${readinessScore * 3.6}deg` }}
                onClick={() => setHealthOpen((value) => !value)}
                aria-expanded={healthOpen}
                aria-label="Lihat detail kesiapan workspace"
              >
                <span><strong>{loading ? '—' : readinessScore}</strong><small>score</small></span>
              </button>

              <div className="admin-dashboard-health-popover" role="dialog" aria-label="Detail kesiapan workspace">
                <div className="admin-dashboard-health-popover-head">
                  <div>
                    <strong>Detail konfigurasi</strong>
                    <span>{incompleteReadiness.length > 0 ? `${incompleteReadiness.length} bagian belum penuh` : 'Semua konfigurasi siap'}</span>
                  </div>
                  <DashboardIcon name="info" size={17} />
                </div>
                <div className="admin-dashboard-health-popover-list">
                  {readiness.map((item) => (
                    <Link to={item.to} key={item.label} onClick={() => setHealthOpen(false)}>
                      <span className={item.value >= 100 ? 'is-ready' : 'is-pending'}>
                        <DashboardIcon name={item.value >= 100 ? 'check' : 'warning'} size={14} />
                      </span>
                      <div>
                        <strong>{item.label}</strong>
                        <small>{item.caption}</small>
                      </div>
                      <b>{Math.round(item.value)}%</b>
                    </Link>
                  ))}
                </div>
              </div>
            </div>

            <p>{readinessScore >= 80 ? 'Konfigurasi utama sudah siap digunakan.' : 'Beberapa konfigurasi masih perlu dilengkapi.'}</p>
            <Link to="/admin/site-branding">Periksa konfigurasi <DashboardIcon name="chevron" size={14} /></Link>
          </article>

          <article className="admin-dashboard-panel admin-dashboard-priority-panel">
            <div className="admin-dashboard-panel-head">
              <div>
                <span className="admin-dashboard-panel-kicker">Reminders</span>
                <h2>Prioritas</h2>
              </div>
              <span className="admin-dashboard-priority-total">{loading ? '—' : attentionTotal}</span>
            </div>
            <div className="admin-dashboard-priority-list">
              {priorities.map((item) => (
                <Link to={item.to} key={item.label} className="admin-dashboard-priority-item">
                  <span className={`admin-dashboard-priority-status is-${item.tone}`}>
                    <DashboardIcon name={item.tone === 'warning' ? 'warning' : 'check'} size={14} />
                  </span>
                  <span className="admin-dashboard-priority-copy">
                    <strong>{item.label}</strong>
                    <small>{item.detail}</small>
                  </span>
                  <b>{loading ? '—' : item.value}</b>
                </Link>
              ))}
            </div>
          </article>
        </div>
      </div>

      <div className="admin-dashboard-v4-bottom-grid">
        <article className="admin-dashboard-revenue-card">
          <div className="admin-dashboard-revenue-glow" aria-hidden="true" />
          <div className="admin-dashboard-revenue-head">
            <div>
              <span className="admin-dashboard-command-badge"><i /> Revenue terverifikasi</span>
              <small>{todayLabel}</small>
            </div>
            <span className="admin-dashboard-revenue-icon"><DashboardIcon name="revenue" size={20} /></span>
          </div>
          <div className="admin-dashboard-revenue-main">
            <span>Total revenue</span>
            <strong>{loading ? '—' : formatRupiah(counts.verifiedRevenue)}</strong>
            <p>Dihitung dari request dengan pembayaran VERIFIED atau invoice PAID.</p>
          </div>
          <div className="admin-dashboard-revenue-stats">
            <div>
              <span>Bulan ini</span>
              <strong>{loading ? '—' : formatRupiah(currentMonthRevenue)}</strong>
            </div>
            <div>
              <span>Request terbayar</span>
              <strong>{loading ? '—' : counts.paidRequests}</strong>
            </div>
            <div>
              <span>Bagian owner ({revenueShares.owner}%)</span>
              <strong>{loading ? '—' : formatRupiah(revenueSplit.owner)}</strong>
            </div>
          </div>
          <div className="admin-dashboard-revenue-footer">
            <span>Freelance {revenueShares.freelance}% · Admin {revenueShares.admin}% · Owner {revenueShares.owner}%</span>
            <Link to="/admin/stats">Buka statistik <DashboardIcon name="arrow" size={15} /></Link>
          </div>
        </article>

        <article className="admin-dashboard-panel admin-dashboard-quick-panel">
          <div className="admin-dashboard-panel-head">
            <div>
              <span className="admin-dashboard-panel-kicker">Project</span>
              <h2>Akses cepat</h2>
              <p>Modul yang paling sering digunakan.</p>
            </div>
          </div>
          <div className="admin-dashboard-quick-grid">
            {quickModules.map((item) => (
              <Link to={item.to} key={item.to} className={`admin-dashboard-quick-item tone-${item.tone}`}>
                <span><DashboardIcon name={item.icon} size={17} /></span>
                <div>
                  <strong>{item.label}</strong>
                  <small>{loading ? 'Memuat...' : item.caption}</small>
                </div>
                <DashboardIcon name="chevron" size={13} />
              </Link>
            ))}
          </div>
        </article>
      </div>

      <div className="admin-dashboard-footer-note">
        <span><DashboardIcon name="activity" size={15} /> Data diperbarui saat halaman dibuka atau disinkronkan.</span>
        <span>Login sebagai {user?.email}</span>
      </div>
    </section>
  )
}

export default AdminDashboard
