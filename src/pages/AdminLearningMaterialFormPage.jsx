import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../supabase'
import {
  formatMaterialDate,
  getMaterialStatus,
  isValidMaterialSlug,
  slugifyMaterialTitle,
  validateMaterialDraft
} from '../utils/learningMaterials'

const emptyForm = {
  title: '',
  slug: '',
  excerpt: '',
  content_markdown: '',
  category: 'umum',
  meta_title: '',
  meta_description: '',
  status: 'draft'
}

function FieldLabel({ children, optional = false }) {
  return (
    <span className="mb-1.5 block text-sm font-bold text-gray-700">
      {children} {optional && <span className="font-normal text-gray-400">(opsional)</span>}
    </span>
  )
}

function TextInput({ label, value, onChange, placeholder = '', optional = false, disabled = false, hint = '' }) {
  return (
    <label className="block">
      <FieldLabel optional={optional}>{label}</FieldLabel>
      <input
        value={value || ''}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 disabled:bg-gray-100 disabled:text-gray-500"
      />
      {hint && <p className="mt-1.5 text-xs leading-relaxed text-gray-400">{hint}</p>}
    </label>
  )
}

function TextArea({ label, value, onChange, placeholder = '', rows = 5, optional = false, hint = '' }) {
  return (
    <label className="block">
      <FieldLabel optional={optional}>{label}</FieldLabel>
      <textarea
        value={value || ''}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-green-400"
      />
      {hint && <p className="mt-1.5 text-xs leading-relaxed text-gray-400">{hint}</p>}
    </label>
  )
}

function StatusBadge({ status }) {
  const item = getMaterialStatus(status)
  return <span className={'inline-flex rounded-full border px-3 py-1 text-xs font-bold ' + item.className}>{item.label}</span>
}

