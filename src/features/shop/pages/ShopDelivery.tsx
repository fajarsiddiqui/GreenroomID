import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { getShopSupabase } from '../lib/supabase'

type Credentials = { email: string; password: string; has_totp: boolean; delivery_grant: string;
  product_name: string; terms: string | null }
type CodeInfo = { code: string; server_now_ms: number; window_end_ms: number }
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

export default function ShopDelivery() {
  const { id = '' } = useParams()
  const [token] = useState(() => window.location.hash.slice(1))
  const claimKey = `shop-delivery-claim:${id}`
  const [claim, setClaim] = useState(() => window.sessionStorage.getItem(`shop-delivery-claim:${id}`) ?? '')
  const [state, setState] = useState<'loading' | 'ready' | 'bound' | 'unavailable'>('loading')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [device, setDevice] = useState('Komputer')
  const [city, setCity] = useState('')
  const [credentials, setCredentials] = useState<Credentials | null>(null)
  const [code, setCode] = useState('')
  const [codeEnd, setCodeEnd] = useState(0)
  const [now, setNow] = useState(Date.now())
  const [readyForCode, setReadyForCode] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [finished, setFinished] = useState(false)
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
    if (!codeEnd) return
    const timer = window.setInterval(() => setNow(Date.now()), 200)
    return () => window.clearInterval(timer)
  }, [codeEnd])
  async function bind(event: FormEvent) {
    event.preventDefault()
    if (inFlight.current) return
    if (!name.trim() || name.trim().length > 100 || !/^(08[0-9]{7,11}|62[0-9]{8,12})$/.test(phone.trim()) ||
      !device.trim() || device.trim().length > 200 || !city.trim() || city.trim().length > 100) {
      setError('Periksa nama, nomor WhatsApp, perangkat, dan kota/kabupaten.'); return
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
      await buyerCall('shop-issue-totp', { ...base, action: 'start' })
      const result = await buyerCall('shop-issue-totp', { ...base, action: 'code' }) as CodeInfo
      if (result.server_now_ms >= result.window_end_ms) throw new Error('totp_expired')
      setCode(result.code); setCodeEnd(result.window_end_ms)
      setNow(result.server_now_ms)
    } catch (cause) {
      setError(cause instanceof Error && ['totp_expired', 'totp_already_issued'].includes(cause.message)
        ? 'Kode sudah kedaluwarsa dan tidak dapat diambil ulang. Hubungi admin.' : 'Gagal mengambil kode. Coba lagi.')
    } finally { inFlight.current = false; setBusy(false) }
  }
  if (finished || state === 'unavailable') return <main className="min-h-screen bg-greenroom-bg px-5 py-10 font-greenroom-sans"><section className={card}>
    <h1 className="text-2xl font-bold">Tautan tidak tersedia</h1><p>Tautan sudah digunakan, dibatalkan, kedaluwarsa, atau tidak valid. Hubungi admin bila perlu bantuan.</p>
  </section></main>
  return <main className="min-h-screen bg-greenroom-bg px-5 py-10 font-greenroom-sans text-greenroom-ink"><section className={card}>
    <h1 className="text-2xl font-extrabold">Ambil akun</h1>
    {state === 'loading' && <p>Memeriksa tautan…</p>}
    {state === 'ready' && <form onSubmit={(event) => void bind(event)} className="space-y-4">
      <p>Isi identitas sebelum mengambil akun. Identitas pertama yang disimpan tidak dapat diubah.</p>
      <label className="block font-bold">Nama panggilan<input className={input} value={name} maxLength={100} onChange={(event) => setName(event.target.value)} required /></label>
      <label className="block font-bold">Nomor WhatsApp<input className={input} value={phone} inputMode="tel" onChange={(event) => setPhone(event.target.value)} required /></label>
      <label className="block font-bold">Perangkat<input className={input} value={device} maxLength={200} onChange={(event) => setDevice(event.target.value)} required /></label>
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
      <div><h2 className="font-bold">{credentials.product_name}</h2><p className="whitespace-pre-wrap text-sm text-greenroom-muted">{credentials.terms ?? 'Ketentuan belum tersedia.'}</p></div>
      {credentials.has_totp && <div className="space-y-3"><h2 className="text-xl font-bold">Kode authenticator</h2>
        <p>Login sampai halaman kode authenticator muncul, lalu ambil kode. Kode hanya diberikan sekali.</p>
        {!code && <><label className="flex items-center gap-2"><input type="checkbox" checked={readyForCode} onChange={(event) => setReadyForCode(event.target.checked)} />Halaman kode authenticator sudah terbuka</label>
          <button type="button" className={button} disabled={!readyForCode || busy} onClick={() => void takeCode()}>{busy ? 'Menunggu kode…' : 'Ambil Kode'}</button></>}
        {code && now < codeEnd && <p className="rounded-greenroom-control bg-greenroom-ink p-4 text-3xl font-bold text-white">{code.slice(0, 3)} {code.slice(3)} <span className="text-base">({Math.max(0, Math.ceil((codeEnd - now) / 1000))} detik)</span></p>}
        {code && now >= codeEnd && <p>Kode kedaluwarsa. Hubungi admin bila perlu bantuan.</p>}
      </div>}
      <label className="flex items-center gap-2"><input type="checkbox" checked={saved} onChange={(event) => setSaved(event.target.checked)} />Saya sudah menyimpan akun ini</label>
      <button type="button" className={button} disabled={!saved} onClick={() => { setCredentials(null); setCode(''); setFinished(true) }}>Selesai</button>
    </div>}
    {error && <p role="alert" className="text-greenroom-danger">{error}</p>}
  </section></main>
}
