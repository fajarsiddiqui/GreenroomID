import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../../../supabase'
import ShopAdminShell from '../../components/ShopAdminShell'
type Usage = { account_id: string; links_created: number; links_opened: number }
type Account = { id: string; variant_id: string | null;
  email: string; priority: number; is_active: boolean;
  created_at: string; has_password: boolean; has_totp: boolean }
type Mode = 'add' | 'edit' | 'credentials' | 'reveal' | null
type Field = 'password' | 'totp_secret'
type DeliveryLink = { id: string; order_code: string; account_email: string | null; created_at: string;
  expires_at: string | null; buyer_name: string | null; credentials_viewed_at: string | null; delivery_cancelled_at: string | null;
  recipient_name: string | null; total_count: number }
const pageSize = 10
const buttonBase = 'inline-flex min-h-11 items-center justify-center rounded-greenroom-control border px-4 font-bold disabled:opacity-50'
const button = `${buttonBase} border-greenroom-input-border bg-white text-greenroom-ink hover:bg-greenroom-bg`
const primary = `${buttonBase} border-greenroom-primary bg-greenroom-primary text-white hover:bg-greenroom-primary-hover`
const input = 'min-h-11 w-full rounded-greenroom-control border border-greenroom-input-border bg-white px-3 text-greenroom-ink'
const messages: Record<string, string> = {
  unauthorized: 'Sesi admin tidak berlaku.', forbidden: 'Akses ditolak.', invalid_input: 'Periksa kembali isian.',
  invalid_variant: 'Varian tidak aktif.', variant_locked: 'Varian akun tidak dapat diubah.',
  stock_below_used: 'Stok tidak boleh lebih kecil dari jumlah terpakai.', not_found: 'Akun tidak ditemukan.',
  not_found_or_unchanged: 'Status akun tidak berubah.', not_decryptable: 'Rahasia akun ini tidak dapat dibuka.',
  server_configuration_error: 'Konfigurasi server belum lengkap.', audit_failed: 'Pencatatan audit gagal.',
  save_failed: 'Gagal menyimpan akun.', lookup_failed: 'Gagal mengambil data.',
  origin_not_allowed: 'Alamat situs tidak diizinkan.', method_not_allowed: 'Permintaan tidak didukung.',
  invalid_json: 'Format permintaan tidak valid.', failed: 'Permintaan gagal.'
}
function message(code?: string) { return messages[code ?? ''] ?? 'Aksi gagal. Coba lagi.' }
class RequestFailure extends Error {
  constructor(readonly status: number, readonly code: string) { super(code) }
}
function failureDetail(cause: unknown) {
  const failure = cause instanceof RequestFailure ? cause : new RequestFailure(0, 'jaringan')
  return `Kode: HTTP ${failure.status} · ${failure.code}`
}
async function callFunction(name: string, body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke(name, { body })
  if (error) {
    const response = (error as { context?: Response }).context
    let code = 'jaringan'
    if (response instanceof Response) {
      try { code = ((await response.json()) as { error?: string }).error ?? code } catch { /* invalid response */ }
    }
    throw new RequestFailure(response instanceof Response ? response.status : 0, code)
  }
  return data as Record<string, unknown>
}

