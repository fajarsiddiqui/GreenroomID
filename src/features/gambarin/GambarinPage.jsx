import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import {
  enqueueGambarinPrompt, gambarinAuthClient, gambarinCapabilities, loadGambarinAccount, loginGambarin,
  loadGambarinJobs, loadGambarinJobStatus, loadGambarinMockAsset, loadGambarinRealAsset,
  loadGambarinThumbnail, loadGambarinImageNumber, downloadGambarinOriginal, signOutGambarin
} from './lib/customerApi'
import { clearGambarinThumbnailCache } from './lib/thumbnailCache'
import { gambarinDownloadFilename } from './lib/downloadNaming'
import { resolveGambarinOriginal } from './lib/originalAsset'
import './gambarin.css'

const STATUS_TEXT = {
  queued: 'Menunggu',
  claimed: 'Disiapkan',
  submitting: 'Dikirim',
  processing: 'Diproses',
  succeeded: 'Selesai',
  failed: 'Gagal',
  cancelled: 'Dibatalkan',
  submission_unknown: 'Diperiksa'
}

function formatDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium', timeStyle: 'short'
  }).format(date)
}

function readSubmittedPrompt(accountId) {
  if (typeof window === 'undefined') return null
  try {
    const saved = JSON.parse(window.sessionStorage.getItem(`gambarin_progress_${accountId}`))
    return typeof saved?.jobId === 'string' && typeof saved?.text === 'string' ? saved : null
  } catch { return null }
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
    <section className="gb-login-shell" aria-labelledby="gb-login-title">
      <div className="gb-login-story">
        <div className="gb-story-mark"><img src="/landing/GambarinAI-icon.svg" alt="" /><span>GreenroomID <b>Gambarin AI</b></span></div>
        <div className="gb-story-center">
          <div className="gb-art-grid" aria-hidden="true"><i /><i /><i /><i /></div>
          <span className="gb-kicker">Studio gambar AI</span>
          <h1>Tulis ide.<br />Lihat hasilnya.</h1>
          <p>Mulai dari sebuah prompt, lalu pantau proses dan hasil gambar Anda di satu tempat.</p>
        </div>
        <small>Ruang kreatif untuk pelanggan GreenroomID.</small>
      </div>
      <div className="gb-login-form-panel">
        <span className="gb-kicker">Akses pelanggan</span>
        <h2 id="gb-login-title">Masuk ke Studio</h2>
        <p>Gunakan username dan password dari admin.</p>
        <form onSubmit={submit}>
          <label htmlFor="gb-username">Username</label>
          <input id="gb-username" type="text" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} required disabled={!configured || busy} />
          <label htmlFor="gb-password">Password</label>
          <input id="gb-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required disabled={!configured || busy} />
          <button type="submit" className="gb-primary-button" disabled={!configured || !gambarinCapabilities.login || busy}>{busy ? 'Memeriksa...' : 'Masuk'}</button>
        </form>
        {error && <p className="gb-error" role="alert">{error}</p>}
        {!configured && <p className="gb-notice" role="status">Konfigurasi Gambarin belum tersedia. Login belum dapat digunakan.</p>}
      </div>
    </section>
  )
}

function DoorIcon() {
  return <svg viewBox="0 0 38 46" fill="none" aria-hidden="true"><path d="M7 42V5a2 2 0 0 1 2-2h22v39" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" /><path d="M13 6 28 3v39l-15-3V6Z" fill="currentColor" opacity=".82" /><circle cx="24" cy="24" r="1.7" fill="#F8F9F5" /><path d="M3 42h32" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" /></svg>
}

function PersonIcon({ current = false }) {
  return <svg className={current ? 'gb-person-current' : ''} viewBox="0 0 22 42" fill="currentColor" aria-hidden="true"><circle cx="11" cy="6" r="5" /><path d="M6 13h10c2.4 0 4 1.6 4 4v13h-3v10h-5V29h-2v11H5V30H2V17c0-2.4 1.6-4 4-4Z" /></svg>
}

