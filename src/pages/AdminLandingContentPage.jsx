import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase'
import {
  DEFAULT_LANDING_CONTENT,
  LANDING_CONTENT_GROUPS,
  LANDING_CONTENT_FIELDS,
  mergeLandingContentRows
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

  const fetchContent = async () => {
    setLoading(true)
    setErrorMessage('')

    const { data, error } = await supabase
      .from('landing_content')
      .select('content_key, content_value')

    if (error) {
      setErrorMessage('Gagal mengambil konten landing page. Pastikan SQL supabase/h6-admin-landing-revision-update.sql sudah dijalankan. Detail: ' + error.message)
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
    if (!window.confirm('Reset semua teks ke default bawaan aplikasi?')) return
    setForm(DEFAULT_LANDING_CONTENT)
  }

  const saveContent = async () => {
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
      setErrorMessage('Gagal menyimpan konten landing page. Detail: ' + error.message)
    } else {
      alert('Konten landing page berhasil disimpan.')
      fetchContent()
    }

    setSaving(false)
  }

  const renderInput = (field) => {
    const value = form[field.key] ?? fieldsByKey[field.key]?.defaultValue ?? ''

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
          <p className="text-xs text-gray-400 mb-1">Admin / Landing Page</p>
          <h2 className="text-2xl font-bold text-gray-900">Editor Teks Landing Page</h2>
          <p className="text-sm text-gray-500 mt-1">Ubah teks yang tampil di halaman utama tanpa mengubah kode.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={resetToDefault} className="bg-white border border-gray-200 text-gray-700 px-4 py-3 rounded-xl text-sm hover:bg-gray-50">
            Reset Default
          </button>
          <button onClick={saveContent} disabled={saving || loading} className="bg-gray-900 text-white px-5 py-3 rounded-xl text-sm hover:bg-gray-800 disabled:opacity-50">
            {saving ? 'Menyimpan...' : 'Simpan Konten'}
          </button>
        </div>
      </div>

      {errorMessage && (
        <div className="border border-red-200 bg-red-50 rounded-2xl p-4 text-sm text-red-700">
          {errorMessage}
        </div>
      )}

      {loading ? (
        <div className="bg-white rounded-2xl shadow-sm p-10 text-center text-gray-400">Memuat konten...</div>
      ) : (
        <div className="space-y-5">
          {LANDING_CONTENT_GROUPS.map((group) => (
            <div key={group.title} className="bg-white rounded-2xl shadow-sm p-5">
              <h3 className="font-bold text-gray-900 mb-4">{group.title}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {group.fields.map((field) => (
                  <div key={field.key} className={field.type === 'textarea' ? 'md:col-span-2' : ''}>
                    <label className="block text-sm text-gray-600 mb-1">{field.label}</label>
                    {renderInput(field)}
                    <p className="text-[11px] text-gray-400 mt-1">Key: {field.key}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default AdminLandingContentPage
