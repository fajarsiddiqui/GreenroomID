import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase'

const fallbackServices = [
  {
    slug: 'image_to_table',
    title: 'Image to Table',
    description: 'Susun banyak gambar ke tabel rapi, atur ukuran kertas, caption, layout, lalu download hasilnya ke PDF.',
    status: 'active',
    status_message: 'Layanan bisa digunakan.',
    icon: '🖼️',
    route_path: '/image-to-table',
    total_usage: 0,
    download_pdf_count: 0,
    print_count: 0
  },
  {
    slug: 'daftar_hadir',
    title: 'Daftar Hadir',
    description: 'Buat daftar hadir rapor dengan kolom, baris, data, tanda tangan, dan export dokumen dari browser.',
    status: 'active',
    status_message: 'Layanan bisa digunakan.',
    icon: '📋',
    route_path: '/daftar-hadir',
    total_usage: 0,
    download_pdf_count: 0,
    print_count: 0
  }
]

const statusOptions = [
  { value: 'active', label: 'Aktif' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'inactive', label: 'Nonaktif' }
]

const statusClass = {
  active: 'bg-green-50 text-green-700 border-green-100',
  maintenance: 'bg-amber-50 text-amber-700 border-amber-100',
  inactive: 'bg-gray-100 text-gray-600 border-gray-200'
}

