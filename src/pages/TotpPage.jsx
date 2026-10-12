import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import TotpToast from '../components/TotpToast'
import useTotpToast from '../hooks/useTotpToast'
import { clearTotpSession, getServerTime, getTotpCode, makeTotp, normalizeBase32, validateTotpToken } from '../utils/totpClient'
import '../styles/totp.css'

const PERIOD = 30000

function PublicCard({ showToast }) {
  const [input, setInput] = useState('')
  const [job, setJob] = useState(null)
  const [status, setStatus] = useState('idle')
  const [code, setCode] = useState('')
  const [left, setLeft] = useState(0)
  const [error, setError] = useState('')
  const [copying, setCopying] = useState(false)
  const runId = useRef(0)
  const knownOffset = useRef(0)
  const validUntilRef = useRef(0)
  const notifiedRunId = useRef(0)

  useEffect(() => () => { runId.current += 1 }, [])

  useEffect(() => {
    if (!job) return undefined
    let cancelled = false
    let timer
    let renderedStep = -1

    const tick = async () => {
      if (cancelled || runId.current !== job.id) return
      const now = Date.now() + job.offset
      const step = Math.floor(now / PERIOD)
      const validFrom = step * PERIOD
      const validUntil = validFrom + PERIOD
      validUntilRef.current = validUntil
      setLeft(Math.max(0, Math.ceil((validUntil - now) / 1000)))

      if (renderedStep !== step) {
        renderedStep = step
        setStatus('generating')
        try {
          const nextCode = await makeTotp(job.secret, validFrom)
          if (cancelled || runId.current !== job.id) return
          const refreshedNow = Date.now() + job.offset
          if (refreshedNow >= validUntil) {
            timer = window.setTimeout(tick, 0)
            return
          }
          setCode(nextCode)
          setStatus('active')
          setLeft(Math.max(0, Math.ceil((validUntil - refreshedNow) / 1000)))
          if (notifiedRunId.current !== job.id) {
            notifiedRunId.current = job.id
            showToast('Kode berhasil dibuat.')
          }
        } catch {
          if (!cancelled && runId.current === job.id) {
            setStatus('idle')
            setCode('')
            setLeft(0)
            setError('Secret Base32 tidak valid.')
            showToast('Secret Base32 tidak valid.', 'error')
          }
          return
        }
      }

      const refreshedNow = Date.now() + job.offset
      timer = window.setTimeout(tick, Math.min(1000, Math.max(50, validUntil - refreshedNow + 20)))
    }

    tick()
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [job, showToast])

  const submit = (event) => {
    event.preventDefault()
    const id = runId.current + 1
    runId.current = id
    setError('')
    setCode('')
    setLeft(0)

    let secret
    try {
      secret = normalizeBase32(input)
    } catch {
      setStatus('idle')
      setJob(null)
      setError('Secret Base32 tidak valid.')
      showToast('Secret Base32 tidak valid.', 'error')
      return
    }

    setStatus('generating')
    setJob({ id, secret, offset: knownOffset.current })

    getServerTime().then((result) => {
      if (runId.current !== id) return
      const offset = Number(result.serverNow) - Date.now()
      if (!Number.isFinite(offset)) return
      knownOffset.current = offset
      setJob((current) => current?.id === id ? { ...current, offset } : current)
    }).catch(() => {
      // Sinkronisasi tidak boleh menghambat kode awal; secret tidak ikut request.
    })
  }

  const reset = () => {
    runId.current += 1
    validUntilRef.current = 0
    setJob(null)
    setInput('')
    setStatus('idle')
    setCode('')
    setLeft(0)
    setError('')
    showToast('Form berhasil direset.')
  }

  const canCopy = status === 'active' && Boolean(code) && left > 0 && !copying
  const copy = async () => {
    if (!canCopy || Date.now() + (job?.offset || 0) >= validUntilRef.current) return
    setCopying(true)
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable')
      await navigator.clipboard.writeText(code)
      showToast('Kode berhasil disalin.')
    } catch {
      showToast('Gagal menyalin. Silakan salin secara manual.', 'error')
    } finally {
      setCopying(false)
    }
  }
  const message = status === 'idle'
    ? 'Masukkan secret key TOTP.'
    : status === 'generating'
      ? 'Membuat kode autentikasi...'
      : `Kode aktif ${left} detik`

  return (
    <section className="totp-card totp-stage-card">
      <div className="totp-card-heading">
        <span className="totp-card-mark" aria-hidden="true">P</span>
        <div><h2>TOTP Publik</h2><p>Secret hanya diproses di browser.</p></div>
      </div>
      <form className="totp-form" onSubmit={submit}>
        <label htmlFor="totp-public-secret">Secret key Base32</label>
        <input id="totp-public-secret" value={input} onChange={(event) => setInput(event.target.value)} placeholder="Secret Base32" autoComplete="off" required />
        <button className="totp-primary" type="submit" disabled={status === 'generating'}>{status === 'generating' ? 'Membuat Kode...' : 'Dapatkan Kode'}</button>
      </form>
      <div className="totp-result" aria-live="polite">
        <p className="totp-help">{message}</p>
        {code && <p className="totp-code">{code}</p>}
        {error && <p className="totp-error">{error}</p>}
      </div>
      <div className="totp-actions">
        <button type="button" disabled={!canCopy} onClick={copy}>{copying ? 'Menyalin...' : 'Salin'}</button>
        <button type="button" className="totp-secondary" onClick={reset}>Reset</button>
      </div>
    </section>
  )
}

