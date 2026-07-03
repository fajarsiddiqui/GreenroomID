import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../supabase'
import ClientPortalHeader from '../components/ClientPortalHeader'
import { formatLearningDate, getLearningPath, getLearningStatus } from '../utils/learning'

const formatRupiah = (value) => new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0
}).format(Number(value || 0))

function StatusBadge({ status }) {
  const item = getLearningStatus(status)
  return <span className={'inline-flex rounded-full border px-3 py-1 text-xs font-bold ' + item.className}>{item.label}</span>
}

function ClientLearningPaymentPage({ user }) {
  const { entryId } = useParams()
  const [entry, setEntry] = useState(null)
  const [settings, setSettings] = useState(null)
  const [paymentProfile, setPaymentProfile] = useState(null)
  const [latestPayment, setLatestPayment] = useState(null)
  const [loading, setLoading] = useState(true)
  const [confirming, setConfirming] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  const fetchData = async () => {
    setLoading(true)
    setErrorMessage('')

    const [entryResult, settingsResult, profileResult, paymentResult] = await Promise.all([
      supabase
        .from('learning_entries')
        .select('id, author_id, title, status, published_at, updated_at, short_code, slug, discipline')
        .eq('id', entryId)
        .eq('author_id', user.id)
        .maybeSingle(),
      supabase
        .from('learning_payment_settings')
        .select('*')
        .eq('id', 'default')
        .maybeSingle(),
      supabase
        .from('admin_payment_settings')
        .select('admin_name, admin_phone, bank_name, account_type, account_number, account_holder, payment_instruction, qris_url')
        .eq('id', 'default')
        .maybeSingle(),
      supabase
        .from('learning_payments')
        .select('*')
        .eq('entry_id', entryId)
        .order('confirmed_at', { ascending: false })
        .limit(1)
        .maybeSingle()
    ])

    if (entryResult.error) {
      setErrorMessage('Gagal memuat hasil pembelajaran. Detail: ' + entryResult.error.message)
    } else if (!entryResult.data) {
      setErrorMessage('Hasil pembelajaran tidak ditemukan atau bukan milik Anda.')
    }

    if (settingsResult.error) {
      setErrorMessage((current) => current || 'Pengaturan kontribusi belum dapat dibaca. Pastikan SQL RB-03 sudah dijalankan. Detail: ' + settingsResult.error.message)
    }

    if (profileResult.error) {
      setErrorMessage((current) => current || 'Profile pembayaran admin belum dapat dibaca. Detail: ' + profileResult.error.message)
    }

    if (paymentResult.error) {
      setErrorMessage((current) => current || 'Riwayat konfirmasi pembayaran belum dapat dibaca. Detail: ' + paymentResult.error.message)
    }

    setEntry(entryResult.data || null)
    setSettings(settingsResult.data || null)
    setPaymentProfile(profileResult.data || null)
    setLatestPayment(paymentResult.data || null)
    setLoading(false)
  }

  useEffect(() => {
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryId, user.id])

  const paymentChannelReady = Boolean(paymentProfile?.qris_url || paymentProfile?.account_number)
  const canConfirm = Boolean(
    entry?.status === 'accepted_pending_payment'
    && settings?.is_enabled
    && paymentChannelReady
  )

  const paymentExplanation = useMemo(() => {
    if (!settings) return ''
    return settings.description || 'Kontribusi ini digunakan untuk proses kurasi dan publikasi hasil pembelajaran yang telah diterima secara editorial.'
  }, [settings])

  const confirmPayment = async () => {
    if (!entry || !settings) return

    const confirmed = window.confirm(
      `Pastikan Anda sudah membayar ${formatRupiah(settings.amount)} melalui QRIS/rekening yang ditampilkan.\n\nSetelah dikonfirmasi, admin akan memeriksa transaksi secara manual. Artikel belum otomatis terbit sebelum admin memverifikasi.`
    )
    if (!confirmed) return

    setConfirming(true)
    setErrorMessage('')
    setSuccessMessage('')

    const { error } = await supabase.rpc('submit_learning_payment_confirmation', {
      target_entry_id: entry.id
    })

    if (error) {
      setErrorMessage('Konfirmasi pembayaran belum dapat dikirim. Detail: ' + error.message)
    } else {
      setSuccessMessage('Konfirmasi pembayaran telah dikirim. Admin akan memeriksa transaksi QRIS/rekening secara manual sebelum artikel diterbitkan.')
      await fetchData()
    }

    setConfirming(false)
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <ClientPortalHeader user={user} subtitle="Ruang Belajar · Kontribusi Publikasi" />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-7 sm:py-9">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <Link to="/ruang-belajar/saya" className="text-sm font-bold text-green-700 hover:underline">← Kembali ke Pembelajaran Saya</Link>
            <p className="text-xs text-gray-400 mt-4 mb-1">Ruang Belajar / Kontribusi Publikasi</p>
            <h1 className="text-2xl sm:text-3xl font-black text-gray-900">Kontribusi Kurasi dan Publikasi</h1>
          </div>
          <button type="button" onClick={fetchData} disabled={loading || confirming} className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-50">{loading ? 'Memuat...' : 'Muat ulang'}</button>
        </div>

        {errorMessage && <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm leading-relaxed text-red-700">{errorMessage}</div>}
        {successMessage && <div className="mb-5 rounded-2xl border border-green-200 bg-green-50 p-4 text-sm leading-relaxed text-green-800">{successMessage}</div>}

        {loading ? (
          <div className="rounded-3xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-400 shadow-sm">Memuat instruksi pembayaran...</div>
        ) : !entry ? (
          <div className="rounded-3xl border border-gray-200 bg-white p-10 text-center shadow-sm"><p className="text-gray-500">Halaman pembayaran tidak dapat dibuka.</p><Link to="/ruang-belajar/saya" className="inline-flex mt-4 text-sm font-bold text-green-700 hover:underline">Kembali ke pembelajaran saya →</Link></div>
        ) : (
          <div className="space-y-5">
            <section className="rounded-3xl border border-gray-200 bg-white p-5 sm:p-6 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                <div>
                  <p className="text-xs font-black tracking-wide text-violet-700">HASIL PEMBELAJARAN DITERIMA</p>
                  <h2 className="mt-2 text-xl font-black leading-snug text-gray-900">{entry.title}</h2>
                  <p className="mt-2 text-sm leading-relaxed text-gray-500">Keputusan editorial sudah selesai. Kontribusi publikasi tidak menentukan tulisan diterima atau tidak.</p>
                </div>
                <StatusBadge status={entry.status} />
              </div>

              {entry.status === 'published' && (
                <div className="mt-5 rounded-2xl border border-green-100 bg-green-50 p-4 text-sm text-green-900"><p className="font-black">Artikel sudah dipublikasikan.</p><p className="mt-1">Pembayaran telah diverifikasi admin. Artikel sekarang dapat dibaca di perpustakaan publik.</p><Link to={getLearningPath(entry)} className="inline-flex mt-3 font-bold text-green-700 hover:underline">Buka artikel publik ↗</Link></div>
              )}

              {entry.status === 'payment_pending' && (
                <div className="mt-5 rounded-2xl border border-sky-100 bg-sky-50 p-4 text-sm text-sky-950"><p className="font-black">Konfirmasi Anda sedang menunggu verifikasi admin.</p><p className="mt-1 leading-relaxed">Admin akan mencocokkan transaksi pada riwayat QRIS atau rekening. Artikel belum tampil publik sampai pembayaran dinyatakan valid.</p>{latestPayment?.confirmed_at && <p className="mt-2 text-xs text-sky-800">Dikonfirmasi pada {formatLearningDate(latestPayment.confirmed_at, { hour: '2-digit', minute: '2-digit' })}.</p>}</div>
              )}

              {entry.status === 'accepted_pending_payment' && !settings?.is_enabled && (
                <div className="mt-5 rounded-2xl border border-amber-100 bg-amber-50 p-4 text-sm text-amber-950"><p className="font-black">Kontribusi publikasi belum dibuka.</p><p className="mt-1">Hasil pembelajaran Anda sudah diterima secara editorial. Silakan tunggu admin mengaktifkan tahap kontribusi publikasi.</p></div>
              )}
            </section>

            {entry.status === 'accepted_pending_payment' && settings?.is_enabled && (
              <>
                {!paymentChannelReady ? (
                  <section className="rounded-3xl border border-amber-200 bg-amber-50 p-5 sm:p-6"><h2 className="font-black text-amber-950">Metode pembayaran belum lengkap</h2><p className="mt-2 text-sm leading-relaxed text-amber-900">Admin perlu menambahkan QRIS atau rekening di menu <b>Profile Payment</b> sebelum kontribusi publikasi dapat dilakukan.</p></section>
                ) : (
                  <>
                    <section className="rounded-3xl bg-gray-950 p-5 sm:p-6 text-white shadow-lg">
                      <p className="text-xs font-black tracking-wide text-green-200">NOMINAL KONTRIBUSI</p>
                      <p className="mt-2 text-4xl font-black">{formatRupiah(settings.amount)}</p>
                      <p className="mt-4 max-w-2xl text-sm leading-relaxed text-gray-300">{paymentExplanation}</p>
                    </section>

                    <section className="rounded-3xl border border-gray-200 bg-white p-5 sm:p-6 shadow-sm">
                      <div className="flex flex-col md:flex-row gap-6">
                        <div className="flex-1">
                          <p className="text-xs font-black tracking-wide text-gray-400">PETUNJUK PEMBAYARAN</p>
                          <h2 className="mt-2 text-xl font-black text-gray-900">Bayar melalui QRIS atau rekening admin</h2>
                          {paymentProfile?.payment_instruction && <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-gray-600">{paymentProfile.payment_instruction}</p>}

                          <dl className="mt-5 grid grid-cols-1 gap-3 text-sm">
                            {paymentProfile?.admin_name && <div className="rounded-2xl bg-gray-50 p-3"><dt className="text-xs font-bold text-gray-400">Admin / Brand</dt><dd className="mt-1 font-bold text-gray-800">{paymentProfile.admin_name}</dd></div>}
                            {paymentProfile?.account_type && <div className="rounded-2xl bg-gray-50 p-3"><dt className="text-xs font-bold text-gray-400">Metode</dt><dd className="mt-1 font-bold text-gray-800">{paymentProfile.account_type}</dd></div>}
                            {(paymentProfile?.bank_name || paymentProfile?.account_number) && <div className="rounded-2xl bg-gray-50 p-3"><dt className="text-xs font-bold text-gray-400">Rekening / Wallet</dt><dd className="mt-1 font-bold text-gray-800">{[paymentProfile.bank_name, paymentProfile.account_number].filter(Boolean).join(' · ')}</dd>{paymentProfile?.account_holder && <dd className="mt-1 text-xs text-gray-500">a.n. {paymentProfile.account_holder}</dd>}</div>}
                          </dl>
                        </div>

                        {paymentProfile?.qris_url && <div className="md:w-72 rounded-3xl border border-gray-200 bg-gray-50 p-4"><p className="text-center text-xs font-black tracking-wide text-gray-500">QRIS PEMBAYARAN</p><img src={paymentProfile.qris_url} alt="QRIS pembayaran GreenroomID" className="mt-3 w-full rounded-2xl border border-gray-200 bg-white object-contain" /></div>}
                      </div>
                    </section>

                    <section className="rounded-3xl border border-violet-100 bg-violet-50 p-5 sm:p-6">
                      <h2 className="text-lg font-black text-violet-950">Konfirmasi setelah pembayaran</h2>
                      <p className="mt-2 text-sm leading-relaxed text-violet-900">Klik tombol berikut hanya setelah pembayaran selesai. Sistem tidak meminta atau menyimpan screenshot/bukti transfer. Admin akan melakukan pengecekan transaksi secara manual melalui QRIS atau rekening.</p>
                      <button type="button" onClick={confirmPayment} disabled={!canConfirm || confirming} className="mt-5 rounded-xl bg-violet-700 px-5 py-3 text-sm font-black text-white hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-50">{confirming ? 'Mengirim konfirmasi...' : 'Saya Sudah Melakukan Pembayaran'}</button>
                    </section>
                  </>
                )}
              </>
            )}

            {settings?.policy_text && <p className="px-2 text-xs leading-relaxed text-gray-500">{settings.policy_text}</p>}
          </div>
        )}
      </main>
    </div>
  )
}

export default ClientLearningPaymentPage
