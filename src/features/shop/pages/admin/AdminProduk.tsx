import { useState } from 'react'
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../../../supabase'
import ShopAdminShell from '../../components/ShopAdminShell'
import { formatDuration } from '../../lib/formatDuration'
import { imageUrl } from '../../lib/shopImages'
import type { ShopImage } from '../../lib/shopImages'
import { AdminImages } from './AdminImages'

type Product = { id: string; name: string; description: string | null; terms: string | null;
  image_url: string | null; sort_order: number; is_active: boolean }
type Variant = { id: string; product_id: string; account_type: 'sharing' | 'private';
  duration_days: number; price: number; is_active: boolean }
type ProductForm = Omit<Product, 'id' | 'image_url'>
type VariantForm = Omit<Variant, 'id'>
const client = new QueryClient()
const base = 'inline-flex min-h-11 items-center justify-center rounded-greenroom-control border px-4 font-bold disabled:opacity-50'
const primary = `${base} border-greenroom-primary bg-greenroom-primary text-white hover:bg-greenroom-primary-hover`
const secondary = `${base} border-greenroom-input-border bg-white text-greenroom-ink hover:bg-greenroom-bg`
const danger = `${base} border-greenroom-danger bg-white text-greenroom-danger hover:bg-greenroom-danger-bg`
const input = 'min-h-11 w-full rounded-greenroom-control border border-greenroom-input-border bg-white px-3 text-greenroom-ink'
const blankProduct: ProductForm = { name: '', description: '', terms: '', sort_order: 0, is_active: true }
const durations = [1, 3, 7, 14, 30]
const rupiah = (value: number) => `Rp ${new Intl.NumberFormat('id-ID').format(value)}`
async function listProducts() {
  const { data, error } = await supabase.from('shop_products').select('id,name,description,terms,image_url,sort_order,is_active').order('sort_order')
  if (error) throw error
  return data as Product[]
}
async function listVariants() {
  const { data, error } = await supabase.from('shop_variants').select('id,product_id,account_type,duration_days,price,is_active').order('duration_days')
  if (error) throw error
  return data as Variant[]
}
async function listImages() {
  const { data, error } = await supabase.from('shop_images').select('id,product_id,variant_id,path,sort_order').order('sort_order')
  if (error) throw error
  return data as ShopImage[]
}
function Page() {
  const queryClient = useQueryClient()
  const products = useQuery({ queryKey: ['shop-admin-products'], queryFn: listProducts })
  const variants = useQuery({ queryKey: ['shop-admin-variants'], queryFn: listVariants })
  const images = useQuery({ queryKey: ['shop-admin-images'], queryFn: listImages })
  const [productModal, setProductModal] = useState<Product | 'new' | null>(null)
  const [variantModal, setVariantModal] = useState<Variant | 'new' | null>(null)
  const [productForm, setProductForm] = useState<ProductForm>(blankProduct)
  const [variantForm, setVariantForm] = useState<VariantForm>({ product_id: '', account_type: 'sharing', duration_days: 1, price: 0, is_active: true })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  function openProduct(product: Product | 'new') {
    setError(''); setProductModal(product)
    setProductForm(product === 'new' ? { ...blankProduct } : { name: product.name, description: product.description,
      terms: product.terms, sort_order: product.sort_order, is_active: product.is_active })
  }
  function openVariant(productId: string, variant: Variant | 'new') {
    setError(''); setVariantModal(variant)
    setVariantForm(variant === 'new' ? { product_id: productId, account_type: 'sharing', duration_days: 1, price: 0, is_active: true }
      : { product_id: variant.product_id, account_type: variant.account_type, duration_days: variant.duration_days,
        price: variant.price, is_active: variant.is_active })
  }
  async function saveProduct() {
    if (!productForm.name.trim() || !Number.isInteger(productForm.sort_order)) {
      setError('Periksa nama dan urutan.'); return
    }
    setBusy(true); setError('')
    const values = { ...productForm, name: productForm.name.trim() }
    const result = productModal === 'new'
      ? await supabase.from('shop_products').insert(values)
      : await supabase.from('shop_products').update(values).eq('id', (productModal as Product).id)
    setBusy(false)
    if (result.error) { setError('Gagal menyimpan produk.'); return }
    setProductModal(null)
    await queryClient.invalidateQueries({ queryKey: ['shop-admin-products'] })
  }
  async function saveVariant() {
    if (!durations.includes(variantForm.duration_days) || !Number.isInteger(variantForm.price) || variantForm.price <= 0) {
      setError('Pilih durasi dan isi harga rupiah lebih dari nol.'); return
    }
    setBusy(true); setError('')
    const result = variantModal === 'new'
      ? await supabase.from('shop_variants').insert(variantForm)
      : await supabase.from('shop_variants').update(variantForm).eq('id', (variantModal as Variant).id)
    setBusy(false)
    if (result.error) { setError(result.error.code === '23505' ? 'Varian itu sudah ada' : 'Gagal menyimpan varian.'); return }
    setVariantModal(null)
    await queryClient.invalidateQueries({ queryKey: ['shop-admin-variants'] })
  }
  async function deleteVariant() {
    if (variantModal === 'new' || !window.confirm(`Hapus varian ${variantModal.account_type === 'sharing' ? 'Sharing' : 'Private'} · ${formatDuration(variantModal.duration_days)}? Tindakan ini tidak bisa dibatalkan.`)) return
    setBusy(true); setError('')
    const { data: rows } = await supabase.from('shop_images').select('path').eq('variant_id', variantModal.id)
    const result = await supabase.from('shop_variants').delete().eq('id', variantModal.id)
    setBusy(false)
    if (result.error) { setError(result.error.code === '23503' ? 'Varian ini sudah punya akun atau pesanan, jadi tidak bisa dihapus. Nonaktifkan saja.' : 'Gagal menghapus varian.'); return }
    setVariantModal(null)
    await Promise.all([queryClient.invalidateQueries({ queryKey: ['shop-admin-products'] }), queryClient.invalidateQueries({ queryKey: ['shop-admin-variants'] }), queryClient.invalidateQueries({ queryKey: ['shop-admin-images'] }), queryClient.invalidateQueries({ queryKey: ['shop-images'] }), queryClient.invalidateQueries({ queryKey: ['shop-admin-stock-summary'] }), queryClient.invalidateQueries({ queryKey: ['shop-variant-stock'] })])
    const { error: storageError } = rows?.length ? await supabase.storage.from('shop-images').remove(rows.map((row) => row.path)) : { error: null }
    if (storageError) window.alert('Varian terhapus, tetapi berkas gambar gagal dibersihkan.')
  }
  async function deleteProduct() {
    if (productModal === 'new') return
    const product = productModal as Product
    const typed = window.prompt(`Ketik nama produk untuk menghapusnya: ${product.name}`)
    if (typed !== product.name) return
    setBusy(true); setError('')
    const { data: rows } = await supabase.from('shop_images').select('path').eq('product_id', product.id)
    const result = await supabase.from('shop_products').delete().eq('id', product.id)
    setBusy(false)
    if (result.error) { setError(result.error.code === '23503' ? 'Produk ini punya varian dengan akun atau pesanan, jadi tidak bisa dihapus. Nonaktifkan saja.' : 'Gagal menghapus produk.'); return }
    setProductModal(null)
    await Promise.all([queryClient.invalidateQueries({ queryKey: ['shop-admin-products'] }), queryClient.invalidateQueries({ queryKey: ['shop-admin-variants'] }), queryClient.invalidateQueries({ queryKey: ['shop-admin-images'] }), queryClient.invalidateQueries({ queryKey: ['shop-images'] }), queryClient.invalidateQueries({ queryKey: ['shop-admin-stock-summary'] }), queryClient.invalidateQueries({ queryKey: ['shop-variant-stock'] })])
    const { error: storageError } = rows?.length ? await supabase.storage.from('shop-images').remove(rows.map((row) => row.path)) : { error: null }
    if (storageError) window.alert('Produk terhapus, tetapi berkas gambar gagal dibersihkan.')
  }
  return <ShopAdminShell>
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3"><h1 className="text-3xl font-extrabold">Produk</h1>
      <button type="button" className={primary} onClick={() => openProduct('new')}>Tambah produk</button></div>
    {products.isPending && <p role="status">Memuat produk…</p>}
    {products.isError && <p role="alert" className="text-greenroom-danger">Gagal memuat produk. <button className={secondary} onClick={() => void products.refetch()}>Coba lagi</button></p>}
    {variants.isError && <p role="alert" className="text-greenroom-danger">Gagal memuat varian. <button className={secondary} onClick={() => void variants.refetch()}>Coba lagi</button></p>}
    {images.isError && <p role="alert" className="text-greenroom-danger">Gagal memuat gambar. <button className={secondary} onClick={() => void images.refetch()}>Coba lagi</button></p>}
    <div className="space-y-5">{products.data?.map((product) => <section key={product.id} className="overflow-x-auto rounded-greenroom-card border border-greenroom-border bg-white p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-bold">{product.name}</h2>
        <p className="text-sm text-greenroom-muted">Urutan {product.sort_order} · {product.is_active ? 'Aktif' : 'Nonaktif'}</p></div>
        <div className="flex gap-2"><button type="button" className={secondary} onClick={() => openProduct(product)}>Edit produk</button>
          <button type="button" className={primary} onClick={() => openVariant(product.id, 'new')}>Tambah varian</button></div></div>
      <div className="mb-5"><AdminImages productId={product.id} images={images.data ?? []} /></div>
      <table className="w-full min-w-[560px] text-left text-sm"><thead className="bg-greenroom-tint text-greenroom-muted"><tr>
        {['Gambar', 'Jenis akun', 'Masa aktif', 'Harga', 'Status', 'Aksi'].map((heading) => <th key={heading} className="p-3">{heading}</th>)}
      </tr></thead><tbody>{variants.data?.filter((variant) => variant.product_id === product.id).map((variant) => <tr key={variant.id} className="border-t border-greenroom-border">
        <td className="p-3">{images.data?.find((image) => image.variant_id === variant.id) && <img src={imageUrl(images.data.find((image) => image.variant_id === variant.id)!.path)} alt="Gambar varian" className="h-12 w-12 rounded-greenroom-control object-cover" />}</td>
        <td className="p-3">{variant.account_type === 'sharing' ? 'Sharing' : 'Private'}</td><td className="p-3">{formatDuration(variant.duration_days)}</td>
        <td className="p-3">{rupiah(variant.price)}</td><td className="p-3">{variant.is_active ? 'Aktif' : 'Nonaktif'}</td>
        <td className="p-3"><button type="button" className={secondary} onClick={() => openVariant(product.id, variant)}>Edit</button></td>
      </tr>)}</tbody></table>
    </section>)}</div>
    {productModal && <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-greenroom-ink/60 p-4"><section role="dialog" aria-modal="true" aria-label="Form produk" className="my-auto w-full max-w-lg space-y-3 rounded-greenroom-card bg-white p-6">
      <h2 className="text-xl font-bold">{productModal === 'new' ? 'Tambah produk' : 'Edit produk'}</h2>
      <label className="block font-bold">Nama<input className={input} value={productForm.name} onChange={(e) => setProductForm({ ...productForm, name: e.target.value })} /></label>
      <label className="block font-bold">Deskripsi<textarea className={input} value={productForm.description ?? ''} onChange={(e) => setProductForm({ ...productForm, description: e.target.value })} /></label>
      <label className="block font-bold">Ketentuan<textarea className={input} value={productForm.terms ?? ''} onChange={(e) => setProductForm({ ...productForm, terms: e.target.value })} /><small className="text-greenroom-muted">Tulis kebijakan refund dan batas pengguna Sharing</small></label>
      <label className="block font-bold">Urutan<input type="number" className={input} value={productForm.sort_order} onChange={(e) => setProductForm({ ...productForm, sort_order: Number(e.target.value) })} /></label>
      <label className="flex min-h-11 items-center gap-2 font-bold"><input type="checkbox" checked={productForm.is_active} onChange={(e) => setProductForm({ ...productForm, is_active: e.target.checked })} />Aktif</label>
      {error && <p role="alert" className="text-greenroom-danger">{error}</p>}
      {productModal !== 'new' && <button type="button" disabled={busy} className={danger} onClick={() => void deleteProduct()}>Hapus produk</button>}
      <div className="flex justify-end gap-2"><button type="button" className={secondary} onClick={() => setProductModal(null)}>Batal</button><button type="button" disabled={busy} className={primary} onClick={() => void saveProduct()}>Simpan</button></div>
    </section></div>}
    {variantModal && <div className="fixed inset-0 z-50 flex items-center justify-center bg-greenroom-ink/60 p-4"><section role="dialog" aria-modal="true" aria-label="Form varian" className="w-full max-w-lg space-y-3 rounded-greenroom-card bg-white p-6">
      <h2 className="text-xl font-bold">{variantModal === 'new' ? 'Tambah varian' : 'Edit varian'}</h2>
      <label className="block font-bold">Jenis akun<select className={input} value={variantForm.account_type} onChange={(e) => setVariantForm({ ...variantForm, account_type: e.target.value as Variant['account_type'] })}><option value="sharing">Sharing</option><option value="private">Private</option></select></label>
      <label className="block font-bold">Masa aktif<select className={input} value={variantForm.duration_days} onChange={(e) => setVariantForm({ ...variantForm, duration_days: Number(e.target.value) })}>{durations.map((days) => <option key={days} value={days}>{formatDuration(days)}</option>)}</select></label>
      <label className="block font-bold">Harga (IDR)<input type="number" min="1" className={input} value={variantForm.price} onChange={(e) => setVariantForm({ ...variantForm, price: Number(e.target.value) })} /><small className="text-greenroom-muted">{rupiah(variantForm.price)}</small></label>
      <label className="flex min-h-11 items-center gap-2 font-bold"><input type="checkbox" checked={variantForm.is_active} onChange={(e) => setVariantForm({ ...variantForm, is_active: e.target.checked })} />Aktif</label>
      <p className="text-sm text-greenroom-muted">Varian nonaktif hilang dari katalog; pesanan yang sudah berjalan tidak berubah</p>
      {variantModal !== 'new' ? <AdminImages productId={variantForm.product_id} variantId={variantModal.id} images={images.data ?? []} />
        : <p className="text-sm text-greenroom-muted">Simpan varian dahulu untuk menambahkan gambar.</p>}
      {error && <p role="alert" className="text-greenroom-danger">{error}</p>}
      {variantModal !== 'new' && <button type="button" disabled={busy} className={danger} onClick={() => void deleteVariant()}>Hapus varian</button>}
      <div className="flex justify-end gap-2"><button type="button" className={secondary} onClick={() => setVariantModal(null)}>Batal</button><button type="button" disabled={busy} className={primary} onClick={() => void saveVariant()}>Simpan</button></div>
    </section></div>}
  </ShopAdminShell>
}
export default function AdminProduk() { return <QueryClientProvider client={client}><Page /></QueryClientProvider> }
