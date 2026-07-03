import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../supabase'
import ClientPortalHeader from '../components/ClientPortalHeader'
import {
  ANALYSIS_TAG_OPTIONS,
  LEARNING_DISCIPLINES,
  METHOD_TAG_OPTIONS,
  SUBMISSION_EDITABLE_STATUSES,
  ensureUrl,
  generateShortCode,
  getLearningStatus,
  getSourceRecord,
  isHttpUrl,
  normalizeTags,
  parseExtraTags,
  slugify,
  splitTagsForForm
} from '../utils/learning'
import {
  createLearningDraftFromImportedFields,
  parseGreenroomLearningDocx
} from '../utils/learningDocx'

const todayIso = () => new Date().toISOString().slice(0, 10)

const emptyForm = (user) => ({
  title: '',
  excerpt: '',
  discipline: 'Pendidikan',
  studied_by_name: user?.user_metadata?.full_name || user?.user_metadata?.name || '',
  studied_at: todayIso(),
  method_tags: [],
  analysis_tags: [],
  extra_method_tags: '',
  extra_analysis_tags: '',
  summary_own_words: '',
  research_purpose: '',
  research_design: '',
  participants: '',
  variables_focus: '',
  instruments: '',
  data_analysis: '',
  analysis_flow: '',
  reported_findings: '',
  learning_points: '',
  critical_notes: '',
  references_text: '',
  source_mode: 'new',
  existing_source_id: '',
  source_title: '',
  source_authors: '',
  source_year: '',
  source_journal: '',
  source_volume_issue: '',
  source_url: '',
  doi_url: '',
  confirms_original_learning: false
})

function FieldLabel({ children, optional = false }) {
  return (
    <span className="block text-sm font-semibold text-gray-700 mb-1.5">
      {children} {optional && <span className="text-xs font-normal text-gray-400">(opsional)</span>}
    </span>
  )
}

function TextInput({ label, value, onChange, placeholder = '', type = 'text', optional = false, className = '' }) {
  return (
    <label className={'block ' + className}>
      <FieldLabel optional={optional}>{label}</FieldLabel>
      <input
        type={type}
        value={value || ''}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
      />
    </label>
  )
}

function TextArea({ label, value, onChange, placeholder = '', rows = 5, optional = false, hint = '', className = '' }) {
  return (
    <label className={'block ' + className}>
      <FieldLabel optional={optional}>{label}</FieldLabel>
      <textarea
        value={value || ''}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-green-400"
      />
      {hint && <p className="text-xs text-gray-400 mt-1.5 leading-relaxed">{hint}</p>}
    </label>
  )
}

function TagPicker({ label, options, selected, onToggle, extraValue, onExtraChange, hint }) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <div className="flex flex-wrap gap-2">
        {options.map((tag) => {
          const selectedTag = selected.includes(tag)
          return (
            <button
              type="button"
              key={tag}
              onClick={() => onToggle(tag)}
              className={'rounded-full border px-3 py-2 text-xs font-semibold transition ' + (selectedTag ? 'border-green-700 bg-green-700 text-white' : 'border-gray-200 bg-white text-gray-600 hover:border-green-300 hover:text-green-700')}
            >
              {selectedTag ? '✓ ' : ''}{tag}
            </button>
          )
        })}
      </div>
      <input
        type="text"
        value={extraValue}
        onChange={(event) => onExtraChange(event.target.value)}
        placeholder="Tambahkan tag lain, pisahkan dengan koma"
        className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm mt-3 focus:outline-none focus:ring-2 focus:ring-green-400"
      />
      <p className="text-xs text-gray-400 mt-1.5">{hint}</p>
    </div>
  )
}

