import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import ClientPortalHeader from '../components/ClientPortalHeader'

function ClientServicesPage({ user, onChooseService }) {
  const navigate = useNavigate()
  const [categories, setCategories] = useState([])
  const [selectedCategory, setSelectedCategory] = useState(null)
  const [items, setItems] = useState([])
  const [loadingCategories, setLoadingCategories] = useState(true)
  const [loadingItems, setLoadingItems] = useState(false)

  const formatRupiah = (angka) => {
    if (!angka) return '-'
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(angka)
  }

  const fetchCategories = async () => {
    setLoadingCategories(true)

    const { data, error } = await supabase
      .from('service_categories')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })

    if (error) {
      alert('Gagal mengambil kategori layanan: ' + error.message)
      setCategories([])
    } else {
      setCategories(data || [])
    }

    setLoadingCategories(false)
  }

  const fetchItems = async (category) => {
    setSelectedCategory(category)
    setLoadingItems(true)

    const { data, error } = await supabase
      .from('service_items')
      .select('*')
      .eq('category_id', category.id)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })

    if (error) {
      alert('Gagal mengambil daftar layanan: ' + error.message)
      setItems([])
    } else {
      setItems(data || [])
    }

    setLoadingItems(false)
  }

  useEffect(() => {
    fetchCategories()
  }, [])

  const chooseService = (service) => {
    const snapshot = {
      service_item_id: service.id,
      category_id: selectedCategory.id,
      category_name: selectedCategory.name,
      category_slug: selectedCategory.slug,
      service_name: service.name,
      service_slug: service.slug,
      short_description: service.short_description,
      description: service.description,
      price_start: service.price_start,
      price_end: service.price_end,
      estimated_time: service.estimated_time,
      price_note: service.price_note
    }

    localStorage.setItem('greenroomid_pending_service', JSON.stringify(snapshot))

    if (onChooseService) {
      onChooseService(snapshot)
      return
    }

    navigate('/request/new')
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <ClientPortalHeader user={user} subtitle="Portal Client · Layanan & Harga" />

      <div className="max-w-5xl mx-auto p-6">
        {selectedCategory && (
          <button
            type="button"
            onClick={() => {
              setSelectedCategory(null)
              setItems([])
            }}
            className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-green-700 hover:text-green-900"
          >
            ← Kembali ke kategori
          </button>
        )}
        {!selectedCategory && (
          <>
            <div className="bg-white rounded-3xl shadow-sm p-8 mb-6">
              <p className="inline-block bg-green-100 text-green-700 text-xs font-medium px-3 py-1 rounded-full mb-4">
                Layanan & Harga
              </p>

              <h2 className="text-3xl font-bold text-gray-900 mb-4">
                Pilih jenis layanan
              </h2>

              <p className="text-gray-600 leading-relaxed max-w-3xl">
                Pilih kategori layanan terlebih dahulu. Setelah itu kamu bisa melihat
                daftar layanan, estimasi harga, estimasi waktu, dan catatan harga.
              </p>
            </div>

            {loadingCategories && (
              <div className="bg-white rounded-2xl shadow-sm p-10 text-center">
                <p className="text-gray-400">Memuat kategori layanan...</p>
              </div>
            )}

            {!loadingCategories && categories.length === 0 && (
              <div className="bg-white rounded-2xl shadow-sm p-10 text-center">
                <p className="text-4xl mb-3">📦</p>
                <p className="text-gray-500">Belum ada kategori layanan aktif.</p>
              </div>
            )}

            {!loadingCategories && categories.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {categories.map((category) => (
                  <button
                    key={category.id}
                    onClick={() => fetchItems(category)}
                    className="bg-white rounded-3xl shadow-sm p-6 text-left hover:shadow-md transition"
                  >
                    <div className="flex items-start justify-between gap-4 mb-4">
                      <div>
                        <p className="text-4xl mb-3">{category.icon || '📌'}</p>
                        <h3 className="text-2xl font-bold text-gray-900 mb-2">
                          {category.name}
                        </h3>
                      </div>

                      <span className="text-xs bg-blue-50 text-blue-600 px-3 py-1 rounded-full">
                        Lihat daftar
                      </span>
                    </div>

                    <p className="text-sm text-gray-600 leading-relaxed">
                      {category.description || 'Lihat daftar layanan dan estimasi harga untuk kategori ini.'}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {selectedCategory && (
          <>
            <div className="bg-white rounded-3xl shadow-sm p-8 mb-6">
              <p className="text-4xl mb-4">{selectedCategory.icon || '📌'}</p>

              <p className="inline-block bg-green-100 text-green-700 text-xs font-medium px-3 py-1 rounded-full mb-4">
                {selectedCategory.name}
              </p>

              <h2 className="text-3xl font-bold text-gray-900 mb-4">
                Pilih paket layanan
              </h2>

              <p className="text-gray-600 leading-relaxed max-w-3xl">
                Estimasi harga dan waktu hanya sebagai acuan awal. Harga final akan
                dikonfirmasi admin setelah request direview.
              </p>
            </div>

            {loadingItems && (
              <div className="bg-white rounded-2xl shadow-sm p-10 text-center">
                <p className="text-gray-400">Memuat daftar layanan...</p>
              </div>
            )}

            {!loadingItems && items.length === 0 && (
              <div className="bg-white rounded-2xl shadow-sm p-10 text-center">
                <p className="text-4xl mb-3">📝</p>
                <p className="text-gray-500">Belum ada layanan aktif di kategori ini.</p>
              </div>
            )}

            {!loadingItems && items.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {items.map((service) => (
                  <button
                    key={service.id}
                    onClick={() => chooseService(service)}
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
          </>
        )}
      </div>
    </div>
  )
}

export default ClientServicesPage