function AdminLearningMaterialFormPage({ user }) {
  const { materialId } = useParams()
  const navigate = useNavigate()
  const isEditing = Boolean(materialId)
  const [form, setForm] = useState(emptyForm)
  const [material, setMaterial] = useState(null)
  const [slugEdited, setSlugEdited] = useState(false)
  const [loading, setLoading] = useState(isEditing)
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    if (!isEditing) return undefined

    let active = true

    const fetchMaterial = async () => {
      setLoading(true)
      setErrorMessage('')

      const { data, error } = await supabase
        .from('learning_materials')
        .select('*')
        .eq('id', materialId)
        .maybeSingle()

      if (!active) return

      if (error) {
        setErrorMessage('Gagal memuat materi. Detail: ' + error.message)
      } else if (!data) {
        setErrorMessage('Materi tidak ditemukan.')
      } else {
        setMaterial(data)
        setForm({
          title: data.title || '',
          slug: data.slug || '',
          excerpt: data.excerpt || '',
          content_markdown: data.content_markdown || '',
          category: data.category || 'umum',
          meta_title: data.meta_title || '',
          meta_description: data.meta_description || '',
          status: data.status || 'draft'
        })
        setSlugEdited(true)
      }

      setLoading(false)
    }

    fetchMaterial()

    return () => { active = false }
  }, [isEditing, materialId])

  const updateForm = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }))
  }

  const updateTitle = (value) => {
    setForm((current) => ({
      ...current,
      title: value,
      slug: slugEdited ? current.slug : slugifyMaterialTitle(value)
    }))
  }

  const updateSlug = (value) => {
    setSlugEdited(true)
    updateForm('slug', slugifyMaterialTitle(value))
  }

  const slugValid = useMemo(() => isValidMaterialSlug(form.slug), [form.slug])

  const getSaveErrorMessage = (error) => {
    if (error?.code === '23505' || /learning_materials_slug_unique|duplicate key/i.test(error?.message || '')) {
      return 'Slug sudah digunakan oleh materi lain.'
    }

    return 'Gagal menyimpan materi. Detail: ' + (error?.message || 'Tidak diketahui')
  }

  const saveMaterial = async (event) => {
    event.preventDefault()
    setErrorMessage('')

    const validationError = validateMaterialDraft(form)
    if (validationError) {
      setErrorMessage(validationError)
      return
    }

    setSaving(true)

    const payload = {
      title: form.title.trim(),
      slug: form.slug.trim(),
      excerpt: form.excerpt.trim(),
      content_markdown: form.content_markdown.trim(),
      category: form.category.trim() || 'umum',
      meta_title: form.meta_title.trim() || null,
      meta_description: form.meta_description.trim() || null
    }

    const request = isEditing
      ? supabase.from('learning_materials').update(payload).eq('id', materialId)
      : supabase.from('learning_materials').insert({
        ...payload,
        status: 'draft',
        author_id: user?.id || null
      })

    const { error } = await request

    if (error) {
      setErrorMessage(getSaveErrorMessage(error))
      setSaving(false)
      return
    }

    navigate('/admin/materi', {
      replace: true
    })
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div>
          <Link to="/admin/materi" className="text-sm font-bold text-green-700 hover:underline">Kembali ke Materi Publik</Link>
          <p className="mt-4 mb-1 text-xs text-gray-400">Admin / Materi Publik / {isEditing ? 'Edit' : 'Baru'}</p>
          <h1 className="text-2xl font-black text-gray-900">{isEditing ? 'Edit Materi' : 'Buat Materi Baru'}</h1>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-gray-500">Simpan materi sebagai draft Markdown. Tahap ini belum menyediakan tombol Publish, halaman publik, upload file, atau Deploy Hook.</p>
        </div>
        {isEditing && material && (
          <div className="rounded-2xl border border-gray-200 bg-white p-4 text-sm text-gray-500">
            <StatusBadge status={material.status} />
            <p className="mt-3">Dibuat: {formatMaterialDate(material.created_at)}</p>
            <p className="mt-1">Diperbarui: {formatMaterialDate(material.updated_at)}</p>
          </div>
        )}
      </div>

      {errorMessage && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm leading-relaxed text-red-700">{errorMessage}</div>}

      {loading ? (
        <div className="rounded-3xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-400 shadow-sm">Memuat materi...</div>
      ) : (
        <form onSubmit={saveMaterial} className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm">
          <div className="grid grid-cols-1 gap-6 p-5 sm:p-6 xl:grid-cols-[1fr_340px]">
            <section className="space-y-5">
              <TextInput label="Judul materi" value={form.title} onChange={updateTitle} placeholder="Contoh: Panduan Membaca Artikel Ilmiah" />
              <TextInput
                label="Slug"
                value={form.slug}
                onChange={updateSlug}
                placeholder="panduan-membaca-artikel-ilmiah"
                hint={slugValid ? 'Slug valid.' : 'Gunakan huruf kecil, angka, dan tanda hubung tanpa tanda hubung di awal/akhir.'}
              />
              <TextArea label="Excerpt" value={form.excerpt} onChange={(value) => updateForm('excerpt', value)} rows={3} placeholder="Ringkasan singkat untuk daftar materi." optional hint="Draft boleh kosong, tetapi sebaiknya diisi sebelum tahap publish nanti." />
              <TextArea label="Konten Markdown" value={form.content_markdown} onChange={(value) => updateForm('content_markdown', value)} rows={18} placeholder={'## Judul bagian\n\nTulis isi materi dalam Markdown.'} optional hint="Markdown mentah akan dirender dan disanitasi di aplikasi pada tahap publik." />
            </section>

            <aside className="space-y-5">
              <section className="rounded-2xl border border-gray-200 bg-gray-50 p-5">
                <h2 className="font-black text-gray-900">Pengaturan</h2>
                <div className="mt-4 space-y-4">
                  <TextInput label="Kategori" value={form.category} onChange={(value) => updateForm('category', value)} placeholder="umum" />
                  <label className="block">
                    <FieldLabel>Status</FieldLabel>
                    <select
                      value={form.status}
                      onChange={(event) => updateForm('status', event.target.value)}
                      disabled
                      className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 disabled:bg-gray-100 disabled:text-gray-500"
                    >
                      <option value="draft">Draft</option>
                      <option value="archived">Archived</option>
                      {form.status === 'published' && <option value="published">Published</option>}
                    </select>
                    <p className="mt-1.5 text-xs leading-relaxed text-gray-400">Status tidak diubah dari form ini. Gunakan daftar materi untuk arsipkan atau pulihkan draft. Tahap ini tidak menyediakan publish.</p>
                  </label>
                </div>
              </section>

              <section className="rounded-2xl border border-gray-200 bg-white p-5">
                <h2 className="font-black text-gray-900">SEO Draft</h2>
                <div className="mt-4 space-y-4">
                  <TextInput label="Meta title" value={form.meta_title} onChange={(value) => updateForm('meta_title', value)} optional />
                  <TextArea label="Meta description" value={form.meta_description} onChange={(value) => updateForm('meta_description', value)} rows={4} optional />
                </div>
              </section>
            </aside>
          </div>

          <div className="sticky bottom-0 flex flex-col gap-3 border-t border-gray-100 bg-white/95 px-5 py-4 backdrop-blur sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <p className="text-xs leading-relaxed text-gray-400">Simpan hanya ke tabel learning_materials. Tidak ada Deploy Hook dan tidak ada upload file.</p>
            <div className="flex flex-wrap gap-2">
              <Link to="/admin/materi" className="rounded-xl border border-gray-200 px-4 py-3 text-sm font-bold text-gray-600 hover:bg-gray-50">Batal</Link>
              <button type="submit" disabled={saving} className="rounded-xl bg-gray-900 px-5 py-3 text-sm font-black text-white hover:bg-gray-800 disabled:opacity-50">{saving ? 'Menyimpan...' : 'Simpan Draft'}</button>
            </div>
          </div>
        </form>
      )}
    </div>
  )
}

export default AdminLearningMaterialFormPage
