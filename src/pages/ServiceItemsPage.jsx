import { Link, useParams } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase } from '../supabase'

function ServiceItemsPage() {
  const { slug } = useParams()

  const [category, setCategory] = useState(null)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  const formatRupiah = (angka) => {
    if (!angka) return '-'
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(angka)
  }

  const fetchData = async () => {
    setLoading(true)

    const { data: categoryData, error: categoryError } = await supabase
      .from('service_categories')
      .select('*')
      .eq('slug', slug)
      .eq('is_active', true)
      .single()

    if (categoryError || !categoryData) {
      setCategory(null)
      setItems([])
      setLoading(false)
      return
    }

    setCategory(categoryData)

    const { data: itemData, error: itemError } = await supabase
      .from('service_items')
      .select('*')
      .eq('category_id', categoryData.id)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })

    if (itemError) {
      alert('Gagal mengambil daftar layanan: ' + itemError.message)
      setItems([])
    } else {
      setItems(itemData || [])
    }

    setLoading(false)
  }

  useEffect(() => {
    fetchData()
    // H37: daftar layanan sengaja dimuat ulang hanya saat slug kategori berubah.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug])

  const handleChooseService = async (service) => {
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
      return_to: `/layanan/${category.slug}`
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
        <p className="text-gray-400">Memuat daftar layanan...</p>
      </div>
    )
  }

  if (!category) {
    return (
      <div className="min-h-screen bg-gray-100">
        <div className="max-w-4xl mx-auto px-6 py-10">
          <div className="bg-white rounded-3xl shadow-sm p-10 text-center">
            <p className="text-4xl mb-3">📦</p>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              Kategori tidak ditemukan
            </h1>
            <p className="text-gray-500 mb-6">
              Kategori layanan ini tidak tersedia atau sedang dinonaktifkan.
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
            <h1 className="text-2xl font-bold text-gray-900">GreenroomID</h1>
            <p className="text-sm text-gray-500">Daftar Layanan & Harga</p>
          </div>

          <div className="flex gap-3">
            <Link
              to="/layanan"
              className="bg-white text-gray-700 border border-gray-200 px-5 py-2 rounded-xl text-sm hover:bg-gray-50 transition"
            >
              Kembali
            </Link>

            <Link
              to="/"
              className="bg-gray-900 text-white px-5 py-2 rounded-xl text-sm hover:bg-gray-800 transition"
            >
              Beranda
            </Link>
          </div>
        </div>

        <div className="bg-white rounded-3xl shadow-sm p-8 mb-6">
          <p className="text-4xl mb-4">{category.icon || '📌'}</p>

          <p className="inline-block bg-green-100 text-green-700 text-xs font-medium px-3 py-1 rounded-full mb-4">
            {category.name}
          </p>

          <h2 className="text-4xl font-bold text-gray-900 mb-4">
            Pilih paket layanan
          </h2>

          <p className="text-gray-600 leading-relaxed max-w-3xl">
            {category.description ||
              'Pilih layanan yang sesuai dengan kebutuhanmu. Estimasi harga dan waktu hanya sebagai acuan awal. Harga final akan dikonfirmasi oleh admin setelah request direview.'}
          </p>
        </div>

        {items.length === 0 && (
          <div className="bg-white rounded-3xl shadow-sm p-10 text-center">
            <p className="text-4xl mb-3">📝</p>
            <h3 className="font-bold text-gray-800 mb-2">
              Belum ada layanan aktif
            </h3>
            <p className="text-sm text-gray-500">
              Layanan pada kategori ini akan muncul setelah admin menambah atau mengaktifkannya.
            </p>
          </div>
        )}

        {items.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-8">
            {items.map((service) => (
              <button
                key={service.id}
                onClick={() => handleChooseService(service)}
                className="bg-white rounded-3xl shadow-sm p-6 text-left hover:shadow-md transition"
              >
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <h3 className="text-2xl font-bold text-gray-900 mb-2">
                      {service.name}
                    </h3>
                    <p className="text-sm text-gray-600 leading-relaxed">
                      {service.short_description || 'Layanan tersedia untuk kategori ini.'}
                    </p>
                  </div>

                  <span className="text-xs bg-blue-50 text-blue-600 px-3 py-1 rounded-full shrink-0">
                    Pilih
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                  <div className="bg-gray-50 rounded-2xl p-4">
                    <p className="text-xs text-gray-400 mb-1">Estimasi Harga</p>
                    <p className="font-bold text-gray-900">
                      {service.price_start && service.price_end
                        ? `${formatRupiah(service.price_start)} - ${formatRupiah(service.price_end)}`
                        : service.price_start
                          ? `Mulai ${formatRupiah(service.price_start)}`
                          : '-'}
                    </p>
                  </div>

                  <div className="bg-gray-50 rounded-2xl p-4">
                    <p className="text-xs text-gray-400 mb-1">Estimasi Waktu</p>
                    <p className="font-bold text-gray-900">
                      {service.estimated_time || '-'}
                    </p>
                  </div>
                </div>

                {service.description && (
                  <p className="text-sm text-gray-600 leading-relaxed mb-3">
                    {service.description}
                  </p>
                )}

                {service.price_note && (
                  <div className="bg-yellow-50 border border-yellow-100 rounded-2xl p-4">
                    <p className="text-xs text-yellow-700">
                      {service.price_note}
                    </p>
                  </div>
                )}

                <div className="mt-5">
                  <span className="inline-block bg-blue-600 text-white px-5 py-3 rounded-xl text-sm font-medium">
                    Ajukan Request
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}

        <div className="bg-gray-900 rounded-3xl p-8 text-center">
          <h2 className="text-2xl font-bold text-white mb-3">
            Harga final tetap dikonfirmasi admin
          </h2>
          <p className="text-gray-300">
            Estimasi harga membantu memberi gambaran awal. Setelah request dikirim,
            admin akan meninjau detail kebutuhan, menentukan harga final, dan membuat invoice.
          </p>
        </div>

        <div className="py-8 text-center text-xs text-gray-400">
          © {new Date().getFullYear()} GreenroomID. Bantuan Tugas Digital.
        </div>
      </div>
    </div>
  )
}

export default ServiceItemsPage