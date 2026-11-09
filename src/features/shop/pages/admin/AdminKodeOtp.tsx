import { useEffect, useState } from 'react'
import { supabase } from '../../../../supabase'
import ShopAdminShell from '../../components/ShopAdminShell'

type OtpAccount = { id: string; email: string; code: string }
type OtpPage = { accounts: OtpAccount[]; total: number; server_now_ms: number; window_end_ms: number }
const pageSize = 10
const button = 'min-h-11 rounded-greenroom-control border border-greenroom-input-border bg-white px-4 font-bold disabled:opacity-50'

export default function AdminKodeOtp() {
  const [page, setPage] = useState(0)
  const [data, setData] = useState<OtpPage | null>(null)
  const [offset, setOffset] = useState(0)
  const [now, setNow] = useState(Date.now())
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState('')
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(timer)
  }, [])
  useEffect(() => {
    let active = true
    let sequence = 0
    let timer: number | undefined
    async function load() {
      if (!active || document.hidden) return
      const currentRequest = ++sequence
      setBusy(true); setError(''); setCopied('')
      try {
        const requestStartedAt = Date.now()
        const { data: result, error: requestError } = await supabase.functions.invoke('shop-admin-otp-codes', {
          body: { page }
        })
        if (!active || document.hidden || currentRequest !== sequence) return
        if (requestError || !result || !Array.isArray(result.accounts)) throw requestError ?? new Error('invalid_response')
        const response = result as OtpPage
        // The request-start bound hides expired codes early even with network latency.
        setOffset(response.server_now_ms - requestStartedAt)
        setData(response)
        setBusy(false)
        timer = window.setTimeout(() => { void load() },
          Math.max(250, response.window_end_ms - response.server_now_ms + 150))
      } catch {
        if (!active || document.hidden || currentRequest !== sequence) return
        setData(null); setBusy(false); setError('Gagal memuat kode OTP. Coba lagi.')
        timer = window.setTimeout(() => { void load() }, 5000)
      }
    }
    function visibilityChanged() {
      sequence += 1
      if (timer) window.clearTimeout(timer)
      if (document.hidden) { setData(null); setBusy(false) }
      else void load()
    }
    document.addEventListener('visibilitychange', visibilityChanged)
    void load()
    return () => { active = false; sequence += 1; if (timer) window.clearTimeout(timer); document.removeEventListener('visibilitychange', visibilityChanged) }
  }, [page])
  const seconds = data ? Math.max(0, Math.ceil((data.window_end_ms - now - offset) / 1000)) : 0
  const current = seconds > 0 && !document.hidden
  async function copy(account: OtpAccount) {
    if (!data || Date.now() + offset >= data.window_end_ms || document.hidden) return
    try { await navigator.clipboard.writeText(account.code); setCopied(account.id) }
    catch { setError('Gagal menyalin kode. Coba lagi.') }
  }
  return <ShopAdminShell>
    <h1 className="mb-2 text-3xl font-extrabold">Kode OTP</h1>
    <p className="mb-5 text-greenroom-muted">Kode akun aktif diperbarui otomatis setiap 30 detik.</p>
    {error && <p role="alert" className="mb-4 text-greenroom-danger">{error}</p>}
    {busy && <p role="status" className="mb-4">Memuat kode OTP…</p>}
    {data && <>
      <p role="status" className="mb-4 text-greenroom-muted">{current ? `Kode berganti dalam ${seconds} detik` : 'Memuat kode terbaru…'}</p>
      <div className="grid gap-4 md:grid-cols-2">{data.accounts.map((account) => <section key={account.id}
        className="rounded-greenroom-card border border-greenroom-border bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h2 className="min-w-0 break-all font-bold">{account.email}</h2>
          <button type="button" className={button} disabled={!current} onClick={() => void copy(account)}
            aria-label={`Salin OTP ${account.email}`}>{copied === account.id ? 'Tersalin ✓' : 'Salin'}</button>
        </div>
        <p className="mt-4 text-4xl font-extrabold tracking-widest sm:text-5xl">
          {current ? account.code : '••••••'}
        </p>
      </section>)}</div>
      {data.accounts.length === 0 && <p className="rounded-greenroom-card border border-greenroom-border bg-white p-5">Belum ada akun aktif dengan 2FA.</p>}
      <div className="mt-5 flex items-center gap-3">
        <button type="button" className={button} disabled={page === 0} onClick={() => setPage(page - 1)}>Sebelumnya</button>
        <span>Halaman {page + 1} · Total {data.total}</span>
        <button type="button" className={button} disabled={(page + 1) * pageSize >= data.total} onClick={() => setPage(page + 1)}>Berikutnya</button>
      </div>
    </>}
  </ShopAdminShell>
}
