import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../supabase'
import ClientPortalHeader from '../components/ClientPortalHeader'
import { createAuditLog } from '../utils/auditLog'
import {
  CHOICE_QUESTION_TYPES,
  CONDITION_OPERATORS,
  FORM_REQUEST_TYPE,
  QUESTION_TYPE_OPTIONS,
  buildPublicFormUrl,
  downloadCsv,
  formatAnswerValue,
  getQuestionTypeLabel,
  isRequestPaymentVerified,
  makeUniqueSlug,
  normalizeSlug,
  optionsToText,
  parseOptionsText
} from '../utils/dynamicForms'

const defaultSectionTitle = 'Bagian 1'
const chartColors = ['#3367d6', '#dc3912', '#ff9900', '#109618', '#990099', '#0099c6', '#dd4477', '#66aa00']

const DEFAULT_FORM_THEME = {
  primaryColor: '#3f51b5',
  backgroundColor: '#c8cdec',
  headerFont: 'Lexend',
  questionFont: 'Roboto',
  bodyFont: 'Comfortaa',
  headerSize: 30,
  questionSize: 16,
  bodySize: 14,
  headerImageUrl: '',
  leftAdImageUrl: '',
  leftAdImageUrl2: '',
  rightAdImageUrl: '',
  rightAdImageUrl2: '',
  leftAdLink: '',
  leftAdLink2: '',
  rightAdLink: '',
  rightAdLink2: ''
}

const FONT_OPTIONS = ['Lexend', 'Roboto', 'Comfortaa', 'Inter', 'Arial', 'Georgia', 'Times New Roman']
const THEME_COLORS = ['#3f51b5', '#673ab7', '#009688', '#0f9d58', '#f4511e', '#607d8b', '#0f766e', '#7c3aed']
const BACKGROUND_COLORS = ['#c8cdec', '#ede7f6', '#e0f2f1', '#e8f5e9', '#fbe9e7', '#eceff1', '#f3f4f6']

function normalizeTheme(rawTheme) {
  return {
    ...DEFAULT_FORM_THEME,
    ...(rawTheme && typeof rawTheme === 'object' ? rawTheme : {})
  }
}

function fontStyle(font, size) {
  return {
    fontFamily: `${font}, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`,
    fontSize: `${Number(size) || 14}px`
  }
}

