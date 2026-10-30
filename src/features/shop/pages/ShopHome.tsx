import { useState } from 'react'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { getShopSupabase } from '../lib/supabase'
import { variantLabel } from '../lib/variations'
import type { VariationAxis } from '../lib/variations'
import ShopGallery from './ShopGallery'
import type { GalleryItem } from './ShopGallery'
import { imageUrl } from '../lib/shopImages'
import type { ShopImage } from '../lib/shopImages'
import ShopRefundTerms from '../components/ShopRefundTerms'

type Variant = { id: string; account_type: string; duration_days: number; price: number; option_values: string[] }
type Product = {
  id: string
  name: string
  description: string | null
  terms: string | null
  image_url: string | null
  variation_axes: VariationAxis[]
  variants: Variant[]
}

const queryClient = new QueryClient()
const priceFormatter = new Intl.NumberFormat('id-ID')

async function fetchProducts(): Promise<Product[]> {
  const { data, error } = await getShopSupabase()
    .from('shop_products')
    .select('id, name, description, terms, image_url, variation_axes, variants:shop_variants(id, account_type, duration_days, price, option_values)')
    .eq('is_active', true)
    .eq('variants.is_active', true)
    .order('sort_order')

  if (error) throw error
  return (data ?? []) as Product[]
}
async function fetchImages(productIds: string[]): Promise<ShopImage[]> {
  if (!productIds.length) return []
  const { data, error } = await getShopSupabase().from('shop_images')
    .select('id,product_id,variant_id,path,sort_order').in('product_id', productIds).order('sort_order')
  if (error) throw error
  return data as ShopImage[]
}

function ProductCard({ product, stock, images }: { product: Product; stock: Record<string, boolean> | undefined; images: ShopImage[] }) {
  const navigate = useNavigate()
  const firstVariant = product.variants[0]
  const [selectedValues, setSelectedValues] = useState(firstVariant?.option_values ?? [])
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const [galleryOpen, setGalleryOpen] = useState(false)
  const selectedVariant = product.variants.find((variant) =>
    variant.option_values.every((value, index) => value === selectedValues[index]))
  const soldOut = !!stock && product.variants.every((variant) => !stock[variant.id])
  const selectedInStock = !!selectedVariant && !!stock?.[selectedVariant.id]
  const productImages = images.filter((image) => !image.variant_id).sort((a, b) => a.sort_order - b.sort_order)
  const variantImages = images.filter((image) => image.variant_id && product.variants.some((variant) => variant.id === image.variant_id))
    .sort((a, b) => {
      const left = product.variants.find((variant) => variant.id === a.variant_id)!
      const right = product.variants.find((variant) => variant.id === b.variant_id)!
      return variantLabel(left).localeCompare(variantLabel(right), 'id')
    })
  const gallery: GalleryItem[] = [...productImages.map((image) => ({ url: imageUrl(image.path), caption: 'Foto produk', alt: product.name })),
    ...(productImages.length === 0 && product.image_url ? [{ url: product.image_url, caption: 'Foto produk', alt: product.name }] : []),
    ...variantImages.map((image) => {
      const variant = product.variants.find((row) => row.id === image.variant_id)!
      const caption = variantLabel(variant)
      return { url: imageUrl(image.path), caption, alt: `${product.name} ${caption}`, variantId: variant.id }
    })]
  const selectedImage = variantImages.find((image) => image.variant_id === selectedVariant?.id)
  const currentUrl = selectedImage ? imageUrl(selectedImage.path) : productImages[0] ? imageUrl(productImages[0].path) : product.image_url
  const currentAlt = `${product.name}${selectedVariant ? ` ${variantLabel(selectedVariant)}` : ''}`
  const toggleClass = (selected: boolean) =>
    `min-h-11 min-w-11 rounded-greenroom-control border px-3 py-2 text-sm font-semibold ${selected
      ? 'border-greenroom-primary bg-greenroom-tint text-greenroom-ink'
      : 'border-greenroom-input-border bg-white text-greenroom-muted'}`

  return (
    <article className="flex flex-col gap-4 rounded-greenroom-card border border-greenroom-border bg-white p-4">
      <button type="button" disabled={!gallery.length} onClick={() => setGalleryOpen(true)} className="aspect-[4/5] w-full overflow-hidden rounded-greenroom-control bg-greenroom-tint text-greenroom-muted disabled:cursor-default" aria-label={`Lihat gambar ${product.name}`}>
        {currentUrl && failedUrl !== currentUrl ? <img key={currentUrl} src={currentUrl} alt={currentAlt} loading="lazy" onError={() => setFailedUrl(currentUrl)} className="h-full w-full object-contain" />
          : <span>Gambar belum tersedia</span>}
      </button>
      {gallery.length > 0 && <button type="button" className="min-h-11 self-start rounded-greenroom-control border border-greenroom-input-border bg-white px-3 font-bold text-greenroom-ink" onClick={() => setGalleryOpen(true)}>Lihat semua gambar ({gallery.length})</button>}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold text-greenroom-ink">{product.name}</h2>
          {product.description && <p className="mt-1 text-sm text-greenroom-muted">{product.description}</p>}
        </div>
        {soldOut && <span className="rounded-full bg-greenroom-danger-bg px-3 py-1 text-sm font-semibold text-greenroom-danger">Habis</span>}
      </div>
      {product.variation_axes.map((axis, index) => <div key={axis.name} role="group" aria-label={`${axis.name} ${product.name}`}>
        <p className="mb-2 text-sm font-semibold text-greenroom-ink">{axis.name}</p>
        <div className="flex flex-wrap gap-2">{axis.options.map((option) => <button key={option} type="button"
          className={toggleClass(selectedValues[index] === option)} aria-pressed={selectedValues[index] === option}
          onClick={() => setSelectedValues((current) => current.map((value, position) => position === index ? option : value))}>{option}</button>)}</div>
      </div>)}
      {product.terms && <p className="text-sm text-greenroom-muted">{product.terms}</p>}
      <div className="mt-auto flex items-baseline justify-between gap-2">
        <span className="text-sm text-greenroom-muted">Harga</span>
        <strong className="text-xl text-greenroom-ink">
          {selectedVariant ? `Rp ${priceFormatter.format(selectedVariant.price)}` : 'Tidak tersedia'}
        </strong>
      </div>
      <button type="button" disabled={!selectedInStock}
        onClick={() => selectedVariant && navigate(`/shop/beli/${selectedVariant.id}`)}
        className="min-h-11 w-full rounded-greenroom-control bg-greenroom-primary px-5 font-bold text-white hover:bg-greenroom-primary-hover disabled:cursor-not-allowed disabled:opacity-50">
        {!stock ? 'Memuat stok…' : selectedVariant && !selectedInStock ? 'Habis' : 'Beli'}
      </button>
      {galleryOpen && <ShopGallery items={gallery} onClose={() => setGalleryOpen(false)} onSelect={(id) => {
        const variant = product.variants.find((row) => row.id === id)
        if (variant) setSelectedValues(variant.option_values)
        setGalleryOpen(false)
      }} />}
    </article>
  )
}

