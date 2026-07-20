import { useEffect, useMemo, useRef, useState } from 'react'

import { supabase } from '../supabase'
import {
  DEFAULT_LANDING_CONTENT,
  LANDING_BACKGROUND_DEFAULT,
  LANDING_CONTENT_FIELDS,
  LANDING_CONTENT_GROUPS,
  mergeLandingContentRows
} from '../utils/landingContent'

const BACKGROUND_BUCKET = 'landing-assets'
const MAX_BACKGROUND_SIZE = 5 * 1024 * 1024
const ALLOWED_BACKGROUND_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif']

function AdminLandingContentPage({ user }) {
  const backgroundInputRef = useRef(null)

  const [form, setForm] = useState(DEFAULT_LANDING_CONTENT)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadingBackground, setUploadingBackground] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [backgroundMessage, setBackgroundMessage] = useState('')

  const fieldsByKey = useMemo(() => {
    return LANDING_CONTENT_FIELDS.reduce((acc, field) => {
      acc[field.key] = field
      return acc
    }, {})
  }, [])

  const fetchContent = async () => {
    setLoading(true)
    setErrorMessage('')

    const { data, error } = await supabase
      .from('landing_content')
      .select('content_key, content_value')

    if (error) {
      setErrorMessage(
        `Gagal mengambil konten landing page. Pastikan tabel landing_content dan policy admin sudah tersedia. Detail: ${error.message}`
      )
      setForm(DEFAULT_LANDING_CONTENT)
    } else {
      setForm(mergeLandingContentRows(data || []))
    }

    setLoading(false)
  }

  useEffect(() => {
    fetchContent()
  }, [])

  const updateField = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }))
  }

  const resetToDefault = () => {
    if (!window.confirm('Reset semua konten Landing V5 ke default bawaan aplikasi?')) return
    setForm(DEFAULT_LANDING_CONTENT)
    setBackgroundMessage('Nilai default sudah dimuat. Tekan Simpan Konten untuk menerapkannya.')
  }

  const saveContent = async () => {
    if (!user?.id) {
      setErrorMessage('Sesi admin tidak ditemukan. Silakan login ulang.')
      return
    }

    setSaving(true)
    setErrorMessage('')

    const rows = LANDING_CONTENT_FIELDS.map((field, index) => ({
      content_key: field.key,
      content_value: form[field.key] ?? '',
      label: field.label,
      group_name: field.groupTitle,
      sort_order: index + 1,
      updated_by: user.id,
      updated_at: new Date().toISOString()
    }))

    const { error } = await supabase
      .from('landing_content')
      .upsert(rows, { onConflict: 'content_key' })

    if (error) {
      setErrorMessage(`Gagal menyimpan konten landing page. Detail: ${error.message}`)
    } else {
      window.alert('Konten Landing V5 berhasil disimpan.')
      await fetchContent()
    }

    setSaving(false)
  }

  const uploadBackground = async (file) => {
    setBackgroundMessage('')
    setErrorMessage('')

    if (!file) return

    if (!ALLOWED_BACKGROUND_TYPES.includes(file.type)) {
      setErrorMessage('Format gambar harus JPG, PNG, WebP, atau AVIF.')
      return
    }

    if (file.size > MAX_BACKGROUND_SIZE) {
      setErrorMessage('Ukuran gambar maksimal 5 MB. Kompres gambar terlebih dahulu agar landing tetap ringan.')
      return
    }

    setUploadingBackground(true)

    try {
      const extension = file.name.split('.').pop()?.toLowerCase() || 'webp'
      const filePath = `backgrounds/landing-${Date.now()}.${extension}`

      const { error: uploadError } = await supabase.storage
        .from(BACKGROUND_BUCKET)
        .upload(filePath, file, {
          cacheControl: '3600',
          contentType: file.type,
          upsert: false
        })

      if (uploadError) throw uploadError

      const { data } = supabase.storage.from(BACKGROUND_BUCKET).getPublicUrl(filePath)
      const publicUrl = data?.publicUrl

      if (!publicUrl) throw new Error('URL publik gambar tidak berhasil dibuat.')

      updateField('landing_background_url', publicUrl)
      setBackgroundMessage(
        'Gambar berhasil diunggah. Periksa preview lalu tekan Simpan Konten agar background dipakai di landing.'
      )
    } catch (error) {
      setErrorMessage(
        `Gagal mengunggah background. Jalankan SQL supabase/h7-landing-v5-admin-background.sql satu kali di Supabase SQL Editor. Detail: ${error.message}`
      )
    } finally {
      setUploadingBackground(false)
      if (backgroundInputRef.current) backgroundInputRef.current.value = ''
    }
  }

  const renderBackgroundInput = (field) => {
    const value = form[field.key] || LANDING_BACKGROUND_DEFAULT

    return (
      <div className="space-y-3">
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-gray-950">
          <div className="aspect-[16/7] w-full">
            <img
              src={value}
              alt="Preview background landing"
              className="h-full w-full object-cover"
              style={{ objectPosition: form.landing_background_position || 'center center' }}
              onError={(event) => {
                if (event.currentTarget.src.endsWith(LANDING_BACKGROUND_DEFAULT)) return
                event.currentTarget.src = LANDING_BACKGROUND_DEFAULT
              }}
            />
          </div>
        </div>

        <input
          type="text"
          value={value}
          onChange={(event) => updateField(field.key, event.target.value)}
          placeholder="/landing/nama-gambar.webp atau URL https://..."
          className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        />

        <input
          ref={backgroundInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          className="hidden"
          onChange={(event) => uploadBackground(event.target.files?.[0])}
        />

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => backgroundInputRef.current?.click()}
            disabled={uploadingBackground}
            className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {uploadingBackground ? 'Mengunggah...' : 'Upload Gambar Baru'}
          </button>
          <button
            type="button"
            onClick={() => {
              updateField('landing_background_url', LANDING_BACKGROUND_DEFAULT)
              setBackgroundMessage('Background default dipilih. Tekan Simpan Konten untuk menerapkannya.')
            }}
            className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            Gunakan Gambar Default
          </button>
        </div>

        <p className="text-xs leading-relaxed text-gray-500">
          Disarankan WebP 1600×900 atau 1920×1080, maksimal 5 MB. Upload tersimpan di Supabase Storage.
        </p>

        {backgroundMessage && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {backgroundMessage}
          </div>
        )}
      </div>
    )
  }

  const renderInput = (field) => {
    const value = form[field.key] ?? fieldsByKey[field.key]?.defaultValue ?? ''

    if (field.type === 'background') return renderBackgroundInput(field)

    if (field.type === 'textarea') {
      return (
        <textarea
          value={value}
          onChange={(event) => updateField(field.key, event.target.value)}
          rows={4}
          className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
      )
    }

    if (field.type === 'select') {
      return (
        <select
          value={value}
          onChange={(event) => updateField(field.key, event.target.value)}
          className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        >
          {(field.options || []).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )
    }

    return (
      <input
        type="text"
        value={value}
        onChange={(event) => updateField(field.key, event.target.value)}
        className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
      />
    )
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="mb-1 text-xs text-gray-400">Admin / Landing Page</p>
          <h2 className="text-2xl font-bold text-gray-900">Editor Landing Page V5</h2>
          <p className="mt-1 max-w-3xl text-sm text-gray-500">
            Ubah background, header, empat scene, statistik, menu, dan tombol landing tanpa menyentuh source code.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <a
            href="/"
            target="_blank"
            rel="noreferrer"
            className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            Preview Landing
          </a>
          <button
            type="button"
            onClick={resetToDefault}
            className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            Reset Default
          </button>
          <button
            type="button"
            onClick={saveContent}
            disabled={saving || loading || uploadingBackground}
            className="rounded-xl bg-gray-900 px-5 py-3 text-sm font-semibold text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? 'Menyimpan...' : 'Simpan Konten'}
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm leading-relaxed text-blue-800">
        Upload background membutuhkan bucket <strong>landing-assets</strong>. Jalankan file SQL yang disertakan satu kali sebelum upload pertama.
      </div>

      {errorMessage && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm leading-relaxed text-red-700">
          {errorMessage}
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl bg-white p-10 text-center text-gray-400 shadow-sm">
          Memuat konten...
        </div>
      ) : (
        <div className="space-y-5">
          {LANDING_CONTENT_GROUPS.map((group) => (
            <section key={group.title} className="rounded-2xl bg-white p-5 shadow-sm sm:p-6">
              <div className="mb-5">
                <h3 className="font-bold text-gray-900">{group.title}</h3>
                {group.description && (
                  <p className="mt-1 text-sm text-gray-500">{group.description}</p>
                )}
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {group.fields.map((field) => {
                  const fullWidth = field.type === 'textarea' || field.type === 'background'

                  return (
                    <div key={field.key} className={fullWidth ? 'md:col-span-2' : ''}>
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        {field.label}
                      </label>
                      {renderInput(field)}
                      {field.helper && (
                        <p className="mt-1 text-xs text-gray-500">{field.helper}</p>
                      )}
                      <p className="mt-1 text-[11px] text-gray-400">Key: {field.key}</p>
                    </div>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

export default AdminLandingContentPage
