import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { getShopSupabase } from '../lib/supabase'

type Variant = {
  id: string
  account_type: 'sharing' | 'private'
  duration_days: number
  price: number
  product: { name: string; is_active: boolean }
}

type CreatedOrder = {
  order_id: string
  order_code: string
  token: string
  expires_at: string
}

type FieldErrors = Partial<Record<'name' | 'phone' | 'device' | 'city', string>>

const queryClient = new QueryClient()
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const phonePattern = /^(08|62)[0-9]{7,11}$/
const inputClass = 'mt-2 min-h-11 w-full rounded-greenroom-control border border-greenroom-input-border bg-greenroom-bg px-3 py-3 text-greenroom-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-greenroom-primary disabled:opacity-50'
const buttonClass = 'inline-flex min-h-11 items-center justify-center rounded-greenroom-control border border-greenroom-input-border px-5 py-3 font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-greenroom-primary'

async function fetchVariant(id: string): Promise<Variant | null> {
  const { data, error } = await getShopSupabase()
    .from('shop_variants')
    .select('id, account_type, duration_days, price, product:shop_products!inner(name, is_active)')
    .eq('id', id)
    .eq('is_active', true)
    .eq('product.is_active', true)
    .maybeSingle()

  if (error) throw error
  return data as unknown as Variant | null
}