async function fetchStock(): Promise<Record<string, boolean>> {
  const { data, error } = await getShopSupabase().rpc('shop_variant_stock')
  if (error) throw error
  return Object.fromEntries((data as { variant_id: string; in_stock: boolean }[]).map((row) => [row.variant_id, row.in_stock]))
}

function Catalog() {
  const stock = useQuery({ queryKey: ['shop-variant-stock'], queryFn: fetchStock })
  const { data: products, isPending, isError } = useQuery({
    queryKey: ['shop-products'],
    queryFn: fetchProducts
  })
  const images = useQuery({ queryKey: ['shop-images'], queryFn: () => fetchImages(products?.map((product) => product.id) ?? []), enabled: !!products })

  return (
    <main className="min-h-screen bg-greenroom-bg px-5 py-10 font-greenroom-sans text-greenroom-ink">
      <div className="mx-auto max-w-6xl">
        <h1 className="text-3xl font-extrabold">Pilih produk</h1>
        <p className="mt-2 mb-8 max-w-2xl text-greenroom-muted">
          Pilih produk dan varian, bayar lewat transfer atau QRIS, lalu akun dikirim langsung di halaman ini setelah admin memverifikasi.
        </p>
        {(isError || stock.isError || images.isError) && <p role="alert" className="text-greenroom-danger">Gagal memuat produk</p>}
        {isPending && (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" aria-label="Memuat produk">
            {[0, 1, 2].map((item) => (
              <div key={item} className="h-96 animate-pulse rounded-greenroom-card bg-greenroom-border" />
            ))}
          </div>
        )}
        {products && (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((product) => <ProductCard key={product.id} product={product} stock={stock.data} images={images.data?.filter((image) => image.product_id === product.id) ?? []} />)}
          </div>
        )}
        <div className="mt-8"><ShopRefundTerms /></div>
      </div>
    </main>
  )
}

export default function ShopHome() {
  return (
    <QueryClientProvider client={queryClient}>
      <Catalog />
    </QueryClientProvider>
  )
}