function QueueVisual({ job }) {
  const position = Number.isSafeInteger(job?.queue_position) && job.queue_position > 0 ? job.queue_position : null
  const activeWithoutPosition = !position && ['queued', 'claimed', 'submitting', 'processing', 'submission_unknown'].includes(job?.status)
  const visiblePeople = position ? Math.min(position, 24) : activeWithoutPosition ? 1 : 0
  const hiddenAhead = position ? position - visiblePeople : 0
  return (
    <div className="gb-queue-visual" aria-label={position ? `Posisi Anda nomor ${position} dalam antrean global` : activeWithoutPosition ? 'Pekerjaan Anda aktif, tetapi posisi antrean belum tersedia' : 'Tidak ada posisi antrean yang tersedia'}>
      <div className="gb-queue-door"><DoorIcon /><span>Antrean<br />gambar</span></div>
      <div className="gb-queue-line" aria-hidden="true">
        {visiblePeople ? <>{hiddenAhead > 0 && <span className="gb-queue-hidden">+{hiddenAhead}</span>}{Array.from({ length: visiblePeople }, (_, index) => <PersonIcon key={index} current={index === visiblePeople - 1} />)}</> : <span className="gb-queue-idle">{job && !['succeeded', 'failed', 'cancelled'].includes(job.status) ? 'Posisi belum tersedia' : 'Belum ada antrean aktif'}</span>}
      </div>
      <div className="gb-queue-estimate"><strong>{position ? `${position}/?` : '—/?'}</strong><span>Estimasi</span><small>Belum tersedia</small></div>
    </div>
  )
}

function CardIcon({ name }) {
  const common = { viewBox: '0 0 20 20', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }
  if (name === 'open') return <svg {...common}><path d="M11 4h5v5M16 4 8.5 11.5" /><path d="M16 11v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h4" /></svg>
  if (name === 'refresh') return <svg {...common}><path d="M16 9a6 6 0 1 0 .2 2M16 5v4h-4" /></svg>
  return <svg {...common}><rect x="3" y="4" width="14" height="12" rx="2" /><circle cx="7" cy="8" r="1" /><path d="m4 14 4-4 3 3 2-2 3 3" /></svg>
}

export function ResultCard({ job, accountId, onOpenOriginal,
  loadThumbnail = loadGambarinThumbnail }) {
  const frame = useRef(null)
  const [visible, setVisible] = useState(false)
  const [thumbnail, setThumbnail] = useState(null)
  const [imageError, setImageError] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const retryAttempts = useRef(0)
  const modelName = typeof job.model === 'string' ? job.model.trim() : ''
  const openOriginal = () => onOpenOriginal(job.id, job.provider_asset_id?.startsWith('mock-asset-') === true)

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') { setVisible(true); return undefined }
    const observer = new IntersectionObserver(entries => {
      setVisible(entries[0]?.isIntersecting ?? false)
    }, { rootMargin: '200px' })
    if (frame.current) observer.observe(frame.current)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!visible || job.status !== 'succeeded' || job.thumbnail_status !== 'ready') return undefined
    let mounted = true
    let retryTimer
    void loadThumbnail(accountId, job.id)
      .then(url => {
        if (!mounted) return
        retryAttempts.current = 0
        setThumbnail(url)
        setImageError(false)
      })
      .catch(() => {
        if (!mounted) return
        setImageError(true)
        const delay = Math.min(60000, 5000 * 2 ** Math.min(retryAttempts.current++, 4))
        retryTimer = window.setTimeout(() => setRefreshKey(value => value + 1), delay)
      })
    return () => { mounted = false; window.clearTimeout(retryTimer) }
  }, [accountId, job.id, job.status, job.thumbnail_status, loadThumbnail, refreshKey, visible])

  const retryAsset = () => {
    setThumbnail(null)
    setImageError(false)
    retryAttempts.current = 0
    setRefreshKey((value) => value + 1)
  }

  return (
    <article className="gb-image-card">
      <button ref={frame} type="button" className="gb-image-frame gb-image-open" onClick={openOriginal}
        disabled={job.status !== 'succeeded'} aria-label="Buka gambar asli">
        <span className="gb-image-kind"><CardIcon name="image" /></span>
        {thumbnail && !imageError
          ? <img src={thumbnail} alt="Thumbnail hasil Gambarin AI" loading="lazy" onError={() => setImageError(true)} />
          : <div className="gb-image-placeholder"><span>{job.status !== 'succeeded'
            ? STATUS_TEXT[job.status] || 'Menunggu hasil'
            : job.thumbnail_status === 'pending' || job.thumbnail_status === 'processing'
              ? 'Pratinjau sedang disiapkan'
              : job.thumbnail_status === 'ready' && imageError
                ? 'Pratinjau sedang dimuat' : 'Pratinjau tidak tersedia'}</span></div>}
      </button>
      <div className="gb-image-meta"><div className="gb-image-caption">{modelName && <span className="gb-model-label" title={modelName}>{modelName}</span>}<div className="gb-card-actions">{job.status === 'succeeded' && <button type="button" onClick={openOriginal} aria-label="Buka gambar ukuran penuh" title="Buka gambar"><CardIcon name="open" /></button>}{job.status === 'succeeded' && <button type="button" onClick={retryAsset} aria-label="Muat ulang thumbnail" title="Muat ulang thumbnail"><CardIcon name="refresh" /></button>}</div></div><div className="gb-image-footnote"><span className={`gb-status gb-status-${job.status}`}>{STATUS_TEXT[job.status] || job.status}</span><time>{formatDate(job.created_at)}</time></div></div>
    </article>
  )
}

