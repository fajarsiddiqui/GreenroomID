import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { getShopSupabase } from '../lib/supabase'
import { formatDuration } from '../lib/formatDuration'

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
  id: string; name: string; account_number: string; account_name: string; logo_url: string | null
}
type Variant = {
  account_type: 'sharing' | 'private'; duration_days: number; price: number
  product: { name: string }
}

const queryClient = new QueryClient()
const tokenPattern = /^[0-9a-f]{64}$/i
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const buttonClass = 'inline-flex min-h-11 items-center justify-center rounded-greenroom-control border border-greenroom-input-border px-5 py-3 font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-greenroom-primary disabled:opacity-50'
const primaryButtonClass = `${buttonClass} border-greenroom-primary bg-greenroom-primary text-white hover:bg-greenroom-primary-hover`

function readStoredOrder(code: string | undefined): StoredOrder | null {
  if (typeof window === 'undefined' || !code) return null
  try {
    const value = JSON.parse(sessionStorage.getItem('gr_order') || 'null') as StoredOrder | null
    if (value && uuidPattern.test(value.order_id) && tokenPattern.test(value.token)
      && value.order_code === code && Number.isFinite(Date.parse(value.expires_at))) return value
  } catch { /* Missing or invalid session falls back to recovery. */ }
  return null
}

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
    .select('id, name, account_number, account_name, logo_url')
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
  const [copied, setCopied] = useState('')
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

  async function submitPayment() {
    if (!order || busy || currentStatus !== 'draft') return
    setBusy(true)
    setActionError('')
    try {
      const { error } = await getShopSupabase().rpc('submit_payment', {
        p_order_id: order.order_id,
        p_token_hash: await hashToken(order.token),
        p_paid_at: new Date().toISOString()
      })
      if (error) throw error
      setStatus(await getStatus(order))
    } catch {
      setActionError('Gagal mengonfirmasi transfer. Coba lagi.')
    } finally { setBusy(false) }
  }

  async function uploadProof() {
    if (!order || !file || busy || currentStatus !== 'waiting_verification' || status?.proof_path) return
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp',
      'image/gif', 'image/avif', 'image/heic', 'image/heif', 'image/bmp']
    if (!allowedTypes.includes(file.type) || file.size === 0 || file.size > 5 * 1024 * 1024) {
      setActionError('Pilih gambar atau PDF berukuran maksimal 5 MB.')
      return
    }
    setBusy(true)
    setActionError('')
    try {
      const form = new FormData()
      form.set('order_id', order.order_id)
      form.set('token', order.token)
      form.set('file', file)
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/proof-upload`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY
        },
        body: form
      })
      if (!response.ok) throw new Error('upload_failed')
      setStatus((previous) => previous ? { ...previous, proof_path: 'uploaded' } : previous)
      setFile(null)
    } catch {
      setActionError('Gagal mengunggah bukti. Coba lagi.')
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
      sessionStorage.setItem('gr_order', JSON.stringify(nextOrder))
      setStatus(null)
      setOrder(nextOrder)
    } catch {
      setActionError('Gagal mengulang pembayaran. Coba lagi.')
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
  const adminPhone = String(import.meta.env.VITE_SHOP_ADMIN_PHONE || '').replace(/\D/g, '').replace(/^0/, '62')
  const whatsapp = adminPhone ? `https://wa.me/${adminPhone}?text=${encodeURIComponent(`Halo, saya ingin menanyakan pesanan ${order.order_code}.`)}` : ''

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
              <div className="mt-4 space-y-3">
                {methodsQuery.data?.map((method) => <div key={method.id} className="flex flex-wrap items-center gap-4 rounded-greenroom-control border border-greenroom-border p-4">
                  <span aria-hidden="true" className="relative flex h-11 w-11 items-center justify-center rounded-full bg-greenroom-tint font-bold">
                    {method.name.slice(0, 2).toUpperCase()}
                    {method.logo_url && <img src={method.logo_url} alt="" className="absolute inset-0 h-11 w-11 bg-white object-contain" onError={(event) => { event.currentTarget.hidden = true }} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold">{method.name}</p>
                    <p className="break-all">{method.account_number}</p>
                    <p className="text-sm text-greenroom-muted">a.n. {method.account_name}</p>
                  </div>
                  <button type="button" className={buttonClass} onClick={() => void copyNumber(method.account_number)}>
                    {copied === method.account_number ? 'Tersalin' : 'Salin nomor'}
                  </button>
                </div>)}
              </div>
            </section>
            <button type="button" disabled={busy} className={primaryButtonClass} onClick={() => void submitPayment()}>
              {busy ? 'Memproses…' : 'Sudah Transfer'}
            </button>
          </>
        )}

        {currentStatus === 'waiting_verification' && (
          <section className="rounded-greenroom-card border border-greenroom-border bg-white p-5">
            <h2 className="text-xl font-bold">Menunggu verifikasi</h2>
            <p className="mt-2">Kode pesanan: <strong>{order.order_code}</strong></p>
            <p className="mt-2 text-greenroom-muted">Waktu sejak transfer: {Math.floor(paidSeconds / 60)} menit {paidSeconds % 60} detik</p>
            {!status?.proof_path ? <div className="mt-6 space-y-3">
              <label htmlFor="shop-proof" className="block font-bold">Unggah bukti transfer (gambar atau PDF, maksimal 5 MB)</label>
              <input id="shop-proof" type="file" accept="image/*,application/pdf" className="block min-h-11 w-full"
                onChange={(event) => setFile(event.target.files?.[0] || null)} />
              {file && <p className="text-sm">{file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB</p>}
              {busy && <p role="status">Mengunggah bukti…</p>}
              <button type="button" disabled={!file || busy} className={primaryButtonClass} onClick={() => void uploadProof()}>Unggah bukti</button>
            </div> : <p role="status" className="mt-6 flex items-center gap-3">
              <span aria-hidden="true" className="h-5 w-5 animate-spin rounded-full border-2 border-greenroom-tint border-t-greenroom-primary" />
              Bukti diterima. Menunggu admin memverifikasi…
            </p>}
            {paidSeconds >= 600 && <div className="mt-6 rounded-greenroom-control bg-greenroom-warn-bg p-4 text-greenroom-warn-ink">
              <p className="font-bold">Terlambat</p>
              <p>Verifikasi membutuhkan waktu lebih lama. Hubungi admin dengan kode pesanan ini.</p>
              {whatsapp && <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex min-h-11 items-center underline">Hubungi via WhatsApp</a>}
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
  return <QueryClientProvider client={queryClient}><OrderPage key={kode} /></QueryClientProvider>
}
