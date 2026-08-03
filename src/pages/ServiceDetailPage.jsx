import { Link, useParams } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { applyServiceDetailNotFoundMeta, applyServiceDetailPageMeta } from '../utils/pageMeta'
import PublicFooter from '../components/PublicFooter'

function ServiceDetailPage() {
  const { categorySlug, serviceSlug } = useParams()
  const [category, setCategory] = useState(null)
  const [service, setService] = useState(null)
  const [loading, setLoading] = useState(true)
  const [errorText, setErrorText] = useState('')

  const formatRupiah = (angka) => {
    if (!angka) return '-'
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(angka)
  }

  useEffect(() => {
    let active = true

    const fetchDetail = async () => {
      setLoading(true)
      setErrorText('')

      const { data: categoryData, error: categoryError } = await supabase
        .from('service_categories')
        .select('*')
        .eq('slug', categorySlug)
        .eq('is_active', true)
        .maybeSingle()

      if (!active) return

      if (categoryError) {
        setCategory(null)
        setService(null)
        setErrorText('Layanan belum bisa dimuat saat ini.')
        setLoading(false)
        return
      }

      if (!categoryData) {
        setCategory(null)
        setService(null)
        setErrorText('Layanan tidak ditemukan atau sedang dinonaktifkan.')
        setLoading(false)
        return
      }

      const { data: serviceData, error: serviceError } = await supabase
        .from('service_items')
        .select('*')
        .eq('category_id', categoryData.id)
        .eq('slug', serviceSlug)
        .eq('is_active', true)
        .maybeSingle()

      if (!active) return

      if (serviceError) {
        setCategory(null)
        setService(null)
        setErrorText('Layanan belum bisa dimuat saat ini.')
      } else if (!serviceData) {
        setCategory(null)
        setService(null)
        setErrorText('Layanan tidak ditemukan atau sedang dinonaktifkan.')
      } else {
        setCategory(categoryData)
        setService(serviceData)
      }

      setLoading(false)
    }

    fetchDetail()

    return () => {
      active = false
    }
  }, [categorySlug, serviceSlug])

  useEffect(() => {
    if (loading) return undefined
    if (category && category.slug !== categorySlug) return undefined
    if (service && service.slug !== serviceSlug) return undefined

    if (category && service) return applyServiceDetailPageMeta({ category, service })
    return applyServiceDetailNotFoundMeta({ categorySlug, serviceSlug })
  }, [category, categorySlug, loading, service, serviceSlug])

  const handleChooseService = async () => {
    if (!category || !service) return

    const snapshot = {
      service_item_id: service.id,
      category_id: category.id,
      category_name: category.name,
      category_slug: category.slug,
      service_name: service.name,
      service_slug: service.slug,
      short_description: service.short_description,
      description: service.description,
      price_start: service.price_start,
      price_end: service.price_end,
      estimated_time: service.estimated_time,
      price_note: service.price_note,
      return_to: `/layanan/${category.slug}/${service.slug}`
    }

    localStorage.setItem('greenroomid_pending_service', JSON.stringify(snapshot))

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/request/new`
      }
    })

    if (error) alert('Error: ' + error.message)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <p className="text-gray-400">Memuat detail layanan...</p>
      </div>
    )
  }

  if (!category || !service) {
    return (
      <div className="min-h-screen bg-gray-100">
        <div className="max-w-4xl mx-auto px-6 py-10">
          <div className="bg-white rounded-3xl shadow-sm p-10 text-center">
            <p className="text-4xl mb-3">GR</p>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              Layanan tidak ditemukan
            </h1>
            <p className="text-gray-500 mb-6">
              {errorText || 'Layanan ini tidak tersedia atau sedang dinonaktifkan.'}
            </p>
            <Link
              to="/layanan"
              className="inline-block bg-gray-900 text-white px-5 py-3 rounded-xl text-sm hover:bg-gray-800 transition"
            >
              Kembali ke Daftar Layanan
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="max-w-6xl mx-auto px-6 py-6">
        <div className="flex items-center justify-between mb-10">
          <div>
            <p className="text-2xl font-bold text-gray-900">GreenroomID</p>
            <p className="text-sm text-gray-500">Detail Layanan</p>
          </div>

          <div className="flex gap-3">
            <Link
              to={`/layanan/${category.slug}`}
              className="bg-white text-gray-700 border border-gray-200 px-5 py-2 rounded-xl text-sm hover:bg-gray-50 transition"
            >
              Kembali ke Kategori
            </Link>

            <Link
              to="/"
              className="bg-gray-900 text-white px-5 py-2 rounded-xl text-sm hover:bg-gray-800 transition"
            >
              Beranda
            </Link>
          </div>
        </div>

        <nav className="mb-5 text-sm text-gray-500">
          <Link to="/" className="hover:text-gray-900">Beranda</Link>
          <span className="mx-2">/</span>
          <Link to="/layanan" className="hover:text-gray-900">Layanan</Link>
          <span className="mx-2">/</span>
          <Link to={`/layanan/${category.slug}`} className="hover:text-gray-900">{category.name}</Link>
          <span className="mx-2">/</span>
          <span className="text-gray-900 font-medium">{service.name}</span>
        </nav>

        <div className="bg-white rounded-3xl shadow-sm p-8 mb-6">
          <p className="text-4xl mb-4">{category.icon || 'GR'}</p>

          <p className="inline-block bg-green-100 text-green-700 text-xs font-medium px-3 py-1 rounded-full mb-4">
            {category.name}
          </p>

          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            {service.name}
          </h1>

          <p className="text-gray-600 leading-relaxed max-w-3xl">
            {service.short_description || 'Layanan tersedia untuk kategori ini.'}
          </p>
        </div>

        <section className="lg:hidden bg-white rounded-3xl shadow-sm p-6 mb-6">
          <h2 className="text-xl font-bold text-gray-900 mb-2">
            Siap mengajukan layanan ini?
          </h2>
          <p className="text-sm text-gray-500 leading-relaxed mb-4">
            Detail kebutuhan akan direview sebelum harga final dikonfirmasi.
          </p>
          <button
            type="button"
            onClick={handleChooseService}
            className="w-full bg-blue-600 text-white px-5 py-3 rounded-xl text-sm font-medium hover:bg-blue-700 transition"
          >
            Ajukan Request
          </button>
          <div className="mt-4 text-sm text-gray-500">
            <p className="mb-2">Masih ingin memastikan?</p>
            <div className="flex flex-wrap gap-3">
              <Link to="/faq" className="font-medium text-blue-600 hover:underline">
                Baca FAQ
              </Link>
              <Link to="/kontak" className="font-medium text-blue-600 hover:underline">
                Hubungi kami
              </Link>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 mb-6">
          <section className="bg-white rounded-3xl shadow-sm p-8">
            <h3 className="text-2xl font-bold text-gray-900 mb-4">
              Detail layanan
            </h3>
            <p className="text-gray-600 leading-relaxed whitespace-pre-line">
              {service.description || service.short_description || 'Detail layanan akan dikonfirmasi setelah request direview.'}
            </p>

            {service.price_note && (
              <div className="bg-yellow-50 border border-yellow-100 rounded-2xl p-4 mt-6">
                <p className="text-xs text-yellow-700">
                  {service.price_note}
                </p>
              </div>
            )}
          </section>

          <aside className="bg-white rounded-3xl shadow-sm p-6 h-fit">
            <div className="bg-gray-50 rounded-2xl p-4 mb-3">
              <p className="text-xs text-gray-400 mb-1">Estimasi Harga</p>
              <p className="font-bold text-gray-900">
                {service.price_start && service.price_end
                  ? `${formatRupiah(service.price_start)} - ${formatRupiah(service.price_end)}`
                  : service.price_start
                    ? `Mulai ${formatRupiah(service.price_start)}`
                    : '-'}
              </p>
            </div>

            <div className="bg-gray-50 rounded-2xl p-4 mb-5">
              <p className="text-xs text-gray-400 mb-1">Estimasi Waktu</p>
              <p className="font-bold text-gray-900">
                {service.estimated_time || '-'}
              </p>
            </div>

            <p className="text-sm text-gray-500 leading-relaxed mb-5">
              Harga final akan dikonfirmasi admin setelah detail kebutuhan request direview.
            </p>

            <button
              type="button"
              onClick={handleChooseService}
              className="w-full bg-blue-600 text-white px-5 py-3 rounded-xl text-sm font-medium hover:bg-blue-700 transition"
            >
              Ajukan Request
            </button>
            <div className="mt-4 text-sm text-gray-500">
              <p className="mb-2">Masih ingin memastikan?</p>
              <div className="flex flex-wrap gap-3">
                <Link to="/faq" className="font-medium text-blue-600 hover:underline">
                  Baca FAQ
                </Link>
                <Link to="/kontak" className="font-medium text-blue-600 hover:underline">
                  Hubungi kami
                </Link>
              </div>
            </div>
          </aside>
        </div>

        <div className="bg-gray-900 rounded-3xl p-8 text-center">
          <h2 className="text-2xl font-bold text-white mb-3">
            Harga final tetap dikonfirmasi admin
          </h2>
          <p className="text-gray-300">
            Estimasi harga membantu memberi gambaran awal. Setelah request dikirim,
            admin akan meninjau detail kebutuhan, menentukan harga final, dan membuat invoice.
          </p>
        </div>

        <section className="mt-6 rounded-3xl bg-white p-8 shadow-sm">
          <h2 className="text-2xl font-black text-gray-900">Sebelum mengajukan request</h2>
          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-gray-100 bg-gray-50 p-5">
              <h3 className="font-bold text-gray-900">Harga masih berupa estimasi</h3>
              <p className="mt-2 text-sm leading-relaxed text-gray-600">Harga final ditentukan setelah kebutuhan direview.</p>
            </div>
            <div className="rounded-2xl border border-gray-100 bg-gray-50 p-5">
              <h3 className="font-bold text-gray-900">Detail kebutuhan memengaruhi proses</h3>
              <p className="mt-2 text-sm leading-relaxed text-gray-600">Kelengkapan bahan dan kompleksitas pekerjaan diperiksa oleh admin.</p>
            </div>
            <div className="rounded-2xl border border-gray-100 bg-gray-50 p-5">
              <h3 className="font-bold text-gray-900">Invoice dibuat setelah review</h3>
              <p className="mt-2 text-sm leading-relaxed text-gray-600">Pengerjaan mengikuti detail dan harga yang telah dikonfirmasi.</p>
            </div>
          </div>
        </section>
      </div>
      <PublicFooter />
    </div>
  )
}

export default ServiceDetailPage
