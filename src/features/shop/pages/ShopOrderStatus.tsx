import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { QueryClientProvider, useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { getShopSupabase } from '../lib/supabase'
import { formatDuration } from '../lib/formatDuration'
import { readStoredOrder, saveStoredOrder } from '../lib/orderStorage'
import { buildWhatsAppLink, shopContactQueryClient, useShopContact } from '../lib/shopContact'

type StoredOrder = { order_id: string; order_code: string; token: string; expires_at: string }
type OrderStatus = {
  status: 'draft' | 'waiting_verification' | 'verified' | 'rejected' | 'expired'
  order_code: string
  variant_id: string
  price: number
  paid_at: string | null
  proof_path: string | null
  admin_note: string | null
  expires_at: string
}
type PaymentMethod = {
  id: string; name: string; kind: 'bank' | 'ewallet' | 'qris'; account_number: string | null;
  account_name: string; logo_url: string | null; qris_image_path: string | null
}
type Variant = {
  account_type: 'sharing' | 'private'; duration_days: number; price: number
  product: { name: string }
}

const tokenPattern = /^[0-9a-f]{64}$/i
const proofTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp',
  'image/gif', 'image/avif', 'image/heic', 'image/heif', 'image/bmp']
const proofAccept = proofTypes.join(',')
const buttonClass = 'inline-flex min-h-11 items-center justify-center rounded-greenroom-control border border-greenroom-input-border px-5 py-3 font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-greenroom-primary disabled:opacity-50'
const primaryButtonClass = `${buttonClass} border-greenroom-primary bg-greenroom-primary text-white hover:bg-greenroom-primary-hover`

async function hashToken(rawToken: string): Promise<string> {
  const bytes = new Uint8Array(32)
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(rawToken.slice(index * 2, index * 2 + 2), 16)
  }
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function getStatus(order: StoredOrder): Promise<OrderStatus> {
  const { data, error } = await getShopSupabase().rpc('get_order_status', {
    p_order_id: order.order_id, p_token_hash: await hashToken(order.token)
  })
  if (error || !data || typeof data.status !== 'string') throw error || new Error('invalid_order_status')
  return data as OrderStatus
}

async function getPaymentMethods(): Promise<PaymentMethod[]> {
  const { data, error } = await getShopSupabase().from('shop_payment_methods')
    .select('id, name, kind, account_number, account_name, logo_url, qris_image_path')
    .eq('is_active', true).order('sort_order').order('name')
  if (error) throw error
  return data || []
}

async function getVariant(id: string): Promise<Variant | null> {
  const { data, error } = await getShopSupabase().from('shop_variants')
    .select('account_type, duration_days, price, product:shop_products(name)')
    .eq('id', id).maybeSingle()
  if (error) throw error
  return data as unknown as Variant | null
}