function AdminFreeServicesPage() {
  const [services, setServices] = useState(fallbackServices)
  const [drafts, setDrafts] = useState({})
  const [loading, setLoading] = useState(true)
  const [savingSlug, setSavingSlug] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  const fetchServices = async () => {
    setLoading(true)
    setErrorMessage('')

    const { data, error } = await supabase.rpc('get_free_service_admin_stats')

    if (error) {
      setErrorMessage('Gagal mengambil data layanan gratis. Jalankan SQL supabase/h12-daftar-hadir-free-service-update.sql setelah SQL H11. Detail: ' + error.message)
      setServices(fallbackServices)
      setDrafts(Object.fromEntries(fallbackServices.map((service) => [service.slug, {
        status: service.status,
        status_message: service.status_message || ''
      }])))
    } else {
      const rows = data?.length ? data : fallbackServices
      setServices(rows)
      setDrafts(Object.fromEntries(rows.map((service) => [service.slug, {
        status: service.status || 'active',
        status_message: service.status_message || ''
      }])))
    }

    setLoading(false)
  }

  useEffect(() => {
    fetchServices()
  }, [])

  const totals = useMemo(() => {
    return services.reduce((acc, service) => {
      acc.usage += Number(service.total_usage || 0)
      acc.download += Number(service.download_pdf_count || 0)
      acc.print += Number(service.print_count || 0)
      acc.active += service.status === 'active' ? 1 : 0
      acc.maintenance += service.status === 'maintenance' ? 1 : 0
      acc.inactive += service.status === 'inactive' ? 1 : 0
      return acc
    }, { usage: 0, download: 0, print: 0, active: 0, maintenance: 0, inactive: 0 })
  }, [services])

  const updateDraft = (slug, field, value) => {
    setDrafts((current) => ({
      ...current,
      [slug]: {
        ...(current[slug] || {}),
        [field]: value
      }
    }))
  }

  const saveService = async (service) => {
    const draft = drafts[service.slug] || {}
    setSavingSlug(service.slug)
    setErrorMessage('')

    const { error } = await supabase.rpc('update_free_service_status', {
      p_slug: service.slug,
      p_status: draft.status || 'active',
      p_status_message: draft.status_message || ''
    })

    if (error) {
      setErrorMessage('Gagal menyimpan status layanan gratis. Detail: ' + error.message)
    } else {
      await fetchServices()
    }

    setSavingSlug('')
  }

  const formatNumber = (value) => new Intl.NumberFormat('id-ID').format(Number(value || 0))

  return (
    <div className="p-6 pt-20 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <p className="text-xs text-gray-400 mb-1">Admin / Layanan Gratis</p>
          <h2 className="text-2xl font-bold text-gray-900">Layanan Gratis</h2>
          <p className="text-sm text-gray-500 mt-1">
            Pantau penggunaan tool gratis dan atur status aktif, nonaktif, atau maintenance untuk setiap layanan.
          </p>
        </div>
        <button
          onClick={fetchServices}
          className="bg-white border border-gray-200 text-gray-700 px-4 py-3 rounded-xl text-sm hover:bg-gray-50"
        >
          Refresh Data
        </button>
      </div>

      {errorMessage && (
        <div className="border border-red-200 bg-red-50 rounded-2xl p-4 text-sm text-red-700">
          {errorMessage}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5">
          <p className="text-xs text-gray-400">Total Penggunaan</p>
          <p className="text-3xl font-black text-gray-900 mt-2">{formatNumber(totals.usage)}</p>
        </div>
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5">
          <p className="text-xs text-gray-400">Save / Export</p>
          <p className="text-3xl font-black text-gray-900 mt-2">{formatNumber(totals.download)}</p>
        </div>
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5">
          <p className="text-xs text-gray-400">Print / Save PDF</p>
          <p className="text-3xl font-black text-gray-900 mt-2">{formatNumber(totals.print)}</p>
        </div>
        <div className="bg-green-50 border border-green-100 rounded-2xl shadow-sm p-5">
          <p className="text-xs text-green-700">Aktif</p>
          <p className="text-3xl font-black text-green-800 mt-2">{formatNumber(totals.active)}</p>
        </div>
        <div className="bg-amber-50 border border-amber-100 rounded-2xl shadow-sm p-5">
          <p className="text-xs text-amber-700">Maintenance / Nonaktif</p>
          <p className="text-3xl font-black text-amber-800 mt-2">{formatNumber(totals.maintenance + totals.inactive)}</p>
        </div>
      </div>

      {loading && (
        <div className="bg-white rounded-2xl shadow-sm p-10 text-center text-gray-400">Memuat layanan gratis...</div>
      )}

      {!loading && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          {services.map((service) => {
            const draft = drafts[service.slug] || { status: service.status || 'active', status_message: service.status_message || '' }
            return (
              <div key={service.slug} className="bg-white border border-gray-100 rounded-3xl shadow-sm p-5">
                <div className="flex items-start justify-between gap-4 mb-5">
                  <div className="flex items-start gap-4 min-w-0">
                    <div className="h-12 w-12 rounded-2xl bg-gray-100 flex items-center justify-center text-2xl shrink-0">
                      {service.icon || '🎁'}
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-xl font-black text-gray-900">{service.title}</h3>
                      <p className="text-sm text-gray-500 mt-1 leading-relaxed">{service.description}</p>
                      <p className="text-xs text-gray-400 mt-2">Slug: {service.slug}</p>
                    </div>
                  </div>
                  <span className={'text-xs font-bold border rounded-full px-3 py-1 shrink-0 ' + (statusClass[service.status] || statusClass.inactive)}>
                    {statusOptions.find((item) => item.value === service.status)?.label || 'Nonaktif'}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
                  <div className="rounded-2xl bg-gray-50 border border-gray-100 p-4">
                    <p className="text-xs text-gray-400">Total</p>
                    <p className="text-2xl font-black text-gray-900 mt-1">{formatNumber(service.total_usage)}</p>
                  </div>
                  <div className="rounded-2xl bg-gray-50 border border-gray-100 p-4">
                    <p className="text-xs text-gray-400">Save / Export</p>
                    <p className="text-2xl font-black text-gray-900 mt-1">{formatNumber(service.download_pdf_count)}</p>
                  </div>
                  <div className="rounded-2xl bg-gray-50 border border-gray-100 p-4">
                    <p className="text-xs text-gray-400">Print</p>
                    <p className="text-2xl font-black text-gray-900 mt-1">{formatNumber(service.print_count)}</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="block">
                    <span className="block text-sm text-gray-600 mb-1">Status Layanan</span>
                    <select
                      value={draft.status}
                      onChange={(event) => updateDraft(service.slug, 'status', event.target.value)}
                      className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                    >
                      {statusOptions.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="block text-sm text-gray-600 mb-1">Keterangan saat nonaktif / maintenance</span>
                    <textarea
                      value={draft.status_message}
                      onChange={(event) => updateDraft(service.slug, 'status_message', event.target.value)}
                      rows={3}
                      className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                      placeholder="Contoh: Layanan sedang maintenance, coba lagi nanti."
                    />
                  </label>
                  <button
                    onClick={() => saveService(service)}
                    disabled={savingSlug === service.slug}
                    className="bg-gray-900 text-white px-5 py-3 rounded-xl text-sm hover:bg-gray-800 disabled:opacity-50"
                  >
                    {savingSlug === service.slug ? 'Menyimpan...' : 'Simpan Status'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default AdminFreeServicesPage
