import { useEffect, useState } from 'react'
import { supabase } from '../../../../supabase'
import ShopAdminShell from '../../components/ShopAdminShell'

type Account = { id: string; email: string }
type Link = { id: string; account_email: string | null; created_at: string; expires_at: string | null;
  bound_at: string | null; taken_at: string | null; cancelled_at: string | null; total_count: number }
const pageSize = 10
const button = 'min-h-11 rounded-greenroom-control border border-greenroom-input-border bg-white px-4 font-bold disabled:opacity-50'
const primary = 'min-h-11 rounded-greenroom-control bg-greenroom-primary px-4 font-bold text-white disabled:opacity-50'
const date = (value: string) => new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta',
  day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) + ' WIB'

export default function AdminOtpUlang() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [links, setLinks] = useState<Link[]>([])
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const [selected, setSelected] = useState('')
  const [newLink, setNewLink] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  async function load() {
    const [accountResult, linkResult] = await Promise.all([
      supabase.rpc('shop_admin_otp_eligible_accounts'), supabase.rpc('shop_admin_page_otp_reissues', { p_limit: pageSize, p_offset: page * pageSize })
    ])
    if (accountResult.error || linkResult.error) { setError('Gagal memuat data OTP ulang.'); return }
    setAccounts((accountResult.data ?? []) as Account[])
    setLinks((linkResult.data ?? []) as Link[])
    setTotal((linkResult.data?.[0] as Link | undefined)?.total_count ?? 0)
    if (!linkResult.data?.length && page > 0) setPage(page - 1)
  }
  useEffect(() => { void load() }, [page])
  async function create() {
    if (!selected || busy) return
    setBusy(true); setError(''); setNewLink(''); setCopied(false)
    const { data, error: createError } = await supabase.rpc('shop_admin_create_otp_reissue', { p_account_id: selected })
    if (createError) setError('Gagal membuat tautan OTP ulang.')
    else {
      const result = data as { id: string; token: string }
      setNewLink(`${window.location.origin}/shop/otp-ulang/${result.id}#${result.token}`)
      await load()
    }
    setBusy(false)
  }
  async function cancel(id: string) {
    if (busy || !window.confirm('Batalkan tautan OTP ulang ini?')) return
    setBusy(true); setError('')
    const { error: cancelError } = await supabase.rpc('shop_admin_cancel_otp_reissue', { p_id: id })
    if (cancelError) setError('Gagal membatalkan tautan.')
    else await load()
    setBusy(false)
  }
  return <ShopAdminShell>
    <h1 className="mb-5 text-3xl font-extrabold">OTP Ulang</h1>
    <p className="mb-5 text-greenroom-muted">Pilih akun yang pernah diserahkan. Setiap tautan hanya dapat menghasilkan satu kode OTP.</p>
    {error && <p role="alert" className="mb-4 text-greenroom-danger">{error} <button type="button" className={button} onClick={() => void load()}>Coba lagi</button></p>}
    <section className="mb-7 space-y-4 rounded-greenroom-card border border-greenroom-border bg-white p-5">
      <label className="block font-bold">Akun<select className="mt-2 min-h-11 w-full rounded-greenroom-control border border-greenroom-input-border bg-white px-3" value={selected} onChange={(event) => setSelected(event.target.value)}>
        <option value="">Pilih akun</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.email}</option>)}</select></label>
      <button type="button" className={primary} disabled={!selected || busy} onClick={() => void create()}>{busy ? 'Memproses…' : 'Buat tautan OTP ulang'}</button>
      {newLink && <div className="rounded-greenroom-control bg-greenroom-tint p-4"><p className="font-bold">Salin sekarang. Tautan tidak dapat ditampilkan ulang.</p>
        <p className="my-3 break-all text-sm">{newLink}</p><button type="button" className={button} onClick={() => void navigator.clipboard.writeText(newLink).then(() => setCopied(true)).catch(() => setError('Gagal menyalin. Salin tautan secara manual.'))}>{copied ? 'Tersalin ✓' : 'Salin tautan'}</button></div>}
    </section>
    <h2 className="mb-3 text-xl font-bold">Riwayat tautan</h2>
    <div className="overflow-x-auto rounded-greenroom-card border border-greenroom-border bg-white"><table className="w-full min-w-[700px] text-left text-sm">
      <thead className="bg-greenroom-tint"><tr>{['Akun', 'Dibuat', 'Status', 'Aksi'].map((heading) => <th key={heading} className="p-4">{heading}</th>)}</tr></thead>
      <tbody>{links.map((link) => {
        const expired = !!link.expires_at && new Date(link.expires_at).getTime() <= Date.now()
        const status = link.taken_at ? `Diambil ${date(link.taken_at)}` : expired ? 'Kedaluwarsa' : link.cancelled_at ? 'Dibatalkan' : link.bound_at ? 'Identitas terisi' : 'Belum dipakai'
        return <tr key={link.id} className="border-t border-greenroom-border"><td className="p-4">{link.account_email ?? 'Akun dihapus'}</td><td className="p-4">{date(link.created_at)}</td><td className="p-4">{status}</td><td className="p-4">{!link.taken_at && !link.cancelled_at && !expired && <button type="button" className={button} disabled={busy} onClick={() => void cancel(link.id)}>Batalkan</button>}</td></tr>
      })}</tbody></table>{links.length === 0 && <p className="p-4 text-greenroom-muted">Belum ada tautan OTP ulang.</p>}</div>
    <div className="mt-3 flex items-center gap-3"><button type="button" className={button} disabled={page === 0 || busy} onClick={() => setPage(page - 1)}>Sebelumnya</button><span>Halaman {page + 1} · Total {total}</span><button type="button" className={button} disabled={busy || (page + 1) * pageSize >= total} onClick={() => setPage(page + 1)}>Berikutnya</button></div>
  </ShopAdminShell>
}
