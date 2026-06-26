import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase'
import {
  DEFAULT_SITE_BRANDING,
  SITE_BRANDING_FIELDS,
  SITE_BRANDING_KEYS,
  applySiteBrandingToHead,
  mergeSiteBrandingRows
} from '../utils/siteBranding'

const SITE_ASSETS_BUCKET = 'site-assets'
const MAX_IMAGE_SIZE = 2 * 1024 * 1024
const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'image/x-icon', 'image/vnd.microsoft.icon']

function AdminSiteBrandingPage({ user }) {
  const [form, setForm] = useState(DEFAULT_SITE_BRANDING)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadingKey, setUploadingKey] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  const fieldMap = useMemo(() => {
    return SITE_BRANDING_FIELDS.reduce((acc, field) => {
      acc[field.key] = field
      return acc
    }, {})
  }, [])

  const fetchBranding = async () => {
    setLoading(true)
    setErrorMessage('')

    const { data, error } = await supabase
      .from('landing_content')
      .select('content_key, content_value')
      .in('content_key', SITE_BRANDING_KEYS)

    if (error) {
      setErrorMessage('Gagal mengambil data branding. Pastikan SQL supabase/h7-site-branding-update.sql sudah dijalankan. Detail: ' + error.message)
      setForm(DEFAULT_SITE_BRANDING)
    } else {
      const nextBranding = mergeSiteBrandingRows(data || [])
      setForm(nextBranding)
      applySiteBrandingToHead(nextBranding)
    }

    setLoading(false)
  }

  useEffect(() => {
    fetchBranding()
  }, [])

  const updateField = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }))
  }

  const resetToDefault = () => {
    if (!window.confirm('Reset pengaturan branding dan SEO ke default GreenroomID?')) return
    setForm(DEFAULT_SITE_BRANDING)
  }

  const saveBranding = async () => {
    setSaving(true)
    setErrorMessage('')

    const rows = SITE_BRANDING_FIELDS.map((field, index) => ({
      content_key: field.key,
      content_value: form[field.key] ?? field.defaultValue ?? '',
      label: field.label,
      group_name: 'Branding & SEO',
      sort_order: 100 + index,
      updated_by: user.id,
      updated_at: new Date().toISOString()
    }))

    const { error } = await supabase
      .from('landing_content')
      .upsert(rows, { onConflict: 'content_key' })

    if (error) {
      setErrorMessage('Gagal menyimpan branding. Detail: ' + error.message)
    } else {
      applySiteBrandingToHead(form)
      alert('Branding dan SEO berhasil disimpan.')
      fetchBranding()
    }

    setSaving(false)
  }

  const uploadImage = async (event, targetKey) => {
    const file = event.target.files?.[0]
    event.target.value = ''

    if (!file) return

    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      setErrorMessage('Format gambar tidak didukung. Gunakan PNG, JPG, WEBP, SVG, atau ICO.')
      return
    }

    if (file.size > MAX_IMAGE_SIZE) {
      setErrorMessage('Ukuran gambar maksimal 2 MB.')
      return
    }

    setUploadingKey(targetKey)
    setErrorMessage('')

    const extension = file.name.split('.').pop()?.toLowerCase() || 'png'
    const filePath = `branding/${targetKey}-${Date.now()}.${extension}`

    const { error: uploadError } = await supabase.storage
      .from(SITE_ASSETS_BUCKET)
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type
      })

    if (uploadError) {
      setErrorMessage('Upload gagal. Pastikan bucket Supabase Storage "site-assets" sudah dibuat melalui SQL h7-site-branding-update.sql. Detail: ' + uploadError.message)
      setUploadingKey('')
      return
    }

    const { data } = supabase.storage
      .from(SITE_ASSETS_BUCKET)
      .getPublicUrl(filePath)

    updateField(targetKey, data.publicUrl)
    setUploadingKey('')
  }

  const renderInput = (field) => {
    const value = form[field.key] ?? fieldMap[field.key]?.defaultValue ?? ''

    if (field.type === 'textarea') {
      return (
        <textarea
          value={value}
          onChange={(event) => updateField(field.key, event.target.value)}
          rows={4}
          className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
      )
    }

    return (
      <input
        type="text"
        value={value}
        onChange={(event) => updateField(field.key, event.target.value)}
        className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
      />
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <p className="text-xs text-gray-400 mb-1">Admin / Branding & SEO</p>
          <h2 className="text-2xl font-bold text-gray-900">Branding & SEO Website</h2>
          <p className="text-sm text-gray-500 mt-1">
            Ubah nama situs, judul Google, deskripsi, canonical URL, favicon, dan gambar preview share.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={resetToDefault} className="bg-white border border-gray-200 text-gray-700 px-4 py-3 rounded-xl text-sm hover:bg-gray-50">
            Reset Default
          </button>
          <button onClick={saveBranding} disabled={saving || loading || uploadingKey} className="bg-gray-900 text-white px-5 py-3 rounded-xl text-sm hover:bg-gray-800 disabled:opacity-50">
            {saving ? 'Menyimpan...' : 'Simpan Branding'}
          </button>
        </div>
      </div>

      {errorMessage && (
        <div className="border border-red-200 bg-red-50 rounded-2xl p-4 text-sm text-red-700">
          {errorMessage}
        </div>
      )}

      <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 text-sm text-blue-800">
        Favicon untuk pencarian Google sebaiknya berbentuk persegi, jelas pada ukuran kecil, dan minimal 48×48 px. Setelah disimpan dan di-deploy, Google tetap butuh waktu untuk memperbarui tampilan hasil pencarian.
      </div>

      {loading ? (
        <div className="bg-white rounded-2xl shadow-sm p-10 text-center text-gray-400">Memuat branding...</div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-[1.4fr_0.8fr] gap-5">
          <div className="bg-white rounded-2xl shadow-sm p-5 space-y-4">
            <h3 className="font-bold text-gray-900">Pengaturan Utama</h3>
            {SITE_BRANDING_FIELDS.map((field) => (
              <div key={field.key}>
                <label className="block text-sm text-gray-600 mb-1">{field.label}</label>
                {renderInput(field)}
                <p className="text-[11px] text-gray-400 mt-1">Key: {field.key}</p>
              </div>
            ))}
          </div>

          <div className="space-y-5">
            <div className="bg-white rounded-2xl shadow-sm p-5">
              <h3 className="font-bold text-gray-900 mb-3">Upload Favicon</h3>
              <div className="border border-gray-200 rounded-2xl p-4 mb-4 flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-gray-100 border border-gray-200 flex items-center justify-center overflow-hidden">
                  {form.site_favicon_url ? (
                    <img src={form.site_favicon_url} alt="Preview favicon" className="w-10 h-10 object-contain" />
                  ) : (
                    <span className="text-gray-400 text-xs">Icon</span>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900">Ikon pencarian Google</p>
                  <p className="text-xs text-gray-500 break-all">{form.site_favicon_url || 'Belum ada favicon'}</p>
                </div>
              </div>
              <label className="block cursor-pointer bg-gray-900 text-white px-4 py-3 rounded-xl text-sm text-center hover:bg-gray-800 transition">
                {uploadingKey === 'site_favicon_url' ? 'Mengupload...' : 'Pilih Gambar Favicon'}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml,image/x-icon"
                  onChange={(event) => uploadImage(event, 'site_favicon_url')}
                  disabled={uploadingKey === 'site_favicon_url'}
                  className="hidden"
                />
              </label>
            </div>

            <div className="bg-white rounded-2xl shadow-sm p-5">
              <h3 className="font-bold text-gray-900 mb-3">Upload Gambar Share</h3>
              <div className="border border-gray-200 rounded-2xl p-3 mb-4 bg-gray-50">
                {form.site_og_image_url ? (
                  <img src={form.site_og_image_url} alt="Preview share" className="w-full aspect-video object-cover rounded-xl" />
                ) : (
                  <div className="w-full aspect-video rounded-xl bg-white border border-dashed border-gray-300 flex items-center justify-center text-xs text-gray-400">
                    Belum ada gambar preview
                  </div>
                )}
              </div>
              <label className="block cursor-pointer bg-white border border-gray-200 text-gray-700 px-4 py-3 rounded-xl text-sm text-center hover:bg-gray-50 transition">
                {uploadingKey === 'site_og_image_url' ? 'Mengupload...' : 'Pilih Gambar Preview'}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(event) => uploadImage(event, 'site_og_image_url')}
                  disabled={uploadingKey === 'site_og_image_url'}
                  className="hidden"
                />
              </label>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default AdminSiteBrandingPage