export default function AdminAkun() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [usage, setUsage] = useState<Record<string, Usage>>({})
  const [deliveryLinks, setDeliveryLinks] = useState<DeliveryLink[]>([])
  const [accountPage, setAccountPage] = useState(0)
  const [linkPage, setLinkPage] = useState(0)
  const [accountTotal, setAccountTotal] = useState(0)
  const [linkTotal, setLinkTotal] = useState(0)
  const [recipientAccount, setRecipientAccount] = useState<Account | null>(null)
  const [recipientName, setRecipientName] = useState('')
  const [newLink, setNewLink] = useState('')
  const [linkCopied, setLinkCopied] = useState(false)
  const [actionAccount, setActionAccount] = useState<Account | null>(null)
  const [accountsPending, setAccountsPending] = useState(true)
  const [accountsError, setAccountsError] = useState('')
  const [modalError, setModalError] = useState('')
  const [modalErrorDetail, setModalErrorDetail] = useState('')
  const [actionError, setActionError] = useState('')
  const [actionErrorDetail, setActionErrorDetail] = useState('')
  const [mode, setMode] = useState<Mode>(null)
  const [selected, setSelected] = useState<Account | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [totp, setTotp] = useState('')
  const [priority, setPriority] = useState('0')
  const [field, setField] = useState<Field>('password')
  const [revealed, setRevealed] = useState('')
  const [busy, setBusy] = useState(false)
  const timer = useRef<number | null>(null)
  const revealRequest = useRef(0)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; if (timer.current) window.clearTimeout(timer.current) }
  }, [])
  const loadUsage = useCallback(async () => {
    const { data, error } = await supabase.rpc('shop_admin_delivery_usage')
    if (!mounted.current) return
    if (error) { setAccountsError('Gagal memuat jumlah tautan.'); return }
    setUsage(Object.fromEntries(((data ?? []) as Usage[]).map((row) => [row.account_id, row])))
  }, [])
  const loadAccounts = useCallback(async () => {
    setAccountsPending(true)
    setAccountsError('')
    const { data, error: rpcError } = await supabase.rpc('shop_admin_page_accounts', { p_limit: pageSize, p_offset: accountPage * pageSize })
    if (!mounted.current) return
    setAccountsPending(false)
    if (rpcError) { setAccountsError(rpcError.message); return }
    setAccounts((data ?? []) as Account[])
    setAccountTotal((data?.[0] as { total_count?: number } | undefined)?.total_count ?? 0)
    if (!data?.length && accountPage > 0) setAccountPage(accountPage - 1)
  }, [accountPage])
  useEffect(() => { void loadUsage(); void loadAccounts() }, [loadUsage, loadAccounts])
  const loadLinks = useCallback(async () => {
    const { data, error } = await supabase.rpc('shop_admin_page_delivery_links', { p_limit: pageSize, p_offset: linkPage * pageSize })
    if (mounted.current) {
      if (error) setActionError('Gagal memuat tautan.')
      else {
        setDeliveryLinks((data ?? []) as DeliveryLink[])
        setLinkTotal((data?.[0] as DeliveryLink | undefined)?.total_count ?? 0)
        if (!data?.length && linkPage > 0) setLinkPage(linkPage - 1)
      }
    }
  }, [linkPage])
  useEffect(() => { void loadLinks() }, [loadLinks])
  async function createLink(account: Account) {
    if (busy) return
    const name = recipientName.trim()
    if (!name || name.length > 100) { setActionError('Isi nama tujuan (maksimal 100 karakter).'); return }
    setBusy(true); setActionError(''); setNewLink(''); setLinkCopied(false)
    try {
      const { data, error } = await supabase.rpc('shop_admin_create_delivery_link', { p_account_id: account.id, p_recipient_name: name })
      if (error) throw error
      const result = data as { order_id: string; token: string }
      setNewLink(`${window.location.origin}/shop/ambil/${result.order_id}#${result.token}`)
      setRecipientAccount(null); setRecipientName('')
      await Promise.all([loadAccounts(), loadUsage(), loadLinks()])
    } catch { setActionError('Gagal membuat tautan. Coba lagi.') }
    finally { setBusy(false) }
  }
  async function cancelLink(link: DeliveryLink) {
    if (busy || !window.confirm(`Batalkan tautan ${link.order_code}?`)) return
    setBusy(true); setActionError('')
    try {
      const { error } = await supabase.rpc('shop_admin_cancel_delivery_link', { p_order_id: link.id })
      if (error) throw error
      await Promise.all([loadAccounts(), loadUsage(), loadLinks()])
    } catch { setActionError('Gagal membatalkan tautan.') }
    finally { setBusy(false) }
  }
  function close() {
    revealRequest.current += 1
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = null
    setRevealed(''); setPassword(''); setTotp(''); setModalError(''); setModalErrorDetail(''); setMode(null); setSelected(null)
  }
  function open(next: Exclude<Mode, null>, account: Account | null = null, nextField: Field = 'password') {
    close(); setSelected(account); setMode(next); setField(nextField)
    setEmail(account?.email ?? '')
    setPriority(String(account?.priority ?? 0))
  }
  async function save() {
    if (busy) return
    const rank = Number(priority)
    if (!email.trim()
      || !Number.isInteger(rank) || rank < 0 || rank > 9999 || (mode === 'add' && !password)) {
      setModalError('Periksa kembali isian.'); return
    }
    setBusy(true); setModalError(''); setModalErrorDetail('')
    try {
      const meta = { p_account_id: selected?.id, p_email: email.trim(), p_max_uses: null, p_priority: rank }
      if (mode === 'edit') {
        const { error: rpcError, status } = await supabase.rpc('shop_admin_update_account_meta', meta)
        if (rpcError) throw new RequestFailure(status, rpcError.code)
      } else {
        await callFunction('shop-admin-save-account', {
          account_id: selected?.id, variant_id: selected?.variant_id ?? null, email: email.trim(),
          password, totp_secret: totp, max_uses: null, priority: rank
        })
      }
      close(); await Promise.all([loadAccounts(), loadUsage()])
    } catch (cause) {
      setModalError(message(cause instanceof RequestFailure ? cause.code : undefined))
      setModalErrorDetail(failureDetail(cause))
    }
    finally { setPassword(''); setTotp(''); setBusy(false) }
  }
  async function toggle(account: Account) {
    setActionError(''); setActionErrorDetail(''); setBusy(true)
    const { error: rpcError, status } = await supabase.rpc('shop_admin_set_account_status',
      { p_account_id: account.id, p_is_active: !account.is_active })
    if (rpcError) {
      setActionError(message(rpcError.code))
      setActionErrorDetail(failureDetail(new RequestFailure(status, rpcError.code)))
    }
    else await loadAccounts()
    setBusy(false)
  }
  async function remove(account: Account) {
    if (busy) return
    setActionError(''); setActionErrorDetail(''); setBusy(true)
    const { data: count, error: countError } = await supabase.rpc('shop_admin_account_order_count', { p_account_id: account.id })
    if (countError) {
      setActionError(message(countError.code)); setActionErrorDetail(countError.message); setBusy(false); return
    }
    const confirmed = window.confirm(`Hapus permanen akun ${account.email}? ${count ?? 0} pesanan terkait akan kehilangan akses kredensial dan TOTP. Riwayat pesanan tetap tersimpan.`)
    if (!confirmed) { setBusy(false); return }
    const { error: deleteError } = await supabase.rpc('shop_admin_delete_account', { p_account_id: account.id })
    if (deleteError) {
      setActionError(message(deleteError.code)); setActionErrorDetail(deleteError.message)
    } else {
      await Promise.all([loadAccounts(), loadUsage()])
    }
    setBusy(false)
  }
  async function reveal() {
    if (!selected || busy) return
    const requestId = ++revealRequest.current
    setBusy(true); setModalError(''); setModalErrorDetail(''); setRevealed('')
    try {
      const result = await callFunction('shop-admin-reveal-secret', { account_id: selected.id, field })
      if (!mounted.current || requestId !== revealRequest.current) return
      setRevealed(String(result.value ?? ''))
      if (timer.current) window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => { setRevealed(''); timer.current = null }, 30000)
    } catch (cause) { if (requestId === revealRequest.current) {
      setModalError(message(cause instanceof RequestFailure ? cause.code : undefined))
      setModalErrorDetail(failureDetail(cause))
    } }
    finally { setBusy(false) }
  }
  return <ShopAdminShell>
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3"><h1 className="text-3xl font-extrabold">Akun</h1>
      <button type="button" className={primary} onClick={() => open('add')}>Tambah akun</button></div>
    {newLink && <div className="mb-5 rounded-greenroom-card border border-greenroom-border bg-white p-4"><p className="mb-2 font-bold">Tautan baru — salin sekarang. Tautan tidak dapat ditampilkan ulang.</p>
      <p className="break-all text-sm">{newLink}</p><button type="button" className={button} onClick={() => void navigator.clipboard.writeText(newLink).then(() => setLinkCopied(true)).catch(() => setActionError('Gagal menyalin tautan. Salin manual dari teks di atas.'))}>{linkCopied ? 'Tersalin ✓' : 'Salin tautan'}</button>
      {linkCopied && <p role="status" className="mt-2 text-sm text-greenroom-primary">Tautan berhasil disalin.</p>}</div>}
    <section className="mb-8"><h2 className="mb-3 text-xl font-bold">Tautan pengambilan akun</h2>
      <p className="mb-3 text-sm text-greenroom-muted">Pilih akun di daftar bawah, lalu tekan Buat tautan. Setiap tautan hanya dapat dipakai sekali.</p>
      <div className="overflow-x-auto rounded-greenroom-card border border-greenroom-border bg-white"><table className="w-full min-w-[700px] text-left text-sm"><thead className="bg-greenroom-tint"><tr>{['Kode', 'Akun', 'Nama tujuan', 'Dibuat', 'Status', 'Aksi'].map((heading) => <th key={heading} className="p-3">{heading}</th>)}</tr></thead>
        <tbody>{deliveryLinks.map((link) => { const expired = !!link.expires_at && new Date(link.expires_at) <= new Date(); const status = link.delivery_cancelled_at ? 'Dibatalkan' : link.credentials_viewed_at ? 'Sudah dibuka' : expired ? 'Kedaluwarsa' : link.buyer_name ? 'Identitas terisi' : 'Belum dipakai'; return <tr key={link.id} className="border-t"><td className="p-3">{link.order_code}</td><td className="p-3">{link.account_email ?? 'Akun dihapus'}</td><td className="p-3">{link.recipient_name ?? '—'}</td><td className="p-3">{new Date(link.created_at).toLocaleDateString('id-ID')}</td><td className="p-3">{status}</td><td className="p-3">{!expired && !link.delivery_cancelled_at && !link.credentials_viewed_at && <button type="button" className={button} disabled={busy} onClick={() => void cancelLink(link)}>Batalkan</button>}</td></tr> })}</tbody>
      </table>{!deliveryLinks.length && <p className="p-4 text-greenroom-muted">Belum ada tautan.</p>}</div>
      <div className="mt-3 flex items-center gap-3"><button type="button" className={button} disabled={linkPage === 0} onClick={() => setLinkPage(linkPage - 1)}>Sebelumnya</button><span>Halaman {linkPage + 1} · Total {linkTotal}</span><button type="button" className={button} disabled={(linkPage + 1) * pageSize >= linkTotal} onClick={() => setLinkPage(linkPage + 1)}>Berikutnya</button></div></section>
    {actionError && <div role="alert" className="mb-3 text-greenroom-danger">{actionError}<small className="block text-greenroom-muted">{actionErrorDetail}</small></div>}
    <h2 className="mb-3 text-xl font-bold">Daftar akun</h2>
    {accountsPending && <p role="status">Memuat akun…</p>}
    {accountsError && <div role="alert" className="mb-3 flex flex-wrap items-center gap-3"><span>Gagal memuat akun</span>
      <button type="button" className={button} onClick={() => void loadAccounts()}>Coba lagi</button>
      <small className="w-full text-greenroom-muted">{accountsError}</small></div>}
    <p className="mb-3 text-sm text-greenroom-muted">Nonaktif hanya menghentikan alokasi baru; pesanan yang sudah berjalan tidak berubah.</p>
    <div className="overflow-x-auto rounded-greenroom-card border border-greenroom-border bg-white"><table className="w-full min-w-[580px] text-left text-sm">
      <thead className="bg-greenroom-tint text-greenroom-muted"><tr>{['Email', 'Tautan dibuat', 'Akun dibuka', 'Status', 'Aksi'].map((heading) => <th key={heading} className="p-4">{heading}</th>)}</tr></thead>
      <tbody>{accounts.map((account) => <tr key={account.id} className="border-t border-greenroom-border align-top">
        <td className="p-4 break-all">{account.email}</td>
        <td className="p-4">{usage[account.id]?.links_created ?? '—'}</td><td className="p-4">{usage[account.id]?.links_opened ?? '—'}</td>
        <td className="p-4"><div className="space-y-1"><p className="font-bold">{account.is_active ? 'Akun aktif' : 'Akun nonaktif'}</p>
          <p>Sandi: {account.has_password ? 'Tersedia' : 'Tidak tersedia'}</p><p>2FA: {account.has_totp ? 'Tersedia' : 'Tidak tersedia'}</p></div></td>
        <td className="p-4"><button type="button" aria-haspopup="dialog" aria-expanded={actionAccount?.id === account.id} className={button} onClick={() => setActionAccount((current) => current?.id === account.id ? null : account)}>Aksi</button></td>
      </tr>)}</tbody></table>{!accounts.length && !accountsPending && !accountsError && <p className="p-4 text-greenroom-muted">Belum ada akun.</p>}</div>
    <div className="mt-3 flex items-center gap-3"><button type="button" className={button} disabled={accountPage === 0 || accountsPending} onClick={() => setAccountPage(accountPage - 1)}>Sebelumnya</button><span>Halaman {accountPage + 1} · Total {accountTotal}</span><button type="button" className={button} disabled={accountsPending || (accountPage + 1) * pageSize >= accountTotal} onClick={() => setAccountPage(accountPage + 1)}>Berikutnya</button></div>
    {actionAccount && <div className="fixed inset-0 z-40 flex items-center justify-center bg-greenroom-ink/60 p-4" onClick={() => setActionAccount(null)}><section role="dialog" aria-modal="true" aria-label={`Aksi akun ${actionAccount.email}`} className="w-full max-w-sm rounded-greenroom-card bg-white p-5" onClick={(event) => event.stopPropagation()}>
      <h2 className="mb-4 break-all text-lg font-bold">Aksi · {actionAccount.email}</h2><div className="flex flex-col gap-2 [&>button]:w-full">
        <button type="button" className={button} onClick={() => { setActionAccount(null); open('edit', actionAccount) }}>Edit</button>
        <button type="button" className={button} onClick={() => { setActionAccount(null); open('credentials', actionAccount) }}>Ganti sandi/secret</button>
        <button type="button" className={button} onClick={() => { setActionAccount(null); open('reveal', actionAccount, 'password') }}>Tampilkan sandi</button>
        <button type="button" className={button} onClick={() => { setActionAccount(null); open('reveal', actionAccount, 'totp_secret') }}>Tampilkan secret</button>
        <button type="button" className={primary} disabled={busy || !actionAccount.is_active} onClick={() => { setRecipientAccount(actionAccount); setRecipientName(''); setActionError(''); setActionAccount(null) }}>Buat tautan</button>
        <button type="button" className={button} disabled={busy} onClick={() => { setActionAccount(null); void toggle(actionAccount) }}>{actionAccount.is_active ? 'Nonaktifkan' : 'Aktifkan'}</button>
        <button type="button" disabled={busy} className={`${buttonBase} border-greenroom-danger bg-white text-greenroom-danger`} onClick={() => { setActionAccount(null); void remove(actionAccount) }}>Hapus</button>
        <button type="button" className={button} onClick={() => setActionAccount(null)}>Tutup</button>
      </div></section></div>}
    {recipientAccount && <div className="fixed inset-0 z-50 flex items-center justify-center bg-greenroom-ink/60 p-4"><form className="w-full max-w-sm rounded-greenroom-card bg-white p-5" onSubmit={(event) => { event.preventDefault(); void createLink(recipientAccount) }}><h2 className="mb-3 text-xl font-bold">Buat tautan</h2><p className="mb-4 break-all text-sm">Akun: {recipientAccount.email}</p><label className="block font-bold">Untuk …<input className={`${input} mt-2`} required maxLength={100} value={recipientName} onChange={(event) => setRecipientName(event.target.value)} autoFocus /></label>{actionError && <p role="alert" className="mt-2 text-greenroom-danger">{actionError}</p>}<div className="mt-5 flex justify-end gap-2"><button type="button" className={button} disabled={busy} onClick={() => { setRecipientAccount(null); setRecipientName(''); setActionError('') }}>Batal</button><button type="submit" className={primary} disabled={busy || !recipientName.trim()}>{busy ? 'Memproses…' : 'Buat tautan'}</button></div></form></div>}
    {mode && <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-greenroom-ink/60 p-4"><section role="dialog" aria-modal="true" aria-label="Kelola akun" className="my-auto w-full max-w-lg rounded-greenroom-card bg-white p-6">
      <h2 className="mb-4 text-xl font-extrabold">{mode === 'add' ? 'Tambah akun' : mode === 'edit' ? 'Edit akun' : mode === 'credentials' ? 'Ganti sandi/secret' : 'Tampilkan rahasia'}</h2>
      {mode === 'reveal' ? <div className="space-y-3"><p>{field === 'password' ? 'Sandi' : 'Secret 2FA'} hanya tampil selama 30 detik.</p>
        <button type="button" className={primary} disabled={busy} onClick={() => void reveal()}>Tampilkan</button>
        {revealed && <div className="rounded-greenroom-control border border-greenroom-border p-3"><p className="break-all">{revealed}</p><button type="button" className={button} onClick={() => void navigator.clipboard.writeText(revealed)}>Salin</button></div>}</div> : <div className="space-y-3">
        {mode !== 'credentials' && <label className="block font-bold">Email<input type="email" className={input} value={email} onChange={(event) => setEmail(event.target.value)} /></label>}
        {(mode === 'add' || mode === 'credentials') && <><label className="block font-bold">Sandi<input type="password" autoComplete="new-password" className={input} value={password} onChange={(event) => setPassword(event.target.value)} /></label>
          <label className="block font-bold">Secret 2FA<input type="password" autoComplete="off" className={input} value={totp} onChange={(event) => setTotp(event.target.value)} /></label>{mode === 'credentials' && <p className="text-sm text-greenroom-muted">Biarkan kosong untuk mempertahankan sandi atau secret lama.</p>}</>}
        {mode !== 'credentials' && <label className="block font-bold">Prioritas<input type="number" min="0" max="9999" className={input} value={priority} onChange={(event) => setPriority(event.target.value)} /></label>}
      </div>}
      {modalError && <div role="alert" className="mt-3 text-greenroom-danger">{modalError}<small className="block text-greenroom-muted">{modalErrorDetail}</small></div>}
      <div className="mt-6 flex justify-end gap-3"><button type="button" className={button} onClick={close}>Tutup</button>
        {mode !== 'reveal' && <button type="button" className={primary} disabled={busy} onClick={() => void save()}>{busy ? 'Menyimpan…' : 'Simpan'}</button>}</div>
    </section></div>}
  </ShopAdminShell>
}
