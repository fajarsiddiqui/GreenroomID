import { useEffect, useMemo, useState } from 'react'

import { supabase } from '../supabase'
import {
  DEFAULT_LANDING_CONTENT,
  HOME_CARD_CONTENT,
  LANDING_CONTENT_FIELDS,
  mergeLandingContentRows,
  resolveLandingCardIcon
} from '../utils/landingContent'

function AdminLandingContentPage({ user }) {
  const [form, setForm] = useState(DEFAULT_LANDING_CONTENT)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const fieldsByKey = useMemo(() => {
    return LANDING_CONTENT_FIELDS.reduce((acc, field) => {
      acc[field.key] = field
      return acc
    }, {})
  }, [])

  const homeCardFieldKeys = useMemo(() => {
    return new Set(
      HOME_CARD_CONTENT.flatMap((card) => [card.labelKey, card.descriptionKey, card.iconKey])
    )
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
    if (!window.confirm('Reset lima Kartu Beranda ke default bawaan aplikasi?')) return

    setForm((current) => {
      const nextForm = { ...current }

      homeCardFieldKeys.forEach((key) => {
        nextForm[key] = DEFAULT_LANDING_CONTENT[key]
      })

      return nextForm
    })
  }
  const saveContent = async () => {
    if (!user?.id) {
      setErrorMessage('Sesi admin tidak ditemukan. Silakan login ulang.')
      return
    }

    setSaving(true)
    setErrorMessage('')

    const rows = LANDING_CONTENT_FIELDS
      .filter((field) => field.persist !== false)
      .map((field, index) => ({
      content_key: field.key,
      content_value: form[field.key] ?? '',
      label: field.label,
      group_name: field.groupTitle,
      sort_order: index + 1,
      updated_by: user.id,
      updated_at: new Date().toISOString()
      }))
      .filter((row) => homeCardFieldKeys.has(row.content_key))

    const { error } = await supabase
      .from('landing_content')
      .upsert(rows, { onConflict: 'content_key' })

    if (error) {
      setErrorMessage(`Gagal menyimpan konten landing page. Detail: ${error.message}`)
    } else {
      window.alert('Kartu Beranda berhasil disimpan.')
      await fetchContent()
    }

    setSaving(false)
  }

  const renderInput = (field) => {
    const value = form[field.key] ?? fieldsByKey[field.key]?.defaultValue ?? ''
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
          <h2 className="text-2xl font-bold text-gray-900">Editor Landing Page</h2>
          <p className="mt-1 max-w-3xl text-sm text-gray-500">
            Atur nama, deskripsi, dan icon lima kartu utama yang tampil di beranda.
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
            Reset Kartu
          </button>
          <button
            type="button"
            onClick={saveContent}
            disabled={saving || loading}
            className="rounded-xl bg-gray-900 px-5 py-3 text-sm font-semibold text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? 'Menyimpan...' : 'Simpan Konten'}
          </button>
        </div>
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
          <section className="rounded-2xl bg-white p-5 shadow-sm sm:p-6">
            <div className="mb-5">
              <h3 className="font-bold text-gray-900">Kartu Beranda</h3>
              <p className="mt-1 text-sm text-gray-500">
                Atur nama, deskripsi, dan icon lima kartu utama. Tujuan route dan urutan kartu tetap dikendalikan aplikasi.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              {HOME_CARD_CONTENT.map((card) => {
                const labelField = fieldsByKey[card.labelKey]
                const descriptionField = fieldsByKey[card.descriptionKey]
                const iconField = fieldsByKey[card.iconKey]
                const iconSrc = resolveLandingCardIcon(form[card.iconKey], card.defaultIcon)

                return (
                  <div key={card.id} className="rounded-2xl border border-gray-200 p-4 sm:p-5">
                    <div className="mb-4 flex items-center gap-3">
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gray-50">
                        <img
                          src={iconSrc}
                          alt=""
                          aria-hidden="true"
                          className="h-9 w-9 object-contain"
                        />
                      </div>

                      <div>
                        <h4 className="font-semibold text-gray-900">{card.defaultLabel}</h4>
                        <p className="text-xs text-gray-500">
                          Identitas dan tujuan kartu dikunci oleh aplikasi.
                        </p>
                      </div>
                    </div>

                    <div className="space-y-4">
                      {[labelField, descriptionField, iconField].map((field) => (
                        <div key={field.key}>
                          <label className="mb-1 block text-sm font-medium text-gray-700">
                            {field.label}
                          </label>
                          {renderInput(field)}
                          {field.helper && (
                            <p className="mt-1 text-xs text-amber-600">{field.helper}</p>
                          )}
                          <p className="mt-1 text-[11px] text-gray-400">Key: {field.key}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>

        </div>
      )}
    </div>
  )
}

export default AdminLandingContentPage
