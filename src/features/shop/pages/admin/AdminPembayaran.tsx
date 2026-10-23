import { useEffect, useState } from 'react'
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../../../supabase'
import ShopAdminShell from '../../components/ShopAdminShell'

type Method = { id: string; name: string; kind: 'bank' | 'ewallet' | 'qris'; account_number: string | null;
  account_name: string; logo_url: string | null; qris_image_path: string | null; sort_order: number; is_active: boolean }
type Form = Omit<Method, 'id'>
const client = new QueryClient()
const base = 'inline-flex min-h-11 items-center justify-center rounded-greenroom-control border px-4 font-bold disabled:opacity-50'
const primary = `${base} border-greenroom-primary bg-greenroom-primary text-white hover:bg-greenroom-primary-hover`
const secondary = `${base} border-greenroom-input-border bg-white text-greenroom-ink hover:bg-greenroom-bg`
const input = 'min-h-11 w-full rounded-greenroom-control border border-greenroom-input-border bg-white px-3 text-greenroom-ink'
const blank: Form = { name: '', kind: 'bank', account_number: '', account_name: '', logo_url: '', qris_image_path: null, sort_order: 0, is_active: true }
async function listMethods() {
  const { data, error } = await supabase.from('shop_payment_methods')
    .select('id,name,kind,account_number,account_name,logo_url,qris_image_path,sort_order,is_active').order('sort_order')
  if (error) throw error
  return data as Method[]
}
function Page() {
  const queryClient = useQueryClient()
  const methods = useQuery({ queryKey: ['shop-admin-payment-methods'], queryFn: listMethods })
  const [editing, setEditing] = useState<Method | 'new' | null>(null)
  const [form, setForm] = useState<Form>(blank)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [qrisFile, setQrisFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  useEffect(() => {
    if (!qrisFile) return
    const url = URL.createObjectURL(qrisFile)
    setPreview(url)
    return () => { URL.revokeObjectURL(url); setPreview(null) }
  }, [qrisFile])
  function open(method: Method | 'new') {
    setEditing(method); setError(''); setQrisFile(null)
    setForm(method === 'new' ? { ...blank } : { name: method.name, kind: method.kind, account_number: method.account_number,
      account_name: method.account_name, logo_url: method.logo_url, qris_image_path: method.qris_image_path,
      sort_order: method.sort_order, is_active: method.is_active })
  }
  async function save() {
    const digits = (form.account_number ?? '').replace(/ /g, '')
    if (!form.name.trim() || !form.account_name.trim() || (form.kind !== 'qris' && (!/^[0-9 ]+$/.test(form.account_number ?? '') || digits.length < 5 || digits.length > 30))
      || (form.kind === 'qris' && !qrisFile && !form.qris_image_path) || (form.logo_url && !form.logo_url.startsWith('https://'))
      || !Number.isInteger(form.sort_order)) { setError('Periksa nama, nomor akun, URL logo, dan urutan.'); return }
    setBusy(true); setError('')
    const id = editing === 'new' ? crypto.randomUUID() : (editing as Method).id
    let newPath: string | null = null
    if (qrisFile && form.kind === 'qris') {
      const extension = qrisFile.type === 'image/jpeg' ? 'jpg' : qrisFile.type === 'image/png' ? 'png' : 'webp'
      newPath = `qris/${id}/${crypto.randomUUID()}.${extension}`
      const uploaded = await supabase.storage.from('shop-images').upload(newPath, qrisFile, { contentType: qrisFile.type })
      if (uploaded.error) { setBusy(false); setError('Gagal mengunggah gambar QRIS.'); return }
    }
    const oldPath = editing === 'new' ? null : (editing as Method).qris_image_path
    const values = { ...form, id, name: form.name.trim(), account_name: form.account_name.trim(),
      account_number: form.kind === 'qris' ? null : form.account_number, qris_image_path: form.kind === 'qris' ? newPath ?? form.qris_image_path : null,
      logo_url: form.logo_url || null }
    const result = editing === 'new'
      ? await supabase.from('shop_payment_methods').insert(values)
      : await supabase.from('shop_payment_methods').update(values).eq('id', id)
    setBusy(false)
    if (result.error) { if (newPath) await supabase.storage.from('shop-images').remove([newPath]); setError('Gagal menyimpan metode pembayaran.'); return }
    if (oldPath && oldPath !== values.qris_image_path) {
      const removed = await supabase.storage.from('shop-images').remove([oldPath])
      if (removed.error) setError('Metode tersimpan, tetapi gambar lama gagal dibersihkan.')
    }
    setEditing(null)
    await queryClient.invalidateQueries({ queryKey: ['shop-admin-payment-methods'] })
  }
  return <ShopAdminShell>
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3"><h1 className="text-3xl font-extrabold">Pembayaran</h1>
      <button type="button" className={primary} onClick={() => open('new')}>Tambah metode</button></div>
    {methods.isPending && <p role="status">Memuat metode pembayaran…</p>}
    {methods.isError && <p role="alert" className="text-greenroom-danger">Gagal memuat metode pembayaran. <button type="button" className={secondary} onClick={() => void methods.refetch()}>Coba lagi</button></p>}
    <div className="overflow-x-auto rounded-greenroom-card border border-greenroom-border bg-white"><table className="w-full min-w-[720px] text-left text-sm">
      <thead className="bg-greenroom-tint text-greenroom-muted"><tr>{['Nama', 'Jenis', 'Nomor akun / QRIS', 'Atas nama', 'Urutan', 'Status', 'Aksi'].map((heading) => <th key={heading} className="p-4">{heading}</th>)}</tr></thead>
      <tbody>{methods.data?.map((method) => <tr key={method.id} className="border-t border-greenroom-border">
        <td className="p-4">{method.name}</td><td className="p-4">{method.kind === 'qris' ? 'QRIS' : method.kind === 'ewallet' ? 'E-Wallet' : 'Bank'}</td>
        <td className="p-4">{method.qris_image_path ? <img src={supabase.storage.from('shop-images').getPublicUrl(method.qris_image_path).data.publicUrl} alt={`QRIS ${method.name}`} className="h-14 w-14 object-contain" /> : method.account_number}</td><td className="p-4">{method.account_name}</td>
        <td className="p-4">{method.sort_order}</td><td className="p-4">{method.is_active ? 'Aktif' : 'Nonaktif'}</td>
        <td className="p-4"><button type="button" className={secondary} onClick={() => open(method)}>Edit</button></td>
      </tr>)}</tbody></table>{methods.data?.length === 0 && <p className="p-5 text-greenroom-muted">Belum ada metode pembayaran.</p>}</div>
    {editing && <div className="fixed inset-0 z-50 flex items-center justify-center bg-greenroom-ink/60 p-4"><section role="dialog" aria-modal="true" aria-label="Form metode pembayaran" className="w-full max-w-lg space-y-3 rounded-greenroom-card bg-white p-6">
      <h2 className="text-xl font-bold">{editing === 'new' ? 'Tambah metode' : 'Edit metode'}</h2>
      <label className="block font-bold">Nama<input className={input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
      <label className="block font-bold">Jenis<select className={input} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as Method['kind'] })}><option value="bank">Bank</option><option value="ewallet">E-Wallet</option><option value="qris">QRIS</option></select></label>
      {form.kind !== 'qris' && <label className="block font-bold">Nomor akun<input inputMode="numeric" className={input} value={form.account_number ?? ''} onChange={(e) => setForm({ ...form, account_number: e.target.value })} /></label>}
      <label className="block font-bold">Atas nama<input className={input} value={form.account_name} onChange={(e) => setForm({ ...form, account_name: e.target.value })} /></label>
      {form.kind === 'qris' && <div className="space-y-2"><p className="font-bold">Gambar QRIS</p>
        {(preview || form.qris_image_path) && <img src={preview ?? supabase.storage.from('shop-images').getPublicUrl(form.qris_image_path!).data.publicUrl} alt="Pratinjau QRIS" className="max-h-48 w-full object-contain" />}
        <label className={`${secondary} cursor-pointer`}>{preview || form.qris_image_path ? 'Ganti gambar' : 'Pilih gambar'}<input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => {
          const file = e.target.files?.[0]; e.target.value = ''
          if (!file) return
          if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { setError('Pilih gambar JPG, PNG, atau WebP.'); return }
          if (file.size > 2097152) { setError('Gambar QRIS maksimal 2 MB.'); return }
          setError(''); setQrisFile(file)
        }} /></label>
        {(qrisFile || form.qris_image_path) && <button type="button" className={secondary} onClick={() => { setQrisFile(null); setForm({ ...form, qris_image_path: null }) }}>Hapus gambar</button>}
      </div>}
      <label className="block font-bold">URL logo<input type="url" className={input} value={form.logo_url ?? ''} onChange={(e) => setForm({ ...form, logo_url: e.target.value })} /></label>
      <label className="block font-bold">Urutan<input type="number" className={input} value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} /></label>
      <label className="flex min-h-11 items-center gap-2 font-bold"><input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />Aktif</label>
      {error && <p role="alert" className="text-greenroom-danger">{error}</p>}
      <div className="flex justify-end gap-2"><button type="button" className={secondary} onClick={() => setEditing(null)}>Batal</button><button type="button" disabled={busy} className={primary} onClick={() => void save()}>Simpan</button></div>
    </section></div>}
  </ShopAdminShell>
}
export default function AdminPembayaran() { return <QueryClientProvider client={client}><Page /></QueryClientProvider> }
