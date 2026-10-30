import { useState } from 'react'
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../../../supabase'
import ShopAdminShell from '../../components/ShopAdminShell'
import { formatDuration } from '../../lib/formatDuration'
import { imageUrl } from '../../lib/shopImages'
import type { ShopImage } from '../../lib/shopImages'
import { AdminImages } from './AdminImages'
import { combinations, variantLabel } from '../../lib/variations'
import type { VariationAxis } from '../../lib/variations'

type Product = { id: string; name: string; description: string | null; terms: string | null;
  image_url: string | null; sort_order: number; is_active: boolean; variation_axes: VariationAxis[] }
type Variant = { id: string; product_id: string; account_type: 'sharing' | 'private';
  duration_days: number; price: number; is_active: boolean; option_values: string[] }
type ProductForm = Omit<Product, 'id' | 'image_url'>
type VariantForm = Omit<Variant, 'id'>
const client = new QueryClient()
const base = 'inline-flex min-h-11 items-center justify-center rounded-greenroom-control border px-4 font-bold disabled:opacity-50'
const primary = `${base} border-greenroom-primary bg-greenroom-primary text-white hover:bg-greenroom-primary-hover`
const secondary = `${base} border-greenroom-input-border bg-white text-greenroom-ink hover:bg-greenroom-bg`
const danger = `${base} border-greenroom-danger bg-white text-greenroom-danger hover:bg-greenroom-danger-bg`
const input = 'min-h-11 w-full rounded-greenroom-control border border-greenroom-input-border bg-white px-3 text-greenroom-ink'
const blankProduct: ProductForm = { name: '', description: '', terms: '', sort_order: 0, is_active: true, variation_axes: [] }
const durations = [1, 3, 7, 14, 30]
const rupiah = (value: number) => `Rp ${new Intl.NumberFormat('id-ID').format(value)}`
function accountSettings(axes: VariationAxis[], values: string[]) {
  const typeIndex = axes.findIndex((axis) => axis.name.toLocaleLowerCase('id-ID') === 'jenis akun')
  const durationIndex = axes.findIndex((axis) => axis.name.toLocaleLowerCase('id-ID') === 'masa aktif')
  const parsedDuration = Number.parseInt(values[durationIndex] ?? '', 10)
  return { account_type: values[typeIndex]?.toLocaleLowerCase('id-ID') === 'private' ? 'private' as const : 'sharing' as const,
    duration_days: durations.includes(parsedDuration) ? parsedDuration : 1 }
}
async function listProducts() {
  const { data, error } = await supabase.from('shop_products').select('id,name,description,terms,image_url,sort_order,is_active,variation_axes').order('sort_order')
  if (error) throw error
  return data as Product[]
}
async function listVariants() {
  const { data, error } = await supabase.from('shop_variants').select('id,product_id,account_type,duration_days,price,is_active,option_values').order('duration_days')
  if (error) throw error
  return data as Variant[]
}
async function listImages() {
  const { data, error } = await supabase.from('shop_images').select('id,product_id,variant_id,path,sort_order').order('sort_order')
  if (error) throw error
  return data as ShopImage[]
}
async function listStock() {
  const { data, error } = await supabase.rpc('shop_admin_stock_summary')
  if (error) throw error
  return data as { variant_id: string; has_unlimited: boolean; remaining: number }[]
}
function Page() {
  const queryClient = useQueryClient()
  const products = useQuery({ queryKey: ['shop-admin-products'], queryFn: listProducts })
  const variants = useQuery({ queryKey: ['shop-admin-variants'], queryFn: listVariants })
  const images = useQuery({ queryKey: ['shop-admin-images'], queryFn: listImages })
  const stock = useQuery({ queryKey: ['shop-admin-stock-summary'], queryFn: listStock })
  const [productModal, setProductModal] = useState<Product | 'new' | null>(null)
  const [variantModal, setVariantModal] = useState<Variant | 'new' | null>(null)
  const [productForm, setProductForm] = useState<ProductForm>(blankProduct)
  const [variantForm, setVariantForm] = useState<VariantForm>({ product_id: '', account_type: 'sharing', duration_days: 1, price: 0, is_active: true, option_values: [] })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  function openProduct(product: Product | 'new') {
    setError(''); setProductModal(product)
    setProductForm(product === 'new' ? { ...blankProduct } : { name: product.name, description: product.description,
      terms: product.terms, sort_order: product.sort_order, is_active: product.is_active, variation_axes: product.variation_axes })
  }
  function openVariant(productId: string, variant: Variant | 'new', values?: string[]) {
    setError(''); setVariantModal(variant)
    const axes = products.data?.find((product) => product.id === productId)?.variation_axes ?? []
    const initialValues = values ?? axes.map((axis) => axis.options[0])
    setVariantForm(variant === 'new' ? { product_id: productId, ...accountSettings(axes, initialValues), price: 0, is_active: true,
      option_values: initialValues }
      : { product_id: variant.product_id, account_type: variant.account_type, duration_days: variant.duration_days,
        price: variant.price, is_active: variant.is_active, option_values: variant.option_values })
  }
  async function saveProduct() {
    const axes = productForm.variation_axes.map((axis) => ({ name: axis.name.trim(), options: axis.options.map((option) => option.trim()).filter(Boolean) }))
    const oldVariants = variants.data?.filter((variant) => productModal !== 'new' && variant.product_id === productModal.id) ?? []
    const names = axes.map((axis) => axis.name.toLocaleLowerCase('id-ID'))
    const valid = axes.length <= 2 && axes.every((axis) => axis.name && axis.options.length > 0
      && new Set(axis.options.map((option) => option.toLocaleLowerCase('id-ID'))).size === axis.options.length)
      && new Set(names).size === names.length
    const nextKeys = new Set(combinations(axes).map((values) => JSON.stringify(values)))
    if (!valid || oldVariants.some((variant) => variant.is_active && !nextKeys.has(JSON.stringify(variant.option_values)))) {
      setError('Isi nama dan pilihan variasi yang unik. Nonaktifkan varian lama sebelum menghapus pilihannya.'); return
    }
    if (!productForm.name.trim() || !Number.isInteger(productForm.sort_order)) {
      setError('Periksa nama dan urutan.'); return
    }
    setBusy(true); setError('')
    const values = { ...productForm, name: productForm.name.trim(), variation_axes: axes }
    const result = productModal === 'new'
      ? await supabase.from('shop_products').insert(values)
      : await supabase.from('shop_products').update(values).eq('id', (productModal as Product).id)
    setBusy(false)
    if (result.error) { setError('Gagal menyimpan produk.'); return }
    setProductModal(null)
    await queryClient.invalidateQueries({ queryKey: ['shop-admin-products'] })
  }
  async function saveVariant() {
    const axes = products.data?.find((product) => product.id === variantForm.product_id)?.variation_axes ?? []
    if (variantForm.option_values.length !== axes.length || variantForm.option_values.some((value, index) => !axes[index]?.options.includes(value))
      || !durations.includes(variantForm.duration_days) || !Number.isInteger(variantForm.price) || variantForm.price <= 0) {
      setError('Pilih durasi dan isi harga rupiah lebih dari nol.'); return
    }
    setBusy(true); setError('')
    const result = variantModal === 'new'
      ? await supabase.from('shop_variants').insert(variantForm)
      : await supabase.from('shop_variants').update(variantForm).eq('id', (variantModal as Variant).id)
    setBusy(false)
    if (result.error) { setError(result.error.code === '23505' ? 'Varian itu sudah ada' : 'Gagal menyimpan varian.'); return }
    setVariantModal(null)
    await Promise.all([queryClient.invalidateQueries({ queryKey: ['shop-admin-variants'] }), queryClient.invalidateQueries({ queryKey: ['shop-admin-stock-summary'] })])
  }
  async function deleteVariant() {
    if (variantModal === 'new' || !window.confirm(`Hapus varian ${variantLabel(variantModal)}? Tindakan ini tidak bisa dibatalkan.`)) return
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
        {['Gambar', ...product.variation_axes.map((axis) => axis.name), 'Harga', 'Stok akun', 'Status', 'Aksi'].map((heading) => <th key={heading} className="p-3">{heading}</th>)}
      </tr></thead><tbody>{variants.data?.filter((variant) => variant.product_id === product.id).map((variant) => <tr key={variant.id} className="border-t border-greenroom-border">
        <td className="p-3">{images.data?.find((image) => image.variant_id === variant.id) && <img src={imageUrl(images.data.find((image) => image.variant_id === variant.id)!.path)} alt="Gambar varian" className="h-12 w-12 rounded-greenroom-control object-cover" />}</td>
        {product.variation_axes.map((axis, index) => <td key={axis.name} className="p-3">{variant.option_values[index] ?? '—'}</td>)}
        <td className="p-3">{rupiah(variant.price)}</td><td className="p-3">{stock.data?.find((row) => row.variant_id === variant.id)?.has_unlimited ? 'Tak terbatas' : stock.data?.find((row) => row.variant_id === variant.id)?.remaining ?? '—'}</td><td className="p-3">{variant.is_active ? 'Aktif' : 'Nonaktif'}</td>
        <td className="p-3"><button type="button" className={secondary} onClick={() => openVariant(product.id, variant)}>Edit</button></td>
      </tr>)}</tbody></table>
      {combinations(product.variation_axes).filter((values) => !variants.data?.some((variant) => variant.product_id === product.id && JSON.stringify(variant.option_values) === JSON.stringify(values)))
        .map((values) => <div key={JSON.stringify(values)} className="flex items-center justify-between border-t border-greenroom-border p-3 text-sm"><span>{values.join(' · ')} · Harga belum diisi</span><button type="button" className={secondary} onClick={() => openVariant(product.id, 'new', values)}>Atur harga</button></div>)}
    </section>)}</div>
    {productModal && <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-greenroom-ink/60 p-4"><section role="dialog" aria-modal="true" aria-label="Form produk" className="my-auto w-full max-w-lg space-y-3 rounded-greenroom-card bg-white p-6">
      <h2 className="text-xl font-bold">{productModal === 'new' ? 'Tambah produk' : 'Edit produk'}</h2>
      <label className="block font-bold">Nama<input className={input} value={productForm.name} onChange={(e) => setProductForm({ ...productForm, name: e.target.value })} /></label>
      <label className="block font-bold">Deskripsi<textarea className={input} value={productForm.description ?? ''} onChange={(e) => setProductForm({ ...productForm, description: e.target.value })} /></label>
      <label className="block font-bold">Ketentuan<textarea className={input} value={productForm.terms ?? ''} onChange={(e) => setProductForm({ ...productForm, terms: e.target.value })} /><small className="text-greenroom-muted">Tulis kebijakan refund dan batas pengguna Sharing</small></label>
      <label className="block font-bold">Urutan<input type="number" className={input} value={productForm.sort_order} onChange={(e) => setProductForm({ ...productForm, sort_order: Number(e.target.value) })} /></label>
      <div className="space-y-3"><p className="font-bold">Variasi (maksimal 2)</p>
        {productForm.variation_axes.map((axis, index) => <div key={index} className="space-y-2 rounded-greenroom-control bg-greenroom-tint p-3">
          <label className="block text-sm font-bold">Nama variasi {index + 1}<input className={input} value={axis.name} onChange={(e) => setProductForm({ ...productForm, variation_axes: productForm.variation_axes.map((item, position) => position === index ? { ...item, name: e.target.value } : item) })} placeholder="Contoh: Jumlah user" /></label>
          <label className="block text-sm font-bold">Pilihan (pisahkan dengan koma)<input className={input} value={axis.options.join(', ')} onChange={(e) => setProductForm({ ...productForm, variation_axes: productForm.variation_axes.map((item, position) => position === index ? { ...item, options: e.target.value.split(',').map((value) => value.trimStart()) } : item) })} placeholder="Contoh: 1 user, 2 user" /></label>
          <button type="button" className={danger} onClick={() => setProductForm({ ...productForm, variation_axes: productForm.variation_axes.filter((_, position) => position !== index) })}>Hapus variasi</button>
        </div>)}
        {productForm.variation_axes.length < 2 && <button type="button" className={secondary} onClick={() => setProductForm({ ...productForm, variation_axes: [...productForm.variation_axes, { name: '', options: [''] }] })}>+ Tambah variasi</button>}
        {productForm.variation_axes.length > 0 && <p className="text-sm text-greenroom-muted">{combinations(productForm.variation_axes).length} kombinasi; tambahkan harga tiap kombinasi lewat tombol Tambah varian.</p>}
      </div>
      <label className="flex min-h-11 items-center gap-2 font-bold"><input type="checkbox" checked={productForm.is_active} onChange={(e) => setProductForm({ ...productForm, is_active: e.target.checked })} />Aktif</label>
      {error && <p role="alert" className="text-greenroom-danger">{error}</p>}
      {productModal !== 'new' && <button type="button" disabled={busy} className={danger} onClick={() => void deleteProduct()}>Hapus produk</button>}
      <div className="flex justify-end gap-2"><button type="button" className={secondary} onClick={() => setProductModal(null)}>Batal</button><button type="button" disabled={busy} className={primary} onClick={() => void saveProduct()}>Simpan</button></div>
    </section></div>}
    {variantModal && <div className="fixed inset-0 z-50 flex items-center justify-center bg-greenroom-ink/60 p-4"><section role="dialog" aria-modal="true" aria-label="Form varian" className="w-full max-w-lg space-y-3 rounded-greenroom-card bg-white p-6">
      <h2 className="text-xl font-bold">{variantModal === 'new' ? 'Tambah varian' : 'Edit varian'}</h2>
      {(products.data?.find((product) => product.id === variantForm.product_id)?.variation_axes ?? []).map((axis, index) => <label key={axis.name} className="block font-bold">{axis.name}<select className={input} value={variantForm.option_values[index] ?? ''} onChange={(e) => {
        const nextValues = variantForm.option_values.map((value, position) => position === index ? e.target.value : value)
        setVariantForm({ ...variantForm, option_values: nextValues, ...accountSettings(products.data?.find((product) => product.id === variantForm.product_id)?.variation_axes ?? [], nextValues) })
      }}>{axis.options.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>)}
      <label className="block font-bold">Tipe akun untuk pengiriman<select className={input} value={variantForm.account_type} onChange={(e) => setVariantForm({ ...variantForm, account_type: e.target.value as Variant['account_type'] })}><option value="sharing">Sharing</option><option value="private">Private</option></select></label>
      <label className="block font-bold">Durasi akses akun/TOTP<select className={input} value={variantForm.duration_days} onChange={(e) => setVariantForm({ ...variantForm, duration_days: Number(e.target.value) })}>{durations.map((days) => <option key={days} value={days}>{formatDuration(days)}</option>)}</select></label>
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