function TotpChoice() {
  return (
    <div className="totp-choice-grid">
      <Link className="totp-choice-card" to="/akses-totp/publik">
        <span className="totp-choice-number">01</span>
        <span><strong>TOTP Publik</strong><small>Buat kode menggunakan secret key Anda.</small></span>
        <span className="totp-choice-arrow" aria-hidden="true">→</span>
      </Link>
      <Link className="totp-choice-card" to="/akses-totp/greenroomid">
        <span className="totp-choice-number">02</span>
        <span><strong>TOTP GreenroomID</strong><small>Gunakan token yang diberikan admin.</small></span>
        <span className="totp-choice-arrow" aria-hidden="true">→</span>
      </Link>
    </div>
  )
}

export default function TotpPage({ view = 'choice' }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { toast, showToast, closeToast } = useTotpToast()
  const [token, setToken] = useState('')
  const [loading, setLoading] = useState(false)
  const [copying, setCopying] = useState(false)
  const [error, setError] = useState('')
  const [data, setData] = useState(null)
  const [now, setNow] = useState(0)
  const [codeLoading, setCodeLoading] = useState(view === 'code')
  const [codeError, setCodeError] = useState('')

  useEffect(() => {
    if (view !== 'code' || !location.state?.totpVerified) return
    showToast('Token diterima. Menunggu kode aktif.')
    navigate(location.pathname, { replace: true, state: null })
  }, [location.pathname, location.state, navigate, showToast, view])

  useEffect(() => {
    if (view !== 'code') return undefined
    let live = true
    let requestTimer
    let clockTimer
    let requestVersion = 0
    let serverOffset = 0
    let activeUntil = 0
    let activeResult = null
    let finished = false
    let requestInFlight = false

    const finishExpired = (result) => {
      if (!live) return
      finished = true
      activeUntil = 0
      activeResult = null
      window.clearTimeout(requestTimer)
      window.clearInterval(clockTimer)
      setNow(Date.now() + serverOffset)
      setData({ ...result, status: 'expired', code: null })
      setCodeError('')
      setCodeLoading(false)
    }

    const load = async () => {
      if (finished || requestInFlight) return
      requestInFlight = true
      const version = requestVersion + 1
      requestVersion = version
      window.clearTimeout(requestTimer)
      try {
        const result = await getTotpCode()
        if (!live || version !== requestVersion) return
        const receivedAt = Date.now()
        serverOffset = Number(result.serverNow) - receivedAt
        setNow(Number(result.serverNow))
        setData(result)
        setCodeError('')
        setCodeLoading(false)

        if (result.status === 'expired') {
          finishExpired(result)
          return
        }

        if (result.status === 'waiting') {
          const delay = Math.max(100, Number(result.validFrom) - Number(result.serverNow) + 50)
          requestTimer = window.setTimeout(load, delay)
          return
        }

        if (result.status === 'active') {
          activeUntil = Number(result.validUntil)
          activeResult = result
          const delay = Math.max(0, activeUntil - Number(result.serverNow) + 20)
          requestTimer = window.setTimeout(() => finishExpired(result), delay)
          return
        }

        throw new Error('Invalid TOTP response')
      } catch {
        if (!live || version !== requestVersion) return
        finished = true
        activeUntil = 0
        activeResult = null
        window.clearTimeout(requestTimer)
        window.clearInterval(clockTimer)
        setData(null)
        setCodeLoading(false)
        setCodeError('Sesi tidak valid atau telah berakhir. Silakan masukkan token kembali.')
        showToast('Sesi tidak valid atau telah berakhir. Silakan masukkan token kembali.', 'error')
      } finally {
        requestInFlight = false
      }
    }

    clockTimer = window.setInterval(() => setNow(Date.now() + serverOffset), 1000)
    const handleVisibility = () => {
      if (document.visibilityState !== 'visible' || finished) return
      const currentNow = Date.now() + serverOffset
      setNow(currentNow)
      if (activeUntil && currentNow >= activeUntil) {
        finishExpired(activeResult || { validFrom: activeUntil - PERIOD, validUntil: activeUntil })
      } else if (!activeUntil) {
        load()
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    load()

    return () => {
      live = false
      requestVersion += 1
      window.clearTimeout(requestTimer)
      window.clearInterval(clockTimer)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [showToast, view])

  const submit = async (event) => {
    event.preventDefault()
    setLoading(true)
    setError('')
    try {
      await validateTotpToken(token.trim())
      navigate('/akses-totp/kode', { state: { totpVerified: true } })
    } catch (requestError) {
      const message = requestError.code === 'TOKEN_USED'
        ? 'Token sudah digunakan. Minta token baru kepada admin.'
        : 'Token salah atau kadaluarsa.'
      setError(message)
      showToast(message, 'error')
    } finally {
      setLoading(false)
    }
  }
  const reset = async () => {
    try { await clearTotpSession() } finally { navigate('/akses-totp/greenroomid', { replace: true }) }
  }
  const waitingLeft = data?.status === 'waiting' ? Math.max(0, Math.ceil((data.validFrom - now) / 1000)) : 0
  const activeLeft = data?.status === 'active' ? Math.max(0, Math.ceil((data.validUntil - now) / 1000)) : 0
  const codeIsActive = data?.status === 'active' && /^\d{6}$/.test(data.code || '') && activeLeft > 0
  const codeIsExpired = data?.status === 'expired' || (data?.status === 'active' && activeLeft <= 0)
  const copyGreenroomCode = async () => {
    if (!codeIsActive || copying || now >= Number(data.validUntil)) return
    setCopying(true)
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable')
      await navigator.clipboard.writeText(data.code)
      showToast('Kode berhasil disalin.')
    } catch {
      showToast('Gagal menyalin. Silakan salin secara manual.', 'error')
    } finally {
      setCopying(false)
    }
  }

  let content
  if (view === 'public') {
    content = <PublicCard showToast={showToast} />
  } else if (view === 'greenroomid') {
    content = (
      <section className="totp-card totp-stage-card">
        <div className="totp-card-heading">
          <span className="totp-card-mark" aria-hidden="true">G</span>
          <div><h2>TOTP GreenroomID</h2><p>Isi dengan token yang diberikan admin.</p></div>
        </div>
        <form className="totp-form" onSubmit={submit}>
          <label htmlFor="totp-greenroom-token">Token akses</label>
          <input id="totp-greenroom-token" value={token} onChange={(event) => setToken(event.target.value)} placeholder="Token admin" autoComplete="off" required />
          {error && <p className="totp-error">{error}</p>}
          <button className="totp-primary" disabled={loading}>{loading ? 'Memeriksa...' : 'Dapatkan Kode'}</button>
        </form>
      </section>
    )
  } else if (view === 'code') {
    content = (
      <section className="totp-card totp-code-view">
        {codeError ? <><p className="totp-error">{codeError}</p><button type="button" className="totp-primary" onClick={() => navigate('/akses-totp/greenroomid', { replace: true })}>Kembali ke Token</button></>
          : codeLoading ? <p className="totp-help">Memuat sesi autentikasi...</p>
            : codeIsActive ? <><p className="totp-status">KODE AUTENTIKASI</p><p className="totp-code">{data.code}</p><p className="totp-help">Kode aktif {activeLeft} detik.</p><div className="totp-actions"><button type="button" disabled={copying} onClick={copyGreenroomCode}>{copying ? 'Menyalin...' : 'Salin'}</button><button type="button" className="totp-secondary" onClick={reset}>Keluar</button></div></>
              : codeIsExpired ? <><p className="totp-status">SESI KODE SELESAI</p><p className="totp-help">Kode sudah kedaluwarsa</p><button type="button" className="totp-primary" onClick={reset}>Kembali ke form GreenroomID</button></>
                : <><div className="totp-loader" aria-hidden="true" /><p className="totp-help">Menunggu kode aktif</p>{data?.status === 'waiting' && <p className="totp-help">Kode tersedia dalam {waitingLeft} detik.</p>}<button type="button" className="totp-secondary" onClick={reset}>Batalkan</button></>}
      </section>
    )
  } else {
    content = <TotpChoice />
  }

  return (
    <main className="totp-page">
      <div className="totp-ambient" aria-hidden="true" />
      <div className="totp-wrap">
        {view !== 'choice' && <Link className="totp-back" to="/akses-totp">← Kembali ke pilihan TOTP</Link>}
        <header className="totp-header"><p className="totp-kicker">GREENROOMID SECURITY</p><h1>AKSES KODE AUTENTIKASI</h1><p>Pilih akses yang sesuai dan buat kode secara aman.</p></header>
        {content}
      </div>
      <TotpToast toast={toast} onClose={closeToast} />
    </main>
  )
}
