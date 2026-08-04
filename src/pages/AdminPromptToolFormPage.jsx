import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../supabase'
import { slugifyPromptTitle, isValidPromptSlug, validatePromptDraft } from '../utils/promptTools'
import { formatMaterialDate } from '../utils/learningMaterials'
import PromptToolBuilder from '../components/admin/PromptToolBuilder'

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
      <input value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} disabled={disabled} className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 disabled:bg-gray-100 disabled:text-gray-500" />
      {hint && <p className="mt-1.5 text-xs leading-relaxed text-gray-400">{hint}</p>}
    </label>
  )
}

function TextArea({ label, value, onChange, placeholder = '', rows = 5, optional = false, hint = '' }) {
  return (
    <label className="block">
      <FieldLabel optional={optional}>{label}</FieldLabel>
      <textarea value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={rows} className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-green-400" />
      {hint && <p className="mt-1.5 text-xs leading-relaxed text-gray-400">{hint}</p>}
    </label>
  )
}

function TemplatePlaceholderInfo({ template = '', questions = [] }) {
  const [copiedPlaceholder, setCopiedPlaceholder] = useState('')
  const [copyMessage, setCopyMessage] = useState('')
  const copyTimeoutRef = useRef(null)

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current)
      }
    }
  }, [])

  const rx = /{{\s*([^}]+)\s*}}/g
  const found = []
  let m
  while ((m = rx.exec(template || '')) !== null) found.push(m[1])
  const placeholders = Array.from(new Set(found.map(s => s.trim()).filter(Boolean)))
  const knownVars = questions.map(q => q.variable_name).filter(Boolean)
  const unknown = placeholders.filter(p => !knownVars.includes(p))
  const unused = questions.filter(q => !placeholders.includes(q.variable_name))

  const handleCopy = async (placeholder) => {
    try {
      await navigator.clipboard.writeText(placeholder)
      setCopiedPlaceholder(placeholder)
      setCopyMessage('Placeholder berhasil disalin.')
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current)
      }
      copyTimeoutRef.current = setTimeout(() => {
        setCopiedPlaceholder('')
        setCopyMessage('')
      }, 1800)
    } catch {
      setCopyMessage('Placeholder belum berhasil disalin. Silakan coba lagi.')
    }
  }

  return (
    <div className="space-y-2">
      {unknown.length > 0 && <div className="rounded border border-yellow-200 bg-yellow-50 p-2 text-sm text-amber-800">Template mengandung placeholder tidak dikenal: {unknown.join(', ')}. Ini hanya peringatan.</div>}
      <div className="rounded border border-gray-100 bg-white p-2">
        <div className="font-bold">Variabel tersedia untuk template</div>
        <div className="mt-2 grid grid-cols-1 gap-1 text-xs text-gray-600">
          {knownVars.length === 0 && <div className="text-gray-400">Belum ada pertanyaan.</div>}
          {knownVars.map(v => {
            const placeholder = `{{${v}}}`
            const isCopied = copiedPlaceholder === placeholder
            return (
              <div key={v} className="flex items-center justify-between gap-2">
                <code className="rounded bg-gray-100 px-2 py-1">{placeholder}</code>
                <button
                  type="button"
                  className={`ml-2 rounded-xl border px-3 py-1 text-xs font-bold transition ${isCopied ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-green-200 text-green-700 hover:bg-green-50'}`}
                  onClick={() => handleCopy(placeholder)}
                >
                  {isCopied ? 'Tersalin ✓' : 'Salin'}
                </button>
              </div>
            )
          })}
        </div>
      </div>
      <p className="sr-only" aria-live="polite">{copyMessage}</p>
      {unused.length > 0 && <div className="text-xs text-gray-500">Pertanyaan belum digunakan di template: {unused.map(u=>u.label).slice(0,5).join(', ')}{unused.length>5?` (+${unused.length-5} lainnya)`:''}</div>}
    </div>
  )
}

const emptyForm = {
  title: '',
  slug: '',
  description: '',
  category: 'umum',
  prompt_template: '',
  submit_button_label: 'Buat Prompt',
  result_title: 'Prompt Siap Pakai',
  copy_button_label: 'Salin Prompt',
  survey_url: '',
  survey_cta: '',
  meta_title: '',
  meta_description: ''
}

