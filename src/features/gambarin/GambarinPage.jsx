import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  enqueueGambarinPrompt, gambarinAuthClient, gambarinCapabilities, loadGambarinAccount, loginGambarin,
  loadGambarinJobs, loadGambarinJobStatus, loadGambarinMockAsset, loadGambarinRealAsset, signOutGambarin
} from './lib/customerApi'
import './gambarin.css'

const STATUS_TEXT = {
  queued: 'Menunggu antrean',
  claimed: 'Menyiapkan proses',
  submitting: 'Mengirim permintaan',
  processing: 'Sedang dibuat',
  succeeded: 'Selesai',
  failed: 'Gagal',
  cancelled: 'Dibatalkan',
  submission_unknown: 'Sedang diperiksa'
}

function formatDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium', timeStyle: 'short'
  }).format(date)
}

function LoginPanel({ configured, onLoggedIn }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const submit = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await loginGambarin(username, password)
      setPassword('')
      await onLoggedIn()
    } catch (cause) {
      setError(cause.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="gb-panel gb-login" aria-labelledby="gb-login-title">
      <span className="gb-kicker">Akses pelanggan</span>
      <h2 id="gb-login-title">Masuk ke Gambarin</h2>
      <p>Gunakan username dan password yang diberikan admin.</p>
      <form onSubmit={submit}>
        <label htmlFor="gb-username">Username</label>
        <input id="gb-username" type="text" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} required disabled={!configured || busy} />
        <label htmlFor="gb-password">Password</label>
        <input id="gb-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required disabled={!configured || busy} />
        <button type="submit" disabled={!configured || !gambarinCapabilities.login || busy}>{busy ? 'Memeriksa...' : 'Masuk'}</button>
      </form>
      {error && <p className="gb-error" role="alert">{error}</p>}
      {!configured && <p className="gb-notice" role="status">Konfigurasi Gambarin belum tersedia. Login belum dapat digunakan.</p>}
    </section>
  )
}

function JobStatus({ job }) {
  if (!job) return <p className="gb-muted">Belum ada pekerjaan gambar.</p>
  return (
    <div className="gb-job-detail" aria-live="polite">
      <span className={`gb-status gb-status-${job.status}`}>{STATUS_TEXT[job.status] || job.status}</span>
      {job.queue_position != null && <p>Posisi antrean global: <strong>{job.queue_position}</strong></p>}
      {job.status === 'submission_unknown' && <p>Status pengiriman sedang diperiksa. Permintaan tidak dikirim ulang.</p>}
      {job.asset?.state === 'unresolved' && <p>Hasil sedang diperiksa. Kuota masih dicadangkan.</p>}
      {job.error?.message && <p>{job.error.message}</p>}
      {job.status === 'succeeded' && <p>Proses selesai. Hasil ditampilkan bila masih tersedia.</p>}
    </div>
  )
}