function formatCountdown(seconds: number) {
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

function OrderPage() {
  const { kode } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [order, setOrder] = useState<StoredOrder | null>(() => readStoredOrder(kode))
  const [status, setStatus] = useState<OrderStatus | null>(null)
  const [now, setNow] = useState(Date.now)
  const [statusError, setStatusError] = useState('')
  const [actionError, setActionError] = useState('')
  const [busy, setBusy] = useState(false)
  const [noStock, setNoStock] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState('')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const contact = useShopContact()
  const [copied, setCopied] = useState('')
  const [selectedMethodId, setSelectedMethodId] = useState('')
  const [proofStepOpen, setProofStepOpen] = useState(false)
  const [qrisOpen, setQrisOpen] = useState(false)
  const [qrisFailed, setQrisFailed] = useState(false)
  const [recoveryCode, setRecoveryCode] = useState(kode || '')
  const [lastFour, setLastFour] = useState('')

  const remainingSeconds = order ? Math.max(0, Math.ceil((Date.parse(order.expires_at) - now) / 1000)) : 0
  const currentStatus = status?.status === 'draft' && remainingSeconds === 0 ? 'expired' : status?.status
  const methodsQuery = useQuery({
    queryKey: ['shop-payment-methods'], queryFn: getPaymentMethods,
    enabled: currentStatus === 'draft'
  })
  const variantQuery = useQuery({
    queryKey: ['shop-order-variant', status?.variant_id],
    queryFn: () => getVariant(status!.variant_id),
    enabled: currentStatus === 'draft' && !!status?.variant_id
  })

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])
  useEffect(() => {
    if (!file || file.type === 'application/pdf') return
    const url = URL.createObjectURL(file)
    setPreviewUrl(url)
    return () => { URL.revokeObjectURL(url); setPreviewUrl(null) }
  }, [file])

  function chooseFile(next: File | null) {
    setFileError('')
    if (!next) { setFile(null); return }
    if (!proofTypes.includes(next.type)) { setFile(null); setFileError('Pilih foto JPG, PNG, WebP, GIF, AVIF, HEIC, HEIF, BMP, atau PDF.'); return }
    if (next.size === 0 || next.size > 5 * 1024 * 1024) { setFile(null); setFileError('Ukuran bukti harus lebih dari 0 dan maksimal 5 MB.'); return }
    setFile(next)
  }

  useEffect(() => {
    if (!order) return
    let active = true
    let timer: number | undefined
    let polling = false
    async function poll() {
      if (polling) return
      polling = true
      try {
        const next = await getStatus(order!)
        if (!active) return
        setStatus(next)
        setStatusError('')
        if (next.status === 'verified' || next.status === 'rejected' || next.status === 'expired'
          || (next.status === 'draft' && Date.now() >= Date.parse(order!.expires_at))) {
          window.clearInterval(timer)
        }
      } catch {
        if (active) setStatusError('Gagal memuat status pesanan. Mencoba lagi otomatis…')
      } finally { polling = false }
    }
    void poll()
    timer = window.setInterval(() => void poll(), 3000)
    return () => { active = false; window.clearInterval(timer) }
  }, [order])

  useEffect(() => {
    if (currentStatus === 'verified' && kode) navigate(`/shop/order/${kode}/hasil`, { replace: true })
    if (currentStatus === 'expired') sessionStorage.removeItem('gr_order')
  }, [currentStatus, kode, navigate])

  function recover(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextCode = recoveryCode.trim().toUpperCase()
    if (!nextCode || !/^\d{4}$/.test(lastFour)) return
    navigate(`/shop/order/${encodeURIComponent(nextCode)}?recover=1`)
  }

  function showProofStep() {
    if (!order || !selectedMethodId || busy || currentStatus !== 'draft') return
    setActionError('')
    setProofStepOpen(true)
  }

  async function uploadProof() {
    if (!order || !file || !selectedMethodId || busy || currentStatus !== 'draft') return
    if (!proofTypes.includes(file.type) || file.size === 0 || file.size > 5 * 1024 * 1024) {
      setActionError('Pilih gambar atau PDF berukuran maksimal 5 MB.')
      return
    }
    setBusy(true)
    setActionError('')
    try {
      const form = new FormData()
      form.set('order_id', order.order_id)
      form.set('token', order.token)
      form.set('method_id', selectedMethodId)
      form.set('file', file)
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/proof-upload`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY
        },
        body: form
      })
      const result = await response.json()
      if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'upload_failed')
      setStatus(await getStatus(order))
      setFile(null)
      setProofStepOpen(false)
    } catch (cause) {
      const messages: Record<string, string> = {
        order_expired: 'Waktu pembayaran habis. Silakan buat pesanan baru.',
        invalid_method: 'Metode pembayaran tidak tersedia, pilih metode lain.',
        invalid_status: 'Bukti sudah diproses. Memuat ulang status pesanan.',
        invalid_file: 'Format bukti tidak dikenali. Pilih foto atau PDF yang valid.',
        payload_too_large: 'Bukti transfer maksimal 5 MB.',
        rate_limited: 'Terlalu sering mencoba. Tunggu sebentar.'
      }
      const code = cause instanceof Error ? cause.message : ''
      setActionError(messages[code] ?? 'Gagal mengunggah bukti. Coba lagi.')
      if (code === 'order_expired') setStatus((previous) => previous ? { ...previous, status: 'expired' } : previous)
      if (code === 'invalid_method') { setSelectedMethodId(''); void methodsQuery.refetch() }
    } finally { setBusy(false) }
  }

  async function retryPayment() {
    if (!order || busy || currentStatus !== 'rejected') return
    setBusy(true)
    setNoStock(false)
    setActionError('')
    try {
      const { data, error } = await getShopSupabase().rpc('retry_payment', {
        p_order_id: order.order_id, p_token_hash: await hashToken(order.token)
      })
      if (error) {
        if (error.message === 'no_stock') { setNoStock(true); return }
        throw error
      }
      if (!data || typeof data.token !== 'string' || !tokenPattern.test(data.token)
        || typeof data.expires_at !== 'string') throw new Error('invalid_retry_response')
      const nextOrder = { ...order, token: data.token, expires_at: data.expires_at }
      saveStoredOrder(nextOrder)
      setProofStepOpen(false); setSelectedMethodId(''); setFile(null)
      setStatus(null)
      setOrder(nextOrder)
    } catch (cause) {
      setActionError(cause && typeof cause === 'object' && 'message' in cause && cause.message === 'rate_limited'
        ? 'Terlalu banyak percobaan. Coba lagi beberapa menit lagi atau hubungi admin.' : 'Gagal mengulang pembayaran. Coba lagi.')
    } finally { setBusy(false) }
  }

  async function copyNumber(value: string) {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(value)
    } catch { setActionError('Nomor tidak dapat disalin. Salin secara manual.') }
  }

  if (!order) {
    return (
      <main className="min-h-screen bg-greenroom-bg px-5 py-10 font-greenroom-sans text-greenroom-ink">
        <section className="mx-auto max-w-xl rounded-greenroom-card border border-greenroom-border bg-white p-5 sm:p-8">
          <h1 className="text-2xl font-extrabold">Pulihkan pesanan</h1>
          {searchParams.get('recover') === '1' && <p role="status" className="mt-4">Fitur pemulihan segera hadir.</p>}
          <form onSubmit={recover} className="mt-6 space-y-4">
            <label className="block font-bold">Kode pesanan
              <input required value={recoveryCode} onChange={(event) => setRecoveryCode(event.target.value)}
                className="mt-2 min-h-11 w-full rounded-greenroom-control border border-greenroom-input-border p-3" />
            </label>
            <label className="block font-bold">4 digit terakhir nomor HP
              <input required inputMode="numeric" pattern="[0-9]{4}" maxLength={4} value={lastFour}
                onChange={(event) => setLastFour(event.target.value)}
                className="mt-2 min-h-11 w-full rounded-greenroom-control border border-greenroom-input-border p-3" />
            </label>
            <button type="submit" className={primaryButtonClass}>Cari pesanan</button>
          </form>
        </section>
      </main>
    )
  }

  const variant = variantQuery.data
  const paidSeconds = status?.paid_at ? Math.max(0, Math.floor((now - Date.parse(status.paid_at)) / 1000)) : 0
  const whatsapp = buildWhatsAppLink(contact, `Halo admin, saya butuh bantuan untuk pesanan ${order.order_code}`)

  return (
    <main className="min-h-screen bg-greenroom-bg px-5 py-10 font-greenroom-sans text-greenroom-ink">
      <div className="mx-auto max-w-2xl space-y-5">
        <h1 className="text-2xl font-extrabold">Pesanan {order.order_code}</h1>
        {statusError && <p role="alert" className="text-greenroom-danger">{statusError}</p>}
        {actionError && <p role="alert" className="text-greenroom-danger">{actionError}</p>}
        {!status && <p role="status">Memuat status pesanan…</p>}

        {currentStatus === 'draft' && (
          <>
            <section className="rounded-greenroom-card border border-greenroom-border bg-white p-5">
              <h2 className="text-lg font-bold">Ringkasan pesanan</h2>
              <p className="mt-2">Kode: <strong>{order.order_code}</strong></p>
              {variant && <>
                <p>{variant.product.name} · {variant.account_type === 'sharing' ? 'Sharing' : 'Private'} · {formatDuration(variant.duration_days)}</p>
                <p className="mt-2 text-xl font-extrabold">Rp {new Intl.NumberFormat('id-ID').format(status!.price)}</p>
              </>}
              {variantQuery.isPending && <p role="status">Memuat rincian produk…</p>}
              {variantQuery.isError && <p role="alert">Rincian produk belum dapat dimuat.</p>}
              <p className="mt-4 rounded-greenroom-control bg-greenroom-warn-bg p-3 text-greenroom-warn-ink">
                Selesaikan transfer dalam {formatCountdown(remainingSeconds)}.
              </p>
            </section>
            <section className="rounded-greenroom-card border border-greenroom-border bg-white p-5">
              <h2 className="text-lg font-bold">Pilih metode pembayaran</h2>
              {methodsQuery.isPending && <p role="status" className="mt-3">Memuat metode pembayaran…</p>}
              {methodsQuery.isError && <button type="button" className={buttonClass} onClick={() => methodsQuery.refetch()}>Coba muat ulang</button>}
              {methodsQuery.data?.length === 0 && <p className="mt-3">Metode pembayaran belum tersedia.</p>}
              <div className="mt-4 space-y-3" role="radiogroup" aria-label="Metode pembayaran">
                {methodsQuery.data?.map((method) => <label key={method.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-greenroom-control border border-greenroom-border bg-white p-4">
                  <input type="radio" name="shop-method" value={method.id} checked={selectedMethodId === method.id}
                    onChange={() => { setSelectedMethodId(method.id); setQrisFailed(false) }} />
                  <span className="font-bold">{method.name}</span><span className="text-sm text-greenroom-muted">{method.kind === 'qris' ? 'QRIS' : method.kind === 'ewallet' ? 'E-Wallet' : 'Bank'}</span>
                </label>)}
              </div>
              {methodsQuery.data?.filter((method) => method.id === selectedMethodId).map((method) => <div key={method.id} className="mt-4 space-y-3 rounded-greenroom-control bg-greenroom-tint p-4">
                <p className="text-xl font-extrabold">Transfer tepat Rp {new Intl.NumberFormat('id-ID').format(status!.price)}</p>
                <p className="font-bold">{method.name}</p><p>a.n. {method.account_name}</p>
                {method.kind !== 'qris' && method.account_number && <div className="flex flex-wrap items-center gap-3"><strong className="break-all">{method.account_number}</strong>
                  <button type="button" className={buttonClass} aria-live="polite" onClick={() => void copyNumber(method.account_number!)}>{copied === method.account_number ? 'Tersalin ✓' : 'Salin'}</button></div>}
                {method.kind === 'qris' && method.qris_image_path && <>
                  {qrisFailed ? <p role="alert">Gambar QRIS gagal dimuat. Hubungi Admin. {whatsapp && <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="underline">Hubungi Admin</a>}</p>
                    : <button type="button" className="block min-h-11 w-full" onClick={() => setQrisOpen(true)}><img src={getShopSupabase().storage.from('shop-images').getPublicUrl(method.qris_image_path).data.publicUrl} alt={`QRIS ${method.name}`} className="mx-auto max-h-80 object-contain" onError={() => setQrisFailed(true)} /></button>}
                  <a href={getShopSupabase().storage.from('shop-images').getPublicUrl(method.qris_image_path).data.publicUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center underline">Buka gambar</a>
                  <p>Scan dengan aplikasi bank atau e-wallet. Pastikan nominal sesuai.</p>
                  {qrisOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-greenroom-ink/80 p-4" role="presentation" onClick={() => setQrisOpen(false)}><div role="dialog" aria-modal="true" aria-label="Gambar QRIS" className="max-h-[90vh] max-w-2xl overflow-auto bg-white p-4" onClick={(event) => event.stopPropagation()}><button type="button" className={buttonClass} onClick={() => setQrisOpen(false)}>Tutup</button><img src={getShopSupabase().storage.from('shop-images').getPublicUrl(method.qris_image_path).data.publicUrl} alt={`QRIS ${method.name}`} className="max-h-[75vh] w-full object-contain" /></div></div>}
                </>}
              </div>)}
            </section>
            <button type="button" disabled={busy || !selectedMethodId} className={primaryButtonClass} onClick={showProofStep}>
              Sudah Transfer
            </button>
            {proofStepOpen && <div className="mt-6 space-y-3">
              <p className="font-bold">1. Pilih file&nbsp;&nbsp; 2. Kirim bukti</p>
              <label htmlFor="shop-proof" className="flex min-h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-greenroom-control border border-greenroom-input-border bg-greenroom-bg p-5 text-center focus-within:outline-2 focus-within:outline-greenroom-primary"
                onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); chooseFile(event.dataTransfer.files[0] ?? null) }}>
                <input ref={fileInput} id="shop-proof" type="file" accept={proofAccept} className="sr-only"
                  onChange={(event) => { chooseFile(event.target.files?.[0] ?? null); event.target.value = '' }} />
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-8 w-8 text-greenroom-primary"><path d="M12 16V3m0 0L7 8m5-5 5 5M4 16v4h16v-4" /></svg>
                <span className="font-bold">Pilih foto atau PDF bukti transfer</span><span className="text-sm text-greenroom-muted">JPG, PNG, PDF - maks. 5 MB</span>
              </label>
              {fileError && <p role="alert" className="text-sm text-greenroom-danger">{fileError}</p>}
              {file && <div className="flex flex-wrap items-center gap-3 rounded-greenroom-control border border-greenroom-border p-3">
                {file.type === 'application/pdf' ? <svg aria-label="Dokumen PDF" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-16 w-16 text-greenroom-primary"><path d="M6 2h8l4 4v16H6zM14 2v5h5M9 13h6m-6 4h6" /></svg>
                  : previewUrl && <img src={previewUrl} alt="Pratinjau bukti transfer" className="h-20 w-20 rounded-greenroom-control object-cover" />}
                <div className="min-w-0 flex-1"><p className="break-all font-bold">{file.name}</p><p className="text-sm text-greenroom-muted">{(file.size / 1024 / 1024).toFixed(2)} MB</p></div>
                <button type="button" className={buttonClass} onClick={() => fileInput.current?.click()}>Ganti file</button>
                <button type="button" className={buttonClass} onClick={() => { setFile(null); setFileError('') }}>Hapus</button>
              </div>}
              {busy && <p role="status">Mengunggah bukti…</p>}
              <button type="button" disabled={!file || !selectedMethodId || busy} className={primaryButtonClass} onClick={() => void uploadProof()}>Kirim bukti</button>
            </div>}
          </>
        )}

        {currentStatus === 'waiting_verification' && (
          <section className="rounded-greenroom-card border border-greenroom-border bg-white p-5">
            <h2 className="text-xl font-bold">Menunggu verifikasi</h2>
            <p className="mt-2">Kode pesanan: <strong>{order.order_code}</strong></p>
            <p className="mt-2 text-greenroom-muted">Waktu sejak transfer: {Math.floor(paidSeconds / 60)} menit {paidSeconds % 60} detik</p>
            <p role="status" className="mt-6">Bukti diterima. Menunggu admin memverifikasi…</p>
            {paidSeconds >= 600 && <div className="mt-6 rounded-greenroom-control bg-greenroom-warn-bg p-4 text-greenroom-warn-ink">
              <p className="font-bold">Terlambat</p>
              <p>Verifikasi membutuhkan waktu lebih lama. Hubungi admin dengan kode pesanan ini.</p>
              {whatsapp ? <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex min-h-11 items-center underline">Hubungi via WhatsApp</a> : <p className="mt-3 text-sm">Kontak admin belum tersedia</p>}
            </div>}
          </section>
        )}

        {currentStatus === 'rejected' && <section className="rounded-greenroom-card border border-greenroom-border bg-white p-5">
          <h2 className="text-xl font-bold text-greenroom-danger">Pembayaran ditolak</h2>
          {status?.admin_note && <p className="mt-3">Catatan admin: {status.admin_note}</p>}
          {noStock && <p role="alert" className="mt-3 text-greenroom-danger">Stok habis. Silakan pilih varian lain.</p>}
          <div className="mt-5 flex flex-wrap gap-3">
            <button type="button" disabled={busy || noStock} className={primaryButtonClass} onClick={() => void retryPayment()}>
              {busy ? 'Memproses…' : 'Ulangi pembayaran'}
            </button>
            <Link to="/shop" className={buttonClass}>Kembali ke katalog</Link>
            {whatsapp ? <a href={whatsapp} target="_blank" rel="noopener noreferrer" className={buttonClass}>Hubungi Admin</a> : <p className="text-sm text-greenroom-muted">Kontak admin belum tersedia</p>}
          </div>
        </section>}

        {currentStatus === 'expired' && <section className="rounded-greenroom-card border border-greenroom-border bg-white p-5">
          <h2 className="text-xl font-bold">Waktu pembayaran habis</h2>
          <p className="mt-2">Pesanan dibatalkan. Silakan buat pesanan baru.</p>
          <Link to="/shop" className={`${primaryButtonClass} mt-5`}>Kembali ke katalog</Link>
        </section>}
      </div>
    </main>
  )
}

export default function ShopOrderStatus() {
  const { kode } = useParams()
  return <QueryClientProvider client={shopContactQueryClient}><OrderPage key={kode} /></QueryClientProvider>
}
