import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../../../supabase'
import ShopAdminShell from '../../components/ShopAdminShell'
import { formatDuration } from '../../lib/formatDuration'

type Stock = { variant_id: string; product_name: string; account_type: string; duration_days: number;
  has_unlimited: boolean; remaining: number; low: boolean; sold_out: boolean }
type Account = { id: string; variant_id: string; product_name: string; account_type: string; duration_days: number;
  email: string; max_uses: number | null; used_count: number; priority: number; is_active: boolean;
  created_at: string; has_password: boolean; has_totp: boolean }
type Mode = 'add' | 'edit' | 'credentials' | 'reveal' | null
type Field = 'password' | 'totp_secret'
const button = 'inline-flex min-h-11 items-center justify-center rounded-greenroom-control border border-greenroom-input-border bg-white px-4 font-bold text-greenroom-ink hover:bg-greenroom-bg disabled:opacity-50'
const primary = `${button} border-greenroom-primary bg-greenroom-primary text-white hover:bg-greenroom-primary-hover`
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
function label(item: Pick<Stock, 'product_name' | 'account_type' | 'duration_days'>) {
  return `${item.product_name} · ${item.account_type === 'sharing' ? 'Sharing' : 'Private'} · ${formatDuration(item.duration_days)}`
}
async function callFunction(name: string, body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke(name, { body })
  if (error) {
    const response = (error as { context?: Response }).context
    let code = 'failed'
    if (response instanceof Response) {
      try { code = ((await response.json()) as { error?: string }).error ?? code } catch { /* invalid response */ }
    }
    throw new Error(code)
  }
  return data as Record<string, unknown>
}

