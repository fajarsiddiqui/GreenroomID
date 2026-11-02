import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { getShopSupabase } from '../lib/supabase'
import { buildWhatsAppLink, shopContactQueryClient, useShopContact } from '../lib/shopContact'

type Credentials = { email: string; password: string; has_totp: boolean; delivery_grant: string;
  product_name: string; terms: string | null }
type CodeInfo = { code: string; server_now_ms: number; window_end_ms: number }
type WindowInfo = { server_now_ms: number; window_start_ms: number; window_end_ms: number }
type Rating = 'keren' | 'bagus' | 'biasa aja' | 'cukup' | 'kurang'
const ratings: Rating[] = ['keren', 'bagus', 'biasa aja', 'cukup', 'kurang']
const input = 'mt-1 min-h-11 w-full rounded-greenroom-control border border-greenroom-input-border bg-white px-3'
const button = 'min-h-11 rounded-greenroom-control bg-greenroom-primary px-5 font-bold text-white disabled:opacity-50'
const card = 'mx-auto max-w-xl space-y-5 rounded-greenroom-card border border-greenroom-border bg-white p-6'
const tokenPattern = /^[0-9a-f]{64}$/i
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i

async function tokenHash(token: string) {
  const bytes = Uint8Array.from(token.match(/../g) ?? [], (part) => Number.parseInt(part, 16))
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('')
}
async function buyerCall(name: string, body: Record<string, unknown>) {
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY
  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST', cache: 'no-store', headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  const result = await response.json()
  if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'request_failed')
  return result
}

function ClockIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-6 w-6 shrink-0">
    <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />
  </svg>
}