function Studio({ account, onInvalidSession }) {
  const [prompt, setPrompt] = useState('')
  const [jobs, setJobs] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [selectedJob, setSelectedJob] = useState(null)
  const [currentAccount, setCurrentAccount] = useState(account)
  const [checkedAt, setCheckedAt] = useState(0)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [resultAsset, setResultAsset] = useState(null)
  const attempt = useRef(null)

  const generate = async () => {
    const text = prompt.trim()
    if (!text || submitting || !active || remaining < 1) return
    const key = attempt.current?.prompt === text ? attempt.current.key : crypto.randomUUID()
    attempt.current = { prompt: text, key }
    setSubmitting(true)
    setError('')
    try {
      const result = await enqueueGambarinPrompt(text, key)
      attempt.current = null
      setSelectedId(result.job_id)
      setSelectedJob({ job_id: result.job_id, status: result.status, queue_position: result.queue_position })
      setPrompt('')
    } catch (cause) {
      setError(cause.message)
    } finally {
      setSubmitting(false)
    }
  }

  const refresh = useCallback(async () => {
    try {
      const [profile, recentJobs] = await Promise.all([loadGambarinAccount(), loadGambarinJobs()])
      if (profile.state !== 'authenticated' || profile.account.id !== account.id) {
        onInvalidSession()
        return
      }
      setCurrentAccount(profile.account)
      setCheckedAt(Date.now())
      setJobs(recentJobs)
      const jobId = selectedId || recentJobs[0]?.id
      if (jobId) {
        const detail = await loadGambarinJobStatus(jobId)
        setSelectedId(jobId)
        setSelectedJob(detail)
      } else {
        setSelectedJob(null)
      }
      setError('')
    } catch (cause) {
      setError(cause.message)
    }
  }, [account.id, onInvalidSession, selectedId])

  useEffect(() => {
    let active = true
    const run = () => { if (active) void refresh() }
    run()
    const timer = window.setInterval(run, 15000)
    return () => { active = false; window.clearInterval(timer) }
  }, [refresh])

  useEffect(() => {
    if (selectedJob?.status !== 'succeeded' || !selectedJob.job_id
      || resultAsset?.jobId === selectedJob.job_id) return undefined
    const controller = new AbortController()
    let objectUrl
    void loadGambarinRealAsset(selectedJob.job_id, controller.signal)
      .then(url => { if (!controller.signal.aborted) setResultAsset({ jobId: selectedJob.job_id, url, mock: false }) })
      .catch(async () => {
        try {
          objectUrl = await loadGambarinMockAsset(selectedJob.job_id, controller.signal)
          if (!controller.signal.aborted) setResultAsset({ jobId: selectedJob.job_id, url: objectUrl, mock: true })
          else URL.revokeObjectURL(objectUrl)
        } catch { /* Asset is still unavailable. */ }
      })
    return () => {
      controller.abort()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [selectedJob?.job_id, selectedJob?.status, resultAsset?.jobId, checkedAt])

  const remaining = Math.max(0, currentAccount.quota_granted - currentAccount.quota_used - currentAccount.quota_reserved)
  const active = currentAccount.status === 'active' && new Date(currentAccount.expires_at).getTime() > checkedAt

  return (
    <div className="gb-studio">
      <div className="gb-studio-heading">
        <div><span className="gb-kicker">Studio pelanggan</span><h2>Halo, {currentAccount.username}</h2></div>
        <button type="button" className="gb-text-button" onClick={() => void signOutGambarin()}>Keluar</button>
      </div>
      <div className="gb-facts">
        <div className="gb-panel"><span>Sisa gambar</span><strong>{remaining}</strong><small>{currentAccount.quota_reserved} dalam proses</small></div>
        <div className="gb-panel"><span>Masa aktif</span><strong>{active ? 'Aktif' : 'Tidak aktif'}</strong><small>{formatDate(currentAccount.expires_at)}</small></div>
        <div className="gb-panel"><span>Antrean Anda</span><strong>{selectedJob?.queue_position ?? '—'}</strong><small>{selectedJob?.queue_position != null ? 'Posisi global' : 'Tidak sedang antre'}</small></div>
      </div>
      <div className="gb-workspace">
        <section className="gb-panel gb-compose" aria-labelledby="gb-prompt-title">
          <h3 id="gb-prompt-title">Buat gambar</h3>
          <label htmlFor="gb-prompt">Ceritakan gambar yang Anda inginkan</label>
          <textarea id="gb-prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} maxLength={4000} placeholder="Tulis ide gambar di sini..." />
          <button type="button" onClick={() => void generate()} disabled={!gambarinCapabilities.generate || !active || remaining < 1 || !prompt.trim() || submitting}>{submitting ? 'Mengirim...' : 'Generate'}</button>
          {!active && <p className="gb-muted">Akun tidak aktif. Hubungi admin.</p>}
          {active && remaining < 1 && <p className="gb-muted">Kuota gambar habis.</p>}
        </section>
        <section className="gb-panel gb-result" aria-labelledby="gb-result-title">
          <h3 id="gb-result-title">Hasil gambar</h3>
          {selectedJob?.status === 'succeeded' && resultAsset?.jobId === selectedJob.job_id
            ? <figure className="gb-mock-result"><img src={resultAsset.url} alt={resultAsset.mock ? 'Hasil simulasi Gambarin AI' : 'Hasil Gambarin AI'} />{resultAsset.mock && <figcaption>Hasil simulasi untuk pengujian. Bukan gambar dari Jennabot.</figcaption>}</figure>
            : <div className="gb-result-empty"><img src="/landing/GambarinAI-icon.svg" alt="" /><p>{selectedJob?.status === 'succeeded' ? 'Hasil belum dapat diambil.' : 'Gambar akan tampil di sini setelah tersedia.'}</p></div>}
        </section>
      </div>
      <section className="gb-panel gb-history" aria-labelledby="gb-history-title">
        <div className="gb-history-heading"><h3 id="gb-history-title">Pekerjaan terbaru</h3><button type="button" className="gb-text-button" onClick={() => void refresh()}>Muat ulang</button></div>
        {error && <p className="gb-error" role="alert">{error}</p>}
        <JobStatus job={selectedJob} />
        {jobs.length > 0 && <div className="gb-job-list">{jobs.map((job) => <button type="button" key={job.id} className={selectedId === job.id ? 'selected' : ''} onClick={() => setSelectedId(job.id)}><span>{STATUS_TEXT[job.status] || job.status}</span><small>{formatDate(job.created_at)}</small></button>)}</div>}
      </section>
    </div>
  )
}

function GambarinPage() {
  const [access, setAccess] = useState({ state: 'loading' })
  const handleInvalidSession = useCallback(() => setAccess({ state: 'signed-out' }), [])

  useEffect(() => {
    let active = true
    const client = gambarinAuthClient()
    const load = async () => {
      try {
        const result = await loadGambarinAccount()
        if (active) setAccess(result)
      } catch {
        if (active) setAccess({ state: 'error' })
      }
    }
    void load()
    const { data: listener } = client?.auth.onAuthStateChange(() => { void load() }) || {}
    return () => { active = false; listener?.subscription?.unsubscribe() }
  }, [])

  return (
    <div className="gb-page">
      <header className="gb-header"><Link to="/" className="gb-brand"><img src="/landing/GambarinAI-icon.svg" alt="" /><span>GreenroomID <b>/ Gambarin AI</b></span></Link><Link to="/" className="gb-back">← Beranda</Link></header>
      <main className="gb-main">
        {access.state !== 'authenticated' && <div className="gb-intro"><span className="gb-kicker">Gambarin AI</span><h1>Ide Anda, jadi gambar.</h1><p>Tulis prompt dan pantau hasilnya dalam satu ruang yang sederhana.</p></div>}
        {access.state === 'authenticated' ? <Studio account={access.account} onInvalidSession={handleInvalidSession} /> : access.state === 'loading' ? <p role="status">Memeriksa sesi Gambarin...</p> : access.state === 'error' ? <p role="alert">Sesi belum dapat diperiksa. Coba muat ulang halaman.</p> : <LoginPanel configured={access.state !== 'unconfigured'} onLoggedIn={async () => setAccess(await loadGambarinAccount())} />}
      </main>
    </div>
  )
}

export default GambarinPage
