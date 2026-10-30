import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { getShopSupabase } from '../lib/supabase'
import { buildWhatsAppLink, shopContactQueryClient, useShopContact } from '../lib/shopContact'
import { variantLabel } from '../lib/variations'
import ShopRefundTerms from '../components/ShopRefundTerms'
import { forgetStoredOrder, hashOrderToken, readStoredOrder, saveStoredOrder } from '../lib/orderStorage'

type Credentials = { email: string; password: string; has_totp: boolean; product_name: string;
  variant_label_parts: { account_type: string; duration_days: number; option_values: string[] }; terms: string | null }
type Status = { status: string; variant_id: string; access_expires_at: string | null }
type Variant = { account_type: string; duration_days: number; option_values: string[]; product: { name: string; terms: string | null } | null }
type WindowInfo = { server_now_ms: number; window_start_ms: number; window_end_ms: number; access_expires_at: string }
type CodeInfo = { code: string; window_end_ms: number; server_now_ms: number }
type Phase = 'idle' | 'starting' | 'waiting' | 'shown' | 'expired'
type CopyField = 'email' | 'password' | 'totp'
const base = 'inline-flex min-h-11 items-center justify-center rounded-greenroom-control border px-4 py-2 font-bold focus-visible:outline-2 focus-visible:outline-greenroom-primary disabled:opacity-50'
const primary = `${base} border-greenroom-primary bg-greenroom-primary text-white hover:bg-greenroom-primary-hover`
const secondary = `${base} border-greenroom-input-border bg-white text-greenroom-ink hover:bg-greenroom-bg`
const copiedButton = `${base} border-greenroom-primary bg-greenroom-tint text-greenroom-primary`
const card = 'rounded-greenroom-card border border-greenroom-border bg-white p-5 sm:p-7'
const errors: Record<string, string> = {
  rate_limited: 'Terlalu sering mencoba. Tunggu sebentar.',
  already_viewed: 'Akun sudah pernah ditampilkan. Hubungi Admin.',
  not_verified: 'Pembayaran belum terverifikasi.', unauthorized: 'Akses pesanan tidak valid. Hubungi Admin.',
  reveal_failed: 'Gagal membuka akun. Silakan coba lagi.', totp_failed: 'Gagal mengambil kode. Silakan coba lagi.',
  not_started: 'Pengambilan kode belum dimulai.', no_totp_configured: 'Akun ini tidak memakai authenticator.',
  totp_expired: 'Kode kedaluwarsa. Kode hanya bisa diambil sekali. Hubungi Admin jika perlu.',
  totp_already_issued: 'Kode kedaluwarsa. Kode hanya bisa diambil sekali. Hubungi Admin jika perlu.'
}
class BuyerError extends Error {
  constructor(readonly code: string, readonly hasTotp?: boolean) { super(code) }
}
async function buyerCall<T>(name: string, orderId: string, token: string, signal: AbortSignal, action?: string): Promise<T> {
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY
  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST', signal, cache: 'no-store', headers: { apikey: anon, Authorization: `Bearer ${anon}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ order_id: orderId, token, ...(action ? { action } : {}) })
  })
  const result = await response.json()
  if (!response.ok) throw new BuyerError(response.status === 429 ? 'rate_limited' : typeof result.error === 'string' ? result.error : 'request_failed',
    typeof result.has_totp === 'boolean' ? result.has_totp : undefined)
  return result as T
}

