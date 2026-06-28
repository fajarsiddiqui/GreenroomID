import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../supabase'

const formatRupiah = (value) =>
  new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0
  }).format(Number(value || 0))

const fallbackSettings = {
  is_enabled: true,
  title: 'Dukung GreenroomID',
  description: 'Donasi Anda membantu menjaga layanan gratis GreenroomID tetap aktif, ringan, dan terus dikembangkan.',
  min_amount: 5000,
  preset_amounts: [5000, 10000, 25000, 50000, 100000],
  note: 'Pembayaran diproses otomatis melalui Midtrans. Nama hanya tampil di Top Donatur jika Anda mengizinkan.'
}

const getFallbackName = (user) => {
  const emailName = String(user?.email || '').split('@')[0]
  return user?.user_metadata?.full_name || user?.user_metadata?.name || emailName || ''
}


const getGuestDonorId = () => {
  if (typeof window === 'undefined') return ''
  const key = 'greenroomid_guest_donor_id'
  const existing = window.localStorage.getItem(key)
  if (existing) return existing
  const next = `guest-${crypto.randomUUID()}`
  window.localStorage.setItem(key, next)
  return next
}

function DonateUsPage({ user }) {
  const [searchParams] = useSearchParams()
  const [settings, setSettings] = useState(fallbackSettings)
  const [profile, setProfile] = useState(null)
  const [amount, setAmount] = useState(10000)
  const [customAmount, setCustomAmount] = useState('')
  const [donorName, setDonorName] = useState('')
  const [message, setMessage] = useState('')
  const [showPublic, setShowPublic] = useState(true)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [notice, setNotice] = useState('')

  const status = searchParams.get('status')
  const orderId = searchParams.get('order_id')

  const selectedAmount = useMemo(() => {
    const manual = Number(String(customAmount || '').replace(/[^0-9]/g, ''))
    return manual > 0 ? manual : Number(amount || 0)
  }, [amount, customAmount])

  const displayNamePreview = showPublic ? (donorName.trim() || 'Nama donatur') : 'Alias anonim tetap'

  useEffect(() => {
    const fetchInitialData = async () => {
      setLoading(true)
      const [{ data: settingRows }, profileResult] = await Promise.all([
        supabase.rpc('get_public_donation_settings'),
        user?.id
          ? supabase
              .from('user_profiles')
              .select('full_name, donor_display_name, donor_public_default, phone')
              .eq('id', user.id)
              .maybeSingle()
          : Promise.resolve({ data: null })
      ])

      const nextSettings = Array.isArray(settingRows) && settingRows[0] ? settingRows[0] : fallbackSettings
      const normalizedSettings = {
        ...fallbackSettings,
        ...nextSettings,
        preset_amounts: Array.isArray(nextSettings.preset_amounts) && nextSettings.preset_amounts.length
          ? nextSettings.preset_amounts
          : fallbackSettings.preset_amounts
      }
      setSettings(normalizedSettings)
      setAmount(normalizedSettings.preset_amounts[1] || normalizedSettings.preset_amounts[0] || normalizedSettings.min_amount)

      const nextProfile = profileResult?.data || null
      setProfile(nextProfile)
      const defaultName = nextProfile?.donor_display_name || nextProfile?.full_name || getFallbackName(user)
      setDonorName(defaultName || '')
      setShowPublic(nextProfile?.donor_public_default !== false)
      setLoading(false)
    }

    fetchInitialData()
  }, [user])

  useEffect(() => {
    if (!status) return

    if (status === 'finish') {
      setNotice(`Pembayaran sedang dicek otomatis oleh Midtrans. Jika berhasil, donasi akan masuk Top Donatur. Order: ${orderId || '-'}`)
    } else if (status === 'pending') {
      setNotice(`Invoice donasi masih pending. Selesaikan pembayaran agar masuk Top Donatur. Order: ${orderId || '-'}`)
    } else if (status === 'error') {
      setNotice(`Pembayaran gagal atau dibatalkan. Silakan coba lagi. Order: ${orderId || '-'}`)
    }
  }, [status, orderId])

  const startDonation = async () => {
    const cleanName = donorName.trim()
    const cleanMessage = message.trim()

    if (!settings.is_enabled) {
      setNotice('Donasi sedang belum aktif.')
      return
    }

    if (selectedAmount < Number(settings.min_amount || 5000)) {
      setNotice(`Minimal donasi adalah ${formatRupiah(settings.min_amount || 5000)}.`)
      return
    }

    if (showPublic && cleanName.length < 2) {
      setNotice('Isi nama donatur minimal 2 karakter, atau matikan pilihan tampil publik.')
      return
    }

    setSubmitting(true)
    setNotice('')

    const { data, error } = await supabase.functions.invoke('create-donation', {
      body: {
        amount: selectedAmount,
        donor_name: cleanName || 'Anonim',
        donor_message: cleanMessage || null,
        show_public: Boolean(showPublic),
        guest_id: user?.id ? null : getGuestDonorId()
      }
    })

    if (error) {
      setNotice('Gagal membuat invoice donasi. Detail: ' + error.message)
      setSubmitting(false)
      return
    }

    if (data?.redirect_url) {
      window.location.href = data.redirect_url
      return
    }

    setNotice('Invoice dibuat, tetapi redirect_url Midtrans tidak ditemukan. Periksa Edge Function create-donation.')
    setSubmitting(false)
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <div className="mb-6">
          <Link to="/" className="text-sm font-semibold text-green-700 hover:underline">
            ← Kembali ke Landing
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-6 items-start">
          <section className="bg-gray-950 text-white rounded-[2rem] p-6 sm:p-8 shadow-sm">
            <p className="inline-flex items-center rounded-full bg-green-400/10 px-3 py-1 text-xs font-bold text-green-300 border border-green-400/20 mb-5">
              Donate Us
            </p>
            <h1 className="text-3xl sm:text-5xl font-black tracking-tight mb-4">{settings.title}</h1>
            <p className="text-gray-300 leading-relaxed max-w-2xl">{settings.description}</p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-8">
              <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
                <p className="text-2xl mb-2">⚡</p>
                <h2 className="font-bold">Otomatis</h2>
                <p className="text-xs text-gray-400 mt-2">Status dibaca dari Midtrans melalui webhook, bukan upload bukti.</p>
              </div>
              <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
                <p className="text-2xl mb-2">🎁</p>
                <h2 className="font-bold">Dukung Tools Gratis</h2>
                <p className="text-xs text-gray-400 mt-2">Donasi membantu perawatan Image to Table dan Daftar Hadir.</p>
              </div>
              <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
                <p className="text-2xl mb-2">👤</p>
                <h2 className="font-bold">Bisa Anonim</h2>
                <p className="text-xs text-gray-400 mt-2">Nama hanya tampil jika Anda mengizinkan.</p>
              </div>
            </div>
          </section>

          <section className="bg-white rounded-[2rem] border border-gray-200 shadow-sm p-6">
            <h2 className="text-xl font-black text-gray-900 mb-1">Buat Donasi</h2>
            <p className="text-sm text-gray-500 mb-5">Pilih nominal, lalu bayar melalui halaman Midtrans.</p>

            {loading && <div className="text-gray-400 text-center py-10">Memuat form donasi...</div>}

            {!loading && (
              <div className="space-y-5">
                {!settings.is_enabled && (
                  <div className="rounded-2xl border border-yellow-100 bg-yellow-50 p-4 text-sm text-yellow-700">
                    Donasi sedang belum aktif.
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-2">Nominal cepat</label>
                  <div className="grid grid-cols-2 gap-2">
                    {settings.preset_amounts.map((item) => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => {
                          setAmount(item)
                          setCustomAmount('')
                        }}
                        className={`rounded-2xl border px-4 py-3 text-sm font-bold transition ${selectedAmount === item && !customAmount ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'}`}
                      >
                        {formatRupiah(item)}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-2">Nominal bebas</label>
                  <input
                    value={customAmount}
                    onChange={(event) => setCustomAmount(event.target.value.replace(/[^0-9]/g, ''))}
                    className="w-full rounded-2xl border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10"
                    placeholder={`Minimal ${formatRupiah(settings.min_amount)}`}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-2">Nama donatur</label>
                  <input
                    value={donorName}
                    onChange={(event) => setDonorName(event.target.value)}
                    disabled={!showPublic}
                    className="w-full rounded-2xl border border-gray-300 px-4 py-3 text-sm disabled:bg-gray-100 disabled:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900/10"
                    placeholder={user ? 'Nama dari profil' : 'Nama donatur'}
                  />
                  {user && profile && (
                    <p className="text-xs text-gray-400 mt-1">Default diambil dari Profil Saya. Bisa diganti untuk donasi ini.</p>
                  )}
                </div>

                <label className="flex items-start gap-3 rounded-2xl border border-gray-200 bg-gray-50 p-4 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showPublic}
                    onChange={(event) => setShowPublic(event.target.checked)}
                    className="mt-1"
                  />
                  <span>
                    <span className="block text-sm font-bold text-gray-800">Tampilkan nama di Top Donatur</span>
                    <span className="block text-xs text-gray-500 mt-1">Jika dimatikan, donasi tetap dihitung sebagai alias Anonim yang stabil untuk akun/browser ini.</span>
                  </span>
                </label>

                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-2">Pesan singkat opsional</label>
                  <textarea
                    value={message}
                    onChange={(event) => setMessage(event.target.value.slice(0, 180))}
                    rows={3}
                    className="w-full rounded-2xl border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10"
                    placeholder="Semoga GreenroomID makin berkembang."
                  />
                </div>

                <div className="rounded-2xl border border-green-100 bg-green-50 p-4">
                  <p className="text-xs text-green-700 mb-1">Preview Top Donatur</p>
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-black text-green-950">{displayNamePreview}</p>
                    <p className="font-black text-green-950">{formatRupiah(selectedAmount)}</p>
                  </div>
                </div>

                {notice && (
                  <div className="rounded-2xl border border-yellow-100 bg-yellow-50 p-4 text-sm text-yellow-700 leading-relaxed">
                    {notice}
                  </div>
                )}

                <button
                  type="button"
                  onClick={startDonation}
                  disabled={submitting || !settings.is_enabled}
                  className="w-full rounded-2xl bg-gray-950 px-5 py-4 text-sm font-black text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting ? 'Membuat invoice...' : `Donasi ${formatRupiah(selectedAmount)}`}
                </button>

                <p className="text-xs text-gray-400 leading-relaxed">{settings.note}</p>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}

export default DonateUsPage