function BuyerForm() {
  const { varianId } = useParams()
  const navigate = useNavigate()
  const validId = !!varianId && uuidPattern.test(varianId)
  const variantQuery = useQuery({
    queryKey: ['shop-variant', varianId],
    queryFn: () => fetchVariant(varianId!),
    enabled: validId
  })
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [device, setDevice] = useState('Komputer')
  const [city, setCity] = useState('')
  const [errors, setErrors] = useState<FieldErrors>({})
  const [submitError, setSubmitError] = useState('')
  const [noStock, setNoStock] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [createdOrder, setCreatedOrder] = useState<CreatedOrder | null>(null)
  const inFlight = useRef(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (inFlight.current || noStock) return

    const nextErrors: FieldErrors = {}
    const buyerName = name.trim()
    const buyerPhone = phone.trim()
    const buyerDevice = device.trim()
    const buyerCity = city.trim()
    if (!buyerCity || buyerCity.length > 100) nextErrors.city = 'Isi kota/kabupaten, maksimal 100 karakter.'
    if (!buyerName || buyerName.length > 100) nextErrors.name = 'Isi nama panggilan, maksimal 100 karakter.'
    if (!phonePattern.test(buyerPhone)) nextErrors.phone = 'Gunakan 08 atau 62, sebanyak 9–13 digit tanpa spasi.'
    if (!buyerDevice || buyerDevice.length > 200) nextErrors.device = 'Isi perangkat yang digunakan, maksimal 200 karakter.'
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0 || !variantQuery.data) return

    inFlight.current = true
    setIsSubmitting(true)
    setSubmitError('')
    try {
      let order = createdOrder
      if (!order) {
        const { data, error } = await getShopSupabase().rpc('create_order', {
          p_variant_id: variantQuery.data.id,
          p_buyer_name: buyerName,
          p_buyer_phone: buyerPhone,
          p_buyer_device: buyerDevice,
          p_buyer_city: buyerCity
        })
        if (error) {
          if (error.message === 'no_stock') {
            setNoStock(true)
          } else if (error.message === 'invalid_phone') {
            setErrors({ phone: 'Gunakan 08 atau 62, sebanyak 9–13 digit tanpa spasi.' })
          } else {
            setSubmitError('Terjadi kesalahan. Coba lagi.')
          }
          return
        }
        if (!data || typeof data.order_id !== 'string' || typeof data.order_code !== 'string'
          || typeof data.token !== 'string' || typeof data.expires_at !== 'string') {
          throw new Error('invalid_order_response')
        }
        order = {
          order_id: data.order_id, order_code: data.order_code,
          token: data.token, expires_at: data.expires_at
        }
        // Keep the same result for retry if sessionStorage is temporarily unavailable.
        setCreatedOrder(order)
      }
      sessionStorage.setItem('gr_order', JSON.stringify(order))
      navigate(`/shop/order/${order.order_code}`)
    } catch {
      setSubmitError('Terjadi kesalahan. Coba lagi.')
    } finally {
      inFlight.current = false
      setIsSubmitting(false)
    }
  }

  if (!validId || (variantQuery.isSuccess && !variantQuery.data)) {
    return <Navigate to="/shop" replace />
  }

  const variant = variantQuery.data
  const fieldsDisabled = isSubmitting || noStock || createdOrder !== null

  return (
    <main className="min-h-screen bg-greenroom-bg px-5 py-10 font-greenroom-sans text-greenroom-ink">
      <div className="mx-auto max-w-2xl">
        {variantQuery.isPending && <p role="status">Memuat varian…</p>}
        {variantQuery.isError && (
          <div role="alert" className="space-y-4">
            <p className="text-greenroom-danger">Terjadi kesalahan. Coba lagi.</p>
            <button type="button" className={buttonClass} onClick={() => variantQuery.refetch()}>Coba lagi</button>
          </div>
        )}
        {variant && (
          <>
            <section aria-label="Ringkasan pilihan" className="mb-5 rounded-greenroom-card border border-greenroom-border bg-greenroom-tint p-5">
              <h2 className="text-lg font-bold">{variant.product.name}</h2>
              <p className="mt-1 text-greenroom-muted">
                {variant.account_type === 'sharing' ? 'Sharing' : 'Private'} · {variant.duration_days === 30 ? '1 bulan' : `${variant.duration_days} hari`}
              </p>
              <p className="mt-2 text-xl font-extrabold">Rp {new Intl.NumberFormat('id-ID').format(variant.price)}</p>
            </section>
            <section className="rounded-greenroom-card border border-greenroom-border p-5 sm:p-8">
              <h1 className="text-2xl font-extrabold">Daftarkan perangkat login</h1>
              <p className="mt-2 mb-6 text-sm leading-relaxed text-greenroom-muted">
                Akun hanya boleh dipakai di satu perangkat. Isi data di bawah dengan benar, karena data ini dipakai admin saat memverifikasi.
              </p>
              <form noValidate onSubmit={handleSubmit} className="space-y-5" aria-busy={isSubmitting}>
                <fieldset disabled={fieldsDisabled}>
                  <legend className="text-sm font-bold">Jenis perangkat</legend>
                  <div className="mt-2 flex gap-3">
                    {['Komputer', 'HP'].map((kind) => <button key={kind} type="button" aria-pressed={device === kind}
                      className={`${buttonClass} ${device === kind ? 'border-greenroom-primary bg-greenroom-tint' : ''}`}
                      onClick={() => setDevice(kind)}>{kind}</button>)}
                  </div>
                  {errors.device && <p role="alert" className="mt-2 text-sm text-greenroom-danger">{errors.device}</p>}
                </fieldset>
                <div>
                  <label htmlFor="shop-buyer-city" className="text-sm font-bold">Kota / Kabupaten</label>
                  <input id="shop-buyer-city" type="text" required maxLength={100} autoComplete="address-level2"
                    className={inputClass} value={city} disabled={fieldsDisabled} aria-invalid={!!errors.city}
                    aria-describedby={errors.city ? 'shop-city-error' : undefined} onChange={(event) => setCity(event.target.value)} />
                  {errors.city && <p id="shop-city-error" role="alert" className="mt-2 text-sm text-greenroom-danger">{errors.city}</p>}
                </div>
                <div>
                  <label htmlFor="shop-buyer-name" className="text-sm font-bold">Nama panggilan / inisial</label>
                  <input id="shop-buyer-name" type="text" autoComplete="nickname" required maxLength={100}
                    className={inputClass} value={name} disabled={fieldsDisabled}
                    aria-invalid={!!errors.name} aria-describedby={errors.name ? 'shop-name-error' : undefined}
                    onChange={(event) => setName(event.target.value)} />
                  {errors.name && <p id="shop-name-error" role="alert" className="mt-2 text-sm text-greenroom-danger">{errors.name}</p>}
                </div>
                <div>
                  <label htmlFor="shop-buyer-phone" className="text-sm font-bold">Nomor WhatsApp</label>
                  <input id="shop-buyer-phone" type="text" inputMode="tel" autoComplete="tel" required
                    pattern="(08|62)[0-9]{7,11}" minLength={9} maxLength={13} placeholder="08xxxxxxxxx atau 62xxxxxxxxx"
                    className={inputClass} value={phone} disabled={fieldsDisabled}
                    aria-invalid={!!errors.phone} aria-describedby={`shop-phone-hint${errors.phone ? ' shop-phone-error' : ''}`}
                    onChange={(event) => setPhone(event.target.value)} />
                  <p id="shop-phone-hint" className="mt-2 text-sm text-greenroom-muted">Admin menghubungi nomor ini bila ada kendala.</p>
                  {errors.phone && <p id="shop-phone-error" role="alert" className="mt-2 text-sm text-greenroom-danger">{errors.phone}</p>}
                </div>
                {noStock && <p role="alert" className="text-greenroom-danger">Stok habis. Silakan pilih varian lain.</p>}
                {submitError && <p role="alert" className="text-greenroom-danger">{submitError}</p>}
                <div className="flex flex-wrap gap-3 pt-2">
                  <Link to="/shop" className={buttonClass}>Kembali ke katalog</Link>
                  <button type="submit" disabled={isSubmitting || noStock}
                    className={`${buttonClass} flex-1 border-greenroom-primary bg-greenroom-primary text-greenroom-bg hover:bg-greenroom-primary-hover disabled:cursor-not-allowed disabled:opacity-50`}>
                    {isSubmitting ? 'Membuat pesanan…' : submitError ? 'Coba lagi' : 'Lanjut ke pembayaran'}
                  </button>
                </div>
              </form>
            </section>
          </>
        )}
      </div>
    </main>
  )
}

export default function ShopOrder() {
  const { varianId } = useParams()
  return <QueryClientProvider client={queryClient}><BuyerForm key={varianId} /></QueryClientProvider>
}