function GalleryLightbox({ item, onClose, onImageError, onDownload }) {
  const closeButton = useRef(null)
  useEffect(() => {
    closeButton.current?.focus()
    const onKeyDown = (event) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])
  if (typeof document === 'undefined') return null
  return createPortal(
    <div className="gb-lightbox" role="dialog" aria-modal="true" aria-label="Gambar asli"
      onClick={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <div className="gb-lightbox-content">
        <button ref={closeButton} type="button" onClick={onClose} aria-label="Tutup gambar">Tutup ×</button>
        <div className="gb-lightbox-media">
          {item.phase === 'loading' && <p role="status">Memuat gambar asli...</p>}
          {item.phase === 'error' && <p role="alert">{item.error}</p>}
          {item.phase === 'ready' && <img src={item.url}
            alt={item.mock ? 'Hasil simulasi Gambarin AI' : 'Hasil Gambarin AI resolusi asli'}
            onError={onImageError} />}
        </div>
        <div className="gb-lightbox-footer">{item.phase === 'ready' && <>
          {item.downloadError && <span role="alert">{item.downloadError}</span>}
          <button type="button" onClick={onDownload} disabled={item.downloading}>
            {item.downloading ? 'Mengunduh...' : 'Unduh gambar'}
          </button>
        </>}</div>
      </div>
    </div>, document.body,
  )
}

function ProgressCard({ status, prompt }) {
  return <article className="gb-image-card gb-progress-card" aria-live="polite">
    <div className="gb-progress-center"><svg className="gb-progress-cat" viewBox="0 0 64 64" fill="none" aria-hidden="true"><path d="M20 26 18 13l10 6c3-1 7-1 10 0l9-6-1 14c4 5 6 11 5 17-2 10-10 16-20 16-11 0-20-7-20-18 0-7 3-12 9-16Z" fill="currentColor" /><path d="M45 48c8-1 11-7 8-14" stroke="currentColor" strokeWidth="5" strokeLinecap="round" /><circle cx="26" cy="34" r="2" fill="#F8F9F5" /><circle cx="39" cy="34" r="2" fill="#F8F9F5" /><path d="m30 40 3 2 3-2" stroke="#F8F9F5" strokeWidth="2" strokeLinecap="round" /></svg><strong>Membuat image...</strong><span>{STATUS_TEXT[status] || 'Dikirim'}</span></div>
    <div className="gb-progress-caption"><span>Prompt Anda</span><p title={prompt || undefined}>{prompt || 'Prompt tidak tersedia setelah halaman dimuat ulang.'}</p></div>
  </article>
}

function Studio({ account, onInvalidSession, loadAccount = loadGambarinAccount,
  loadJobs = loadGambarinJobs, loadJobStatus = loadGambarinJobStatus }) {
  const [view, setView] = useState('studio')
  const [prompt, setPrompt] = useState('')
  const [jobs, setJobs] = useState([])
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [selectedJob, setSelectedJob] = useState(null)
  const [currentAccount, setCurrentAccount] = useState(account)
  const [checkedAt, setCheckedAt] = useState(0)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submittedPrompt, setSubmittedPrompt] = useState(() => readSubmittedPrompt(account.id))
  const attempt = useRef(null)
  const selectedId = useRef(null)
  const loadedMore = useRef(false)
  const refreshInFlight = useRef(false)
  const originalCache = useRef(new Map())
  const originalRequest = useRef(0)
  const downloadRequest = useRef(0)
  const lightboxCurrent = useRef(null)
  const [lightbox, setLightbox] = useState(null)

  useEffect(() => {
    const cached = originalCache.current
    const request = originalRequest
    return () => {
      request.current++
      for (const item of cached.values()) if (item.mock) URL.revokeObjectURL(item.url)
      cached.clear()
    }
  }, [])

  const closeLightbox = useCallback(() => {
    originalRequest.current++
    downloadRequest.current++
    lightboxCurrent.current = null
    setLightbox(null)
  }, [])

  const imageFailed = useCallback(() => {
    const current = lightboxCurrent.current
    if (!current) return
    if (current.mock) URL.revokeObjectURL(current.url)
    originalCache.current.delete(current.jobId)
    const next = { jobId: current.jobId, phase: 'error',
      error: 'Gambar asli tidak tersedia lagi. Thumbnail tetap dapat dilihat jika tersedia.' }
    lightboxCurrent.current = next
    setLightbox(next)
  }, [])

  const openOriginal = useCallback(async (jobId, mock = false) => {
    if (lightboxCurrent.current?.jobId === jobId) return
    const request = ++originalRequest.current
    downloadRequest.current++
    const cached = originalCache.current.get(jobId)
    if (cached && (cached.mock || Date.now() - cached.loadedAt < 120000)) {
      const next = { jobId, phase: 'ready', ...cached }
      lightboxCurrent.current = next
      setLightbox(next)
      return
    }
    const loading = { jobId, phase: 'loading' }
    lightboxCurrent.current = loading
    setLightbox(loading)
    let asset
    try { asset = await resolveGambarinOriginal(jobId, mock,
      loadGambarinRealAsset, loadGambarinMockAsset) }
    catch { /* The modal keeps an explicit unavailable state. */ }
    if (request !== originalRequest.current) {
      if (asset?.mock) URL.revokeObjectURL(asset.url)
      return
    }
    if (asset) {
      const entry = { ...asset, loadedAt: Date.now() }
      originalCache.current.set(jobId, entry)
      const next = { jobId, phase: 'ready', ...entry }
      lightboxCurrent.current = next
      setLightbox(next)
    } else {
      const next = { jobId, phase: 'error',
        error: 'Gambar asli tidak tersedia lagi. Thumbnail tetap dapat dilihat jika tersedia.' }
      lightboxCurrent.current = next
      setLightbox(next)
    }
  }, [])

  const downloadOriginal = useCallback(async () => {
    const current = lightboxCurrent.current
    if (!current || current.phase !== 'ready' || current.downloading) return
    const jobId = current.jobId
    const request = ++downloadRequest.current
    const busy = { ...current, downloading: true, downloadError: null }
    lightboxCurrent.current = busy
    setLightbox(busy)
    try {
      const [number, blob] = await Promise.all([
        loadGambarinImageNumber(jobId),
        current.mock ? fetch(current.url).then(response => response.blob())
          : downloadGambarinOriginal(jobId, current.url),
      ])
      const filename = gambarinDownloadFilename(currentAccount.username, number, blob.type)
      const objectUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = objectUrl
      link.download = filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60000)
      if (request === downloadRequest.current && lightboxCurrent.current?.jobId === jobId) {
        const done = { ...lightboxCurrent.current, downloading: false, downloadError: null }
        lightboxCurrent.current = done
        setLightbox(done)
      }
    } catch (cause) {
      if (request === downloadRequest.current && lightboxCurrent.current?.jobId === jobId) {
        const failed = { ...lightboxCurrent.current, downloading: false,
          downloadError: cause.message || 'Gambar tidak dapat diunduh.' }
        lightboxCurrent.current = failed
        setLightbox(failed)
      }
    }
  }, [currentAccount.username])

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
      const nextPrompt = { jobId: result.job_id, text }
      setSubmittedPrompt(nextPrompt)
      try { window.sessionStorage.setItem(`gambarin_progress_${account.id}`, JSON.stringify(nextPrompt)) } catch { /* Keep the in-memory prompt. */ }
      selectedId.current = result.job_id
      setSelectedJob({ job_id: result.job_id, status: result.status, queue_position: result.queue_position })
      setPrompt('')
    } catch (cause) {
      setError(cause.message)
    } finally {
      setSubmitting(false)
    }
  }

  const refresh = useCallback(async () => {
    if (refreshInFlight.current) return
    refreshInFlight.current = true
    try {
      const [profile, page] = await Promise.all([loadAccount(), loadJobs()])
      if (profile.state !== 'authenticated' || profile.account.id !== account.id) {
        onInvalidSession()
        return
      }
      setCurrentAccount(profile.account)
      setCheckedAt(Date.now())
      setJobs(previous => {
        if (previous.length <= 12) return page.items
        const merged = new Map([...previous, ...page.items].map(job => [job.id, job]))
        return [...merged.values()].sort((a, b) => b.created_at.localeCompare(a.created_at)
          || b.id.localeCompare(a.id))
      })
      setHasMore(previous => loadedMore.current ? previous : page.hasMore)
      const jobId = selectedId.current || page.items[0]?.id
      if (jobId) {
        selectedId.current = jobId
        const detail = await loadJobStatus(jobId)
        if (selectedId.current === jobId) setSelectedJob(detail)
      } else {
        setSelectedJob(null)
      }
      setError('')
    } catch (cause) {
      setError(cause.message)
    } finally {
      refreshInFlight.current = false
    }
  }, [account.id, onInvalidSession, loadAccount, loadJobs, loadJobStatus])

  const loadMore = async () => {
    if (loadingMore || !hasMore || !jobs.length) return
    setLoadingMore(true)
    const previouslyLoadedMore = loadedMore.current
    loadedMore.current = true
    try {
      const last = jobs.at(-1)
      const page = await loadJobs({ created_at: last.created_at, id: last.id })
      setJobs(previous => {
        const known = new Set(previous.map(job => job.id))
        return [...previous, ...page.items.filter(job => !known.has(job.id))]
      })
      setHasMore(page.hasMore)
    } catch (cause) { loadedMore.current = previouslyLoadedMore; setError(cause.message) }
    finally { setLoadingMore(false) }
  }

  useEffect(() => {
    let active = true
    const run = () => { if (active) void refresh() }
    run()
    const timer = window.setInterval(run, 15000)
    return () => { active = false; window.clearInterval(timer) }
  }, [refresh])

  const remaining = Math.max(0, currentAccount.quota_granted - currentAccount.quota_used - currentAccount.quota_reserved)
  const active = currentAccount.status === 'active' && checkedAt > 0 && new Date(currentAccount.expires_at).getTime() > checkedAt
  const inProgress = (status) => ['queued', 'claimed', 'submitting', 'processing', 'submission_unknown'].includes(status)
  const progressJob = submitting ? { id: 'local-submit', status: 'submitting' }
    : inProgress(selectedJob?.status) ? { id: selectedJob.job_id, status: selectedJob.status }
      : jobs.find((job) => inProgress(job.status))
  const progressPrompt = submitting ? prompt.trim()
    : progressJob && submittedPrompt && submittedPrompt.jobId === progressJob.id ? submittedPrompt.text : null
  const latestResults = jobs.filter((job) => job.status === 'succeeded').slice(0, progressJob ? 3 : 4)

  const signOut = async () => {
    try { window.sessionStorage.removeItem(`gambarin_progress_${account.id}`) } catch { /* Session storage may be unavailable. */ }
    await signOutGambarin()
  }

  return (
    <div className="gb-studio">
      <div className="gb-studio-heading">
        <div><h1>Halo, {currentAccount.username}</h1></div>
        <button type="button" className="gb-exit-button" onClick={() => void signOut()}>Keluar</button>
      </div>
      <nav className="gb-view-tabs" aria-label="Area Gambarin">
        <button type="button" className={view === 'studio' ? 'active' : ''} aria-current={view === 'studio' ? 'page' : undefined} onClick={() => setView('studio')}>Studio</button>
        <button type="button" className={view === 'gallery' ? 'active' : ''} aria-current={view === 'gallery' ? 'page' : undefined} onClick={() => setView('gallery')}>Galeri</button>
      </nav>
      <div className="gb-facts">
        <div className="gb-panel gb-fact"><span>Sisa gambar</span><strong>{remaining} <em>gambar</em></strong><small>{currentAccount.quota_reserved} sedang dicadangkan</small></div>
        <div className="gb-panel gb-fact"><span>Masa aktif</span><strong className={active ? 'gb-positive' : 'gb-negative'}>{active ? 'Aktif' : 'Tidak aktif'}</strong><small>{formatDate(currentAccount.expires_at)}</small></div>
        <section className="gb-panel gb-queue-overview" aria-label="Visual antrean"><div className="gb-queue-overview-heading"><span>Antrean</span>{selectedJob && <span className={`gb-status gb-status-${selectedJob.status}`}>{STATUS_TEXT[selectedJob.status] || selectedJob.status}</span>}</div><QueueVisual job={selectedJob} />{selectedJob?.status === 'submission_unknown' && <p className="gb-queue-message">Pengiriman sedang diperiksa; permintaan tidak dikirim ulang.</p>}{selectedJob?.asset?.state === 'unresolved' && <p className="gb-queue-message">Hasil sedang diperiksa. Kuota masih dicadangkan.</p>}{selectedJob?.error?.message && <p className="gb-queue-message">{selectedJob.error.message}</p>}</section>
      </div>
      {error && <p className="gb-error gb-page-error" role="alert">{error}</p>}

      {view === 'studio' ? <>
        <section className="gb-panel gb-results" aria-labelledby="gb-results-title"><div className="gb-section-heading"><h2 id="gb-results-title">Hasil terbaru</h2><button type="button" className="gb-gallery-link-card" onClick={() => setView('gallery')}>Lihat galeri <span aria-hidden="true">→</span></button></div>
          {progressJob || latestResults.length ? <div className="gb-image-grid">{progressJob && <ProgressCard status={progressJob.status} prompt={progressPrompt} />}{latestResults.map((job) => <ResultCard key={job.id} job={job} accountId={account.id} onOpenOriginal={openOriginal} />)}</div> : <div className="gb-empty-card">Belum ada hasil gambar. Hasil yang selesai akan muncul di sini.</div>}
        </section>
        <section className="gb-panel gb-prompt-zone" aria-labelledby="gb-prompt-title"><h2 id="gb-prompt-title" className="gb-visually-hidden">Tulis prompt gambar</h2>
          <div className="gb-prompt-box"><label className="gb-visually-hidden" htmlFor="gb-prompt">Deskripsi gambar</label><textarea id="gb-prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} maxLength={4000} placeholder="Ketik prompt di sini..." /><div className="gb-prompt-actions"><span>{prompt.length}/4000</span><button type="button" className="gb-primary-button" onClick={() => void generate()} disabled={!gambarinCapabilities.generate || !active || remaining < 1 || !prompt.trim() || submitting} aria-label={submitting ? 'Mengirim gambar' : 'Buat gambar'}>{submitting ? 'Mengirim...' : <>Buat gambar <span aria-hidden="true">↑</span></>}</button></div></div>
          {!active && <p className="gb-muted">Akun tidak aktif. Hubungi admin.</p>}{active && remaining < 1 && <p className="gb-muted">Kuota gambar habis.</p>}
        </section>
      </> : <section className="gb-panel gb-gallery" aria-labelledby="gb-gallery-title"><div className="gb-section-heading"><div><span className="gb-kicker">Karya Anda</span><h2 id="gb-gallery-title">Galeri</h2></div><button type="button" className="gb-text-button" onClick={() => void refresh()}>Muat ulang</button></div>
        {jobs.length ? <div className="gb-image-grid">{jobs.map((job) => <ResultCard key={job.id} job={job} accountId={account.id} onOpenOriginal={openOriginal} />)}</div> : <div className="gb-empty-card">Belum ada pekerjaan gambar.</div>}
        {hasMore && <button type="button" className="gb-gallery-more" disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? 'Memuat...' : 'Muat lainnya'}</button>}
      </section>}
      {lightbox && <GalleryLightbox item={lightbox} onClose={closeLightbox}
        onImageError={imageFailed} onDownload={() => void downloadOriginal()} />}
    </div>
  )
}

function GambarinPage() {
  const [access, setAccess] = useState({ state: 'loading' })
  const handleInvalidSession = useCallback(() => {
    void clearGambarinThumbnailCache()
    setAccess({ state: 'signed-out' })
  }, [])

  useEffect(() => {
    let active = true
    const client = gambarinAuthClient()
    const load = async () => {
      try {
        const result = await loadGambarinAccount()
        if (active) {
          if (result.state === 'signed-out') void clearGambarinThumbnailCache()
          setAccess(result)
        }
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
        {access.state === 'authenticated' ? <Studio key={access.account.id} account={access.account} onInvalidSession={handleInvalidSession} /> : access.state === 'loading' ? <p className="gb-page-state" role="status">Memeriksa sesi Gambarin...</p> : access.state === 'error' ? <p className="gb-page-state" role="alert">Sesi belum dapat diperiksa. Coba muat ulang halaman.</p> : <LoginPanel configured={access.state !== 'unconfigured'} onLoggedIn={async () => setAccess(await loadGambarinAccount())} />}
      </main>
    </div>
  )
}

export default GambarinPage
export { Studio, GalleryLightbox }