export default function AdminAkun() {
  const [stock, setStock] = useState<Stock[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [modalError, setModalError] = useState('')
  const [mode, setMode] = useState<Mode>(null)
  const [selected, setSelected] = useState<Account | null>(null)
  const [variantId, setVariantId] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [totp, setTotp] = useState('')
  const [maxUses, setMaxUses] = useState('1')
  const [unlimited, setUnlimited] = useState(false)
  const [priority, setPriority] = useState('0')
  const [field, setField] = useState<Field>('password')
  const [revealed, setRevealed] = useState('')
  const [busy, setBusy] = useState(false)
  const timer = useRef<number | null>(null)
  const revealRequest = useRef(0)
  const mounted = useRef(true)
  useEffect(() => () => { mounted.current = false; if (timer.current) window.clearTimeout(timer.current) }, [])
  const load = useCallback(async () => {
    setLoading(true); setError('')
    const [stockResult, accountResult] = await Promise.all([
      supabase.rpc('shop_admin_stock_summary'), supabase.rpc('shop_admin_list_accounts')
    ])
    if (!mounted.current) return
    setLoading(false)
    if (stockResult.error || accountResult.error) { setError('Gagal memuat data akun.'); return }
    setStock((stockResult.data ?? []) as Stock[])
    setAccounts((accountResult.data ?? []) as Account[])
  }, [])
  useEffect(() => { void load() }, [load])
  function close() {
    revealRequest.current += 1
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = null
    setRevealed(''); setPassword(''); setTotp(''); setModalError(''); setMode(null); setSelected(null)
  }
  function open(next: Exclude<Mode, null>, account: Account | null = null, nextField: Field = 'password') {
    close(); setSelected(account); setMode(next); setField(nextField)
    setVariantId(account?.variant_id ?? stock[0]?.variant_id ?? '')
    setEmail(account?.email ?? ''); setMaxUses(String(account?.max_uses ?? 1))
    setUnlimited(account?.max_uses === null && !!account)
    setPriority(String(account?.priority ?? 0))
  }
  async function save() {
    if (busy) return
    const number = Number(maxUses)
    const rank = Number(priority)
    if (!email.trim() || (!unlimited && (!Number.isInteger(number) || number < 1 || number > 1000000))
      || !Number.isInteger(rank) || rank < 0 || rank > 9999 || (mode === 'add' && !password)) {
      setModalError('Periksa kembali isian.'); return
    }
    setBusy(true); setModalError('')
    try {
      const meta = { p_account_id: selected?.id, p_email: email.trim(), p_max_uses: unlimited ? null : number, p_priority: rank }
      if (mode === 'edit') {
        const { error: rpcError } = await supabase.rpc('shop_admin_update_account_meta', meta)
        if (rpcError) throw new Error(rpcError.message.includes('unauthorized') ? 'unauthorized' : 'invalid_input')
      } else {
        await callFunction('shop-admin-save-account', {
          account_id: selected?.id, variant_id: variantId, email: email.trim(),
          password, totp_secret: totp, max_uses: unlimited ? null : number, priority: rank
        })
      }
      close(); await load()
    } catch (cause) { setModalError(message(cause instanceof Error ? cause.message : undefined)) }
    finally { setPassword(''); setTotp(''); setBusy(false) }
  }
  async function toggle(account: Account) {
    setError(''); setBusy(true)
    const { error: rpcError } = await supabase.rpc('shop_admin_set_account_status',
      { p_account_id: account.id, p_is_active: !account.is_active })
    if (rpcError) setError('Gagal mengubah status akun.')
    else await load()
    setBusy(false)
  }
  async function reveal() {
    if (!selected || busy) return
    const requestId = ++revealRequest.current
    setBusy(true); setModalError(''); setRevealed('')
    try {
      const result = await callFunction('shop-admin-reveal-secret', { account_id: selected.id, field })
      if (!mounted.current || requestId !== revealRequest.current) return
      setRevealed(String(result.value ?? ''))
      if (timer.current) window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => { setRevealed(''); timer.current = null }, 30000)
    } catch (cause) { if (requestId === revealRequest.current) setModalError(message(cause instanceof Error ? cause.message : undefined)) }
    finally { setBusy(false) }
  }
  return <ShopAdminShell>
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3"><h1 className="text-3xl font-extrabold">Akun</h1>
      <button type="button" className={primary} onClick={() => open('add')} disabled={!stock.length}>Tambah akun</button></div>
    {error && <p role="alert" className="mb-4 text-greenroom-danger">{error}</p>}
    {loading && <p role="status">Memuat akun…</p>}
    <h2 className="mb-3 text-xl font-bold">Ringkasan stok</h2>
    <div className="mb-8 overflow-x-auto rounded-greenroom-card border border-greenroom-border bg-white"><table className="w-full min-w-[600px] text-left text-sm">
      <thead className="bg-greenroom-tint text-greenroom-muted"><tr><th className="p-4">Varian</th><th className="p-4">Stok tersedia</th><th className="p-4">Status</th></tr></thead>
      <tbody>{stock.map((item) => <tr key={item.variant_id} className="border-t border-greenroom-border"><td className="p-4">{label(item)}</td>
        <td className="p-4">{item.has_unlimited ? 'Tak terbatas' : item.remaining}</td><td className="p-4">{item.sold_out ? <span className="rounded-full bg-greenroom-danger-bg px-3 py-1 font-bold text-greenroom-danger">Habis</span> : item.low ? <span className="rounded-full bg-greenroom-danger-bg px-3 py-1 font-bold text-greenroom-danger">Stok menipis</span> : 'Tersedia'}</td></tr>)}</tbody>
    </table>{!stock.length && !loading && <p className="p-4 text-greenroom-muted">Belum ada varian aktif.</p>}</div>
    <h2 className="mb-3 text-xl font-bold">Daftar akun</h2>
    <p className="mb-3 text-sm text-greenroom-muted">Nonaktif hanya menghentikan alokasi baru; pesanan yang sudah berjalan tidak berubah.</p>
    <div className="overflow-x-auto rounded-greenroom-card border border-greenroom-border bg-white"><table className="w-full min-w-[1050px] text-left text-sm">
      <thead className="bg-greenroom-tint text-greenroom-muted"><tr>{['Email', 'Varian', 'Stok', 'Prioritas', 'Status', 'Sandi', '2FA', 'Aksi'].map((heading) => <th key={heading} className="p-4">{heading}</th>)}</tr></thead>
      <tbody>{accounts.map((account) => <tr key={account.id} className="border-t border-greenroom-border align-top">
        <td className="p-4">{account.email}</td><td className="p-4">{label(account)}</td>
        <td className="p-4">{account.used_count}/{account.max_uses ?? '∞'}</td><td className="p-4">{account.priority}</td>
        <td className="p-4">{account.is_active ? 'Aktif' : 'Nonaktif'}</td><td className="p-4">{account.has_password ? 'Ada' : 'Kosong'}</td><td className="p-4">{account.has_totp ? 'Ada' : 'Kosong'}</td>
        <td className="p-4"><div className="flex flex-wrap gap-2"><button type="button" className={button} onClick={() => open('edit', account)}>Edit</button>
          <button type="button" className={button} onClick={() => open('credentials', account)}>Ganti sandi/secret</button>
          <button type="button" className={button} onClick={() => open('reveal', account, 'password')}>Tampilkan sandi</button>
          <button type="button" className={button} onClick={() => open('reveal', account, 'totp_secret')}>Tampilkan secret</button>
          <button type="button" disabled={busy} className={button} onClick={() => void toggle(account)}>{account.is_active ? 'Nonaktifkan' : 'Aktifkan'}</button></div></td>
      </tr>)}</tbody></table>{!accounts.length && !loading && <p className="p-4 text-greenroom-muted">Belum ada akun.</p>}</div>
    {mode && <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-greenroom-ink/60 p-4"><section role="dialog" aria-modal="true" aria-label="Kelola akun" className="my-auto w-full max-w-lg rounded-greenroom-card bg-white p-6">
      <h2 className="mb-4 text-xl font-extrabold">{mode === 'add' ? 'Tambah akun' : mode === 'edit' ? 'Edit akun' : mode === 'credentials' ? 'Ganti sandi/secret' : 'Tampilkan rahasia'}</h2>
      {mode === 'reveal' ? <div className="space-y-3"><p>{field === 'password' ? 'Sandi' : 'Secret 2FA'} hanya tampil selama 30 detik.</p>
        <button type="button" className={primary} disabled={busy} onClick={() => void reveal()}>Tampilkan</button>
        {revealed && <div className="rounded-greenroom-control border border-greenroom-border p-3"><p className="break-all">{revealed}</p><button type="button" className={button} onClick={() => void navigator.clipboard.writeText(revealed)}>Salin</button></div>}</div> : <div className="space-y-3">
        {mode === 'add' ? <label className="block font-bold">Varian<select className={input} value={variantId} onChange={(event) => setVariantId(event.target.value)}>{stock.map((item) => <option key={item.variant_id} value={item.variant_id}>{label(item)}</option>)}</select></label>
          : <p className="text-greenroom-muted">Varian: {selected ? label(selected) : ''} (tidak dapat diubah)</p>}
        {mode !== 'credentials' && <label className="block font-bold">Email<input type="email" className={input} value={email} onChange={(event) => setEmail(event.target.value)} /></label>}
        {(mode === 'add' || mode === 'credentials') && <><label className="block font-bold">Sandi<input type="password" autoComplete="new-password" className={input} value={password} onChange={(event) => setPassword(event.target.value)} /></label>
          <label className="block font-bold">Secret 2FA<input type="password" autoComplete="off" className={input} value={totp} onChange={(event) => setTotp(event.target.value)} /></label>{mode === 'credentials' && <p className="text-sm text-greenroom-muted">Biarkan kosong untuk mempertahankan sandi atau secret lama.</p>}</>}
        {mode !== 'credentials' && <><label className="flex min-h-11 items-center gap-2 font-bold"><input type="checkbox" checked={unlimited} onChange={(event) => setUnlimited(event.target.checked)} />Tak terbatas</label>
          {!unlimited && <label className="block font-bold">Stok<input type="number" min={Math.max(1, selected?.used_count ?? 1)} max="1000000" className={input} value={maxUses} onChange={(event) => setMaxUses(event.target.value)} /></label>}
          <label className="block font-bold">Prioritas<input type="number" min="0" max="9999" className={input} value={priority} onChange={(event) => setPriority(event.target.value)} /></label></>}
      </div>}
      {modalError && <p role="alert" className="mt-3 text-greenroom-danger">{modalError}</p>}
      <div className="mt-6 flex justify-end gap-3"><button type="button" className={button} onClick={close}>Tutup</button>
        {mode !== 'reveal' && <button type="button" className={primary} disabled={busy} onClick={() => void save()}>{busy ? 'Menyimpan…' : 'Simpan'}</button>}</div>
    </section></div>}
  </ShopAdminShell>
}
