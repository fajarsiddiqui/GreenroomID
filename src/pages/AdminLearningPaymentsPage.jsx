import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase'
import { formatLearningDate, getLearningStatus } from '../utils/learning'

const DEFAULT_SETTINGS = {
  id: 'default',
  is_enabled: false,
  amount: 25000,
  title: 'Kontribusi Kurasi dan Publikasi',
  description: 'Kontribusi ini digunakan untuk proses kurasi dan publikasi hasil pembelajaran yang telah diterima secara editorial.',
  policy_text: 'Keputusan editorial telah selesai sebelum kontribusi publikasi diminta. Kontribusi tidak menentukan diterima atau tidaknya tulisan. Tidak ada jaminan indeksasi, DOI, SINTA, LoA, maupun kredit akademik.'
}

const formatRupiah = (value) => new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0
}).format(Number(value || 0))

const formatDateTime = (value) => formatLearningDate(value, {
  hour: '2-digit',
  minute: '2-digit'
})

function PaymentStatusBadge({ status }) {
  const statusMap = {
    awaiting_verification: ['Menunggu Verifikasi', 'bg-sky-50 text-sky-700 border-sky-100'],
    verified: ['Terverifikasi', 'bg-green-50 text-green-700 border-green-100'],
    not_verified: ['Belum Ditemukan', 'bg-amber-50 text-amber-700 border-amber-100'],
    cancelled: ['Dibatalkan', 'bg-gray-100 text-gray-700 border-gray-200']
  }
  const [label, className] = statusMap[status] || statusMap.awaiting_verification
  return <span className={'inline-flex rounded-full border px-3 py-1 text-xs font-bold ' + className}>{label}</span>
}

function EntryStatusBadge({ status }) {
  const item = getLearningStatus(status)
  return <span className={'inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold ' + item.className}>{item.label}</span>
}

