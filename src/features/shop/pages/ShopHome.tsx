import { useState } from 'react'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { getShopSupabase } from '../lib/supabase'

type AccountType = 'sharing' | 'private'
type Variant = { id: string; account_type: AccountType; duration_days: number; price: number }
type Product = {
  id: string
  name: string
  description: string | null
  terms: string | null
  variants: Variant[]
}

const queryClient = new QueryClient()
const durations = [1, 3, 7, 14, 30]
const priceFormatter = new Intl.NumberFormat('id-ID')

async function fetchProducts(): Promise<Product[]> {
  const { data, error } = await getShopSupabase()
    .from('shop_products')
    .select('id, name, description, terms, variants:shop_variants(id, account_type, duration_days, price)')
    .eq('is_active', true)
    .eq('variants.is_active', true)
    .order('sort_order')

  if (error) throw error
  return (data ?? []) as Product[]
}

function ProductCard({ product }: { product: Product }) {
  const navigate = useNavigate()
  const firstVariant = product.variants[0]
  const [accountType, setAccountType] = useState<AccountType>(firstVariant?.account_type ?? 'sharing')
  const [durationDays, setDurationDays] = useState(firstVariant?.duration_days ?? 7)
  const selectedVariant = product.variants.find(
    (variant) => variant.account_type === accountType && variant.duration_days === durationDays
  )
  const soldOut = product.variants.length === 0
  const toggleClass = (selected: boolean) =>
    `min-h-11 min-w-11 rounded-greenroom-control border px-3 py-2 text-sm font-semibold ${selected
      ? 'border-greenroom-primary bg-greenroom-tint text-greenroom-ink'
      : 'border-greenroom-input-border bg-white text-greenroom-muted'}`

  return (
    <article className="flex flex-col gap-4 rounded-greenroom-card border border-greenroom-border bg-white p-4">
      <div className="flex aspect-[4/3] items-center justify-center rounded-greenroom-control border border-greenroom-border bg-greenroom-tint text-sm text-greenroom-muted">
        Gambar {product.name}
      </div>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold text-greenroom-ink">{product.name}</h2>
          {product.description && <p className="mt-1 text-sm text-greenroom-muted">{product.description}</p>}
        </div>
        {soldOut && <span className="rounded-full bg-greenroom-danger-bg px-3 py-1 text-sm font-semibold text-greenroom-danger">Habis</span>}
      </div>
      <div role="group" aria-label={`Jenis akun ${product.name}`}>
        <p className="mb-2 text-sm font-semibold text-greenroom-ink">Jenis akun</p>
        <div className="flex flex-wrap gap-2">
          {(['sharing', 'private'] as const).map((type) => (
            <button key={type} type="button" className={toggleClass(accountType === type)}
              aria-pressed={accountType === type} onClick={() => setAccountType(type)}>
              {type === 'sharing' ? 'Sharing' : 'Private'}
            </button>
          ))}
        </div>
      </div>
      <div role="group" aria-label={`Masa aktif ${product.name}`}>
        <p className="mb-2 text-sm font-semibold text-greenroom-ink">Masa aktif</p>
        <div className="flex flex-wrap gap-2">
          {durations.map((days) => (
            <button key={days} type="button" className={toggleClass(durationDays === days)}
              aria-pressed={durationDays === days} onClick={() => setDurationDays(days)}>
              {days === 30 ? '1 bulan' : `${days} hari`}
            </button>
          ))}
        </div>
      </div>
      {product.terms && <p className="text-sm text-greenroom-muted">{product.terms}</p>}
      <div className="mt-auto flex items-baseline justify-between gap-2">
        <span className="text-sm text-greenroom-muted">Harga</span>
        <strong className="text-xl text-greenroom-ink">
          {selectedVariant ? `Rp ${priceFormatter.format(selectedVariant.price)}` : 'Tidak tersedia'}
        </strong>
      </div>
      <button type="button" disabled={!selectedVariant}
        onClick={() => selectedVariant && navigate(`/shop/beli/${selectedVariant.id}`)}
        className="min-h-11 w-full rounded-greenroom-control bg-greenroom-primary px-5 font-bold text-white hover:bg-greenroom-primary-hover disabled:cursor-not-allowed disabled:opacity-50">
        Beli
      </button>
    </article>
  )
}

function Catalog() {
  const { data: products, isPending, isError } = useQuery({
    queryKey: ['shop-products'],
    queryFn: fetchProducts
  })

  return (
    <main className="min-h-screen bg-greenroom-bg px-5 py-10 font-greenroom-sans text-greenroom-ink">
      <div className="mx-auto max-w-6xl">
        <h1 className="text-3xl font-extrabold">Pilih produk</h1>
        <p className="mt-2 mb-8 max-w-2xl text-greenroom-muted">
          Pilih produk dan varian, bayar lewat transfer atau QRIS, lalu akun dikirim langsung di halaman ini setelah admin memverifikasi.
        </p>
        {isError && <p role="alert" className="text-greenroom-danger">Gagal memuat produk</p>}
        {isPending && (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" aria-label="Memuat produk">
            {[0, 1, 2].map((item) => (
              <div key={item} className="h-96 animate-pulse rounded-greenroom-card bg-greenroom-border" />
            ))}
          </div>
        )}
        {products && (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((product) => <ProductCard key={product.id} product={product} />)}
          </div>
        )}
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