function DeliveryPage() {
  const { id = '' } = useParams()
  const contact = useShopContact()
  const supportUrl = buildWhatsAppLink(contact, 'Halo admin, saya mengalami kendala saat mengambil akun.')
  const [token] = useState(() => window.location.hash.slice(1))
  const claimKey = `shop-delivery-claim:${id}`
  const [claim, setClaim] = useState(() => window.sessionStorage.getItem(`shop-delivery-claim:${id}`) ?? '')
  const [state, setState] = useState<'loading' | 'ready' | 'bound' | 'unavailable'>('loading')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [deviceType, setDeviceType] = useState<'Komputer/Desktop' | 'HP'>('Komputer/Desktop')
  const [deviceOs, setDeviceOs] = useState('Windows')
  const [city, setCity] = useState('')
  const [credentials, setCredentials] = useState<Credentials | null>(null)
  const [code, setCode] = useState('')
  const [codeEnd, setCodeEnd] = useState(0)
  const [waitStart, setWaitStart] = useState(0)
  const [serverOffset, setServerOffset] = useState(0)
  const [now, setNow] = useState(Date.now())
  const [readyForCode, setReadyForCode] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [step, setStep] = useState<'delivery' | 'rating' | 'done'>('delivery')
  const [feedbackGrant, setFeedbackGrant] = useState('')
  const [rating, setRating] = useState<Rating | null>(null)
  const [comment, setComment] = useState('')
  const [copiedCode, setCopiedCode] = useState(false)
  const [saved, setSaved] = useState(false)
  const inFlight = useRef(false)
  useEffect(() => {
    let active = true
    if (!uuidPattern.test(id) || !tokenPattern.test(token)) { setState('unavailable'); return }
    void tokenHash(token).then((hash) => getShopSupabase().rpc('shop_delivery_status', {
      p_order_id: id, p_token_hash: hash
    })).then(({ data, error: statusError }) => {
      if (!active) return
      setState(statusError ? 'unavailable' : data?.state === 'ready' ? 'ready' : data?.state === 'bound' && claim ? 'bound' : 'unavailable')
    }).catch(() => { if (active) setState('unavailable') })
    return () => { active = false }
  }, [id, token, claim])
  useEffect(() => {
    if (!codeEnd && !waitStart) return
    const timer = window.setInterval(() => setNow(Date.now()), 200)
    return () => window.clearInterval(timer)
  }, [codeEnd, waitStart])
  async function bind(event: FormEvent) {
    event.preventDefault()
    if (inFlight.current) return
    const device = `${deviceType} · ${deviceOs}`
    if (!name.trim() || name.trim().length > 100 ||
      (phone.trim() && !/^(08[0-9]{7,11}|62[0-9]{8,12})$/.test(phone.trim())) ||
      !city.trim() || city.trim().length > 100) {
      setError('Periksa nama, nomor WhatsApp, dan kota/kabupaten.'); return
    }
    inFlight.current = true; setBusy(true); setError('')
    try {
      const { data, error: bindError } = await getShopSupabase().rpc('shop_delivery_bind', {
        p_order_id: id, p_token_hash: await tokenHash(token), p_buyer_name: name.trim(),
        p_buyer_phone: phone.trim(), p_buyer_device: device.trim(), p_buyer_city: city.trim()
      })
      if (bindError) throw bindError
      if (data?.state === 'bound' && typeof data.claim === 'string') {
        window.sessionStorage.setItem(claimKey, data.claim)
        setClaim(data.claim); setState('bound')
      } else setState('unavailable')
    } catch { setError('Gagal menyimpan identitas. Coba lagi.') }
    finally { inFlight.current = false; setBusy(false) }
  }
  async function reveal() {
    if (inFlight.current) return
    inFlight.current = true; setBusy(true); setError('')
    try {
      const result = await buyerCall('shop-reveal-credentials', { order_id: id, token, delivery_claim: claim }) as Credentials
      setCredentials(result)
      setFeedbackGrant(result.delivery_grant)
      window.sessionStorage.removeItem(claimKey)
      window.history.replaceState(null, '', window.location.pathname)
    } catch (cause) {
      if (cause instanceof Error && ['already_viewed', 'unavailable', 'unauthorized'].includes(cause.message)) setState('unavailable')
      else setError('Gagal membuka akun. Coba lagi.')
    } finally { inFlight.current = false; setBusy(false) }
  }
  async function takeCode() {
    if (!credentials || inFlight.current) return
    inFlight.current = true; setBusy(true); setError('')
    try {
      const base = { order_id: id, token, delivery_grant: credentials.delivery_grant }
      const windowInfo = await buyerCall('shop-issue-totp', { ...base, action: 'start' }) as WindowInfo
      setServerOffset(windowInfo.server_now_ms - Date.now())
      setWaitStart(windowInfo.window_start_ms)
      setNow(Date.now())
      const result = await buyerCall('shop-issue-totp', { ...base, action: 'code' }) as CodeInfo
      if (result.server_now_ms >= result.window_end_ms) throw new Error('totp_expired')
      setCode(result.code); setCodeEnd(result.window_end_ms)
      setServerOffset(result.server_now_ms - Date.now())
      setWaitStart(0); setNow(Date.now())
    } catch (cause) {
      setError(cause instanceof Error && ['totp_expired', 'totp_already_issued'].includes(cause.message)
        ? 'Kode sudah kedaluwarsa dan tidak dapat diambil ulang. Hubungi admin.' : 'Gagal mengambil kode. Coba lagi.')
      setWaitStart(0)
    } finally { inFlight.current = false; setBusy(false) }
  }
  async function submitFeedback() {
    if (!rating || busy) return
    setBusy(true); setError('')
    try {
      const { data, error: feedbackError } = await getShopSupabase().rpc('shop_delivery_submit_feedback', {
        p_order_id: id, p_token_hash: await tokenHash(token), p_grant_hash: await tokenHash(feedbackGrant),
        p_rating: rating, p_comment: comment.trim()
      })
      if (feedbackError || (data !== 'saved' && data !== 'already_submitted')) throw feedbackError ?? new Error(String(data))
      setFeedbackGrant(''); setStep('done')
    } catch { setError('Gagal menyimpan penilaian. Coba lagi atau lewati.') }
    finally { setBusy(false) }
  }
  if (state === 'unavailable') return <main className="min-h-screen bg-greenroom-bg px-5 py-10 font-greenroom-sans"><section className={card}>
    <h1 className="text-2xl font-bold">Tautan tidak tersedia</h1><p>Tautan sudah digunakan, dibatalkan, kedaluwarsa, atau tidak valid. Hubungi admin bila perlu bantuan.</p>
  </section></main>
  if (step === 'rating') return <main className="min-h-screen bg-greenroom-bg px-5 py-10 font-greenroom-sans text-greenroom-ink"><section className={card}>
    <h1 className="text-2xl font-extrabold">Bagaimana pengalamanmu?</h1>
    <div role="group" aria-label="Penilaian" className="flex flex-wrap gap-2">{ratings.map((value) => <button key={value} type="button"
      aria-pressed={rating === value} className={`min-h-11 rounded-greenroom-control border px-4 font-bold ${rating === value ? 'border-greenroom-primary bg-greenroom-tint' : 'border-greenroom-input-border bg-white'}`}
      onClick={() => setRating(value)}>{value === 'biasa aja' ? 'Biasa aja' : value[0].toUpperCase() + value.slice(1)}</button>)}</div>
    {(rating === 'cukup' || rating === 'kurang') && <div className="rounded-greenroom-control border border-greenroom-border bg-greenroom-bg p-4"><label className="block font-bold">Kritik dan saran<textarea className={`${input} min-h-28 py-3`} maxLength={2000} value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Apa yang perlu kami perbaiki?" /></label></div>}
    {error && <p role="alert" className="text-greenroom-danger">{error}</p>}
    <div className="flex flex-wrap gap-3"><button type="button" className={button} disabled={!rating || busy} onClick={() => void submitFeedback()}>{busy ? 'Menyimpan…' : 'Kirim penilaian'}</button>
      <button type="button" className="min-h-11 rounded-greenroom-control border border-greenroom-input-border px-5" onClick={() => { setFeedbackGrant(''); setStep('done') }}>Lewati</button></div>
  </section></main>
  if (step === 'done') return <main className="min-h-screen bg-greenroom-bg px-5 py-10 font-greenroom-sans text-greenroom-ink"><section className={card}>
    <h1 className="text-2xl font-extrabold">Selesai</h1><p>Terima kasih. Akun dan kode tidak dapat dibuka ulang dari tautan ini.</p>
    <p>Ada kendala? {supportUrl ? <a className="font-bold text-greenroom-primary underline" href={supportUrl} target="_blank" rel="noreferrer">Hubungi admin di {contact}</a> : 'Nomor admin belum tersedia.'}</p>
  </section></main>
  return <main className="min-h-screen bg-greenroom-bg px-5 py-10 font-greenroom-sans text-greenroom-ink"><section className={card}>
    <h1 className="text-2xl font-extrabold">Ambil akun</h1>
    {state === 'loading' && <p>Memeriksa tautan…</p>}
    {state === 'ready' && <form onSubmit={(event) => void bind(event)} className="space-y-4">
      <p>Isi identitas sebelum mengambil akun. Identitas pertama yang disimpan tidak dapat diubah.</p>
      <label className="block font-bold">Nama panggilan<input className={input} value={name} maxLength={100} onChange={(event) => setName(event.target.value)} required /></label>
      <label className="block font-bold">Nomor WhatsApp (opsional)<input className={input} value={phone} inputMode="tel" onChange={(event) => setPhone(event.target.value)} /></label>
      <label className="block font-bold">Perangkat<select className={input} value={deviceType} onChange={(event) => {
        const next = event.target.value as 'Komputer/Desktop' | 'HP'
        setDeviceType(next); setDeviceOs(next === 'HP' ? 'Android' : 'Windows')
      }}><option>Komputer/Desktop</option><option>HP</option></select></label>
      <label className="block font-bold">Sistem perangkat<select className={input} value={deviceOs} onChange={(event) => setDeviceOs(event.target.value)}>
        {(deviceType === 'HP' ? ['Android', 'iOS'] : ['Windows', 'Mac', 'Linux']).map((option) => <option key={option}>{option}</option>)}
      </select></label>
      <label className="block font-bold">Kota/kabupaten<input className={input} value={city} maxLength={100} onChange={(event) => setCity(event.target.value)} required /></label>
      <button className={button} disabled={busy}>{busy ? 'Menyimpan…' : 'Lanjutkan'}</button>
    </form>}
    {state === 'bound' && !credentials && <div className="space-y-4">
      <p className="rounded-greenroom-control bg-greenroom-warn-bg p-4">Email dan sandi hanya tampil sekali. Setelah tombol ditekan, jangan tutup atau muat ulang halaman sebelum menyalin akun dan mengambil kode authenticator.</p>
      <button type="button" className={button} disabled={busy} onClick={() => void reveal()}>{busy ? 'Membuka…' : 'Tampilkan akun'}</button>
    </div>}
    {credentials && <div className="space-y-5">
      <div><h2 className="font-bold">Email</h2><p className="break-all rounded-greenroom-control bg-greenroom-bg p-3">{credentials.email}</p><button type="button" onClick={() => void navigator.clipboard.writeText(credentials.email)}>Salin email</button></div>
      <div><h2 className="font-bold">Sandi</h2><p className="break-all rounded-greenroom-control bg-greenroom-bg p-3">{credentials.password}</p><button type="button" onClick={() => void navigator.clipboard.writeText(credentials.password)}>Salin sandi</button></div>
      {credentials.has_totp && <div className="space-y-3"><h2 className="text-xl font-bold">Kode authenticator</h2>
        <p>Login sampai halaman kode authenticator muncul, lalu ambil kode. Kode hanya diberikan sekali.</p>
        {!code && <><label className="flex items-center gap-2"><input type="checkbox" checked={readyForCode} onChange={(event) => setReadyForCode(event.target.checked)} />Halaman kode authenticator sudah terbuka</label>
          <button type="button" className={button} disabled={!readyForCode || busy} onClick={() => void takeCode()}>{busy ? 'Menunggu kode…' : 'Ambil Kode'}</button></>}
        {waitStart > 0 && !code && <div role="status" className="flex items-center gap-3 rounded-greenroom-control bg-greenroom-ink p-4 text-white"><ClockIcon /><div><p className="font-bold">Kode aktif dalam {Math.max(0, Math.ceil((waitStart - now - serverOffset) / 1000))} detik</p><p className="text-sm">Setelah muncul, kode berlaku sekitar 30 detik.</p></div></div>}
        {code && now + serverOffset < codeEnd && <div className="space-y-3 rounded-greenroom-control bg-greenroom-ink p-4 text-white"><p className="text-3xl font-bold tracking-widest">{code.slice(0, 3)} {code.slice(3)}</p>
          <p className="flex items-center gap-2"><ClockIcon />Kode aktif, tersisa {Math.max(0, Math.ceil((codeEnd - now - serverOffset) / 1000))} detik</p>
          <button type="button" className="min-h-11 rounded-greenroom-control bg-white px-4 font-bold text-greenroom-ink" onClick={() => void navigator.clipboard.writeText(code).then(() => setCopiedCode(true)).catch(() => setError('Gagal menyalin kode. Salin manual.'))}>{copiedCode ? 'Tersalin' : 'Salin kode'}</button></div>}
        {code && now + serverOffset >= codeEnd && <p>Kode kedaluwarsa. Hubungi admin bila perlu bantuan.</p>}
      </div>}
      <label className="flex items-center gap-2"><input type="checkbox" checked={saved} onChange={(event) => setSaved(event.target.checked)} />Saya sudah menyimpan akun ini</label>
      <button type="button" className={button} disabled={!saved} onClick={() => { setCredentials(null); setCode(''); setStep('rating') }}>Selesai</button>
    </div>}
    {error && <p role="alert" className="text-greenroom-danger">{error}</p>}
  </section></main>
}

export default function ShopDelivery() {
  return <QueryClientProvider client={shopContactQueryClient}><DeliveryPage /></QueryClientProvider>
}