function AdminLearningPaymentsPage() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [paymentProfile, setPaymentProfile] = useState(null)
  const [payments, setPayments] = useState([])
  const [entriesById, setEntriesById] = useState({})
  const [loading, setLoading] = useState(true)
  const [savingSettings, setSavingSettings] = useState(false)
  const [processingPaymentId, setProcessingPaymentId] = useState('')
  const [selectedPayment, setSelectedPayment] = useState(null)
  const [verificationNote, setVerificationNote] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  const fetchData = async () => {
    setLoading(true)
    setErrorMessage('')

    const [settingsResult, profileResult, paymentResult] = await Promise.all([
      supabase
        .from('learning_payment_settings')
        .select('*')
        .eq('id', 'default')
        .maybeSingle(),
      supabase
        .from('admin_payment_settings')
        .select('admin_name, admin_phone, bank_name, account_type, account_number, account_holder, payment_instruction, qris_url, updated_at')
        .eq('id', 'default')
        .maybeSingle(),
      supabase
        .from('learning_payments')
        .select('*')
        .order('confirmed_at', { ascending: false })
        .limit(120)
    ])

    if (settingsResult.error) {
      setErrorMessage('Gagal memuat pengaturan kontribusi. Pastikan SQL RB-03 sudah dijalankan. Detail: ' + settingsResult.error.message)
    } else {
      setSettings({ ...DEFAULT_SETTINGS, ...(settingsResult.data || {}) })
    }

    if (profileResult.error) {
      setErrorMessage((current) => current || 'Gagal memuat Profile Payment admin. Detail: ' + profileResult.error.message)
    } else {
      setPaymentProfile(profileResult.data || null)
    }

    if (paymentResult.error) {
      setErrorMessage((current) => current || 'Gagal memuat antrean verifikasi. Detail: ' + paymentResult.error.message)
      setPayments([])
      setEntriesById({})
      setLoading(false)
      return
    }

    const rows = paymentResult.data || []
    const entryIds = [...new Set(rows.map((payment) => payment.entry_id).filter(Boolean))]
    let entries = []

    if (entryIds.length > 0) {
      const { data, error } = await supabase
        .from('learning_entries')
        .select('id, title, studied_by_name, status, short_code, discipline, updated_at')
        .in('id', entryIds)

      if (error) {
        setErrorMessage((current) => current || 'Gagal memuat detail hasil pembelajaran. Detail: ' + error.message)
      } else {
        entries = data || []
      }
    }

    setPayments(rows)
    setEntriesById(Object.fromEntries(entries.map((entry) => [entry.id, entry])))
    setLoading(false)
  }

  useEffect(() => {
    fetchData()
  }, [])

  const stats = useMemo(() => ({
    awaiting: payments.filter((payment) => payment.status === 'awaiting_verification').length,
    verified: payments.filter((payment) => payment.status === 'verified').length,
    returned: payments.filter((payment) => payment.status === 'not_verified').length,
    totalVerifiedAmount: payments
      .filter((payment) => payment.status === 'verified')
      .reduce((sum, payment) => sum + Number(payment.amount || 0), 0)
  }), [payments])

  const updateSettings = (key, value) => {
    setSettings((current) => ({ ...current, [key]: value }))
  }

  const saveSettings = async () => {
    const amount = Number(settings.amount)
    if (!Number.isInteger(amount) || amount < 1000) {
      setErrorMessage('Nominal kontribusi minimal Rp1.000 dan harus berupa angka bulat.')
      return
    }

    setSavingSettings(true)
    setErrorMessage('')
    setSuccessMessage('')

    const payload = {
      id: 'default',
      is_enabled: Boolean(settings.is_enabled),
      amount,
      title: String(settings.title || '').trim() || DEFAULT_SETTINGS.title,
      description: String(settings.description || '').trim() || DEFAULT_SETTINGS.description,
      policy_text: String(settings.policy_text || '').trim() || DEFAULT_SETTINGS.policy_text,
      updated_at: new Date().toISOString()
    }

    const { error } = await supabase
      .from('learning_payment_settings')
      .upsert(payload, { onConflict: 'id' })

    if (error) {
      setErrorMessage('Gagal menyimpan pengaturan. Detail: ' + error.message)
    } else {
      setSettings((current) => ({ ...current, ...payload }))
      setSuccessMessage('Pengaturan kontribusi publikasi berhasil disimpan.')
    }

    setSavingSettings(false)
  }

  const openVerification = (payment) => {
    setSelectedPayment(payment)
    setVerificationNote('')
    setErrorMessage('')
    setSuccessMessage('')
  }

  const processPayment = async (decision) => {
    if (!selectedPayment) return

    const entry = entriesById[selectedPayment.entry_id]
    const actionLabel = decision === 'verified' ? 'verifikasi dan terbitkan' : 'kembalikan ke tahap pembayaran'
    const confirmed = window.confirm(
      decision === 'verified'
        ? `Pastikan transaksi ${formatRupiah(selectedPayment.amount)} dari “${entry?.studied_by_name || 'pembelajar'}” sudah ditemukan di mutasi QRIS/rekening.\n\nSetelah diverifikasi, artikel akan diterbitkan otomatis. Lanjutkan?`
        : `Tandai konfirmasi ini belum ditemukan? Artikel akan kembali ke status menunggu kontribusi agar pembelajar dapat mencoba kembali.`
    )
    if (!confirmed) return

    setProcessingPaymentId(selectedPayment.id)
    setErrorMessage('')
    setSuccessMessage('')

    const { data, error } = await supabase.rpc('admin_verify_learning_payment', {
      target_payment_id: selectedPayment.id,
      verification_decision: decision,
      verification_note_input: verificationNote.trim() || null
    })

    if (error) {
      setErrorMessage('Gagal ' + actionLabel + '. Detail: ' + error.message)
    } else {
      const result = Array.isArray(data) ? data[0] : data
      const entryStatus = result?.entry_status === 'published' ? ' Artikel telah diterbitkan.' : ''
      setSuccessMessage(decision === 'verified' ? 'Pembayaran berhasil diverifikasi.' + entryStatus : 'Konfirmasi dikembalikan ke tahap menunggu kontribusi.')
      setSelectedPayment(null)
      setVerificationNote('')
      await fetchData()
    }

    setProcessingPaymentId('')
  }

  const paymentChannelReady = Boolean(paymentProfile?.qris_url || paymentProfile?.account_number)

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
        <div>
          <Link to="/admin/ruang-belajar" className="text-sm font-bold text-green-700 hover:underline">← Kembali ke Ruang Belajar</Link>
          <p className="text-xs text-gray-400 mt-4 mb-1">Admin / Ruang Belajar / Kontribusi Publikasi</p>
          <h1 className="text-2xl font-black text-gray-900">Kontribusi Publikasi Manual</h1>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-gray-500">Pembelajar membayar lewat QRIS/rekening dari Profile Payment. Admin mencocokkan transaksi secara manual, lalu verifikasi akan menerbitkan artikel otomatis.</p>
        </div>
        <button type="button" onClick={fetchData} disabled={loading || processingPaymentId} className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-50">{loading ? 'Memuat...' : 'Muat ulang'}</button>
      </div>

      {errorMessage && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm leading-relaxed text-red-700">{errorMessage}</div>}
      {successMessage && <div className="rounded-2xl border border-green-200 bg-green-50 p-4 text-sm leading-relaxed text-green-800">{successMessage}</div>}

      <section className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {[
          ['Menunggu verifikasi', stats.awaiting, 'bg-sky-50 text-sky-700'],
          ['Terverifikasi', stats.verified, 'bg-green-50 text-green-700'],
          ['Belum ditemukan', stats.returned, 'bg-amber-50 text-amber-700'],
          ['Kontribusi terverifikasi', formatRupiah(stats.totalVerifiedAmount), 'bg-white text-gray-800']
        ].map(([label, value, tone]) => <div key={label} className={'rounded-2xl border border-gray-200 p-4 shadow-sm ' + tone}><p className="text-xl font-black">{value}</p><p className="mt-1 text-xs font-bold">{label}</p></div>)}
      </section>

      <section className="rounded-3xl border border-gray-200 bg-white p-5 sm:p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div>
            <p className="text-xs font-black tracking-wide text-gray-400">SUMBER PEMBAYARAN</p>
            <h2 className="mt-2 text-lg font-black text-gray-900">QRIS dan rekening dari Profile Payment</h2>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-gray-500">Tidak ada QR baru di modul ini. Ubah QRIS, rekening, nomor admin, atau instruksi umum melalui menu Profile Payment.</p>
          </div>
          <Link to="/admin/profile" className="rounded-xl border border-gray-200 px-4 py-3 text-sm font-bold text-gray-700 hover:bg-gray-50">Buka Profile Payment →</Link>
        </div>

        <div className="mt-5 grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-5">
          <div className="rounded-2xl bg-gray-50 p-4 text-sm text-gray-700">
            <p className="font-black text-gray-900">{paymentChannelReady ? 'Metode pembayaran siap digunakan' : 'Metode pembayaran belum lengkap'}</p>
            <p className="mt-2 leading-relaxed">{paymentProfile?.admin_name || 'Nama admin belum diatur'}{paymentProfile?.account_type ? ` · ${paymentProfile.account_type}` : ''}{paymentProfile?.bank_name ? ` · ${paymentProfile.bank_name}` : ''}{paymentProfile?.account_number ? ` · ${paymentProfile.account_number}` : ''}</p>
            {!paymentChannelReady && <p className="mt-2 text-amber-700">Tambahkan minimal QRIS atau nomor rekening sebelum mengaktifkan kontribusi publikasi.</p>}
          </div>
          {paymentProfile?.qris_url && <img src={paymentProfile.qris_url} alt="Preview QRIS admin" className="h-40 w-40 rounded-2xl border border-gray-200 bg-white object-contain p-2" />}
        </div>
      </section>

      <section className="rounded-3xl border border-gray-200 bg-white p-5 sm:p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4"><div><p className="text-xs font-black tracking-wide text-violet-700">PENGATURAN RB-03</p><h2 className="mt-2 text-lg font-black text-gray-900">Kontribusi Kurasi dan Publikasi</h2><p className="mt-1 text-sm text-gray-500">Nominal diatur oleh admin; user tidak dapat mengubah nominal dari browser.</p></div><label className="inline-flex items-center gap-3 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-bold text-gray-700"><input type="checkbox" checked={Boolean(settings.is_enabled)} onChange={(event) => updateSettings('is_enabled', event.target.checked)} className="h-4 w-4" /> Aktifkan pembayaran manual</label></div>

        <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="block"><span className="mb-1.5 block text-sm font-bold text-gray-700">Nominal kontribusi (Rp)</span><input type="number" min="1000" step="1000" value={settings.amount} onChange={(event) => updateSettings('amount', event.target.value)} className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm" /></label>
          <label className="block"><span className="mb-1.5 block text-sm font-bold text-gray-700">Nama kontribusi</span><input value={settings.title} onChange={(event) => updateSettings('title', event.target.value)} className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm" /></label>
          <label className="block md:col-span-2"><span className="mb-1.5 block text-sm font-bold text-gray-700">Penjelasan untuk pembelajar</span><textarea value={settings.description} onChange={(event) => updateSettings('description', event.target.value)} rows={3} className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm leading-relaxed" /></label>
          <label className="block md:col-span-2"><span className="mb-1.5 block text-sm font-bold text-gray-700">Kebijakan singkat</span><textarea value={settings.policy_text} onChange={(event) => updateSettings('policy_text', event.target.value)} rows={3} className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm leading-relaxed" /></label>
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3"><p className="text-xs leading-relaxed text-gray-500">Jangan aktifkan sebelum QRIS/rekening dan instruksi di Profile Payment sudah benar.</p><button type="button" onClick={saveSettings} disabled={savingSettings} className="rounded-xl bg-gray-900 px-5 py-3 text-sm font-black text-white hover:bg-gray-800 disabled:opacity-50">{savingSettings ? 'Menyimpan...' : 'Simpan Pengaturan'}</button></div>
      </section>

      <section className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-gray-100 p-5 sm:p-6"><div><h2 className="text-lg font-black text-gray-900">Antrean Konfirmasi Pembayaran</h2><p className="mt-1 text-sm text-gray-500">Verifikasi hanya setelah transaksi benar-benar terlihat pada mutasi QRIS/rekening.</p></div></div>

        {loading ? <div className="p-10 text-center text-sm text-gray-400">Memuat antrean pembayaran...</div> : payments.length === 0 ? (
          <div className="p-10 text-center"><div className="text-4xl">💳</div><h3 className="mt-3 font-black text-gray-900">Belum ada konfirmasi pembayaran</h3><p className="mt-1 text-sm text-gray-500">Konfirmasi user akan muncul di sini setelah tulisan diterima editorial.</p></div>
        ) : (
          <div className="divide-y divide-gray-100">
            {payments.map((payment) => {
              const entry = entriesById[payment.entry_id]
              return (
                <article key={payment.id} className="p-5 sm:p-6">
                  <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2"><PaymentStatusBadge status={payment.status} />{entry?.status && <EntryStatusBadge status={entry.status} />}<span className="text-xs text-gray-400">Dikonfirmasi {formatDateTime(payment.confirmed_at)}</span></div>
                      <h3 className="mt-3 font-black leading-snug text-gray-900">{entry?.title || 'Hasil pembelajaran tidak ditemukan'}</h3>
                      <p className="mt-1 text-sm text-gray-500">Pembelajar: <b className="text-gray-700">{entry?.studied_by_name || '-'}</b> · Nominal: <b className="text-gray-900">{formatRupiah(payment.amount)}</b></p>
                      {payment.verification_note && <p className="mt-3 rounded-xl border border-gray-200 bg-gray-50 p-3 text-xs leading-relaxed text-gray-600"><b>Catatan admin:</b> {payment.verification_note}</p>}
                      {payment.verified_at && <p className="mt-2 text-xs text-gray-400">Diproses {formatDateTime(payment.verified_at)}</p>}
                    </div>
                    {payment.status === 'awaiting_verification' && <button type="button" onClick={() => openVerification(payment)} className="shrink-0 rounded-xl bg-violet-700 px-4 py-3 text-sm font-black text-white hover:bg-violet-800">Periksa & Verifikasi</button>}
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>

      {selectedPayment && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-4" onClick={() => !processingPaymentId && setSelectedPayment(null)}>
          <div className="mx-auto my-8 max-w-lg rounded-3xl bg-white p-5 sm:p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <p className="text-xs font-black tracking-wide text-violet-700">VERIFIKASI MANUAL</p>
            <h2 className="mt-2 text-xl font-black text-gray-900">{entriesById[selectedPayment.entry_id]?.title || 'Konfirmasi pembayaran'}</h2>
            <p className="mt-2 text-sm leading-relaxed text-gray-500">Cocokkan nominal <b className="text-gray-800">{formatRupiah(selectedPayment.amount)}</b> pada mutasi QRIS/rekening sebelum memilih “Verifikasi & Terbitkan”. Tidak ada bukti transfer yang disimpan di sistem.</p>
            <label className="mt-5 block"><span className="mb-1.5 block text-sm font-bold text-gray-700">Catatan admin <span className="font-normal text-gray-400">(opsional)</span></span><textarea value={verificationNote} onChange={(event) => setVerificationNote(event.target.value)} rows={4} placeholder="Contoh: Transaksi ditemukan dan nominal sesuai." className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm leading-relaxed" /></label>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" onClick={() => setSelectedPayment(null)} disabled={Boolean(processingPaymentId)} className="rounded-xl border border-gray-200 px-4 py-3 text-sm font-bold text-gray-600 hover:bg-gray-50 disabled:opacity-50">Batal</button><button type="button" onClick={() => processPayment('not_verified')} disabled={Boolean(processingPaymentId)} className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800 hover:bg-amber-100 disabled:opacity-50">Belum Ditemukan</button><button type="button" onClick={() => processPayment('verified')} disabled={Boolean(processingPaymentId)} className="rounded-xl bg-green-700 px-4 py-3 text-sm font-black text-white hover:bg-green-800 disabled:opacity-50">{processingPaymentId ? 'Memproses...' : 'Verifikasi & Terbitkan'}</button></div>
          </div>
        </div>
      )}
    </div>
  )
}

export default AdminLearningPaymentsPage
