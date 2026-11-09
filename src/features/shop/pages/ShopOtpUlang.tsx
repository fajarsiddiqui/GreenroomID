import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { getShopSupabase } from '../lib/supabase'

const tokenPattern = /^[0-9a-f]{64}$/i
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const button = 'min-h-11 rounded-greenroom-control bg-greenroom-primary px-5 font-bold text-white disabled:opacity-50'
const input = 'mt-1 min-h-11 w-full rounded-greenroom-control border border-greenroom-input-border bg-white px-3'
const card = 'mx-auto max-w-xl space-y-5 rounded-greenroom-card border border-greenroom-border bg-white p-6'

async function hashToken(raw: string) {
  const bytes = Uint8Array.from(raw.match(/../g)!, (part) => Number.parseInt(part, 16))
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function issue(body: Record<string, unknown>) {
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY
  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/shop-otp-reissue`, {
    method: 'POST', cache: 'no-store', headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  const result = await response.json()
  if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'request_failed')
  return result
}

export default function ShopOtpUlang() {
  const { id = '' } = useParams()
  const [token] = useState(() => window.location.hash.slice(1))
  const claimKey = `shop-otp-reissue-claim:${id}`
  const [claim, setClaim] = useState(() => window.sessionStorage.getItem(claimKey) ?? '')
  const [state, setState] = useState<'loading' | 'pending' | 'ready' | 'bound' | 'unavailable'>('loading')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [deviceType, setDeviceType] = useState<'' | 'Komputer/Desktop' | 'HP'>('')
  const [deviceOs, setDeviceOs] = useState('')
  const [city, setCity] = useState('')
  const [readyForCode, setReadyForCode] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [code, setCode] = useState('')
  const [codeCopied, setCodeCopied] = useState(false)
  const [end, setEnd] = useState(0)
  const [waitStart, setWaitStart] = useState(0)
  const [offset, setOffset] = useState(0)
  const [now, setNow] = useState(Date.now())
  const inFlight = useRef(false)
  useEffect(() => {
    let active = true
    if (!uuidPattern.test(id) || !tokenPattern.test(token)) { setState('unavailable'); return }
    void hashToken(token).then(async (hash) => {
      const { data, error: statusError } = await getShopSupabase().rpc('shop_otp_reissue_status', {
      p_id: id, p_token_hash: hash
      })
      if (!active) return
      if (statusError || data === 'unavailable' || (data === 'bound' && !claim)) {
        setState('unavailable'); return
      }
      if (data === 'paired_ready') {
        const { data: bound, error: bindError } = await getShopSupabase().rpc('shop_otp_reissue_bind_paired', {
          p_id: id, p_token_hash: hash
        })
        if (!active) return
        if (bindError || bound?.state !== 'bound' || typeof bound.claim !== 'string') {
          setState('unavailable'); return
        }
        window.sessionStorage.setItem(claimKey, bound.claim)
        setClaim(bound.claim); setState('bound'); return
      }
      setState(data as 'pending' | 'ready' | 'bound')
    }).catch(() => { if (active) setState('unavailable') })
    return () => { active = false }
  }, [id, token, claim])
  useEffect(() => {
    if (!end && !waitStart) return
    const timer = window.setInterval(() => setNow(Date.now()), 200)
    return () => window.clearInterval(timer)
  }, [end, waitStart])
  async function bind(event: FormEvent) {
    event.preventDefault()
    if (inFlight.current) return
    const device = `${deviceType} · ${deviceOs}`
    if (!name.trim() || name.trim().length > 100 ||
      (phone.trim() && !/^(08[0-9]{7,11}|62[0-9]{8,12})$/.test(phone.trim())) ||
      !deviceType || !deviceOs || !city.trim() || city.trim().length > 100) {
      setError('Periksa nama, perangkat, nomor WhatsApp, dan kota/kabupaten.'); return
    }
    inFlight.current = true; setBusy(true); setError('')
    try {
      const { data, error: bindError } = await getShopSupabase().rpc('shop_otp_reissue_bind', {
        p_id: id, p_token_hash: await hashToken(token), p_buyer_name: name.trim(),
        p_buyer_phone: phone.trim(), p_buyer_device: device, p_buyer_city: city.trim()
      })
      if (bindError) throw bindError
      if (data?.state === 'bound' && typeof data.claim === 'string') {
        window.sessionStorage.setItem(claimKey, data.claim)
        setClaim(data.claim); setState('bound')
      } else setState('unavailable')
    } catch { setError('Gagal menyimpan identitas. Coba lagi.') }
    finally { inFlight.current = false; setBusy(false) }
  }
  async function takeCode() {
    if (inFlight.current) return
    inFlight.current = true; setBusy(true); setError('')
    try {
      const base = { id, token, claim }
      const windowInfo = await issue({ ...base, action: 'start' }) as { server_now_ms: number; window_start_ms: number; window_end_ms: number }
      setOffset(windowInfo.server_now_ms - Date.now()); setWaitStart(windowInfo.window_start_ms)
      const result = await issue({ ...base, action: 'code' }) as { code: string; server_now_ms: number; window_end_ms: number }
      setCodeCopied(false); setCode(result.code); setEnd(result.window_end_ms); setOffset(result.server_now_ms - Date.now())
      setWaitStart(0); setNow(Date.now())
      window.sessionStorage.removeItem(claimKey)
      window.history.replaceState(null, '', window.location.pathname)
    } catch (cause) {
      setWaitStart(0)
      setError(cause instanceof Error && ['unavailable', 'expired'].includes(cause.message)
        ? 'Kode tidak tersedia lagi. Hubungi admin.' : 'Gagal mengambil kode. Coba lagi.')
    } finally { inFlight.current = false; setBusy(false) }
  }
  const remaining = Math.max(0, Math.ceil(((code ? end : waitStart) - (now + offset)) / 1000))
  return <main className="min-h-screen bg-greenroom-bg px-5 py-10 font-greenroom-sans text-greenroom-ink"><section className={card}>
    <h1 className="text-2xl font-extrabold">Ambil OTP ulang</h1>
    {state === 'loading' && <p>Memeriksa tautan…</p>}
    {state === 'pending' && <p role="status">Tautan OTP cadangan dapat digunakan setelah akun utama dibuka. Buka kembali halaman ini setelah itu.</p>}
    {state === 'unavailable' && <p role="alert">Tautan tidak tersedia. Hubungi admin bila perlu bantuan.</p>}
    {state === 'ready' && <form onSubmit={(event) => void bind(event)} className="space-y-4">
      <p>Isi identitas sebelum mengambil kode. Identitas pertama yang disimpan tidak dapat diubah.</p>
      <label className="block font-bold">Nama panggilan<input className={input} value={name} maxLength={100} onChange={(event) => setName(event.target.value)} required /></label>
      <label className="block font-bold">Nomor WhatsApp (opsional)<input className={input} value={phone} inputMode="tel" onChange={(event) => setPhone(event.target.value)} /></label>
      <div role="group" aria-label="Perangkat"><p className="font-bold">Perangkat</p><div className="mt-2 grid grid-cols-2 gap-2">{(['Komputer/Desktop', 'HP'] as const).map((option) => <button key={option} type="button" aria-pressed={deviceType === option}
        className={`min-h-16 rounded-greenroom-control border p-3 text-left font-bold ${deviceType === option ? 'border-greenroom-primary bg-greenroom-tint text-greenroom-primary' : 'border-greenroom-input-border bg-white'}`}
        onClick={() => { setDeviceType(option); setDeviceOs('') }}>{option}</button>)}</div></div>
      {deviceType && <div role="group" aria-label="Sistem perangkat"><p className="font-bold">Sistem perangkat</p><div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">{(deviceType === 'HP' ? ['Android', 'iOS'] : ['Windows', 'Mac', 'Linux']).map((option) => <button key={option} type="button" aria-pressed={deviceOs === option}
        className={`min-h-14 rounded-greenroom-control border p-3 text-left font-bold ${deviceOs === option ? 'border-greenroom-primary bg-greenroom-tint text-greenroom-primary' : 'border-greenroom-input-border bg-white'}`}
        onClick={() => setDeviceOs(option)}>{option}</button>)}</div></div>}
      <label className="block font-bold">Kota/kabupaten<input className={input} value={city} maxLength={100} onChange={(event) => setCity(event.target.value)} required /></label>
      <button className={button} disabled={busy}>{busy ? 'Menyimpan…' : 'Lanjutkan'}</button>
    </form>}
    {state === 'bound' && !code && <div className="space-y-4">
      <p>Kode hanya tampil sekali. Buka halaman authenticator sebelum mengambil kode dan jangan tutup halaman ini.</p>
      <label className="flex items-center gap-2"><input type="checkbox" checked={readyForCode} onChange={(event) => setReadyForCode(event.target.checked)} />Halaman authenticator sudah terbuka</label>
      <button type="button" className={button} disabled={!readyForCode || busy} onClick={() => void takeCode()}>{busy ? 'Menunggu kode…' : 'Ambil kode OTP'}</button>
      {waitStart > 0 && <p role="status">Menunggu kode berikutnya aktif: {remaining} detik</p>}
    </div>}
    {code && <div className="space-y-3"><p>Kode OTP kamu:</p><p className="text-4xl font-extrabold tracking-widest">{remaining > 0 ? code : '••••••'}</p>
      <p role="status">{remaining > 0 ? `Berlaku ${remaining} detik lagi` : 'Kode sudah kedaluwarsa. Hubungi admin.'}</p>
      {remaining > 0 && <button type="button" className={button} onClick={() => void navigator.clipboard.writeText(code).then(() => { setCodeCopied(true); setError('') }).catch(() => setError('Gagal menyalin kode.'))}>{codeCopied ? 'Tersalin ✓' : 'Salin kode'}</button>}
      {codeCopied && remaining > 0 && <p role="status" className="text-sm text-greenroom-primary">Kode berhasil disalin.</p>}</div>}
    {error && <p role="alert" className="text-greenroom-danger">{error}</p>}
  </section></main>
}
