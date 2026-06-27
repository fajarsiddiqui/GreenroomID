import { Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase } from '../supabase'

const fallbackFreeServices = [
  {
    slug: 'image_to_table',
    title: 'Image to Table',
    description: 'Susun banyak gambar ke tabel rapi, atur ukuran kertas, caption, layout, lalu download hasilnya ke PDF.',
    route_path: '/image-to-table',
    badge: 'Gratis',
    icon: '🖼️',
    status: 'active',
    status_message: 'Layanan bisa digunakan.'
  },
  {
    slug: 'daftar_hadir',
    title: 'Daftar Hadir',
    description: 'Buat daftar hadir rapor dengan kolom, baris, data, tanda tangan, dan export dokumen dari browser.',
    route_path: '/daftar-hadir',
    badge: 'Gratis',
    icon: '📋',
    status: 'active',
    status_message: 'Layanan bisa digunakan.'
  }
]

const statusBadge = {
  active: 'bg-green-50 text-green-700 border-green-100',
  maintenance: 'bg-amber-50 text-amber-700 border-amber-100',
  inactive: 'bg-gray-100 text-gray-600 border-gray-200'
}

const statusText = {
  active: 'Gratis',
  maintenance: 'Maintenance',
  inactive: 'Nonaktif'
}

function FreeServicesPage() {
  const [services, setServices] = useState(fallbackFreeServices)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchServices = async () => {
      setLoading(true)
      const { data, error } = await supabase.rpc('get_public_free_services')

      if (!error && Array.isArray(data) && data.length) {
        setServices(data)
      } else {
        setServices(fallbackFreeServices)
      }

      setLoading(false)
    }

    fetchServices()
  }, [])

  const renderCardContent = (service) => {
    const status = service.status || 'active'
    const isActive = status === 'active'

    return (
      <>
        <div>
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center text-2xl">
              {service.icon || '🎁'}
            </div>
            <span className={'text-xs font-bold border rounded-full px-3 py-1 ' + (statusBadge[status] || statusBadge.inactive)}>
              {statusText[status] || statusText.inactive}
            </span>
          </div>
          <h2 className="text-xl font-black text-gray-900">{service.title}</h2>
          <p className="text-sm text-gray-500 mt-2 leading-relaxed">{service.description}</p>
          {!isActive && (
            <div className="mt-4 rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-3 text-xs text-gray-600 leading-relaxed">
              {service.status_message || 'Layanan sedang belum tersedia.'}
            </div>
          )}
        </div>
        <p className={'text-sm font-bold mt-6 ' + (isActive ? 'text-green-700 group-hover:underline' : 'text-gray-400')}>
          {isActive ? 'Buka aplikasi →' : 'Belum bisa dibuka'}
        </p>
      </>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-6">
          <div>
            <Link to="/" className="text-sm font-semibold text-green-700 hover:underline">
              ← Kembali ke Landing
            </Link>
            <h1 className="text-3xl sm:text-4xl font-black text-gray-900 mt-3">Layanan Gratis</h1>
            <p className="text-gray-500 mt-2 max-w-2xl">
              Kumpulan tools ringan dari GreenroomID yang bisa dipakai langsung tanpa membuat request layanan berbayar.
            </p>
          </div>
        </div>

        {loading && (
          <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-8 text-center text-gray-400">
            Memuat layanan gratis...
          </div>
        )}

        {!loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {services.map((service) => {
              const isActive = (service.status || 'active') === 'active'
              const className =
                'group bg-white border border-gray-200 rounded-3xl p-5 min-h-56 shadow-sm transition flex flex-col justify-between ' +
                (isActive ? 'hover:-translate-y-0.5 hover:shadow-md hover:border-gray-300' : 'opacity-85 cursor-not-allowed')

              if (!isActive) {
                return (
                  <div key={service.slug} className={className}>
                    {renderCardContent(service)}
                  </div>
                )
              }

              return (
                <Link key={service.slug} to={service.route_path || '/image-to-table'} className={className}>
                  {renderCardContent(service)}
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export default FreeServicesPage