function normalizeExternalUrl(url) {
  const value = String(url || '').trim()
  if (!value) return ''
  if (/^(https?:)?\/\//i.test(value) || /^(mailto:|tel:)/i.test(value)) return value
  return `https://${value}`
}

function getTheme(form) {
  return normalizeTheme(form?.theme_json)
}

function ClientFormWorkspacePage({ user }) {
  const { requestId } = useParams()
  const navigate = useNavigate()
  const [request, setRequest] = useState(null)
  const [form, setForm] = useState(null)
  const [sections, setSections] = useState([])
  const [questions, setQuestions] = useState([])
  const [options, setOptions] = useState([])
  const [responses, setResponses] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState('questions')
  const [responseTab, setResponseTab] = useState('summary')
  const [expandedResponseId, setExpandedResponseId] = useState(null)
  const [activeResponseIndex, setActiveResponseIndex] = useState(0)
  const [responseDrafts, setResponseDrafts] = useState({})
  const [showThemePanel, setShowThemePanel] = useState(false)
  const [showNewQuestionModal, setShowNewQuestionModal] = useState(false)
  const [showNewSectionModal, setShowNewSectionModal] = useState(false)
  const [toolbarTop, setToolbarTop] = useState(240)
  const [activeToolTarget, setActiveToolTarget] = useState('form-cover-card')
  const [sectionForm, setSectionForm] = useState({ title: '', description: '' })
  const [questionForm, setQuestionForm] = useState({
    section_id: '',
    label: '',
    question_type: 'short_text',
    helper_text: '',
    placeholder: '',
    is_required: false,
    options_text: '',
    conditional_parent_question_id: '',
    conditional_operator: 'equals',
    conditional_value: ''
  })

  const theme = useMemo(() => getTheme(form), [form])
  const paymentVerified = isRequestPaymentVerified(request)
  const publicUrl = buildPublicFormUrl(form?.slug)
  const activeResponse = responses[activeResponseIndex] || responses[0]

  const optionsByQuestion = useMemo(() => {
    return (options || []).reduce((acc, option) => {
      const key = option.question_id
      if (!acc[key]) acc[key] = []
      acc[key].push(option)
      return acc
    }, {})
  }, [options])

  const responseCountsByQuestion = useMemo(() => {
    return questions.map((question) => {
      const counts = {}
      responses.forEach((response) => {
        const value = response.answers_json?.[question.id]?.value
        if (Array.isArray(value)) {
          value.forEach((item) => {
            const key = String(item || '').trim() || '(Kosong)'
            counts[key] = (counts[key] || 0) + 1
          })
          return
        }
        const key = String(value || '').trim() || '(Kosong)'
        counts[key] = (counts[key] || 0) + 1
      })
      const total = Object.values(counts).reduce((sum, count) => sum + count, 0)
      const entries = Object.entries(counts).sort((a, b) => b[1] - a[1])
      return { question, total, entries }
    })
  }, [questions, responses])

  const moveToolbarTo = (targetId) => {
    setActiveToolTarget(targetId)
    window.requestAnimationFrame(() => {
      const element = document.getElementById(targetId)
      if (!element) return
      const rect = element.getBoundingClientRect()
      const nextTop = Math.max(118, Math.min(window.innerHeight - 210, rect.top + 48))
      setToolbarTop(nextTop)
    })
  }

  useEffect(() => {
    const handleScroll = () => moveToolbarTo(activeToolTarget)
    window.addEventListener('scroll', handleScroll, { passive: true })
    window.addEventListener('resize', handleScroll)
    return () => {
      window.removeEventListener('scroll', handleScroll)
      window.removeEventListener('resize', handleScroll)
    }
  }, [activeToolTarget])

  const fetchRequest = async () => {
    const { data, error } = await supabase
      .from('requests')
      .select('*')
      .eq('id', requestId)
      .eq('client_id', user.id)
      .maybeSingle()

    if (error || !data) {
      setRequest(null)
      return null
    }

    setRequest(data)
    return data
  }

  async function createFormFromRequest(targetRequest) {
    const initialTitle = targetRequest.judul || 'Formulir Online'
    const { data, error } = await supabase
      .from('forms')
      .insert({
        request_id: String(targetRequest.id),
        owner_id: user.id,
        title: initialTitle,
        description: targetRequest.deskripsi || '',
        slug: makeUniqueSlug(initialTitle),
        status: isRequestPaymentVerified(targetRequest) ? 'active' : 'draft',
        theme_json: DEFAULT_FORM_THEME
      })
      .select('*')
      .single()

    if (error) {
      console.log('Gagal membuat form otomatis:', error.message)
      return null
    }

    await supabase.from('form_sections').insert({
      form_id: data.id,
      title: defaultSectionTitle,
      description: '',
      sort_order: 1
    })

    return data
  }

  const fetchFormBundle = async (targetRequest = request) => {
    if (!targetRequest) return

    const { data: formData, error: formError } = await supabase
      .from('forms')
      .select('*')
      .eq('request_id', String(targetRequest.id))
      .eq('owner_id', user.id)
      .maybeSingle()

    if (formError) {
      console.log('Gagal mengambil form:', formError.message)
      setForm(null)
      return
    }

    let activeForm = formData

    if (!activeForm && isRequestPaymentVerified(targetRequest)) {
      activeForm = await createFormFromRequest(targetRequest)
    }

    if (!activeForm) {
      setForm(null)
      return
    }

    setForm({ ...activeForm, theme_json: normalizeTheme(activeForm.theme_json) })

    const [{ data: sectionRows }, { data: questionRows }, { data: optionRows }, { data: responseRows }] = await Promise.all([
      supabase.from('form_sections').select('*').eq('form_id', activeForm.id).order('sort_order', { ascending: true }),
      supabase.from('form_questions').select('*').eq('form_id', activeForm.id).order('sort_order', { ascending: true }),
      supabase.from('form_options').select('*').eq('form_id', activeForm.id).order('sort_order', { ascending: true }),
      supabase.from('form_responses').select('*').eq('form_id', activeForm.id).is('deleted_at', null).order('created_at', { ascending: false })
    ])

    setSections(sectionRows || [])
    setQuestions(questionRows || [])
    setOptions(optionRows || [])
    setResponses(responseRows || [])

    const firstSection = (sectionRows || [])[0]
    if (firstSection && !questionForm.section_id) {
      setQuestionForm((current) => ({ ...current, section_id: firstSection.id }))
    }
  }

  const loadPage = async () => {
    setLoading(true)
    const targetRequest = await fetchRequest()
    if (targetRequest) await fetchFormBundle(targetRequest)
    setLoading(false)
  }

  useEffect(() => {
    loadPage()
    // H37: load form workspace sengaja mengikuti perubahan requestId saja agar tidak reload saat draft form berubah.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestId])

  useEffect(() => {
    if (activeResponseIndex > Math.max(responses.length - 1, 0)) {
      setActiveResponseIndex(Math.max(responses.length - 1, 0))
    }
  }, [activeResponseIndex, responses.length])

  const refreshBundle = async () => {
    const latestRequest = await fetchRequest()
    await fetchFormBundle(latestRequest)
  }

  const saveFormSettings = async () => {
    if (!form?.title?.trim()) {
      alert('Judul form tidak boleh kosong.')
      return
    }

    setSaving(true)
    const normalizedSlug = normalizeSlug(form.slug || form.title)
    const { error } = await supabase
      .from('forms')
      .update({
        title: form.title,
        description: form.description || '',
        slug: normalizedSlug,
        status: form.status === 'deleted_by_owner' ? 'deleted_by_owner' : form.status,
        theme_json: normalizeTheme(form.theme_json)
      })
      .eq('id', form.id)

    if (error) alert('Gagal menyimpan pengaturan form: ' + error.message)
    else {
      alert('Pengaturan form tersimpan.')
      await refreshBundle()
    }

    setSaving(false)
  }

  const updateTheme = (patch) => {
    setForm((current) => ({
      ...current,
      theme_json: normalizeTheme({ ...normalizeTheme(current?.theme_json), ...patch })
    }))
  }

  const addSection = async () => {
    if (!sectionForm.title.trim()) {
      alert('Judul bagian wajib diisi.')
      return false
    }

    const { error } = await supabase.from('form_sections').insert({
      form_id: form.id,
      title: sectionForm.title.trim(),
      description: sectionForm.description.trim(),
      sort_order: sections.length + 1
    })

    if (error) {
      alert('Gagal menambah bagian: ' + error.message)
      return false
    }

    setSectionForm({ title: '', description: '' })
    await refreshBundle()
    return true
  }

  const updateSection = async (section, patch) => {
    const { error } = await supabase.from('form_sections').update(patch).eq('id', section.id)
    if (error) alert('Gagal mengubah bagian: ' + error.message)
    else await refreshBundle()
  }

  const deleteSection = async (section) => {
    if (!confirm(`Hapus bagian "${section.title}"? Pertanyaan di dalamnya juga akan ikut terhapus.`)) return
    const { error } = await supabase.from('form_sections').delete().eq('id', section.id)
    if (error) alert('Gagal menghapus bagian: ' + error.message)
    else await refreshBundle()
  }

  const addQuestion = async () => {
    if (!questionForm.section_id) {
      alert('Pilih bagian pertanyaan dulu.')
      return false
    }
    if (!questionForm.label.trim()) {
      alert('Tulis pertanyaan dulu.')
      return false
    }

    const { data: question, error } = await supabase
      .from('form_questions')
      .insert({
        form_id: form.id,
        section_id: questionForm.section_id,
        label: questionForm.label.trim(),
        question_type: questionForm.question_type,
        helper_text: questionForm.helper_text.trim(),
        placeholder: questionForm.placeholder.trim(),
        is_required: questionForm.is_required,
        sort_order: questions.filter((item) => item.section_id === questionForm.section_id).length + 1,
        conditional_parent_question_id: questionForm.conditional_parent_question_id || null,
        conditional_operator: questionForm.conditional_parent_question_id ? questionForm.conditional_operator : null,
        conditional_value: questionForm.conditional_parent_question_id ? questionForm.conditional_value : null
      })
      .select('*')
      .single()

    if (error) {
      alert('Gagal menambah pertanyaan: ' + error.message)
      return false
    }

    if (CHOICE_QUESTION_TYPES.includes(questionForm.question_type)) {
      const optionRows = parseOptionsText(questionForm.options_text).map((label, index) => ({
        form_id: form.id,
        question_id: question.id,
        option_label: label,
        option_value: label,
        sort_order: index + 1
      }))

      if (optionRows.length > 0) {
        const { error: optionError } = await supabase.from('form_options').insert(optionRows)
        if (optionError) alert('Pertanyaan tersimpan, tetapi opsi gagal disimpan: ' + optionError.message)
      }
    }

    setQuestionForm({
      section_id: questionForm.section_id,
      label: '',
      question_type: 'short_text',
      helper_text: '',
      placeholder: '',
      is_required: false,
      options_text: '',
      conditional_parent_question_id: '',
      conditional_operator: 'equals',
      conditional_value: ''
    })
    await refreshBundle()
    return true
  }

  const updateQuestion = async (question, patch) => {
    const { error } = await supabase.from('form_questions').update(patch).eq('id', question.id)
    if (error) alert('Gagal mengubah pertanyaan: ' + error.message)
    else await refreshBundle()
  }

  const saveQuestionOptions = async (question, text) => {
    const labels = parseOptionsText(text)
    await supabase.from('form_options').delete().eq('question_id', question.id)

    if (labels.length > 0) {
      const { error } = await supabase.from('form_options').insert(labels.map((label, index) => ({
        form_id: form.id,
        question_id: question.id,
        option_label: label,
        option_value: label,
        sort_order: index + 1
      })))

      if (error) {
        alert('Gagal menyimpan opsi: ' + error.message)
        return
      }
    }

    await refreshBundle()
  }

  const deleteQuestion = async (question) => {
    if (!confirm(`Hapus pertanyaan "${question.label}"?`)) return
    const { error } = await supabase.from('form_questions').delete().eq('id', question.id)
    if (error) alert('Gagal menghapus pertanyaan: ' + error.message)
    else await refreshBundle()
  }

  const toggleFormDisabled = async () => {
    const nextStatus = form.status === 'active' ? 'disabled' : 'active'
    const { error } = await supabase.from('forms').update({ status: nextStatus }).eq('id', form.id)
    if (error) alert('Gagal mengubah status form: ' + error.message)
    else await refreshBundle()
  }

  const softDeleteForm = async () => {
    if (!confirm('Hapus form ini dari sisi pemilik link? Link publik akan nonaktif, tetapi admin masih dapat melihat datanya.')) return
    const now = new Date().toISOString()
    const { error } = await supabase
      .from('forms')
      .update({ status: 'deleted_by_owner', deleted_at: now, deleted_by: user.id, delete_reason: 'Dihapus oleh pemilik link' })
      .eq('id', form.id)

    if (error) alert('Gagal menghapus form: ' + error.message)
    else {
      await createAuditLog({
        requestId,
        actorId: user.id,
        actorEmail: user.email,
        actorRole: 'client',
        action: 'FORM_SOFT_DELETED_BY_OWNER',
        description: `Pemilik link menghapus form: ${form.title}`,
        metadata: { form_id: form.id, slug: form.slug }
      })
      await refreshBundle()
    }
  }

  const softDeleteResponse = async (response) => {
    if (!confirm('Hapus respons ini dari dashboard pemilik link? Admin masih dapat melihat data terhapus.')) return
    const now = new Date().toISOString()
    const { error } = await supabase
      .from('form_responses')
      .update({ deleted_at: now, deleted_by: user.id, delete_reason: 'Dihapus oleh pemilik link' })
      .eq('id', response.id)

    if (error) {
      alert('Gagal menghapus respons: ' + error.message)
      return
    }

    await supabase.from('form_response_logs').insert({
      form_id: form.id,
      response_id: response.id,
      actor_id: user.id,
      actor_email: user.email,
      actor_role: 'owner',
      action: 'SOFT_DELETE_RESPONSE',
      metadata: { request_id: requestId }
    })

    await refreshBundle()
  }

  const startEditResponse = (response) => {
    setExpandedResponseId(expandedResponseId === response.id ? null : response.id)
    const draft = questions.reduce((acc, question) => {
      acc[question.id] = response.answers_json?.[question.id]?.value ?? ''
      return acc
    }, {})
    setResponseDrafts((current) => ({ ...current, [response.id]: draft }))
  }

  const updateResponseDraft = (responseId, question, value) => {
    setResponseDrafts((current) => ({
      ...current,
      [responseId]: { ...(current[responseId] || {}), [question.id]: value }
    }))
  }

  const saveResponseDraft = async (response) => {
    const draft = responseDrafts[response.id] || {}
    const nextAnswers = questions.reduce((acc, question) => {
      acc[question.id] = { label: question.label, type: question.question_type, value: draft[question.id] ?? '' }
      return acc
    }, {})

    const { error } = await supabase.from('form_responses').update({ answers_json: nextAnswers }).eq('id', response.id)
    if (error) {
      alert('Gagal menyimpan edit respons: ' + error.message)
      return
    }

    await supabase.from('form_response_logs').insert({
      form_id: form.id,
      response_id: response.id,
      actor_id: user.id,
      actor_email: user.email,
      actor_role: 'owner',
      action: 'UPDATE_RESPONSE',
      metadata: { request_id: requestId }
    })

    setExpandedResponseId(null)
    await refreshBundle()
  }

  const exportResponses = () => {
    const header = ['Timestamp', ...questions.map((question) => question.label)]
    const rows = responses.map((response) => [
      new Date(response.created_at).toLocaleString('id-ID'),
      ...questions.map((question) => formatAnswerValue(response.answers_json?.[question.id]?.value))
    ])
    downloadCsv(`${form.slug || 'form'}-responses.csv`, [header, ...rows])
  }

  const copyPublicLink = async () => {
    await navigator.clipboard.writeText(publicUrl)
    alert('Link form disalin.')
  }

  const openNewQuestionModal = () => {
    setQuestionForm((current) => ({
      ...current,
      section_id: current.section_id || sections[0]?.id || ''
    }))
    setShowNewQuestionModal(true)
  }

  const openNewSectionModal = () => {
    setShowNewSectionModal(true)
  }

  const saveQuestionFromModal = async () => {
    const ok = await addQuestion()
    if (ok) setShowNewQuestionModal(false)
  }

  const saveSectionFromModal = async () => {
    const ok = await addSection()
    if (ok) setShowNewSectionModal(false)
  }

  if (loading) return <StateShell user={user} text="Memuat..." />

  if (!request) {
    return <StateShell user={user} text="Request formulir tidak ditemukan." action={<button type="button" onClick={() => navigate('/dashboard')} className="mt-4 text-sm font-bold text-green-700 hover:underline">Kembali ke Request Saya</button>} />
  }

  if (request.request_type !== FORM_REQUEST_TYPE) {
    return <StateShell user={user} text="Request ini bukan Request Link Formulir." action={<Link to={`/request/${requestId}`} className="mt-4 inline-flex text-sm font-bold text-green-700 hover:underline">Buka detail request</Link>} />
  }

  if (!paymentVerified) {
    return (
      <div className="min-h-screen bg-gray-100">
        <ClientPortalHeader user={user} subtitle="Portal Client · Formulir Online" />
        <div className="mx-auto max-w-3xl p-6">
          <div className="rounded-2xl bg-white p-8 shadow-sm">
            <p className="text-xs font-black uppercase tracking-wide text-amber-600">Menunggu pembayaran diverifikasi</p>
            <h1 className="mt-2 text-2xl font-black text-gray-900">Request Link Formulir belum aktif</h1>
            <p className="mt-3 text-sm leading-6 text-gray-500">Form builder akan terbuka otomatis setelah admin mengonfirmasi pembayaran request ini.</p>
            <Link to={`/request/${requestId}`} className="mt-6 inline-flex rounded-xl bg-gray-900 px-5 py-3 text-sm font-bold text-white hover:bg-black">Buka invoice dan upload bukti bayar</Link>
          </div>
        </div>
      </div>
    )
  }

  if (!form) return <StateShell user={user} text="Form belum berhasil dibuat. Coba refresh halaman." action={<button type="button" onClick={refreshBundle} className="mt-4 rounded-xl bg-gray-900 px-5 py-3 text-sm font-bold text-white hover:bg-black">Refresh</button>} />

  if (form.status === 'deleted_by_owner') {
    return (
      <div className="min-h-screen bg-gray-100">
        <ClientPortalHeader user={user} subtitle="Portal Client · Formulir Online" />
        <div className="mx-auto max-w-3xl p-6">
          <div className="rounded-2xl bg-white p-8 shadow-sm">
            <p className="text-xs font-black uppercase tracking-wide text-red-500">Form dihapus oleh pemilik link</p>
            <h1 className="mt-2 text-2xl font-black text-gray-900">{form.title}</h1>
            <p className="mt-3 text-sm leading-6 text-gray-500">Form ini sudah tidak tampil di sisi pemilik link. Admin masih dapat melihat atau menghapus permanen dari panel admin.</p>
            <Link to="/dashboard" className="mt-6 inline-flex rounded-xl bg-gray-900 px-5 py-3 text-sm font-bold text-white hover:bg-black">Kembali ke Request Saya</Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen transition-colors duration-300" style={{ backgroundColor: theme.backgroundColor }}>
      <ClientPortalHeader user={user} subtitle="Portal Client · Formulir Online" />

      <div className="sticky top-0 z-30 border-b border-gray-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-lg font-black text-white" style={{ backgroundColor: theme.primaryColor }}>F</span>
              <div className="min-w-0">
                <h1 className="break-words text-base font-semibold leading-5 text-gray-900" style={fontStyle(theme.headerFont, 16)}>{form.title || 'Formulir Online'}</h1>
                <p className="break-words text-xs text-gray-500">Semua perubahan utama tersimpan di database GreenroomID</p>
              </div>
            </div>
          </div>

          <div className="hidden items-center gap-2 sm:flex">
            <button type="button" onClick={() => setShowThemePanel(true)} className="rounded-full p-2 text-gray-600 transition hover:bg-gray-100" title="Tema">🎨</button>
            <a href={publicUrl} target="_blank" rel="noreferrer" className="rounded-full p-2 text-gray-600 transition hover:bg-gray-100" title="Preview">👁</a>
            <button type="button" onClick={copyPublicLink} className="rounded-full p-2 text-gray-600 transition hover:bg-gray-100" title="Salin link">🔗</button>
            <button type="button" onClick={toggleFormDisabled} className="rounded-md border px-4 py-2 text-sm font-semibold transition hover:bg-black/5" style={{ borderColor: theme.primaryColor, color: theme.primaryColor }}>
              {form.status === 'active' ? 'Nonaktifkan' : 'Aktifkan'}
            </button>
            <button type="button" onClick={copyPublicLink} className="rounded-md px-4 py-2 text-sm font-semibold text-white transition brightness-95 hover:brightness-90" style={{ backgroundColor: theme.primaryColor }}>Publikasikan</button>
          </div>
        </div>

        <div className="mx-auto flex max-w-3xl items-center justify-center gap-4 px-4">
          <TopTab active={activeTab === 'questions'} color={theme.primaryColor} onClick={() => setActiveTab('questions')}>Pertanyaan</TopTab>
          <TopTab active={activeTab === 'responses'} color={theme.primaryColor} onClick={() => setActiveTab('responses')}>Jawaban <span className="ml-1 rounded-full bg-gray-700 px-1.5 py-0.5 text-[10px] text-white">{responses.length}</span></TopTab>
          <TopTab active={activeTab === 'settings'} color={theme.primaryColor} onClick={() => setActiveTab('settings')}>Setelan</TopTab>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-5">
        <FormCanvas theme={theme} showAds={false} preview>
        <main className="mx-auto w-full max-w-3xl">
          {activeTab === 'questions' && (
            <QuestionsBuilder
              theme={theme}
              form={form}
              setForm={setForm}
              sections={sections}
              questions={questions}
              optionsByQuestion={optionsByQuestion}
              questionForm={questionForm}
              setQuestionForm={setQuestionForm}
              sectionForm={sectionForm}
              setSectionForm={setSectionForm}
              saving={saving}
              onSaveForm={saveFormSettings}
              onAddSection={addSection}
              onUpdateSection={updateSection}
              onDeleteSection={deleteSection}
              onAddQuestion={addQuestion}
              onUpdateQuestion={updateQuestion}
              onSaveOptions={saveQuestionOptions}
              onDeleteQuestion={deleteQuestion}
              onActivateToolbar={moveToolbarTo}
            />
          )}

          {activeTab === 'responses' && (
            <ResponsesPanel
              theme={theme}
              responses={responses}
              questions={questions}
              responseCountsByQuestion={responseCountsByQuestion}
              responseTab={responseTab}
              setResponseTab={setResponseTab}
              activeResponse={activeResponse}
              activeResponseIndex={activeResponseIndex}
              setActiveResponseIndex={setActiveResponseIndex}
              expandedResponseId={expandedResponseId}
              responseDrafts={responseDrafts}
              onExport={exportResponses}
              onStartEdit={startEditResponse}
              onUpdateDraft={updateResponseDraft}
              onSaveDraft={saveResponseDraft}
              onDeleteResponse={softDeleteResponse}
            />
          )}

          {activeTab === 'settings' && (
            <SettingsPanel
              theme={theme}
              form={form}
              setForm={setForm}
              publicUrl={publicUrl}
              saving={saving}
              onSave={saveFormSettings}
              onCopy={copyPublicLink}
              onToggleStatus={toggleFormDisabled}
              onSoftDelete={softDeleteForm}
              onOpenTheme={() => setShowThemePanel(true)}
            />
          )}
        </main>
        </FormCanvas>
      </div>

      {activeTab === 'questions' && (
        <BuilderFloatingToolbar
          top={toolbarTop}
          color={theme.primaryColor}
          onAddQuestion={openNewQuestionModal}
          onAddText={() => document.getElementById('form-cover-card')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
          onAddSection={openNewSectionModal}
        />
      )}

      {showThemePanel && <ThemePanel theme={theme} onChange={updateTheme} onSave={saveFormSettings} onClose={() => setShowThemePanel(false)} saving={saving} />}
      {showNewQuestionModal && (
        <QuestionModal onClose={() => setShowNewQuestionModal(false)} title="Tambah pertanyaan baru">
          <NewQuestionCard
            theme={theme}
            questions={questions}
            sections={sections}
            questionForm={questionForm}
            setQuestionForm={setQuestionForm}
            onAddQuestion={saveQuestionFromModal}
            onActivateToolbar={() => {}}
            submitLabel="Simpan pertanyaan"
          />
        </QuestionModal>
      )}
      {showNewSectionModal && (
        <QuestionModal onClose={() => setShowNewSectionModal(false)} title="Tambah bagian baru">
          <NewSectionCard
            theme={theme}
            sectionForm={sectionForm}
            setSectionForm={setSectionForm}
            onAddSection={saveSectionFromModal}
            submitLabel="Simpan bagian"
          />
        </QuestionModal>
      )}
    </div>
  )
}

function StateShell({ user, text, action }) {
  return (
    <div className="min-h-screen bg-gray-100">
      <ClientPortalHeader user={user} subtitle="Portal Client · Formulir Online" />
      <div className="mx-auto max-w-3xl p-6">
        <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
          <p className="text-gray-500">{text}</p>
          {action}
        </div>
      </div>
    </div>
  )
}

function TopTab({ active, color = '#3f51b5', onClick, children }) {
  return (
    <button type="button" onClick={onClick} className={`relative px-4 py-3 text-sm font-medium transition ${active ? 'text-gray-950' : 'text-gray-700 hover:text-gray-950'}`}>
      {children}
      {active && <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full" style={{ backgroundColor: color }} />}
    </button>
  )
}

function BuilderFloatingToolbar({ top, color, onAddQuestion, onAddText, onAddSection }) {
  return (
    <div className="fixed right-4 z-40 hidden rounded-xl bg-white p-2 shadow-lg transition-[top,transform,opacity] duration-300 ease-out lg:block" style={{ top }}>
      <ToolButton title="Tambah pertanyaan" onClick={onAddQuestion} color={color}>＋</ToolButton>
      <ToolButton title="Edit judul/deskripsi" onClick={onAddText} color={color}>Tt</ToolButton>
      <ToolButton title="Tambah bagian" onClick={onAddSection} color={color}>▭</ToolButton>
    </div>
  )
}

function ToolButton({ title, onClick, color, children }) {
  return (
    <button type="button" title={title} onClick={onClick} className="mb-1 flex h-10 w-10 items-center justify-center rounded-full text-lg font-semibold text-gray-600 transition hover:bg-gray-100 last:mb-0 hover:scale-105" onMouseEnter={(event) => { event.currentTarget.style.color = color }} onMouseLeave={(event) => { event.currentTarget.style.color = '' }}>
      {children}
    </button>
  )
}

function HeaderImage({ src, alt }) {
  return (
    <div className="w-full overflow-hidden rounded-b-none bg-white">
      <div className="flex h-28 w-full items-center justify-center overflow-hidden bg-white sm:h-36">
        <img
          src={src}
          alt={alt}
          className="h-full w-full object-contain object-center"
        />
      </div>
    </div>
  )
}

function QuestionsBuilder({
  theme,
  form,
  setForm,
  sections,
  questions,
  optionsByQuestion,
  saving,
  onSaveForm,
  onUpdateSection,
  onDeleteSection,
  onUpdateQuestion,
  onSaveOptions,
  onDeleteQuestion,
  onActivateToolbar
}) {
  const [showCoverDetails, setShowCoverDetails] = useState(false)
  const inputFocus = (id) => ({ onMouseEnter: () => onActivateToolbar(id), onFocusCapture: () => onActivateToolbar(id) })

  return (
    <div className="space-y-3">
      <div id="form-cover-card" className="overflow-hidden rounded-lg bg-white shadow-sm" {...inputFocus('form-cover-card')}>
        <div className="h-2" style={{ backgroundColor: theme.primaryColor }} />
        {theme.headerImageUrl && <HeaderImage src={theme.headerImageUrl} alt="Header form" />}
        <div className="border-l-4 px-6 py-6" style={{ borderColor: theme.primaryColor }}>
          <div className="flex items-start gap-3">
            <textarea
              value={form.title || ''}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
              rows={2}
              className="min-h-[72px] min-w-0 flex-1 resize-y overflow-hidden border-0 border-b border-gray-300 bg-transparent px-0 py-2 font-semibold leading-tight text-gray-900 outline-none transition focus:ring-0"
              style={{ ...fontStyle(theme.headerFont, theme.headerSize), borderColor: 'rgb(209 213 219)' }}
              placeholder="Judul formulir"
            />
            <button type="button" onClick={() => setShowCoverDetails((value) => !value)} className="rounded-full p-2 text-gray-500 transition hover:bg-gray-100" title="Menu judul/deskripsi">⋮</button>
          </div>
          {showCoverDetails && (
            <div className="mt-4 rounded-md border border-gray-200 bg-gray-50 p-4">
              <p className="mb-2 text-sm font-semibold text-gray-900">Deskripsi formulir</p>
              <textarea
                value={form.description || ''}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
                rows={5}
                className="w-full resize-y rounded-md border border-gray-300 bg-white px-3 py-2 text-sm leading-6 text-gray-700 outline-none transition focus:ring-2"
                style={fontStyle(theme.bodyFont, theme.bodySize)}
                placeholder="Deskripsi formulir / petunjuk pengisian"
              />
            </div>
          )}
          <div className="mt-4 flex justify-end">
            <button type="button" onClick={onSaveForm} disabled={saving} className="rounded-md px-4 py-2 text-sm font-semibold text-white transition brightness-95 hover:brightness-90 disabled:bg-gray-300" style={{ backgroundColor: theme.primaryColor }}>
              {saving ? 'Menyimpan...' : 'Simpan judul'}
            </button>
          </div>
        </div>
      </div>

      {sections.map((section, sectionIndex) => (
        <div key={section.id} className="space-y-3">
          <SectionHeaderCard theme={theme} section={section} sectionIndex={sectionIndex} totalSections={sections.length} onUpdate={onUpdateSection} onDelete={onDeleteSection} onActivateToolbar={onActivateToolbar} />
          {questions.filter((question) => question.section_id === section.id).map((question) => (
            <QuestionEditorCard
              key={question.id}
              theme={theme}
              question={question}
              questions={questions}
              optionsText={optionsToText(optionsByQuestion[question.id] || [])}
              onUpdate={onUpdateQuestion}
              onSaveOptions={onSaveOptions}
              onDelete={onDeleteQuestion}
              onActivateToolbar={onActivateToolbar}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

function SectionHeaderCard({ theme, section, sectionIndex, totalSections, onUpdate, onDelete, onActivateToolbar }) {
  const [draft, setDraft] = useState({ title: section.title || '', description: section.description || '' })
  const [openDetails, setOpenDetails] = useState(false)

  useEffect(() => {
    setDraft({ title: section.title || '', description: section.description || '' })
  }, [section.id, section.title, section.description])

  return (
    <div id={`section-${section.id}`} className="overflow-hidden rounded-lg bg-white shadow-sm" onMouseEnter={() => onActivateToolbar(`section-${section.id}`)} onFocusCapture={() => onActivateToolbar(`section-${section.id}`)}>
      <div className="px-6 py-4 text-white" style={{ backgroundColor: theme.primaryColor }}>
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold opacity-80">Bagian {sectionIndex + 1} dari {totalSections}</p>
            <textarea value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} rows={1} className="mt-1 w-full min-w-0 resize-y border-0 border-b border-white/35 bg-transparent px-0 py-1 text-xl font-semibold leading-7 outline-none placeholder:text-white/70 focus:ring-0" placeholder="Judul bagian" />
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button type="button" onClick={() => setOpenDetails((value) => !value)} className="rounded-full p-2 text-white/85 transition hover:bg-white/10" title="Deskripsi bagian">⋮</button>
            <button type="button" onClick={() => onDelete(section)} className="rounded-full p-2 text-white/85 transition hover:bg-white/10" title="Hapus bagian">🗑</button>
          </div>
        </div>
        {openDetails && (
          <div className="mt-3 rounded-md bg-white/10 p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/80">Deskripsi bagian</p>
            <textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} rows={3} className="w-full resize-y rounded-md border border-white/25 bg-white/10 px-3 py-2 text-sm leading-6 outline-none placeholder:text-white/70 focus:ring-0" placeholder="Deskripsi bagian" />
          </div>
        )}
        <div className="mt-3 flex gap-2">
          <button type="button" onClick={() => onUpdate(section, draft)} className="rounded-md bg-white px-3 py-1.5 text-xs font-semibold" style={{ color: theme.primaryColor }}>Simpan bagian</button>
        </div>
      </div>
    </div>
  )
}

function QuestionEditorCard({ theme, question, questions, optionsText, onUpdate, onSaveOptions, onDelete, onActivateToolbar }) {
  const [draft, setDraft] = useState({
    label: question.label || '',
    helper_text: question.helper_text || '',
    placeholder: question.placeholder || '',
    is_required: Boolean(question.is_required),
    question_type: question.question_type || 'short_text',
    options_text: optionsText || '',
    conditional_parent_question_id: question.conditional_parent_question_id || '',
    conditional_operator: question.conditional_operator || 'equals',
    conditional_value: question.conditional_value || ''
  })
  const [openAdvanced, setOpenAdvanced] = useState(false)

  useEffect(() => {
    setDraft({
      label: question.label || '',
      helper_text: question.helper_text || '',
      placeholder: question.placeholder || '',
      is_required: Boolean(question.is_required),
      question_type: question.question_type || 'short_text',
      options_text: optionsText || '',
      conditional_parent_question_id: question.conditional_parent_question_id || '',
      conditional_operator: question.conditional_operator || 'equals',
      conditional_value: question.conditional_value || ''
    })
  }, [question.id, question.label, question.helper_text, question.placeholder, question.is_required, question.question_type, question.conditional_parent_question_id, question.conditional_operator, question.conditional_value, optionsText])

  const saveQuestion = async () => {
    await onUpdate(question, {
      label: draft.label,
      helper_text: draft.helper_text,
      placeholder: draft.placeholder,
      is_required: draft.is_required,
      question_type: draft.question_type,
      conditional_parent_question_id: draft.conditional_parent_question_id || null,
      conditional_operator: draft.conditional_parent_question_id ? draft.conditional_operator : null,
      conditional_value: draft.conditional_parent_question_id ? draft.conditional_value : null
    })
    if (CHOICE_QUESTION_TYPES.includes(draft.question_type)) await onSaveOptions(question, draft.options_text)
  }

  return (
    <div id={`question-${question.id}`} className="rounded-lg border-l-4 bg-white px-6 py-5 shadow-sm transition-all duration-200 hover:shadow-md" style={{ borderColor: theme.primaryColor }} onMouseEnter={() => onActivateToolbar(`question-${question.id}`)} onFocusCapture={() => onActivateToolbar(`question-${question.id}`)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <textarea value={draft.label} onChange={(event) => setDraft({ ...draft, label: event.target.value })} placeholder="Pertanyaan" rows={2} className="min-h-[54px] min-w-0 flex-1 resize-y border-0 border-b border-gray-300 bg-gray-50 px-4 py-3 leading-6 outline-none transition focus:ring-0" style={fontStyle(theme.questionFont, theme.questionSize)} />
        <select value={draft.question_type} onChange={(event) => setDraft({ ...draft, question_type: event.target.value })} className="rounded-md border border-gray-300 bg-white px-3 py-3 text-sm text-gray-700 outline-none">
          {QUESTION_TYPE_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
      </div>

      <div className="mt-4 text-xs font-semibold uppercase tracking-wide text-gray-400">{getQuestionTypeLabel(draft.question_type)}</div>

      {CHOICE_QUESTION_TYPES.includes(draft.question_type) && (
        <div className="mt-4">
          <textarea value={draft.options_text} onChange={(event) => setDraft({ ...draft, options_text: event.target.value })} rows={4} className="w-full resize-y rounded-md border border-gray-300 px-3 py-2 text-sm" placeholder={'Opsi 1\nOpsi 2'} />
          <p className="mt-1 text-xs text-gray-400">Tulis satu opsi per baris.</p>
        </div>
      )}

      {openAdvanced && <QuestionAdvancedPanel draft={draft} setDraft={setDraft} questions={questions} currentQuestionId={question.id} />}

      <div className="mt-4 flex items-center justify-between border-t border-gray-200 pt-4">
        <div className="flex items-center gap-2">
          <button type="button" onClick={saveQuestion} className="rounded-md px-4 py-2 text-sm font-semibold text-white transition brightness-95 hover:brightness-90" style={{ backgroundColor: theme.primaryColor }}>Simpan</button>
          <button type="button" onClick={() => onDelete(question)} className="rounded-full p-2 text-gray-500 transition hover:bg-red-50 hover:text-red-600" title="Hapus pertanyaan">🗑</button>
          <button type="button" onClick={() => setOpenAdvanced((value) => !value)} className="rounded-full p-2 text-gray-500 transition hover:bg-gray-100" title="Deskripsi, placeholder, dan logika">⋮</button>
        </div>
        <label className="flex items-center gap-3 text-sm font-medium text-gray-700">
          <span>Wajib diisi</span>
          <Switch checked={draft.is_required} color={theme.primaryColor} onChange={(checked) => setDraft({ ...draft, is_required: checked })} />
        </label>
      </div>
    </div>
  )
}

function QuestionModal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/35 px-4 py-8 backdrop-blur-sm" onMouseDown={onClose}>
      <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-full p-2 text-gray-500 transition hover:bg-gray-100">×</button>
        </div>
        <div className="p-4 sm:p-6">{children}</div>
      </div>
    </div>
  )
}

function NewSectionCard({ theme, sectionForm, setSectionForm, onAddSection, submitLabel = 'Tambah bagian' }) {
  return (
    <div className="rounded-lg bg-white px-2 py-1">
      <input value={sectionForm.title} onChange={(event) => setSectionForm({ ...sectionForm, title: event.target.value })} placeholder="Judul bagian" className="w-full border-0 border-b border-gray-300 px-0 py-3 text-xl font-semibold outline-none focus:ring-0" style={{ borderColor: theme.primaryColor }} />
      <textarea value={sectionForm.description} onChange={(event) => setSectionForm({ ...sectionForm, description: event.target.value })} placeholder="Deskripsi bagian" rows={4} className="mt-4 w-full resize-y rounded-md border border-gray-200 px-3 py-3 text-sm leading-6 outline-none focus:ring-2" />
      <div className="mt-5 flex items-center justify-end gap-2">
        <button type="button" onClick={() => setSectionForm({ title: '', description: '' })} className="rounded-md border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">Bersihkan</button>
        <button type="button" onClick={onAddSection} className="rounded-md px-4 py-2 text-sm font-semibold text-white transition brightness-95 hover:brightness-90" style={{ backgroundColor: theme.primaryColor }}>{submitLabel}</button>
      </div>
    </div>
  )
}

function NewQuestionCard({ theme, questions, sections, questionForm, setQuestionForm, onAddQuestion, onActivateToolbar = () => {}, submitLabel = 'Tambah pertanyaan' }) {
  const [openAdvanced, setOpenAdvanced] = useState(false)

  return (
    <div className="rounded-lg border-l-4 bg-white px-6 py-5 shadow-sm" style={{ borderColor: theme.primaryColor }} onMouseEnter={() => onActivateToolbar('new-question-card')} onFocusCapture={() => onActivateToolbar('new-question-card')}>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <textarea
          value={questionForm.label}
          onChange={(event) => setQuestionForm({ ...questionForm, label: event.target.value })}
          placeholder="Pertanyaan"
          rows={2}
          className="min-h-[54px] min-w-0 flex-1 resize-y border-0 border-b border-gray-300 bg-gray-50 px-4 py-3 leading-6 outline-none transition focus:ring-0"
          style={fontStyle(theme.questionFont, theme.questionSize)}
        />
        <select value={questionForm.question_type} onChange={(event) => setQuestionForm({ ...questionForm, question_type: event.target.value })} className="rounded-md border border-gray-300 bg-white px-3 py-3 text-sm text-gray-700 outline-none">
          {QUESTION_TYPE_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
      </div>

      <select value={questionForm.section_id} onChange={(event) => setQuestionForm({ ...questionForm, section_id: event.target.value })} className="mb-4 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700">
        <option value="">Pilih bagian</option>
        {sections.map((section) => <option key={section.id} value={section.id}>{section.title}</option>)}
      </select>

      {CHOICE_QUESTION_TYPES.includes(questionForm.question_type) && (
        <textarea value={questionForm.options_text} onChange={(event) => setQuestionForm({ ...questionForm, options_text: event.target.value })} rows={4} className="w-full resize-y rounded-md border border-gray-300 px-3 py-2 text-sm" placeholder={'Opsi 1\nOpsi 2'} />
      )}

      {openAdvanced && <QuestionAdvancedPanel draft={questionForm} setDraft={setQuestionForm} questions={questions} currentQuestionId={null} />}

      <div className="mt-4 flex items-center justify-between border-t border-gray-200 pt-4">
        <label className="flex items-center gap-3 text-sm font-medium text-gray-700">
          <span>Wajib diisi</span>
          <Switch checked={questionForm.is_required} color={theme.primaryColor} onChange={(checked) => setQuestionForm({ ...questionForm, is_required: checked })} />
        </label>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setOpenAdvanced((value) => !value)} className="rounded-full p-2 text-gray-500 transition hover:bg-gray-100" title="Deskripsi, placeholder, dan logika">⋮</button>
          <button type="button" onClick={onAddQuestion} className="rounded-md px-4 py-2 text-sm font-semibold text-white transition brightness-95 hover:brightness-90" style={{ backgroundColor: theme.primaryColor }}>{submitLabel}</button>
        </div>
      </div>
    </div>
  )
}

function QuestionAdvancedPanel({ draft, setDraft, questions, currentQuestionId }) {
  return (
    <div className="mt-4 rounded-md bg-gray-50 p-4">
      <p className="mb-3 text-sm font-semibold text-gray-900">Deskripsi, placeholder, dan logika</p>
      <input value={draft.placeholder} onChange={(event) => setDraft({ ...draft, placeholder: event.target.value })} placeholder="Placeholder / contoh jawaban" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
      <textarea value={draft.helper_text} onChange={(event) => setDraft({ ...draft, helper_text: event.target.value })} placeholder="Deskripsi pertanyaan / petunjuk kecil" rows={3} className="mt-3 w-full resize-y rounded-md border border-gray-300 px-3 py-2 text-sm" />
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <select value={draft.conditional_parent_question_id} onChange={(event) => setDraft({ ...draft, conditional_parent_question_id: event.target.value })} className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm">
          <option value="">Selalu tampil</option>
          {questions.filter((item) => item.id !== currentQuestionId).map((item) => <option key={item.id} value={item.id}>Jika: {item.label}</option>)}
        </select>
        <select value={draft.conditional_operator} onChange={(event) => setDraft({ ...draft, conditional_operator: event.target.value })} className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm" disabled={!draft.conditional_parent_question_id}>
          {CONDITION_OPERATORS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
        <input value={draft.conditional_value} onChange={(event) => setDraft({ ...draft, conditional_value: event.target.value })} placeholder="Nilai pemicu" disabled={!draft.conditional_parent_question_id} className="rounded-md border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100" />
      </div>
    </div>
  )
}

function Switch({ checked, color = '#3f51b5', onChange }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="relative h-5 w-10 rounded-full bg-gray-300 transition-colors duration-200" style={{ backgroundColor: checked ? color : '#d1d5db' }} aria-pressed={checked}>
      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all duration-200 ${checked ? 'left-5' : 'left-0.5'}`} />
    </button>
  )
}

function ResponsesPanel({
  theme,
  responses,
  questions,
  responseCountsByQuestion,
  responseTab,
  setResponseTab,
  activeResponse,
  activeResponseIndex,
  setActiveResponseIndex,
  expandedResponseId,
  responseDrafts,
  onExport,
  onStartEdit,
  onUpdateDraft,
  onSaveDraft,
  onDeleteResponse
}) {
  return (
    <div className="space-y-3">
      <div className="rounded-lg bg-white px-6 py-5 shadow-sm sm:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-3xl font-normal text-gray-900">{responses.length} jawaban</h2>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setResponseTab('sheet')} className="rounded-md px-3 py-2 text-sm font-semibold transition hover:bg-blue-50" style={{ color: '#1a73e8' }}>▦ Lihat di Spreadsheet</button>
            <button type="button" onClick={onExport} disabled={responses.length === 0} className="rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-black disabled:bg-gray-300">Export CSV</button>
          </div>
        </div>
        <div className="mt-6 flex justify-around border-b border-gray-200">
          <TopTab active={responseTab === 'summary'} color={theme.primaryColor} onClick={() => setResponseTab('summary')}>Ringkasan</TopTab>
          <TopTab active={responseTab === 'questions'} color={theme.primaryColor} onClick={() => setResponseTab('questions')}>Pertanyaan</TopTab>
          <TopTab active={responseTab === 'individual'} color={theme.primaryColor} onClick={() => setResponseTab('individual')}>Individual</TopTab>
          <TopTab active={responseTab === 'sheet'} color={theme.primaryColor} onClick={() => setResponseTab('sheet')}>Spreadsheet</TopTab>
        </div>
      </div>

      {responseTab === 'summary' && (
        <div className="space-y-3">
          {responseCountsByQuestion.map(({ question, total, entries }) => (
            <div key={question.id} className="rounded-lg bg-white p-6 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h3 className="break-words text-base font-semibold text-gray-900">{question.label}</h3>
                  <p className="mt-1 text-xs text-gray-500">{total} jawaban</p>
                </div>
                <button type="button" className="shrink-0 rounded-md px-3 py-2 text-sm font-semibold text-[#1a73e8] hover:bg-blue-50">Salin diagram</button>
              </div>
              <div className="mt-6 grid gap-6 md:grid-cols-[240px_minmax(0,1fr)] md:items-center">
                <PieChart entries={entries} total={total} />
                <div className="space-y-2">
                  {entries.map(([label, count], index) => (
                    <div key={label} className="flex min-w-0 items-center gap-2 text-sm text-gray-700">
                      <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: chartColors[index % chartColors.length] }} />
                      <span className="min-w-0 flex-1 break-words">{label}</span>
                      <span className="shrink-0 text-gray-500">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {responseTab === 'questions' && (
        <div className="space-y-3">
          {responseCountsByQuestion.map(({ question, entries }) => (
            <div key={question.id} className="rounded-lg bg-white p-6 shadow-sm">
              <h3 className="break-words text-base font-semibold text-gray-900">{question.label}</h3>
              <div className="mt-4 space-y-2">
                {entries.map(([label, count]) => <div key={label} className="flex justify-between gap-3 border-b border-gray-100 py-2 text-sm"><span className="break-words text-gray-700">{label}</span><span className="shrink-0 font-semibold text-gray-900">{count}</span></div>)}
              </div>
            </div>
          ))}
        </div>
      )}

      {responseTab === 'individual' && (
        <div className="rounded-lg bg-white p-6 shadow-sm">
          {responses.length === 0 ? <p className="text-sm text-gray-500">Belum ada respons.</p> : (
            <>
              <div className="mb-4 flex items-center justify-between">
                <button type="button" onClick={() => setActiveResponseIndex(Math.max(activeResponseIndex - 1, 0))} disabled={activeResponseIndex === 0} className="rounded-md border border-gray-300 px-3 py-2 text-sm disabled:opacity-40">Sebelumnya</button>
                <span className="text-sm text-gray-500">Respons {activeResponseIndex + 1} dari {responses.length}</span>
                <button type="button" onClick={() => setActiveResponseIndex(Math.min(activeResponseIndex + 1, responses.length - 1))} disabled={activeResponseIndex >= responses.length - 1} className="rounded-md border border-gray-300 px-3 py-2 text-sm disabled:opacity-40">Berikutnya</button>
              </div>
              <ResponseDetail response={activeResponse} questions={questions} />
            </>
          )}
        </div>
      )}

      {responseTab === 'sheet' && (
        <SpreadsheetResponses responses={responses} questions={questions} expandedResponseId={expandedResponseId} responseDrafts={responseDrafts} onStartEdit={onStartEdit} onUpdateDraft={onUpdateDraft} onSaveDraft={onSaveDraft} onDeleteResponse={onDeleteResponse} />
      )}
    </div>
  )
}

function PieChart({ entries, total }) {
  if (!total) return <div className="flex h-48 w-48 items-center justify-center rounded-full bg-gray-100 text-sm text-gray-400">Belum ada data</div>
  const gradientParts = entries.reduce((acc, entry, index) => {
    const count = entry[1]
    const start = acc.total
    const end = start + (count / total) * 100
    return {
      total: end,
      parts: [...acc.parts, `${chartColors[index % chartColors.length]} ${start}% ${end}%`]
    }
  }, { total: 0, parts: [] })
  const gradient = gradientParts.parts.join(', ')
  return (
    <div className="mx-auto flex h-48 w-48 items-center justify-center rounded-full text-sm font-semibold text-white" style={{ background: `conic-gradient(${gradient})` }}>
      {entries.length === 1 ? '100%' : ''}
    </div>
  )
}

function ResponseDetail({ response, questions }) {
  return (
    <div className="divide-y divide-gray-100">
      {questions.map((question) => (
        <div key={question.id} className="py-3">
          <p className="break-words text-xs font-medium text-gray-500">{question.label}</p>
          <p className="mt-1 break-words text-sm text-gray-900">{formatAnswerValue(response?.answers_json?.[question.id]?.value)}</p>
        </div>
      ))}
    </div>
  )
}

function SpreadsheetResponses({ responses, questions, expandedResponseId, responseDrafts, onStartEdit, onUpdateDraft, onSaveDraft, onDeleteResponse }) {
  return (
    <div className="overflow-hidden rounded-lg bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse text-left text-sm">
          <thead className="sticky top-0 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="border-b border-r border-gray-200 px-4 py-3">Timestamp</th>
              {questions.map((question) => <th key={question.id} className="min-w-[180px] border-b border-r border-gray-200 px-4 py-3 break-words">{question.label}</th>)}
              <th className="border-b border-gray-200 px-4 py-3">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {responses.map((response) => (
              <tr key={response.id} className="align-top hover:bg-gray-50">
                <td className="border-b border-r border-gray-100 px-4 py-3 text-gray-600">{new Date(response.created_at).toLocaleString('id-ID')}</td>
                {questions.map((question) => <td key={question.id} className="max-w-[260px] border-b border-r border-gray-100 px-4 py-3 break-words text-gray-800">{formatAnswerValue(response.answers_json?.[question.id]?.value)}</td>)}
                <td className="border-b border-gray-100 px-4 py-3">
                  <div className="flex gap-2">
                    <button type="button" onClick={() => onStartEdit(response)} className="text-xs font-semibold text-blue-700 hover:underline">Edit</button>
                    <button type="button" onClick={() => onDeleteResponse(response)} className="text-xs font-semibold text-red-700 hover:underline">Hapus</button>
                  </div>
                  {expandedResponseId === response.id && (
                    <div className="mt-3 min-w-[320px] rounded-md border border-gray-200 bg-white p-3 shadow-sm">
                      {questions.map((question) => (
                        <label key={question.id} className="mb-3 block text-xs font-medium text-gray-600">
                          <span className="break-words">{question.label}</span>
                          <textarea value={responseDrafts[response.id]?.[question.id] ?? ''} onChange={(event) => onUpdateDraft(response.id, question, event.target.value)} rows={2} className="mt-1 w-full resize-y rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900" />
                        </label>
                      ))}
                      <button type="button" onClick={() => onSaveDraft(response)} className="rounded-md bg-gray-900 px-4 py-2 text-xs font-semibold text-white">Simpan edit</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {responses.length === 0 && <tr><td colSpan={questions.length + 2} className="px-4 py-8 text-center text-sm text-gray-500">Belum ada respons.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function SettingsPanel({ theme, form, setForm, publicUrl, saving, onSave, onCopy, onToggleStatus, onSoftDelete, onOpenTheme }) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-white p-6 shadow-sm sm:p-8">
        <h2 className="text-xl font-normal text-gray-900">Setelan</h2>
        <div className="mt-5 divide-y divide-gray-200 border-t border-gray-200">
          <SettingRow title="Status link formulir" description="Mengelola apakah responden masih dapat mengirim jawaban.">
            <button type="button" onClick={onToggleStatus} className="rounded-md border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">{form.status === 'active' ? 'Nonaktifkan' : 'Aktifkan'}</button>
          </SettingRow>
          <SettingRow title="Slug / nama link" description="Nama pendek pada URL publik formulir.">
            <input value={form.slug || ''} onChange={(event) => setForm({ ...form, slug: event.target.value })} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
          </SettingRow>
          <SettingRow title="Link publik" description="Bagikan link ini kepada responden.">
            <div className="flex gap-2">
              <input value={publicUrl} readOnly className="min-w-0 flex-1 rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-600" />
              <button type="button" onClick={onCopy} className="rounded-md px-4 py-2 text-sm font-semibold text-white" style={{ backgroundColor: theme.primaryColor }}>Salin</button>
            </div>
          </SettingRow>
          <SettingRow title="Tema" description="Mengelola font, ukuran teks, warna, header, dan gambar iklan sisi kiri/kanan form.">
            <button type="button" onClick={onOpenTheme} className="rounded-md border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">Buka tema</button>
          </SettingRow>
        </div>
        <button type="button" onClick={onSave} disabled={saving} className="mt-6 rounded-md px-5 py-2.5 text-sm font-semibold text-white disabled:bg-gray-300" style={{ backgroundColor: theme.primaryColor }}>{saving ? 'Menyimpan...' : 'Simpan setelan'}</button>
      </div>

      <div className="rounded-lg bg-white p-6 shadow-sm sm:p-8">
        <h2 className="text-xl font-normal text-gray-900">Default</h2>
        <div className="mt-5 divide-y divide-gray-200 border-t border-gray-200">
          <SettingRow title="Formulir default" description="Satu request hanya untuk satu form. Jika ingin membuat form baru, buat request baru." />
          <SettingRow title="Pertanyaan default" description="Setiap pertanyaan dapat dibuat wajib, diberi opsi, dan diberi logika tampil berdasarkan jawaban." />
        </div>
      </div>

      <div className="rounded-lg bg-white p-6 shadow-sm sm:p-8">
        <h2 className="text-xl font-normal text-red-700">Zona hapus</h2>
        <p className="mt-2 text-sm leading-6 text-gray-600">Penghapusan oleh pemilik link hanya soft delete. Admin masih dapat melihat dan menghapus permanen dari panel admin.</p>
        <button type="button" onClick={onSoftDelete} className="mt-5 rounded-md border border-red-200 px-5 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-50">Hapus form dari sisi saya</button>
      </div>
    </div>
  )
}

function SettingRow({ title, description, children }) {
  return (
    <div className="grid gap-3 py-6 sm:grid-cols-[minmax(0,1fr)_minmax(220px,320px)] sm:items-center">
      <div className="min-w-0">
        <h3 className="break-words text-base font-medium text-gray-900">{title}</h3>
        {description && <p className="mt-1 break-words text-sm text-gray-500">{description}</p>}
      </div>
      {children && <div className="min-w-0">{children}</div>}
    </div>
  )
}

function ThemePanel({ theme, onChange, onSave, onClose, saving }) {
  const uploadImage = (field, file) => {
    if (!file) return
    if (file.size > 700 * 1024) {
      alert('Ukuran gambar terlalu besar. Kompres gambar di bawah 700 KB agar database tetap ringan.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => onChange({ [field]: reader.result })
    reader.readAsDataURL(file)
  }

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full max-w-sm border-l border-gray-200 bg-white shadow-2xl transition-transform duration-300">
      <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="text-xl">🎨</span>
          <h2 className="text-base font-semibold text-gray-900">Tema</h2>
        </div>
        <button type="button" onClick={onClose} className="rounded-full p-2 text-gray-500 hover:bg-gray-100">×</button>
      </div>
      <div className="h-[calc(100vh-65px)] space-y-6 overflow-y-auto px-5 py-5">
        <div>
          <h3 className="mb-3 text-sm font-semibold text-gray-900">Gaya teks</h3>
          <div className="space-y-3">
            <ThemeFontSelect label="Header" fontValue={theme.headerFont} sizeValue={theme.headerSize} onFont={(value) => onChange({ headerFont: value })} onSize={(value) => onChange({ headerSize: Number(value) })} />
            <ThemeFontSelect label="Pertanyaan" fontValue={theme.questionFont} sizeValue={theme.questionSize} onFont={(value) => onChange({ questionFont: value })} onSize={(value) => onChange({ questionSize: Number(value) })} />
            <ThemeFontSelect label="Teks" fontValue={theme.bodyFont} sizeValue={theme.bodySize} onFont={(value) => onChange({ bodyFont: value })} onSize={(value) => onChange({ bodySize: Number(value) })} />
          </div>
        </div>

        <div className="border-t border-gray-200 pt-5">
          <h3 className="mb-3 text-sm font-semibold text-gray-900">Warna tema</h3>
          <div className="flex flex-wrap gap-2">
            {THEME_COLORS.map((color) => <button type="button" key={color} onClick={() => onChange({ primaryColor: color })} className="h-9 w-9 rounded-full border-2 transition hover:scale-105" style={{ backgroundColor: color, borderColor: theme.primaryColor === color ? '#111827' : '#e5e7eb' }} />)}
          </div>
        </div>

        <div className="border-t border-gray-200 pt-5">
          <h3 className="mb-3 text-sm font-semibold text-gray-900">Warna latar</h3>
          <div className="flex flex-wrap gap-2">
            {BACKGROUND_COLORS.map((color) => <button type="button" key={color} onClick={() => onChange({ backgroundColor: color })} className="h-9 w-9 rounded-full border-2 transition hover:scale-105" style={{ backgroundColor: color, borderColor: theme.backgroundColor === color ? '#111827' : '#e5e7eb' }} />)}
          </div>
        </div>

        <HeaderThemeImageInput value={theme.headerImageUrl} onChange={(value) => onChange({ headerImageUrl: value })} onUpload={(file) => uploadImage('headerImageUrl', file)} />
        <ThemeAdCards theme={theme} onChange={onChange} onUpload={uploadImage} />

        <div className="border-t border-gray-200 pt-5">
          <button type="button" onClick={onSave} disabled={saving} className="w-full rounded-md px-4 py-2.5 text-sm font-semibold text-white disabled:bg-gray-300" style={{ backgroundColor: theme.primaryColor }}>{saving ? 'Menyimpan...' : 'Simpan tema'}</button>
          <p className="mt-2 text-xs leading-5 text-gray-500">Gambar sisi kiri/kanan akan tampil di halaman responden pada layar desktop, tidak menempel dekat form.</p>
        </div>
      </div>
    </div>
  )
}

function ThemeFontSelect({ label, fontValue, sizeValue, onFont, onSize }) {
  return (
    <div>
      <p className="mb-1 text-sm text-gray-700">{label}</p>
      <div className="grid grid-cols-[minmax(0,1fr)_64px] gap-2">
        <select value={fontValue} onChange={(event) => onFont(event.target.value)} className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700">
          {FONT_OPTIONS.map((font) => <option key={font} value={font}>{font}</option>)}
        </select>
        <select value={sizeValue} onChange={(event) => onSize(event.target.value)} className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700">
          {[10, 12, 14, 16, 18, 20, 24, 28, 30, 32, 36].map((size) => <option key={size} value={size}>{size}</option>)}
        </select>
      </div>
    </div>
  )
}

function HeaderThemeImageInput({ value, onChange, onUpload }) {
  return (
    <div className="border-t border-gray-200 pt-5">
      <h3 className="mb-3 text-sm font-semibold text-gray-900">Header form</h3>
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        {value ? <HeaderImage src={value} alt="Preview header form" /> : <div className="flex h-32 items-center justify-center text-sm text-gray-400">Belum ada gambar header</div>}
      </div>
      <input value={value || ''} onChange={(event) => onChange(event.target.value)} placeholder="URL gambar header atau upload file" className="mt-3 w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
      <label className="mt-2 inline-flex cursor-pointer rounded-md border border-[#1a73e8] px-4 py-2 text-sm font-semibold text-[#1a73e8] hover:bg-blue-50">
        Upload header
        <input type="file" accept="image/*" className="hidden" onChange={(event) => onUpload(event.target.files?.[0])} />
      </label>
      {value && <button type="button" onClick={() => onChange('')} className="ml-2 text-sm font-semibold text-red-600 hover:underline">Hapus</button>}
      <p className="mt-2 text-xs leading-5 text-gray-500">Gambar header memakai mode contain: gambar tidak dipotong, area kosong akan tetap putih jika rasio gambar berbeda.</p>
    </div>
  )
}

function ThemeAdCards({ theme, onChange, onUpload }) {
  const renderCard = ({ side, imageField, linkField, title }) => {
    const inputId = `ad-upload-${side}`
    const imageValue = theme[imageField] || ''
    const linkValue = theme[linkField] || ''

    return (
      <div className="rounded-xl border border-gray-200 bg-white p-3">
        <button type="button" onClick={() => document.getElementById(inputId)?.click()} className="group relative flex aspect-[4/5] w-full items-center justify-center overflow-hidden rounded-xl border border-dashed border-gray-300 bg-gray-50 text-center text-sm text-gray-500 transition hover:border-[#1a73e8] hover:bg-blue-50">
          {imageValue ? (
            <img src={imageValue} alt={title} className="h-full w-full object-cover transition duration-200 group-hover:scale-[1.02]" />
          ) : (
            <span className="px-3">Ketuk card untuk upload {title.toLowerCase()}</span>
          )}
          <input id={inputId} type="file" accept="image/*" className="hidden" onChange={(event) => onUpload(imageField, event.target.files?.[0])} />
        </button>
        <label className="mt-3 block text-xs font-semibold uppercase tracking-wide text-gray-500">Link ketika gambar diklik</label>
        <input value={linkValue} onChange={(event) => onChange({ [linkField]: event.target.value })} placeholder="contoh: greenroomid.com" className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
        <p className="mt-1 text-[11px] leading-4 text-gray-400">Tanpa https:// tetap dibuka sebagai link luar.</p>
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-gray-600">{title}</span>
          {imageValue && <button type="button" onClick={() => onChange({ [imageField]: '', [linkField]: '' })} className="text-xs font-semibold text-red-600 hover:underline">Hapus</button>}
        </div>
      </div>
    )
  }

  return (
    <div className="border-t border-gray-200 pt-5">
      <h3 className="mb-2 text-sm font-semibold text-gray-900">Iklan sisi form</h3>
      <p className="mb-3 text-xs leading-5 text-gray-500">Setiap sisi memiliki 2 card iklan. Gambar tampil di kiri dan kanan form pada layar desktop. Ketika diklik, responden diarahkan ke link yang diisi.</p>
      <div className="space-y-4">
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-500">Sisi kiri</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {renderCard({ side: 'left-1', imageField: 'leftAdImageUrl', linkField: 'leftAdLink', title: 'Iklan kiri 1' })}
            {renderCard({ side: 'left-2', imageField: 'leftAdImageUrl2', linkField: 'leftAdLink2', title: 'Iklan kiri 2' })}
          </div>
        </div>
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-500">Sisi kanan</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {renderCard({ side: 'right-1', imageField: 'rightAdImageUrl', linkField: 'rightAdLink', title: 'Iklan kanan 1' })}
            {renderCard({ side: 'right-2', imageField: 'rightAdImageUrl2', linkField: 'rightAdLink2', title: 'Iklan kanan 2' })}
          </div>
        </div>
      </div>
    </div>
  )
}

function FormCanvas({ theme, showAds = true, preview = false, children }) {
  if (!showAds) return <div className="mx-auto w-full max-w-3xl">{children}</div>

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[180px_minmax(0,768px)_180px] 2xl:grid-cols-[220px_minmax(0,768px)_220px] xl:items-start xl:justify-center">
      <FormAdColumn theme={theme} side="left" preview={preview} />
      <div className="min-w-0">{children}</div>
      <FormAdColumn theme={theme} side="right" preview={preview} />
    </div>
  )
}

function FormAdColumn({ theme, side, preview = false }) {
  const slots = side === 'left'
    ? [
      { image: theme.leftAdImageUrl, link: theme.leftAdLink, label: 'Iklan kiri 1' },
      { image: theme.leftAdImageUrl2, link: theme.leftAdLink2, label: 'Iklan kiri 2' }
    ]
    : [
      { image: theme.rightAdImageUrl, link: theme.rightAdLink, label: 'Iklan kanan 1' },
      { image: theme.rightAdImageUrl2, link: theme.rightAdLink2, label: 'Iklan kanan 2' }
    ]

  const visibleSlots = preview ? slots : slots.filter((slot) => slot.image)
  if (visibleSlots.length === 0) return <div className="hidden xl:block" />

  return (
    <aside className="hidden space-y-5 xl:sticky xl:top-32 xl:block">
      {visibleSlots.map((slot, index) => (
        <AdPreviewCard key={`${side}-${index}`} slot={slot} preview={preview} />
      ))}
    </aside>
  )
}

function AdPreviewCard({ slot, preview = false }) {
  const image = slot.image
  const card = (
    <div className="group flex aspect-[4/5] w-full items-center justify-center overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-black/10 transition duration-200 hover:shadow-md">
      {image ? (
        <img src={image} alt={slot.label} className="h-full w-full object-cover transition duration-200 group-hover:scale-[1.015]" />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-orange-500 px-4 text-center text-xs font-semibold text-white">
          {slot.label}<br />belum diisi
        </div>
      )}
    </div>
  )

  const href = normalizeExternalUrl(slot.link)
  if (href && image) return <a href={href} target="_blank" rel="noreferrer" className="block">{card}</a>
  if (preview) return card
  return image ? card : null
}

export default ClientFormWorkspacePage