function ResultPage({ code }: { code: string }) {
  const navigate = useNavigate()
  const contact = useShopContact()
  const [order] = useState(() => readStoredOrder(code))
  const [status, setStatus] = useState<Status | null>(null)
  const [statusError, setStatusError] = useState('')
  const [variant, setVariant] = useState<Variant | null>(null)
  const [credentials, setCredentials] = useState<Credentials | null>(null)
  const [hasTotp, setHasTotp] = useState<boolean | undefined>(order?.has_totp)
  const [revealError, setRevealError] = useState('')
  const [revealing, setRevealing] = useState(false)
  const [saved, setSaved] = useState(false)
  const [authenticatorOpen, setAuthenticatorOpen] = useState(false)
  const [phase, setPhase] = useState<Phase>('idle')
  const [totpError, setTotpError] = useState('')
  const [windowInfo, setWindowInfo] = useState<WindowInfo | null>(null)
  const [totpCode, setTotpCode] = useState('')
  const [offset, setOffset] = useState(0)
  const [now, setNow] = useState(Date.now)
  const [copied, setCopied] = useState<CopyField | null>(null)
  const [copyError, setCopyError] = useState<CopyField | null>(null)
  const copyTimer = useRef<number | null>(null)
  const controller = useRef<AbortController | null>(null)
  const generation = useRef(0)
  const inFlight = useRef(false)
  useEffect(() => {
    controller.current = new AbortController()
    return () => {
      generation.current += 1
      controller.current?.abort()
      if (copyTimer.current !== null) window.clearTimeout(copyTimer.current)
      setCredentials(null); setTotpCode('')
    }
  }, [])
  useEffect(() => {
    if (!order) return
    try { saveStoredOrder(order) } catch { /* Existing session is still usable if storage is disabled. */ }
    let active = true
    let pending = false
    async function poll() {
      if (pending) return
      pending = true
      try {
        const { data, error } = await getShopSupabase().rpc('get_order_status', {
          p_order_id: order!.order_id, p_token_hash: await hashOrderToken(order!.token)
        })
        if (error || !data) throw new Error('status_failed')
        if (!active) return
        const next = data as Status
        if (next.status !== 'verified') { navigate(`/shop/order/${code}`, { replace: true }); return }
        setStatus(next); setStatusError('')
      } catch { if (active) setStatusError('Gagal memuat status pesanan. Mencoba lagi otomatis…') }
      finally { pending = false }
    }
    void poll()
    const timer = window.setInterval(() => void poll(), 3000)
    return () => { active = false; window.clearInterval(timer) }
  }, [order, code, navigate])
  useEffect(() => {
    if (!status?.variant_id) return
    let active = true
    void (async () => {
      const { data } = await getShopSupabase().from('shop_variants')
        .select('account_type,duration_days,option_values,product:shop_products(name,terms)').eq('id', status.variant_id).maybeSingle()
      if (active) setVariant(data as unknown as Variant | null)
    })()
    return () => { active = false }
  }, [status?.variant_id])
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 200)
    return () => window.clearInterval(timer)
  }, [])
  const serverNow = now + offset
  const codeRemaining = windowInfo ? Math.max(0, Math.ceil((windowInfo.window_end_ms - serverNow) / 1000)) : 0
  const waitRemaining = windowInfo ? Math.max(0, Math.ceil((windowInfo.window_start_ms - serverNow) / 1000)) : 0
  useEffect(() => {
    if (windowInfo && codeRemaining === 0) { setTotpCode(''); setPhase('expired') }
  }, [windowInfo, codeRemaining])
  function rememberTotp(value: boolean) {
    setHasTotp(value)
    if (order) {
      try { saveStoredOrder({ ...order, has_totp: value }) } catch { /* Do not discard already-revealed credentials. */ }
    }
  }
  async function reveal() {
    if (!order || inFlight.current || status?.status !== 'verified') return
    inFlight.current = true; setRevealing(true); setRevealError('')
    const current = generation.current
    try {
      const result = await buyerCall<Credentials>('shop-reveal-credentials', order.order_id, order.token, controller.current!.signal)
      if (current !== generation.current) return
      setCredentials(result); rememberTotp(result.has_totp)
    } catch (cause) {
      if (current !== generation.current) return
      const error = cause instanceof BuyerError ? cause : new BuyerError('reveal_failed')
      setRevealError(error.code)
      if (typeof error.hasTotp === 'boolean') rememberTotp(error.hasTotp)
    } finally { if (current === generation.current) { inFlight.current = false; setRevealing(false) } }
  }
  async function takeCode() {
    if (!order || inFlight.current || !authenticatorOpen) return
    inFlight.current = true; setPhase('starting'); setTotpError('')
    const current = generation.current
    try {
      const started = await buyerCall<WindowInfo>('shop-issue-totp', order.order_id, order.token, controller.current!.signal, 'start')
      if (current !== generation.current) return
      setOffset(started.server_now_ms - Date.now()); setNow(Date.now()); setWindowInfo(started); setPhase('waiting')
      const result = await buyerCall<CodeInfo>('shop-issue-totp', order.order_id, order.token, controller.current!.signal, 'code')
      if (current !== generation.current) return
      setOffset(result.server_now_ms - Date.now()); setNow(Date.now())
      setWindowInfo({ ...started, window_end_ms: result.window_end_ms })
      if (result.server_now_ms >= result.window_end_ms) { setTotpCode(''); setPhase('expired') }
      else { setTotpCode(result.code); setPhase('shown') }
    } catch (cause) {
      if (current !== generation.current) return
      const error = cause instanceof BuyerError ? cause.code : 'totp_failed'
      setTotpError(error)
      if (error === 'no_totp_configured') rememberTotp(false)
      setPhase(error === 'totp_expired' || error === 'totp_already_issued' ? 'expired' : 'idle')
    } finally { if (current === generation.current) inFlight.current = false }
  }
  async function copy(fieldName: CopyField, value: string) {
    if (copyTimer.current !== null) window.clearTimeout(copyTimer.current)
    setCopied(null); setCopyError(null)
    try {
      try { await navigator.clipboard.writeText(value) }
      catch {
        const field = document.createElement('textarea')
        field.value = value; field.style.position = 'fixed'; field.style.opacity = '0'
        document.body.appendChild(field)
        try { field.select(); if (!document.execCommand('copy')) throw new Error('copy_failed') }
        finally { field.value = ''; field.remove() }
      }
      setCopied(fieldName)
      copyTimer.current = window.setTimeout(() => { setCopied(null); copyTimer.current = null }, 2000)
    } catch { setCopyError(fieldName) }
  }
  function finish() {
    if (!saved) return
    generation.current += 1; controller.current?.abort()
    setCredentials(null); setTotpCode(''); setWindowInfo(null); setSaved(false); setAuthenticatorOpen(false)
    forgetStoredOrder(code)
    navigate('/shop', { replace: true })
  }
  const whatsapp = buildWhatsAppLink(contact, `Halo admin, saya butuh bantuan untuk pesanan ${code}`)
  const support = whatsapp ? <a className={secondary} href={whatsapp} target="_blank" rel="noreferrer">Hubungi Admin</a> : <p className="text-sm text-greenroom-muted">Kontak admin belum tersedia</p>
  if (!order) return <main className="min-h-screen bg-greenroom-bg p-5 font-greenroom-sans text-greenroom-ink"><section className={`mx-auto max-w-xl ${card}`}><h1 className="text-2xl font-bold">Akses pesanan tidak ditemukan</h1><p className="my-4">Buka kembali pesanan dari browser tempat kamu membeli.</p><Link className={secondary} to={`/shop/order/${code}`}>Kembali ke pesanan</Link></section></main>
  const parts = credentials?.variant_label_parts ?? variant
  const terms = credentials?.terms ?? variant?.product?.terms
  const expires = windowInfo?.access_expires_at ?? status?.access_expires_at
  return <main className="min-h-screen bg-greenroom-bg px-5 py-10 font-greenroom-sans text-greenroom-ink"><div className="mx-auto max-w-5xl space-y-6">
    <header><h1 className="text-3xl font-extrabold">Pembayaran terverifikasi</h1><p className="mt-2 text-greenroom-muted">Pesanan {code}</p>
      <p>{credentials?.product_name ?? variant?.product?.name}{parts && ` · ${variantLabel(parts)}`}</p></header>
    {statusError && <p role="alert" className="text-greenroom-danger">{statusError}</p>}
    {!status && <p role="status">Memuat pesanan…</p>}
    {status?.status === 'verified' && <>
      <div role="alert" className="rounded-greenroom-control border border-greenroom-border bg-greenroom-warn-bg p-4 text-greenroom-warn-ink"><strong>Akun hanya ditampilkan sekali.</strong> Catat atau salin akun di bawah, login, lalu ambil kode authenticator.</div>
      <div className="grid items-start gap-6 md:grid-cols-2">
        <section className={`${card} space-y-5`}><h2 className="text-xl font-extrabold">Akun kamu</h2>
          {!credentials && !revealError && <button type="button" disabled={revealing} className={primary} onClick={() => void reveal()}>{revealing ? 'Membuka akun…' : 'Tampilkan akun'}</button>}
          {revealError && <div role="alert" className="space-y-3"><p className="text-greenroom-danger">{errors[revealError] ?? 'Gagal membuka akun. Hubungi Admin.'}</p>
            {revealError === 'reveal_failed' ? <button type="button" className={primary} disabled={revealing} onClick={() => void reveal()}>Coba lagi</button> : support}</div>}
          {credentials && <>{([['Email', credentials.email, 'email'], ['Sandi', credentials.password, 'password']] as const).map(([name, value, fieldName]) => <div key={name}><h3 className="mb-2 text-sm font-bold text-greenroom-muted">{name}</h3>
            <div className="flex items-center gap-2 rounded-greenroom-control bg-greenroom-bg p-3"><span className="min-w-0 flex-1 break-all font-bold">{value}</span><button type="button" aria-live="polite" className={copied === fieldName ? copiedButton : secondary} onClick={() => void copy(fieldName, value)}>{copied === fieldName ? 'Tersalin ✓' : 'Salin'}</button></div>
            {copyError === fieldName && <p role="alert" className="mt-1 text-sm text-greenroom-danger">Gagal menyalin, salin manual</p>}</div>)}
            <p className="text-sm text-greenroom-muted">Simpan sekarang. Email dan sandi tidak dapat ditampilkan lagi.</p></>}
          <div><h3 className="font-bold">Ketentuan produk</h3><p className="mt-2 whitespace-pre-wrap text-sm text-greenroom-muted">{terms ?? 'Ketentuan belum tersedia.'}</p></div>
        </section>
        {hasTotp === true && <section className={`${card} space-y-4`}><h2 className="text-xl font-extrabold">Kode authenticator</h2>
          <p className="text-sm text-greenroom-muted">Login dulu sampai halaman kode authenticator muncul, baru tekan “Ambil Kode”. Yang ditampilkan adalah kode berikutnya, jadi kamu punya waktu penuh sekitar 30 detik. Kode hanya bisa diambil sekali; bila salah, hubungi admin.</p>
          {phase === 'idle' && <><label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={authenticatorOpen} onChange={(event) => setAuthenticatorOpen(event.target.checked)} />Halaman kode authenticator sudah terbuka</label>
            <button type="button" className={primary} disabled={!authenticatorOpen} onClick={() => void takeCode()}>Ambil Kode</button></>}
          {phase === 'starting' && <p role="status">Menyiapkan jendela kode…</p>}
          {phase === 'waiting' && <div role="status" className="rounded-greenroom-control bg-greenroom-ink p-5 text-white"><p className="font-bold">Menunggu kode berikutnya aktif</p><p>Aktif dalam {waitRemaining} detik</p></div>}
          {phase === 'shown' && totpCode && <div className="space-y-3"><div className="rounded-greenroom-control bg-greenroom-ink p-5 text-white"><p className="text-4xl font-extrabold tracking-widest tabular-nums">{totpCode.slice(0, 3)} {totpCode.slice(3)}</p><p>{codeRemaining} detik tersisa</p>
            <progress aria-label="Sisa waktu kode" className="mt-3 h-2 w-full accent-greenroom-primary" max={30} value={codeRemaining} /></div><button type="button" aria-live="polite" className={copied === 'totp' ? copiedButton : secondary} onClick={() => void copy('totp', totpCode)}>{copied === 'totp' ? 'Tersalin ✓' : 'Salin'}</button>{copyError === 'totp' && <p role="alert" className="text-sm text-greenroom-danger">Gagal menyalin, salin manual</p>}</div>}
          {phase === 'expired' && <div role="alert" className="space-y-3 rounded-greenroom-control bg-greenroom-warn-bg p-4 text-greenroom-warn-ink"><p>{errors.totp_expired}</p>{support}</div>}
          {totpError && phase !== 'expired' && <p role="alert" className="text-greenroom-danger">{errors[totpError] ?? 'Gagal mengambil kode. Coba lagi.'}</p>}
          {expires && <p className="text-sm text-greenroom-muted">Masa aktif sampai {new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'long', timeStyle: 'short' }).format(new Date(expires))} WIB</p>}
        </section>}
      </div>
      <footer className={`${card} flex flex-wrap items-center justify-between gap-4`}><label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={saved} onChange={(event) => setSaved(event.target.checked)} />Saya sudah menyimpan akun ini</label>
        <div className="flex flex-wrap gap-3">{support}<button type="button" className={primary} disabled={!saved} onClick={finish}>Selesai</button></div></footer>
    </>}
    <ShopRefundTerms />
  </div></main>
}
export default function ShopResult() {
  const { kode = '' } = useParams()
  return <QueryClientProvider client={shopContactQueryClient}><ResultPage key={kode} code={kode} /></QueryClientProvider>
}
