import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase'
import {
  ANALYSIS_TAG_OPTIONS,
  LEARNING_DISCIPLINES,
  METHOD_TAG_OPTIONS,
  ensureUrl,
  formatLearningDate,
  generateShortCode,
  getLearningPath,
  getLearningStatus,
  getSourceRecord,
  isHttpUrl,
  normalizeTags,
  parseExtraTags,
  slugify,
  splitTagsForForm
} from '../utils/learning'

const todayIso = () => new Date().toISOString().slice(0, 10)

const emptyForm = (user) => ({
  title: '',
  excerpt: '',
  discipline: 'Pendidikan',
  studied_by_name: user?.user_metadata?.full_name || user?.user_metadata?.name || 'GreenroomID',
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
  status: 'draft',
  published_at: '',
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

function TextArea({ label, value, onChange, placeholder = '', rows = 5, optional = false, hint = '' }) {
  return (
    <label className="block">
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
          const isSelected = selected.includes(tag)
          return (
            <button
              type="button"
              key={tag}
              onClick={() => onToggle(tag)}
              className={'rounded-full border px-3 py-2 text-xs font-semibold transition ' + (isSelected ? 'border-green-700 bg-green-700 text-white' : 'border-gray-200 bg-white text-gray-600 hover:border-green-300 hover:text-green-700')}
            >
              {isSelected ? '✓ ' : ''}{tag}
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

function StatusBadge({ status }) {
  const item = getLearningStatus(status)
  return <span className={'inline-flex items-center rounded-full border px-3 py-1 text-xs font-bold ' + item.className}>{item.label}</span>
}

function AdminLearningPage({ user }) {
  const [entries, setEntries] = useState([])
  const [sources, setSources] = useState([])
  const [form, setForm] = useState(() => emptyForm(user))
  const [editingEntry, setEditingEntry] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  const summaryStats = useMemo(() => ({
    total: entries.length,
    published: entries.filter((entry) => entry.status === 'published').length,
    drafts: entries.filter((entry) => entry.status === 'draft').length,
    sources: sources.length
  }), [entries, sources])

  const selectedSource = useMemo(() => {
    return sources.find((source) => source.id === form.existing_source_id) || null
  }, [form.existing_source_id, sources])

  const fetchData = async () => {
    setLoading(true)
    setErrorMessage('')

    const [entriesResult, sourcesResult] = await Promise.all([
      supabase
        .from('learning_entries')
        .select(`
          id,
          source_id,
          slug,
          short_code,
          title,
          excerpt,
          discipline,
          method_tags,
          analysis_tags,
          studied_by_name,
          studied_at,
          status,
          published_at,
          summary_own_words,
          research_purpose,
          research_design,
          participants,
          variables_focus,
          instruments,
          data_analysis,
          analysis_flow,
          reported_findings,
          learning_points,
          critical_notes,
          references_text,
          created_at,
          updated_at,
          source:learning_sources(*)
        `)
        .order('updated_at', { ascending: false }),
      supabase
        .from('learning_sources')
        .select('*')
        .order('source_title', { ascending: true })
    ])

    if (entriesResult.error || sourcesResult.error) {
      const detail = entriesResult.error?.message || sourcesResult.error?.message || 'Tidak diketahui'
      setEntries([])
      setSources([])
      setErrorMessage('Gagal memuat Ruang Belajar. Pastikan SQL supabase/rb01-ruang-belajar.sql sudah dijalankan dan akun ini adalah admin. Detail: ' + detail)
    } else {
      setEntries(entriesResult.data || [])
      setSources(sourcesResult.data || [])
    }

    setLoading(false)
  }

  useEffect(() => {
    fetchData()
  }, [])

  const updateForm = (key, value) => setForm((current) => ({ ...current, [key]: value }))

  const toggleTag = (key, tag) => {
    setForm((current) => {
      const values = current[key] || []
      return {
        ...current,
        [key]: values.includes(tag) ? values.filter((value) => value !== tag) : [...values, tag]
      }
    })
  }

  const resetForm = () => {
    setForm(emptyForm(user))
    setEditingEntry(null)
    setShowForm(false)
    setErrorMessage('')
    setSuccessMessage('')
  }

  const startNewEntry = () => {
    setForm(emptyForm(user))
    setEditingEntry(null)
    setShowForm(true)
    setErrorMessage('')
    setSuccessMessage('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const startEdit = (entry) => {
    const source = getSourceRecord(entry)
    const methodTags = splitTagsForForm(entry.method_tags || [], METHOD_TAG_OPTIONS)
    const analysisTags = splitTagsForForm(entry.analysis_tags || [], ANALYSIS_TAG_OPTIONS)

    setForm({
      ...emptyForm(user),
      title: entry.title || '',
      excerpt: entry.excerpt || '',
      discipline: entry.discipline || 'Pendidikan',
      studied_by_name: entry.studied_by_name || 'GreenroomID',
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
      status: entry.status || 'draft',
      published_at: entry.published_at || '',
      source_mode: 'existing',
      existing_source_id: entry.source_id || source?.id || '',
      confirms_original_learning: true
    })
    setEditingEntry(entry)
    setShowForm(true)
    setErrorMessage('')
    setSuccessMessage('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const validateForm = () => {
    if (form.title.trim().length < 12) return 'Judul hasil pembelajaran minimal 12 karakter.'
    if (form.excerpt.trim().length < 40) return 'Ringkasan card minimal 40 karakter agar pembaca memahami gambaran awal.'
    if (form.summary_own_words.trim().length < 120) return 'Ringkasan dengan kata-kata sendiri minimal 120 karakter.'
    if (!form.studied_by_name.trim()) return 'Nama pembelajar wajib diisi.'
    if (!form.studied_at) return 'Tanggal dipelajari wajib diisi.'
    if (!form.confirms_original_learning) return 'Centang pernyataan bahwa isi merupakan hasil pembelajaran orisinal dan bukan salinan artikel.'

    if (form.source_mode === 'existing' && !form.existing_source_id) return 'Pilih artikel sumber yang sudah ada atau buat sumber baru.'

    if (form.source_mode === 'new') {
      if (!form.source_title.trim()) return 'Judul artikel sumber wajib diisi.'
      if (!form.source_url.trim()) return 'Link sumber resmi atau DOI wajib diisi.'
      if (!isHttpUrl(form.source_url)) return 'Link sumber resmi harus berupa URL yang valid, contoh: https://doi.org/...'
      if (form.doi_url.trim() && !isHttpUrl(form.doi_url)) return 'Link DOI harus berupa URL valid bila diisi.'
    }

    if (form.status === 'published' && !form.reported_findings.trim()) return 'Untuk publikasi, isi hasil utama menurut artikel agar pembaca dapat membedakan fakta artikel dan catatan pembelajar.'

    return ''
  }

  const buildEntryPayload = (sourceId, shortCode) => {
    const methodTags = normalizeTags([...form.method_tags, ...parseExtraTags(form.extra_method_tags)])
    const analysisTags = normalizeTags([...form.analysis_tags, ...parseExtraTags(form.extra_analysis_tags)])
    const publishedAt = form.status === 'published'
      ? (form.published_at || new Date().toISOString())
      : null

    return {
      source_id: sourceId,
      author_id: user.id,
      title: form.title.trim(),
      slug: slugify(form.title),
      short_code: shortCode,
      excerpt: form.excerpt.trim(),
      discipline: form.discipline,
      method_tags: methodTags,
      analysis_tags: analysisTags,
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
      status: form.status,
      published_at: publishedAt,
      updated_at: new Date().toISOString()
    }
  }

  const createSource = async () => {
    const sourcePayload = {
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
    }

    const { data, error } = await supabase
      .from('learning_sources')
      .insert(sourcePayload)
      .select('*')
      .single()

    if (error) throw error
    return data
  }

  const saveEntry = async (event) => {
    event.preventDefault()
    setErrorMessage('')
    setSuccessMessage('')

    const validationError = validateForm()
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

      if (editingEntry) {
        const payload = buildEntryPayload(sourceId, editingEntry.short_code)
        const { error } = await supabase
          .from('learning_entries')
          .update(payload)
          .eq('id', editingEntry.id)

        if (error) throw error
        setSuccessMessage(form.status === 'published' ? 'Hasil pembelajaran berhasil diperbarui dan tetap tampil publik.' : 'Draft hasil pembelajaran berhasil diperbarui.')
      } else {
        let saved = false
        let lastError = null

        for (let attempt = 0; attempt < 3 && !saved; attempt += 1) {
          const payload = buildEntryPayload(sourceId, generateShortCode())
          payload.created_at = new Date().toISOString()
          const { error } = await supabase.from('learning_entries').insert(payload)

          if (!error) saved = true
          else lastError = error
        }

        if (!saved) throw lastError || new Error('Gagal membuat hasil pembelajaran baru.')
        setSuccessMessage(form.status === 'published' ? 'Hasil pembelajaran berhasil diterbitkan ke Ruang Belajar.' : 'Draft hasil pembelajaran berhasil disimpan.')
      }

      await fetchData()
      setForm(emptyForm(user))
      setEditingEntry(null)
      setShowForm(false)
    } catch (error) {
      setErrorMessage('Gagal menyimpan hasil pembelajaran. Detail: ' + (error?.message || 'Tidak diketahui'))
    } finally {
      setSaving(false)
    }
  }

  const deleteEntry = async (entry) => {
    const confirmation = window.confirm(`Hapus hasil pembelajaran “${entry.title}”?\n\nArtikel sumber tidak ikut dihapus agar dapat tetap dipakai untuk hasil pembelajaran lain.`)
    if (!confirmation) return

    setErrorMessage('')
    setSuccessMessage('')

    const { error } = await supabase
      .from('learning_entries')
      .delete()
      .eq('id', entry.id)

    if (error) {
      setErrorMessage('Gagal menghapus hasil pembelajaran. Detail: ' + error.message)
      return
    }

    setSuccessMessage('Hasil pembelajaran dihapus. Metadata artikel sumber tetap tersimpan.')
    await fetchData()
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div>
          <p className="text-xs text-gray-400 mb-1">Admin / Ruang Belajar</p>
          <h2 className="text-2xl font-black text-gray-900">Hasil Pembelajaran Artikel</h2>
          <p className="text-sm text-gray-500 mt-1 max-w-3xl">Buat catatan pembelajaran milik GreenroomID. Yang disimpan hanya teks dan metadata sumber; jangan mengunggah PDF jurnal, screenshot, tabel, gambar, atau data responden.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/ruang-belajar" className="bg-white border border-gray-200 text-gray-700 px-4 py-3 rounded-xl text-sm font-semibold hover:bg-gray-50">Lihat publik ↗</Link>
          <button type="button" onClick={startNewEntry} className="bg-gray-900 text-white px-5 py-3 rounded-xl text-sm font-bold hover:bg-gray-800">+ Buat Hasil Pembelajaran</button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          ['Total catatan', summaryStats.total, '📚'],
          ['Dipublikasikan', summaryStats.published, '🌿'],
          ['Draft', summaryStats.drafts, '✏️'],
          ['Artikel sumber', summaryStats.sources, '🔗']
        ].map(([label, value, icon]) => (
          <div key={label} className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
            <div className="flex items-center justify-between gap-2"><p className="text-xs text-gray-400">{label}</p><span>{icon}</span></div>
            <p className="text-2xl font-black text-gray-900 mt-2">{value}</p>
          </div>
        ))}
      </div>

      {errorMessage && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 leading-relaxed">{errorMessage}</div>}
      {successMessage && <div className="rounded-2xl border border-green-200 bg-green-50 p-4 text-sm text-green-800 leading-relaxed">{successMessage}</div>}

      {showForm && (
        <form onSubmit={saveEntry} className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="p-5 sm:p-6 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <p className="text-xs text-green-700 font-bold">{editingEntry ? 'EDIT HASIL PEMBELAJARAN' : 'CATATAN BARU'}</p>
              <h3 className="text-xl font-black text-gray-900 mt-1">{editingEntry ? 'Perbarui catatan pembelajaran' : 'Tulis hasil pembelajaran artikel'}</h3>
              <p className="text-sm text-gray-500 mt-1">Ringkasan wajib ditulis menggunakan pemahaman sendiri. Bahasa boleh sederhana, tetapi fakta artikel dan pendapat pembelajar harus jelas terpisah.</p>
            </div>
            <button type="button" onClick={resetForm} className="text-sm font-bold text-gray-500 hover:text-gray-900">Tutup form ×</button>
          </div>

          <div className="p-5 sm:p-6 space-y-8">
            <section>
              <div className="flex items-center gap-3 mb-4"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-900 text-sm font-black text-white">1</span><div><h4 className="font-black text-gray-900">Artikel sumber</h4><p className="text-xs text-gray-500">Satu artikel sumber dapat dipakai untuk banyak hasil pembelajaran dari orang yang berbeda.</p></div></div>

              <div className="rounded-2xl bg-gray-50 border border-gray-100 p-4">
                <div className="flex flex-wrap gap-4">
                  <label className="inline-flex items-center gap-2 text-sm font-semibold text-gray-700"><input type="radio" name="source_mode" checked={form.source_mode === 'new'} onChange={() => updateForm('source_mode', 'new')} /> Buat artikel sumber baru</label>
                  <label className="inline-flex items-center gap-2 text-sm font-semibold text-gray-700"><input type="radio" name="source_mode" checked={form.source_mode === 'existing'} onChange={() => updateForm('source_mode', 'existing')} /> Gunakan artikel sumber yang sudah ada</label>
                </div>
              </div>

              {form.source_mode === 'existing' ? (
                <div className="mt-4">
                  <label className="block">
                    <FieldLabel>Pilih artikel sumber</FieldLabel>
                    <select value={form.existing_source_id} onChange={(event) => updateForm('existing_source_id', event.target.value)} className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-400">
                      <option value="">Pilih artikel sumber...</option>
                      {sources.map((source) => <option key={source.id} value={source.id}>{source.source_title}{source.source_year ? ` (${source.source_year})` : ''}</option>)}
                    </select>
                  </label>
                  {selectedSource && <div className="mt-3 rounded-xl border border-green-100 bg-green-50 px-4 py-3 text-xs text-green-900 leading-relaxed"><p className="font-bold">{selectedSource.source_title}</p><p className="mt-1">{selectedSource.source_journal || 'Jurnal/penerbit belum diisi'} · {selectedSource.source_url || selectedSource.doi_url}</p></div>}
                  {sources.length === 0 && <p className="text-sm text-amber-700 mt-3">Belum ada artikel sumber. Pilih “Buat artikel sumber baru”.</p>}
                </div>
              ) : (
                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <TextInput label="Judul artikel sumber" value={form.source_title} onChange={(value) => updateForm('source_title', value)} placeholder="Judul asli artikel/jurnal" className="md:col-span-2" />
                  <TextInput label="Penulis artikel" value={form.source_authors} onChange={(value) => updateForm('source_authors', value)} placeholder="Nama penulis" optional />
                  <TextInput label="Tahun terbit" value={form.source_year} onChange={(value) => updateForm('source_year', value.replace(/[^0-9]/g, '').slice(0, 4))} placeholder="2026" optional />
                  <TextInput label="Nama jurnal / penerbit" value={form.source_journal} onChange={(value) => updateForm('source_journal', value)} placeholder="Contoh: Jurnal Pendidikan..." optional />
                  <TextInput label="Edisi sumber" value={form.source_volume_issue} onChange={(value) => updateForm('source_volume_issue', value)} placeholder="Vol. 1 No. 2, Juni 2026" optional />
                  <TextInput label="Link sumber resmi atau DOI" value={form.source_url} onChange={(value) => updateForm('source_url', value)} placeholder="https://doi.org/..." className="md:col-span-2" />
                  <TextInput label="Link DOI khusus" value={form.doi_url} onChange={(value) => updateForm('doi_url', value)} placeholder="Isi bila berbeda dengan link sumber" optional className="md:col-span-2" />
                </div>
              )}
            </section>

            <section>
              <div className="flex items-center gap-3 mb-4"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-900 text-sm font-black text-white">2</span><div><h4 className="font-black text-gray-900">Identitas hasil pembelajaran</h4><p className="text-xs text-gray-500">Judul ini adalah judul catatan pembelajaran GreenroomID, bukan wajib sama persis dengan judul artikel sumber.</p></div></div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <TextInput label="Judul hasil pembelajaran" value={form.title} onChange={(value) => updateForm('title', value)} placeholder="Contoh: Memahami quasi experiment pada pembelajaran kimia" className="md:col-span-2" />
                <TextArea label="Ringkasan untuk card perpustakaan" value={form.excerpt} onChange={(value) => updateForm('excerpt', value)} placeholder="2–3 kalimat singkat tentang isi pembelajaran yang akan terlihat di card." rows={3} hint="Gunakan bahasa sendiri. Maksimal ideal sekitar 300 karakter agar card tetap rapi." className="md:col-span-2" />
                <label className="block"><FieldLabel>Kategori ilmu</FieldLabel><select value={form.discipline} onChange={(event) => updateForm('discipline', event.target.value)} className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-400">{LEARNING_DISCIPLINES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select><p className="text-xs text-gray-400 mt-1.5">Tahap RB-01 hanya membuka kategori Pendidikan. Struktur database siap ditambah kategori lain nanti.</p></label>
                <TextInput label="Nama pembelajar" value={form.studied_by_name} onChange={(value) => updateForm('studied_by_name', value)} placeholder="Contoh: GreenroomID / Nama pena" />
                <TextInput label="Tanggal dipelajari" type="date" value={form.studied_at} onChange={(value) => updateForm('studied_at', value)} />
                <label className="block"><FieldLabel>Status publikasi</FieldLabel><select value={form.status} onChange={(event) => updateForm('status', event.target.value)} className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-400"><option value="draft">Simpan sebagai Draft</option><option value="published">Publikasikan ke Ruang Belajar</option></select><p className="text-xs text-gray-400 mt-1.5">Hanya status “Dipublikasikan” yang dapat dibuka publik dan masuk ke katalog.</p></label>
              </div>
            </section>

            <section>
              <div className="flex items-center gap-3 mb-4"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-900 text-sm font-black text-white">3</span><div><h4 className="font-black text-gray-900">Metode dan analisis</h4><p className="text-xs text-gray-500">Tag hanya berfungsi sebagai filter. Satu hasil pembelajaran tetap hanya memiliki satu halaman publik.</p></div></div>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <TagPicker label="Tag metode" options={METHOD_TAG_OPTIONS} selected={form.method_tags} onToggle={(tag) => toggleTag('method_tags', tag)} extraValue={form.extra_method_tags} onExtraChange={(value) => updateForm('extra_method_tags', value)} hint="Contoh tag tambahan: Posttest-Only Control Group." />
                <TagPicker label="Tag analisis" options={ANALYSIS_TAG_OPTIONS} selected={form.analysis_tags} onToggle={(tag) => toggleTag('analysis_tags', tag)} extraValue={form.extra_analysis_tags} onExtraChange={(value) => updateForm('extra_analysis_tags', value)} hint="Pilih teknik yang benar-benar ditemukan atau dibahas dalam artikel." />
              </div>
            </section>

            <section>
              <div className="flex items-center gap-3 mb-4"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-900 text-sm font-black text-white">4</span><div><h4 className="font-black text-gray-900">Isi pembelajaran</h4><p className="text-xs text-gray-500">Pisahkan “menurut artikel” dari pemahaman dan pertanyaan pembelajar agar aman secara akademik.</p></div></div>
              <div className="space-y-5">
                <TextArea label="Ringkasan dengan kata-kata sendiri" value={form.summary_own_words} onChange={(value) => updateForm('summary_own_words', value)} placeholder="Ceritakan apa yang dibahas artikel ini dengan bahasa Anda sendiri. Jangan menyalin abstrak atau isi panjang artikel." rows={7} hint="Wajib minimal 120 karakter. Bahasa tidak harus terlalu baku, yang penting menunjukkan pemahaman sendiri dan tidak mengubah fakta artikel." />
                <TextArea label="Apa tujuan artikel ini?" value={form.research_purpose} onChange={(value) => updateForm('research_purpose', value)} placeholder="Tuliskan tujuan yang Anda pahami dari artikel." rows={3} optional />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <TextArea label="Pendekatan atau desain" value={form.research_design} onChange={(value) => updateForm('research_design', value)} placeholder="Contoh: Kuantitatif, quasi experiment..." rows={4} optional />
                  <TextArea label="Subjek / sampel / konteks" value={form.participants} onChange={(value) => updateForm('participants', value)} placeholder="Contoh: Siswa kelas XI, dua kelas..." rows={4} optional />
                  <TextArea label="Variabel atau fokus" value={form.variables_focus} onChange={(value) => updateForm('variables_focus', value)} placeholder="Contoh: Media pembelajaran dan hasil belajar..." rows={4} optional />
                  <TextArea label="Instrumen" value={form.instruments} onChange={(value) => updateForm('instruments', value)} placeholder="Contoh: Angket, tes, observasi..." rows={4} optional />
                  <TextArea label="Analisis data" value={form.data_analysis} onChange={(value) => updateForm('data_analysis', value)} placeholder="Contoh: Uji normalitas, homogenitas, t-test..." rows={4} optional />
                  <TextArea label="Alur analisis yang dipelajari" value={form.analysis_flow} onChange={(value) => updateForm('analysis_flow', value)} placeholder={'Contoh:\nData angket\n↓\nUji normalitas\n↓\nUji t'} rows={4} optional />
                </div>
                <TextArea label="Hasil utama menurut artikel" value={form.reported_findings} onChange={(value) => updateForm('reported_findings', value)} placeholder="Tuliskan hanya hasil yang memang dilaporkan penulis. Gunakan frasa seperti “Menurut artikel...” atau “Penulis melaporkan...”." rows={5} hint="Wajib diisi saat publikasi. Jangan menulis seolah-olah penelitian tersebut dilakukan oleh GreenroomID." />
                <TextArea label="Hal yang dipelajari" value={form.learning_points} onChange={(value) => updateForm('learning_points', value)} placeholder={'Contoh:\n• Kata “pengaruh” tidak selalu berarti regresi.\n• Dua kelompok berbeda dapat memakai uji t atau Mann–Whitney.'} rows={5} optional />
                <TextArea label="Pertanyaan metodologis atau hal yang perlu diperhatikan" value={form.critical_notes} onChange={(value) => updateForm('critical_notes', value)} placeholder="Gunakan bahasa netral: hal yang dapat dipelajari lebih lanjut, batasan, atau pertanyaan yang masih muncul." rows={5} optional />
                <TextArea label="Rujukan atau catatan tambahan" value={form.references_text} onChange={(value) => updateForm('references_text', value)} placeholder="Tambahkan sitasi singkat atau catatan rujukan lain bila diperlukan." rows={4} optional />
              </div>
            </section>

            <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
              <h4 className="font-black text-amber-900">Pernyataan sebelum menyimpan</h4>
              <ul className="mt-2 text-sm text-amber-900/90 space-y-1 list-disc pl-5 leading-relaxed">
                <li>Tidak ada PDF jurnal, screenshot, tabel, gambar, instrumen, atau data responden yang diunggah.</li>
                <li>Ringkasan merupakan hasil pemahaman sendiri dan bukan salinan abstrak atau isi panjang artikel.</li>
                <li>Link sumber resmi atau DOI dicantumkan agar pembaca dapat memeriksa artikel asli.</li>
              </ul>
              <label className="mt-4 inline-flex items-start gap-3 text-sm font-semibold text-amber-950 cursor-pointer"><input type="checkbox" checked={form.confirms_original_learning} onChange={(event) => updateForm('confirms_original_learning', event.target.checked)} className="mt-0.5" /> Saya memahami dan menyetujui pernyataan di atas.</label>
            </section>
          </div>

          <div className="sticky bottom-0 bg-white/95 backdrop-blur border-t border-gray-100 px-5 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <p className="text-xs text-gray-400">Tidak ada file PDF atau file jurnal yang disimpan oleh fitur ini.</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={resetForm} disabled={saving} className="px-4 py-3 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50">Batal</button>
              <button type="submit" disabled={saving} className="px-5 py-3 rounded-xl bg-gray-900 text-white text-sm font-bold hover:bg-gray-800 disabled:opacity-50">{saving ? 'Menyimpan...' : form.status === 'published' ? 'Publikasikan Hasil Pembelajaran' : 'Simpan Draft'}</button>
            </div>
          </div>
        </form>
      )}

      <section className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-5 sm:p-6 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div><h3 className="text-lg font-black text-gray-900">Catatan yang sudah dibuat</h3><p className="text-sm text-gray-500 mt-1">Kelola draft dan hasil pembelajaran yang telah diterbitkan.</p></div>
          <button type="button" onClick={fetchData} disabled={loading} className="text-sm font-bold text-green-700 hover:underline disabled:opacity-50">{loading ? 'Memuat...' : 'Muat ulang'}</button>
        </div>

        {loading ? (
          <div className="p-10 text-center text-sm text-gray-400">Memuat hasil pembelajaran...</div>
        ) : entries.length === 0 ? (
          <div className="p-10 text-center"><div className="text-3xl">📚</div><h4 className="mt-3 font-black text-gray-900">Belum ada catatan</h4><p className="text-sm text-gray-500 mt-1">Mulai dengan satu hasil pembelajaran artikel kategori Pendidikan.</p><button type="button" onClick={startNewEntry} className="mt-4 text-sm font-bold text-green-700 hover:underline">Buat catatan pertama →</button></div>
        ) : (
          <div className="divide-y divide-gray-100">
            {entries.map((entry) => {
              const source = getSourceRecord(entry)
              return (
                <div key={entry.id} className="p-5 sm:p-6 flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2"><StatusBadge status={entry.status} /><span className="text-xs text-gray-400">Diperbarui {formatLearningDate(entry.updated_at)}</span></div>
                    <h4 className="font-black text-gray-900 mt-3 leading-snug">{entry.title}</h4>
                    <p className="text-sm text-gray-500 mt-1 line-clamp-2">{entry.excerpt || 'Tidak ada ringkasan card.'}</p>
                    <p className="text-xs text-gray-500 mt-3"><span className="font-semibold text-gray-700">Artikel sumber:</span> {source?.source_title || 'Belum terbaca'}</p>
                    <div className="mt-3 flex flex-wrap gap-1.5">{[...(entry.method_tags || []), ...(entry.analysis_tags || [])].slice(0, 5).map((tag) => <span key={tag} className="rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-semibold text-gray-600">{tag}</span>)}</div>
                  </div>
                  <div className="flex flex-wrap gap-2 shrink-0">
                    {entry.status === 'published' && <Link to={getLearningPath(entry)} className="px-3 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50">Buka publik ↗</Link>}
                    <button type="button" onClick={() => startEdit(entry)} className="px-3 py-2 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800">Edit</button>
                    <button type="button" onClick={() => deleteEntry(entry)} className="px-3 py-2 rounded-xl border border-red-200 text-red-700 text-sm font-semibold hover:bg-red-50">Hapus</button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}

export default AdminLearningPage