function ClientLearningWritePage({ user }) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const editId = searchParams.get('edit')
  const wordInputRef = useRef(null)
  const [form, setForm] = useState(() => emptyForm(user))
  const [sources, setSources] = useState([])
  const [editingEntry, setEditingEntry] = useState(null)
  const [loading, setLoading] = useState(Boolean(editId))
  const [saving, setSaving] = useState(false)
  const [importingWord, setImportingWord] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [importReport, setImportReport] = useState(null)

  const selectedSource = useMemo(() => sources.find((source) => source.id === form.existing_source_id) || null, [sources, form.existing_source_id])

  const fetchSources = async () => {
    const { data, error } = await supabase
      .from('learning_sources')
      .select('*')
      .order('source_title', { ascending: true })

    if (error) throw error
    setSources(data || [])
  }

  const applyEntryToForm = (entry) => {
    const source = getSourceRecord(entry)
    const methodTags = splitTagsForForm(entry.method_tags || [], METHOD_TAG_OPTIONS)
    const analysisTags = splitTagsForForm(entry.analysis_tags || [], ANALYSIS_TAG_OPTIONS)

    setForm({
      ...emptyForm(user),
      title: entry.title || '',
      excerpt: entry.excerpt || '',
      discipline: entry.discipline || 'Pendidikan',
      studied_by_name: entry.studied_by_name || '',
      studied_at: entry.studied_at || todayIso(),
      method_tags: methodTags.selected,
      analysis_tags: analysisTags.selected,
      extra_method_tags: methodTags.extraText,
      extra_analysis_tags: analysisTags.extraText,
      summary_own_words: entry.summary_own_words || '',
      research_purpose: entry.research_purpose || '',
      research_design: entry.research_design || '',
      participants: entry.participants || '',
      variables_focus: entry.variables_focus || '',
      instruments: entry.instruments || '',
      data_analysis: entry.data_analysis || '',
      analysis_flow: entry.analysis_flow || '',
      reported_findings: entry.reported_findings || '',
      learning_points: entry.learning_points || '',
      critical_notes: entry.critical_notes || '',
      references_text: entry.references_text || '',
      source_mode: 'existing',
      existing_source_id: entry.source_id || source?.id || '',
      confirms_original_learning: true
    })
  }

  useEffect(() => {
    let active = true

    const loadPage = async () => {
      setLoading(Boolean(editId))
      setErrorMessage('')

      try {
        await fetchSources()

        if (editId) {
          const { data, error } = await supabase
            .from('learning_entries')
            .select(`
              *,
              source:learning_sources(*)
            `)
            .eq('id', editId)
            .maybeSingle()

          if (error) throw error
          if (!data || data.author_id !== user.id) throw new Error('Draft tidak ditemukan atau Anda tidak memiliki akses.')
          if (!SUBMISSION_EDITABLE_STATUSES.includes(data.status)) throw new Error('Hasil pembelajaran ini tidak dapat diubah pada status saat ini.')
          if (!active) return

          setEditingEntry(data)
          applyEntryToForm(data)
        }
      } catch (error) {
        if (active) setErrorMessage('Gagal memuat form. Detail: ' + (error?.message || 'Tidak diketahui'))
      } finally {
        if (active) setLoading(false)
      }
    }

    loadPage()
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId, user.id])

  const updateForm = (key, value) => setForm((current) => ({ ...current, [key]: value }))

  const toggleTag = (key, tag) => {
    setForm((current) => {
      const values = current[key] || []
      return { ...current, [key]: values.includes(tag) ? values.filter((value) => value !== tag) : [...values, tag] }
    })
  }

  const handleWordImport = async (event) => {
    const selectedFile = event.target.files?.[0]
    event.target.value = ''
    if (!selectedFile) return

    setImportingWord(true)
    setErrorMessage('')
    setSuccessMessage('')

    try {
      const parsed = await parseGreenroomLearningDocx(selectedFile)
      const imported = createLearningDraftFromImportedFields({
        fields: parsed.fields,
        defaults: emptyForm(user),
        methodOptions: METHOD_TAG_OPTIONS,
        analysisOptions: ANALYSIS_TAG_OPTIONS
      })

      setForm(imported.draft)
      setEditingEntry(null)
      setImportReport({
        fileName: selectedFile.name,
        matchedFieldCount: parsed.matchedFieldCount,
        emptyRequiredFields: parsed.emptyRequiredFields,
        warnings: imported.warnings
      })
      setSuccessMessage('Draft Word berhasil dibaca di perangkat ini. Periksa seluruh isi sebelum menyimpan atau mengirim ke admin.')
    } catch (error) {
      setErrorMessage('Draft Word belum dapat diimpor. ' + (error?.message || 'Gunakan template resmi GreenroomID.'))
    } finally {
      setImportingWord(false)
    }
  }

  const validate = (mode) => {
    if (form.title.trim().length < 12) return 'Judul hasil pembelajaran minimal 12 karakter.'
    if (form.excerpt.trim().length < 40) return 'Ringkasan untuk card minimal 40 karakter.'
    if (form.summary_own_words.trim().length < 120) return 'Ringkasan dengan kata-kata sendiri minimal 120 karakter.'
    if (!form.studied_by_name.trim()) return 'Nama pembelajar wajib diisi.'
    if (!form.studied_at) return 'Tanggal dipelajari wajib diisi.'

    if (form.source_mode === 'existing' && !form.existing_source_id) return 'Pilih artikel sumber yang tersedia atau buat sumber baru.'
    if (form.source_mode === 'new') {
      if (!form.source_title.trim()) return 'Judul artikel sumber wajib diisi.'
      if (!form.source_url.trim()) return 'Link sumber resmi atau DOI wajib diisi.'
      if (!isHttpUrl(form.source_url)) return 'Link sumber resmi harus berupa URL valid, misalnya https://doi.org/...'
      if (form.doi_url.trim() && !isHttpUrl(form.doi_url)) return 'Link DOI harus berupa URL valid bila diisi.'
    }

    if (mode === 'submitted') {
      if (!form.confirms_original_learning) return 'Centang pernyataan orisinalitas sebelum mengirim untuk review.'
      if (form.reported_findings.trim().length < 30) return 'Saat mengirim review, isi hasil utama menurut artikel minimal 30 karakter.'
      if (form.learning_points.trim().length < 30) return 'Saat mengirim review, isi hal yang dipelajari minimal 30 karakter.'
    }

    return ''
  }

  const createSource = async () => {
    const { data, error } = await supabase
      .from('learning_sources')
      .insert({
        source_title: form.source_title.trim(),
        source_authors: form.source_authors.trim() || null,
        source_year: form.source_year ? Number(form.source_year) : null,
        source_journal: form.source_journal.trim() || null,
        source_volume_issue: form.source_volume_issue.trim() || null,
        source_url: ensureUrl(form.source_url),
        doi_url: form.doi_url.trim() ? ensureUrl(form.doi_url) : null,
        discipline: form.discipline,
        created_by: user.id,
        updated_at: new Date().toISOString()
      })
      .select('*')
      .single()

    if (error) throw error
    return data
  }

  const buildPayload = (sourceId, shortCode) => ({
    source_id: sourceId,
    author_id: user.id,
    title: form.title.trim(),
    slug: slugify(form.title),
    short_code: shortCode,
    excerpt: form.excerpt.trim(),
    discipline: form.discipline,
    method_tags: normalizeTags([...form.method_tags, ...parseExtraTags(form.extra_method_tags)]),
    analysis_tags: normalizeTags([...form.analysis_tags, ...parseExtraTags(form.extra_analysis_tags)]),
    studied_by_name: form.studied_by_name.trim(),
    studied_at: form.studied_at,
    summary_own_words: form.summary_own_words.trim(),
    research_purpose: form.research_purpose.trim() || null,
    research_design: form.research_design.trim() || null,
    participants: form.participants.trim() || null,
    variables_focus: form.variables_focus.trim() || null,
    instruments: form.instruments.trim() || null,
    data_analysis: form.data_analysis.trim() || null,
    analysis_flow: form.analysis_flow.trim() || null,
    reported_findings: form.reported_findings.trim() || null,
    learning_points: form.learning_points.trim() || null,
    critical_notes: form.critical_notes.trim() || null,
    references_text: form.references_text.trim() || null,
    status: 'draft',
    published_at: null,
    updated_at: new Date().toISOString()
  })

  const saveEntry = async (event, mode = 'draft') => {
    if (event) event.preventDefault()
    setErrorMessage('')
    setSuccessMessage('')

    const validationError = validate(mode)
    if (validationError) {
      setErrorMessage(validationError)
      return
    }

    setSaving(true)

    try {
      let sourceId = form.existing_source_id
      if (form.source_mode === 'new') {
        const source = await createSource()
        sourceId = source.id
      }

      let entryId = editingEntry?.id

      if (editingEntry) {
        const { error } = await supabase
          .from('learning_entries')
          .update(buildPayload(sourceId, editingEntry.short_code))
          .eq('id', editingEntry.id)
        if (error) throw error
      } else {
        let savedEntry = null
        let lastError = null

        for (let attempt = 0; attempt < 3 && !savedEntry; attempt += 1) {
          const payload = buildPayload(sourceId, generateShortCode())
          payload.created_at = new Date().toISOString()
          const { data, error } = await supabase
            .from('learning_entries')
            .insert(payload)
            .select('id')
            .single()
          if (error) lastError = error
          else savedEntry = data
        }

        if (!savedEntry) throw lastError || new Error('Gagal membuat draft baru.')
        entryId = savedEntry.id
      }

      if (mode === 'submitted') {
        const { error } = await supabase
          .from('learning_entries')
          .update({
            status: 'submitted',
            submitted_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', entryId)
        if (error) throw error
      }

      navigate('/ruang-belajar/saya', {
        replace: true,
        state: {
          message: mode === 'submitted'
            ? 'Hasil pembelajaran berhasil dikirim untuk review admin.'
            : 'Draft hasil pembelajaran berhasil disimpan.'
        }
      })
    } catch (error) {
      setErrorMessage('Gagal menyimpan hasil pembelajaran. Detail: ' + (error?.message || 'Tidak diketahui'))
    } finally {
      setSaving(false)
    }
  }

  const currentStatus = editingEntry ? getLearningStatus(editingEntry.status) : null

  return (
    <div className="min-h-screen bg-gray-100">
      <ClientPortalHeader user={user} subtitle="Ruang Belajar · Tulis Hasil Pembelajaran" />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-7 sm:py-9">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-5">
          <div>
            <Link to="/ruang-belajar/saya" className="text-sm font-bold text-green-700 hover:underline">← Kembali ke Pembelajaran Saya</Link>
            <p className="mt-4 inline-flex rounded-full border border-green-100 bg-green-50 px-3 py-1 text-xs font-black tracking-wide text-green-700">RUANG BELAJAR GREENROOMID</p>
            <h1 className="text-2xl sm:text-3xl font-black text-gray-900 mt-3">{editingEntry ? 'Perbaiki Hasil Pembelajaran' : 'Tulis Hasil Pembelajaran Artikel'}</h1>
            <p className="text-sm text-gray-500 leading-relaxed mt-2 max-w-3xl">Tuliskan pemahaman Anda dengan kata-kata sendiri. File Word hanya dibaca di browser; yang disimpan ke GreenroomID adalah teks dan metadata yang Anda periksa di form ini.</p>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <a href="/templates/Template_Hasil_Pembelajaran_Artikel_GreenroomID_v1.docx" download className="px-4 py-3 rounded-xl border border-gray-200 bg-white text-sm font-bold text-gray-700 hover:bg-gray-50">Template Word</a>
            <button type="button" onClick={() => wordInputRef.current?.click()} disabled={importingWord || saving} className="px-4 py-3 rounded-xl bg-gray-900 text-sm font-bold text-white hover:bg-gray-800 disabled:opacity-50">{importingWord ? 'Membaca Word...' : 'Import Draft Word'}</button>
            <input ref={wordInputRef} type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={handleWordImport} className="hidden" />
          </div>
        </div>

        {currentStatus && (
          <div className="mt-5 rounded-2xl border border-gray-200 bg-white p-4 text-sm text-gray-600">
            <p>Status saat ini: <span className={'inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ml-1 ' + currentStatus.className}>{currentStatus.label}</span></p>
            {editingEntry?.review_note && <p className="mt-3 rounded-xl bg-amber-50 border border-amber-100 p-3 text-amber-900"><span className="font-bold">Catatan admin:</span> {editingEntry.review_note}</p>}
          </div>
        )}

        {errorMessage && <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{errorMessage}</div>}
        {successMessage && <div className="mt-5 rounded-2xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">{successMessage}</div>}

        {importReport && (
          <div className="mt-5 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
            <p className="font-bold">Import: {importReport.fileName}</p>
            <p className="mt-1">Field terbaca: {importReport.matchedFieldCount}. {importReport.emptyRequiredFields.length > 0 ? `Perlu dilengkapi: ${importReport.emptyRequiredFields.join(', ')}.` : 'Field inti sudah terbaca.'}</p>
            {importReport.warnings?.length > 0 && <ul className="mt-2 list-disc pl-5 space-y-1">{importReport.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}
          </div>
        )}

        {loading ? (
          <div className="mt-6 bg-white rounded-3xl border border-gray-200 p-10 text-center text-sm text-gray-400">Memuat form pembelajaran...</div>
        ) : (
          <form onSubmit={(event) => saveEntry(event, 'draft')} className="mt-6 bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="p-5 sm:p-7 space-y-9">
              <section>
                <div className="flex items-center gap-3 mb-4"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-900 text-sm font-black text-white">1</span><div><h2 className="font-black text-gray-900">Artikel sumber</h2><p className="text-xs text-gray-500">Sertakan sumber resmi. Jangan unggah PDF jurnal atau menyalin isi panjang artikel.</p></div></div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => updateForm('source_mode', 'new')} className={'px-3 py-2 rounded-xl text-sm font-bold border ' + (form.source_mode === 'new' ? 'border-green-700 bg-green-700 text-white' : 'border-gray-200 text-gray-600')}>Artikel sumber baru</button>
                  <button type="button" onClick={() => updateForm('source_mode', 'existing')} className={'px-3 py-2 rounded-xl text-sm font-bold border ' + (form.source_mode === 'existing' ? 'border-green-700 bg-green-700 text-white' : 'border-gray-200 text-gray-600')}>Gunakan sumber yang tersedia</button>
                </div>

                {form.source_mode === 'existing' ? (
                  <div className="mt-4">
                    <label className="block"><FieldLabel>Pilih artikel sumber</FieldLabel><select value={form.existing_source_id} onChange={(event) => updateForm('existing_source_id', event.target.value)} className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-400"><option value="">Pilih artikel sumber...</option>{sources.map((source) => <option key={source.id} value={source.id}>{source.source_title}{source.source_year ? ` (${source.source_year})` : ''}</option>)}</select></label>
                    {selectedSource && <div className="mt-3 rounded-xl bg-gray-50 border border-gray-100 p-3 text-xs text-gray-600"><p className="font-bold text-gray-800">{selectedSource.source_title}</p><p className="mt-1">{selectedSource.source_authors || 'Penulis belum diisi'} · {selectedSource.source_url || selectedSource.doi_url}</p></div>}
                    {sources.length === 0 && <p className="text-xs text-amber-700 mt-2">Belum ada sumber yang dapat dipilih. Gunakan “Artikel sumber baru”.</p>}
                  </div>
                ) : (
                  <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <TextInput label="Judul artikel sumber" value={form.source_title} onChange={(value) => updateForm('source_title', value)} placeholder="Judul asli artikel/jurnal" className="md:col-span-2" />
                    <TextInput label="Penulis artikel" value={form.source_authors} onChange={(value) => updateForm('source_authors', value)} placeholder="Nama penulis" optional />
                    <TextInput label="Tahun terbit" value={form.source_year} onChange={(value) => updateForm('source_year', value.replace(/[^0-9]/g, '').slice(0, 4))} placeholder="2026" optional />
                    <TextInput label="Nama jurnal / penerbit" value={form.source_journal} onChange={(value) => updateForm('source_journal', value)} placeholder="Contoh: Jurnal Pendidikan..." optional />
                    <TextInput label="Edisi sumber" value={form.source_volume_issue} onChange={(value) => updateForm('source_volume_issue', value)} placeholder="Opsional, misalnya Vol. 1 No. 2" optional />
                    <TextInput label="Link sumber resmi atau DOI" value={form.source_url} onChange={(value) => updateForm('source_url', value)} placeholder="https://doi.org/..." className="md:col-span-2" />
                    <TextInput label="Link DOI khusus" value={form.doi_url} onChange={(value) => updateForm('doi_url', value)} placeholder="Isi bila berbeda dengan link sumber" optional className="md:col-span-2" />
                  </div>
                )}
              </section>

              <section>
                <div className="flex items-center gap-3 mb-4"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-900 text-sm font-black text-white">2</span><div><h2 className="font-black text-gray-900">Identitas hasil pembelajaran</h2><p className="text-xs text-gray-500">Judul ini adalah judul catatan pembelajaran Anda, bukan wajib sama persis dengan judul artikel sumber.</p></div></div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <TextInput label="Judul hasil pembelajaran" value={form.title} onChange={(value) => updateForm('title', value)} placeholder="Contoh: Memahami quasi experiment pada pembelajaran kimia" className="md:col-span-2" />
                  <TextArea label="Ringkasan untuk card perpustakaan" value={form.excerpt} onChange={(value) => updateForm('excerpt', value)} placeholder="2–3 kalimat singkat tentang isi pembelajaran." rows={3} hint="Tulis dengan bahasa sendiri. Minimal 40 karakter." className="md:col-span-2" />
                  <label className="block"><FieldLabel>Kategori ilmu</FieldLabel><select value={form.discipline} onChange={(event) => updateForm('discipline', event.target.value)} className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-400">{LEARNING_DISCIPLINES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select><p className="text-xs text-gray-400 mt-1.5">Tahap ini membuka kategori Pendidikan.</p></label>
                  <TextInput label="Nama pembelajar" value={form.studied_by_name} onChange={(value) => updateForm('studied_by_name', value)} placeholder="Nama asli atau nama pena" />
                  <TextInput label="Tanggal dipelajari" type="date" value={form.studied_at} onChange={(value) => updateForm('studied_at', value)} />
                </div>
              </section>

              <section>
                <div className="flex items-center gap-3 mb-4"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-900 text-sm font-black text-white">3</span><div><h2 className="font-black text-gray-900">Metode dan analisis</h2><p className="text-xs text-gray-500">Tag hanya membantu filter. Satu hasil pembelajaran tetap mempunyai satu halaman publik.</p></div></div>
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6"><TagPicker label="Tag metode" options={METHOD_TAG_OPTIONS} selected={form.method_tags} onToggle={(tag) => toggleTag('method_tags', tag)} extraValue={form.extra_method_tags} onExtraChange={(value) => updateForm('extra_method_tags', value)} hint="Contoh tambahan: Posttest-Only Control Group." /><TagPicker label="Tag analisis" options={ANALYSIS_TAG_OPTIONS} selected={form.analysis_tags} onToggle={(tag) => toggleTag('analysis_tags', tag)} extraValue={form.extra_analysis_tags} onExtraChange={(value) => updateForm('extra_analysis_tags', value)} hint="Pilih teknik yang benar-benar Anda temukan atau pahami dari artikel." /></div>
              </section>

              <section>
                <div className="flex items-center gap-3 mb-4"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-900 text-sm font-black text-white">4</span><div><h2 className="font-black text-gray-900">Isi pembelajaran</h2><p className="text-xs text-gray-500">Pisahkan fakta menurut artikel dari pemahaman Anda agar aman secara akademik.</p></div></div>
                <div className="space-y-5">
                  <TextArea label="Ringkasan dengan kata-kata sendiri" value={form.summary_own_words} onChange={(value) => updateForm('summary_own_words', value)} placeholder="Ceritakan apa yang dibahas artikel ini dengan bahasa Anda sendiri. Jangan menyalin abstrak atau isi panjang artikel." rows={7} hint="Minimal 120 karakter. Bahasa tidak harus terlalu baku, yang penting menunjukkan pemahaman sendiri dan tidak mengubah fakta artikel." />
                  <TextArea label="Apa tujuan artikel ini?" value={form.research_purpose} onChange={(value) => updateForm('research_purpose', value)} placeholder="Tuliskan tujuan yang Anda pahami dari artikel." rows={3} optional />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <TextArea label="Pendekatan atau desain" value={form.research_design} onChange={(value) => updateForm('research_design', value)} placeholder="Contoh: Kuantitatif, quasi experiment..." rows={4} optional />
                    <TextArea label="Subjek / sampel / konteks" value={form.participants} onChange={(value) => updateForm('participants', value)} placeholder="Contoh: Siswa kelas XI, dua kelas..." rows={4} optional />
                    <TextArea label="Variabel atau fokus" value={form.variables_focus} onChange={(value) => updateForm('variables_focus', value)} placeholder="Contoh: Media pembelajaran dan hasil belajar..." rows={4} optional />
                    <TextArea label="Instrumen" value={form.instruments} onChange={(value) => updateForm('instruments', value)} placeholder="Contoh: Angket, tes, observasi..." rows={4} optional />
                    <TextArea label="Analisis data" value={form.data_analysis} onChange={(value) => updateForm('data_analysis', value)} placeholder="Contoh: Uji normalitas, homogenitas, t-test..." rows={4} optional />
                    <TextArea label="Alur analisis yang dipelajari" value={form.analysis_flow} onChange={(value) => updateForm('analysis_flow', value)} placeholder={'Contoh:\nData angket\n↓\nUji normalitas\n↓\nUji t'} rows={4} optional />
                  </div>
                  <TextArea label="Hasil utama menurut artikel" value={form.reported_findings} onChange={(value) => updateForm('reported_findings', value)} placeholder="Tuliskan hanya hasil yang memang dilaporkan penulis. Gunakan frasa seperti “Menurut artikel...” atau “Penulis melaporkan...”" rows={5} hint="Wajib diisi saat mengirim review. Jangan menulis seolah-olah penelitian tersebut dilakukan oleh GreenroomID." />
                  <TextArea label="Hal yang dipelajari" value={form.learning_points} onChange={(value) => updateForm('learning_points', value)} placeholder={'Contoh:\n• Kata “pengaruh” tidak selalu berarti regresi.\n• Dua kelompok berbeda dapat memakai uji t atau Mann–Whitney.'} rows={5} hint="Wajib diisi saat mengirim review." />
                  <TextArea label="Pertanyaan metodologis atau hal yang perlu diperhatikan" value={form.critical_notes} onChange={(value) => updateForm('critical_notes', value)} placeholder="Gunakan bahasa netral: hal yang dapat dipelajari lebih lanjut, batasan, atau pertanyaan yang masih muncul." rows={5} optional />
                  <TextArea label="Rujukan atau catatan tambahan" value={form.references_text} onChange={(value) => updateForm('references_text', value)} placeholder="Tambahkan sitasi singkat atau catatan rujukan lain bila diperlukan." rows={4} optional />
                </div>
              </section>

              <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
                <h2 className="font-black text-amber-900">Pernyataan sebelum mengirim review</h2>
                <ul className="mt-2 text-sm text-amber-900/90 space-y-1 list-disc pl-5 leading-relaxed"><li>Tidak ada PDF jurnal, screenshot, tabel, gambar, instrumen, atau data responden yang diunggah.</li><li>Ringkasan merupakan hasil pemahaman sendiri dan bukan salinan abstrak atau isi panjang artikel.</li><li>Link sumber resmi atau DOI dicantumkan agar pembaca dapat memeriksa artikel asli.</li><li>Keputusan review admin dilakukan sebelum tahap kontribusi publikasi pada RB-03.</li></ul>
                <label className="mt-4 inline-flex items-start gap-3 text-sm font-semibold text-amber-950 cursor-pointer"><input type="checkbox" checked={form.confirms_original_learning} onChange={(event) => updateForm('confirms_original_learning', event.target.checked)} className="mt-0.5" /> Saya memahami dan menyetujui pernyataan di atas.</label>
              </section>
            </div>

            <div className="sticky bottom-0 bg-white/95 backdrop-blur border-t border-gray-100 px-5 sm:px-7 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <p className="text-xs text-gray-400">Draft dan hasil pembelajaran belum tayang publik sampai admin menyelesaikan review dan tahap publikasi.</p>
              <div className="flex flex-wrap gap-2"><Link to="/ruang-belajar/saya" className="px-4 py-3 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50">Batal</Link><button type="submit" disabled={saving} className="px-4 py-3 rounded-xl border border-gray-900 text-sm font-bold text-gray-900 hover:bg-gray-50 disabled:opacity-50">{saving ? 'Menyimpan...' : 'Simpan Draft'}</button><button type="button" onClick={() => saveEntry(null, 'submitted')} disabled={saving} className="px-5 py-3 rounded-xl bg-green-700 text-white text-sm font-bold hover:bg-green-800 disabled:opacity-50">{saving ? 'Mengirim...' : 'Kirim untuk Review'}</button></div>
            </div>
          </form>
        )}
      </main>
    </div>
  )
}

export default ClientLearningWritePage