function AdminPromptToolFormPage({ user }) {
  const { toolId } = useParams()
  const navigate = useNavigate()
  const isEditing = Boolean(toolId)
  const [form, setForm] = useState(emptyForm)
  const [loading, setLoading] = useState(isEditing)
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [slugEdited, setSlugEdited] = useState(false)
  const [toolStatus, setToolStatus] = useState(null)
  const [activeTab, setActiveTab] = useState('settings')
  const [questionsList, setQuestionsList] = useState([])

  useEffect(() => {
    if (!isEditing) return undefined

    let active = true
    const fetchTool = async () => {
      setLoading(true)
      const { data, error } = await supabase.from('prompt_tools').select('*').eq('id', toolId).maybeSingle()
      if (!active) return
      if (error) setErrorMessage('Gagal memuat tool. Detail: ' + error.message)
      else if (!data) setErrorMessage('Tool tidak ditemukan.')
      else {
        setForm({
          title: data.title || '',
          slug: data.slug || '',
          description: data.description || '',
          category: data.category || 'umum',
          prompt_template: data.prompt_template || '',
          submit_button_label: data.submit_button_label || 'Buat Prompt',
          result_title: data.result_title || 'Prompt Siap Pakai',
          copy_button_label: data.copy_button_label || 'Salin Prompt',
          survey_url: data.survey_url || '',
          survey_cta: data.survey_cta || '',
          meta_title: data.meta_title || '',
          meta_description: data.meta_description || '',
          updated_at: data.updated_at || null
        })
        setToolStatus(data.status)
        setSlugEdited(true)
      }
      setLoading(false)
    }
    fetchTool()
    return () => { active = false }
  }, [isEditing, toolId])

  useEffect(() => {
    if (!isEditing) return
    ;(async () => {
      const { data } = await supabase.from('prompt_tool_questions').select('id,label,variable_name,section_id').eq('tool_id', toolId).order('sort_order', { ascending: true })
      setQuestionsList(data || [])
    })()
  }, [isEditing, toolId])
  const slugValid = useMemo(() => isValidPromptSlug(form.slug), [form.slug])

  if (loading) {
    return (
      <div className="p-8 text-center text-gray-500">Memuat data tool...</div>
    )
  }


  const updateField = (key, value) => setForm((cur) => ({ ...cur, [key]: value }))

  const updateTitle = (value) => {
    setForm((cur) => ({ ...cur, title: value, slug: slugEdited ? cur.slug : slugifyPromptTitle(value) }))
  }

  const updateSlug = (value) => {
    setSlugEdited(true)
    updateField('slug', slugifyPromptTitle(value))
  }

  const getSaveErrorMessage = (error) => {
    if (error?.code === '23505' || /prompt_tools_slug_unique|duplicate key/i.test(error?.message || '')) return 'Slug sudah digunakan oleh tool lain.'
    return 'Gagal menyimpan tool. Detail: ' + (error?.message || 'Tidak diketahui')
  }


  const handleSave = async (event) => {
    event?.preventDefault()
    setErrorMessage('')
    setSuccessMessage('')

    const validationError = validatePromptDraft(form)
    if (validationError) { setErrorMessage(validationError); return }

    setSaving(true)

    const payload = {
      title: form.title.trim(),
      slug: form.slug.trim(),
      description: form.description.trim(),
      category: form.category.trim() || 'umum',
      prompt_template: form.prompt_template.trim(),
      submit_button_label: form.submit_button_label.trim(),
      result_title: form.result_title.trim(),
      copy_button_label: form.copy_button_label.trim(),
      survey_url: form.survey_url.trim() || null,
      survey_cta: form.survey_cta.trim() || null,
      meta_title: form.meta_title.trim() || null,
      meta_description: form.meta_description.trim() || null
    }

    if (isEditing) {
      // preserve published_at and deploy fields; only update editable columns
      const { error } = await supabase.from('prompt_tools').update(payload).eq('id', toolId)
      setSaving(false)
      if (error) setErrorMessage(getSaveErrorMessage(error))
      else {
        navigate('/admin/tools', { replace: true, state: { message: 'Perubahan tool berhasil disimpan.', messageType: 'success' } })
      }
    } else {
      const { error } = await supabase.from('prompt_tools').insert({ ...payload, status: 'draft', author_id: user?.id || null }).select('id').single()
      setSaving(false)
      if (error) setErrorMessage(getSaveErrorMessage(error))
      else {
        navigate('/admin/tools', { replace: true, state: { message: 'Tool baru berhasil disimpan sebagai draft.', messageType: 'success' } })
      }
    }
  }


  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div>
          <Link to="/admin/tools" className="text-sm font-bold text-green-700 hover:underline">Kembali ke Tools</Link>
          <p className="mt-4 mb-1 text-xs text-gray-400">Admin / Tools Gratis / {isEditing ? 'Edit' : 'Baru'}</p>
          <h1 className="text-2xl font-black text-gray-900">{isEditing ? 'Edit Tool' : 'Buat Tool Baru'}</h1>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-gray-500">Kelola identitas tool dan template prompt. Builder pertanyaan akan tersedia di tahap selanjutnya.</p>
        </div>
        {isEditing && toolStatus && (
          <div className="rounded-2xl border border-gray-200 bg-white p-4 text-sm text-gray-500">
            <p>Status: <strong className="ml-2">{toolStatus}</strong></p>
            <p className="mt-3">Diperbarui: {formatMaterialDate(form.updated_at)}</p>
          </div>
        )}
      </div>

      {errorMessage && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm leading-relaxed text-red-700">{errorMessage}</div>}
      {successMessage && <div className="rounded-2xl border border-green-200 bg-green-50 p-4 text-sm leading-relaxed text-green-800">{successMessage}</div>}

      <div className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b p-4">
          <nav className="flex items-center gap-3">
            <button type="button" className={`px-3 py-2 rounded ${activeTab==='settings'?'bg-gray-900 text-white':'text-gray-600'}`} onClick={()=>setActiveTab('settings')}>Pengaturan Tool</button>
            <button type="button" className={`px-3 py-2 rounded ${activeTab==='builder'?'bg-gray-900 text-white':'text-gray-600'}`} onClick={()=>setActiveTab('builder')} disabled={!isEditing}>Form & Pertanyaan</button>
          </nav>
        </div>
        <div className="p-5 sm:p-6">
          {activeTab === 'settings' ? (
            <section className="space-y-5">
            <TextInput label="Judul tool" value={form.title} onChange={updateTitle} placeholder="Contoh: Pembantu Ide Judul" />
            <TextInput label="Slug" value={form.slug} onChange={updateSlug} placeholder="pembantu-ide-judul" hint={!slugValid && form.slug ? 'Slug tidak valid' : ''} />
            <TextArea label="Deskripsi (opsional)" value={form.description} onChange={(v) => updateField('description', v)} placeholder="Deskripsi singkat tool" rows={3} optional={true} />

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <TextInput label="Kategori" value={form.category} onChange={(v) => updateField('category', v)} placeholder="umum" />
            </div>

            <div>
              <FieldLabel>Template Prompt</FieldLabel>
              <textarea value={form.prompt_template} onChange={(e) => updateField('prompt_template', e.target.value)} placeholder="Tulis template prompt di sini..." rows={10} className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-green-400" />
              <p className="mt-2 text-xs text-gray-400">Gunakan placeholder seperti: <code className="rounded bg-gray-100 px-1 py-0.5">{'{{program_studi}}'}</code> <code className="rounded bg-gray-100 px-1 py-0.5">{'{{topik_penelitian}}'}</code></p>
            </div>

            <div className="rounded-2xl border border-gray-100 bg-white p-4">
              <TemplatePlaceholderInfo template={form.prompt_template} questions={questionsList} />
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <TextInput label="Label tombol submit" value={form.submit_button_label} onChange={(v) => updateField('submit_button_label', v)} />
              <TextInput label="Judul hasil" value={form.result_title} onChange={(v) => updateField('result_title', v)} />
              <TextInput label="Label tombol salin" value={form.copy_button_label} onChange={(v) => updateField('copy_button_label', v)} />
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <TextInput label="Survey URL (opsional)" value={form.survey_url} onChange={(v) => updateField('survey_url', v)} placeholder="https://example.com/survey" optional={true} />
              <TextInput label="Survey CTA (opsional)" value={form.survey_cta} onChange={(v) => updateField('survey_cta', v)} optional={true} />
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <TextInput label="Meta title (opsional)" value={form.meta_title} onChange={(v) => updateField('meta_title', v)} optional={true} />
              <TextInput label="Meta description (opsional)" value={form.meta_description} onChange={(v) => updateField('meta_description', v)} optional={true} />
            </div>

            <div className="flex items-center gap-3">
              <button type="button" onClick={handleSave} disabled={saving} className="rounded-xl bg-gray-900 px-6 py-3 text-sm font-black text-white hover:bg-gray-800 disabled:opacity-50">{saving ? 'Menyimpan...' : 'Simpan'}</button>
              <Link to="/admin/tools" className="text-sm font-bold text-gray-500">Batal</Link>
            </div>
            </section>

          ) : (
            <div className="p-5 sm:p-6">
              <PromptToolBuilder toolId={toolId} onToolChanged={() => { /* refresh counts if needed */ }} readOnly={false} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default AdminPromptToolFormPage
