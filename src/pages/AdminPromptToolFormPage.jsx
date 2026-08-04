import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import PromptToolBuilder from '../components/admin/PromptToolBuilder'
import PromptToolDeployProgress from '../components/admin/PromptToolDeployProgress'
import { supabase } from '../supabase'
import { formatMaterialDate } from '../utils/learningMaterials'
import {
  getPromptToolDeployStatusLabel,
  hasPromptToolUndeployedChanges,
  isValidPromptSlug,
  slugifyPromptTitle,
  triggerPromptToolDeploy,
  validatePromptDraft,
  validatePromptToolPublish,
} from '../utils/promptTools'

function FieldLabel({ children, optional = false }) {
  return (
    <span className="mb-1.5 block text-sm font-bold text-gray-700">
      {children}
      {optional && (
        <span className="font-normal text-gray-400"> (opsional)</span>
      )}
    </span>
  )
}

function TextInput({
  label,
  value,
  onChange,
  placeholder = '',
  optional = false,
  disabled = false,
  hint = '',
}) {
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
      {hint && (
        <p className="mt-1.5 text-xs leading-relaxed text-gray-400">
          {hint}
        </p>
      )}
    </label>
  )
}

function TextArea({
  label,
  value,
  onChange,
  placeholder = '',
  rows = 5,
  optional = false,
  hint = '',
}) {
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
      {hint && (
        <p className="mt-1.5 text-xs leading-relaxed text-gray-400">
          {hint}
        </p>
      )}
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
        window.clearTimeout(copyTimeoutRef.current)
      }
    }
  }, [])

  const placeholderPattern = /{{\s*([^}]+)\s*}}/g
  const found = []
  let match

  while ((match = placeholderPattern.exec(template || '')) !== null) {
    found.push(match[1])
  }

  const placeholders = Array.from(
    new Set(found.map((item) => item.trim()).filter(Boolean)),
  )
  const knownVariables = questions
    .map((question) => question.variable_name)
    .filter(Boolean)
  const unknownVariables = placeholders.filter((placeholder) => (
    !knownVariables.includes(placeholder)
  ))
  const unusedQuestions = questions.filter((question) => (
    !placeholders.includes(question.variable_name)
  ))

  const handleCopy = async (placeholder) => {
    try {
      await navigator.clipboard.writeText(placeholder)
      setCopiedPlaceholder(placeholder)
      setCopyMessage('Placeholder berhasil disalin.')

      if (copyTimeoutRef.current) {
        window.clearTimeout(copyTimeoutRef.current)
      }

      copyTimeoutRef.current = window.setTimeout(() => {
        setCopiedPlaceholder('')
        setCopyMessage('')
      }, 1800)
    } catch {
      setCopyMessage('Placeholder belum berhasil disalin. Silakan coba lagi.')
    }
  }

  return (
    <div className="space-y-2">
      {unknownVariables.length > 0 && (
        <div className="rounded border border-yellow-200 bg-yellow-50 p-2 text-sm text-amber-800">
          Template mengandung placeholder tidak dikenal: {unknownVariables.join(', ')}. Publikasi akan diblokir sampai diperbaiki.
        </div>
      )}

      <div className="rounded border border-gray-100 bg-white p-2">
        <div className="font-bold">Variabel tersedia untuk template</div>
        <div className="mt-2 grid grid-cols-1 gap-1 text-xs text-gray-600">
          {knownVariables.length === 0 && (
            <div className="text-gray-400">Belum ada pertanyaan.</div>
          )}

          {knownVariables.map((variableName) => {
            const placeholder = `{{${variableName}}}`
            const isCopied = copiedPlaceholder === placeholder

            return (
              <div
                key={variableName}
                className="flex items-center justify-between gap-2"
              >
                <code className="rounded bg-gray-100 px-2 py-1">
                  {placeholder}
                </code>
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

      {unusedQuestions.length > 0 && (
        <div className="text-xs text-gray-500">
          Pertanyaan belum digunakan di template: {unusedQuestions
            .map((question) => question.label)
            .slice(0, 5)
            .join(', ')}
          {unusedQuestions.length > 5
            ? ` (+${unusedQuestions.length - 5} lainnya)`
            : ''}
        </div>
      )}
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
  meta_description: '',
}

const TOOL_STATUS_LABELS = {
  draft: 'Draft',
  published: 'Published',
  archived: 'Diarsipkan',
}

function AdminPromptToolFormPage({ user }) {
  const { toolId } = useParams()
  const navigate = useNavigate()
  const isEditing = Boolean(toolId)

  const [form, setForm] = useState(emptyForm)
  const [tool, setTool] = useState(null)
  const [loading, setLoading] = useState(isEditing)
  const [saving, setSaving] = useState(false)
  const [savingAction, setSavingAction] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [builderWarning, setBuilderWarning] = useState('')
  const [slugEdited, setSlugEdited] = useState(false)
  const [activeTab, setActiveTab] = useState('settings')
  const [questionsList, setQuestionsList] = useState([])

  const loadQuestionsList = useCallback(async () => {
    if (!toolId) return

    const { data } = await supabase
      .from('prompt_tool_questions')
      .select('id, label, variable_name, section_id')
      .eq('tool_id', toolId)
      .order('sort_order', { ascending: true })

    setQuestionsList(data || [])
  }, [toolId])

  const fetchTool = useCallback(async ({ showLoading = false } = {}) => {
    if (!isEditing) return

    if (showLoading) {
      setLoading(true)
    }

    const { data, error } = await supabase
      .from('prompt_tools')
      .select('*')
      .eq('id', toolId)
      .maybeSingle()

    if (error) {
      setErrorMessage('Tool belum dapat dimuat. Silakan coba lagi.')
    } else if (!data) {
      setErrorMessage('Tool tidak ditemukan.')
    } else {
      setTool(data)
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
      })
      setSlugEdited(true)
    }

    if (showLoading) {
      setLoading(false)
    }
  }, [isEditing, toolId])

  useEffect(() => {
    if (!isEditing) return

    fetchTool({ showLoading: true })
    loadQuestionsList()
  }, [fetchTool, isEditing, loadQuestionsList])

  const slugValid = useMemo(
    () => isValidPromptSlug(form.slug),
    [form.slug],
  )

  const updateField = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }))
  }

  const updateTitle = (value) => {
    setForm((current) => ({
      ...current,
      title: value,
      slug: slugEdited
        ? current.slug
        : slugifyPromptTitle(value),
    }))
  }

  const updateSlug = (value) => {
    setSlugEdited(true)
    updateField('slug', slugifyPromptTitle(value))
  }

  const getPayload = () => ({
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
    meta_description: form.meta_description.trim() || null,
  })

  const getSaveErrorMessage = (error) => {
    if (
      error?.code === '23505'
      || /prompt_tools_slug_unique|duplicate key/i.test(error?.message || '')
    ) {
      return 'Slug sudah digunakan oleh tool lain.'
    }

    return 'Tool belum dapat disimpan. Silakan coba lagi.'
  }

  const beginSaving = (action) => {
    setSaving(true)
    setSavingAction(action)
    setErrorMessage('')
    setSuccessMessage('')
  }

  const endSaving = () => {
    setSaving(false)
    setSavingAction('')
  }

  const markDeployPendingLocally = () => {
    setTool((currentTool) => (
      currentTool
        ? {
          ...currentTool,
          last_deploy_status: 'pending',
          last_deploy_triggered_at: new Date().toISOString(),
        }
        : currentTool
    ))
  }

  const saveDraft = async () => {
    const validationError = validatePromptDraft(form)

    if (validationError) {
      setErrorMessage(validationError)
      return
    }

    beginSaving('draft')
    const payload = getPayload()

    if (isEditing) {
      const { error } = await supabase
        .from('prompt_tools')
        .update(payload)
        .eq('id', toolId)

      endSaving()

      if (error) {
        setErrorMessage(getSaveErrorMessage(error))
        return
      }

      navigate('/admin/tools', {
        replace: true,
        state: {
          message: tool?.status === 'archived'
            ? 'Perubahan tool berhasil disimpan.'
            : 'Draft berhasil disimpan.',
          messageType: 'success',
        },
      })
      return
    }

    const { error } = await supabase
      .from('prompt_tools')
      .insert({
        ...payload,
        status: 'draft',
        author_id: user?.id || null,
      })

    endSaving()

    if (error) {
      setErrorMessage(getSaveErrorMessage(error))
      return
    }

    navigate('/admin/tools', {
      replace: true,
      state: {
        message: 'Tool baru berhasil disimpan sebagai draft.',
        messageType: 'success',
      },
    })
  }

  const publishTool = async () => {
    const confirmed = window.confirm(
      'Tool akan tersedia untuk publik dan deployment website akan diminta.',
    )

    if (!confirmed) return

    const payload = getPayload()
    const validationResult = await validatePromptToolPublish(
      toolId,
      payload,
    )

    if (!validationResult.success) {
      setErrorMessage(validationResult.error)
      return
    }

    beginSaving('publish')

    const { error: updateError } = await supabase
      .from('prompt_tools')
      .update({
        ...payload,
        status: 'published',
      })
      .eq('id', toolId)

    if (updateError) {
      endSaving()
      setErrorMessage(getSaveErrorMessage(updateError))
      return
    }

    markDeployPendingLocally()

    const deployResult = await triggerPromptToolDeploy(
      toolId,
      'publish',
    )

    endSaving()
    await fetchTool()

    if (!deployResult.success) {
      setErrorMessage(
        'Tool sudah berstatus published, tetapi deployment belum berhasil diminta. Gunakan tombol Deploy Ulang pada daftar tools. '
        + deployResult.error,
      )
      return
    }

    setSuccessMessage('Tool dipublikasikan dan deployment berhasil diminta.')
  }

  const saveWithoutDeploy = async () => {
    const validationError = validatePromptDraft(form)

    if (validationError) {
      setErrorMessage(validationError)
      return
    }

    beginSaving('without_deploy')

    const { error } = await supabase
      .from('prompt_tools')
      .update(getPayload())
      .eq('id', toolId)

    endSaving()

    if (error) {
      setErrorMessage(getSaveErrorMessage(error))
      return
    }

    await fetchTool()
    setSuccessMessage(
      'Perubahan tersimpan, tetapi belum diterapkan ke halaman production.',
    )
  }

  const saveAndApplyChanges = async () => {
    const payload = getPayload()
    const validationResult = await validatePromptToolPublish(
      toolId,
      payload,
    )

    if (!validationResult.success) {
      setErrorMessage(validationResult.error)
      return
    }

    beginSaving('update_published')

    const { error: updateError } = await supabase
      .from('prompt_tools')
      .update(payload)
      .eq('id', toolId)

    if (updateError) {
      endSaving()
      setErrorMessage(getSaveErrorMessage(updateError))
      return
    }

    markDeployPendingLocally()

    const deployResult = await triggerPromptToolDeploy(
      toolId,
      'update_published',
    )

    endSaving()
    await fetchTool()

    if (!deployResult.success) {
      setErrorMessage(
        'Perubahan sudah tersimpan, tetapi deployment belum berhasil diminta. '
        + deployResult.error,
      )
      return
    }

    setSuccessMessage('Perubahan tersimpan dan deployment berhasil diminta.')
  }

  const applyBuilderChanges = async () => {
    const validationResult = await validatePromptToolPublish(toolId)

    if (!validationResult.success) {
      setErrorMessage(validationResult.error)
      return
    }

    beginSaving('builder_deploy')

    markDeployPendingLocally()

    const deployResult = await triggerPromptToolDeploy(
      toolId,
      'update_published',
    )

    endSaving()
    await fetchTool()

    if (!deployResult.success) {
      setErrorMessage(deployResult.error)
      return
    }

    setSuccessMessage('Deployment perubahan struktur berhasil diminta.')
  }

  const handleBuilderChanged = async (touchResult) => {
    await Promise.all([
      fetchTool(),
      loadQuestionsList(),
    ])

    if (!touchResult?.success) {
      setBuilderWarning(
        touchResult?.error
        || 'Perubahan tersimpan, tetapi status pembaruan tool belum dapat ditandai.',
      )
      return
    }

    setBuilderWarning('')

    if (tool?.status === 'published') {
      setSuccessMessage(
        'Perubahan struktur tersimpan dan belum diterapkan ke halaman production.',
      )
    }
  }

  if (loading) {
    return (
      <div className="p-8 text-center text-gray-500">
        Memuat data tool...
      </div>
    )
  }

  const toolStatus = tool?.status || null
  const hasUndeployedChanges = hasPromptToolUndeployedChanges(tool)

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <Link
            to="/admin/tools"
            className="text-sm font-bold text-green-700 hover:underline"
          >
            Kembali ke Tools
          </Link>
          <p className="mb-1 mt-4 text-xs text-gray-400">
            Admin / Tools Gratis / {isEditing ? 'Edit' : 'Baru'}
          </p>
          <h1 className="text-2xl font-black text-gray-900">
            {isEditing ? 'Edit Tool' : 'Buat Tool Baru'}
          </h1>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-gray-500">
            Kelola identitas, template prompt, dan form dinamis tool.
          </p>
        </div>

        {isEditing && toolStatus && (
          <div className="w-full rounded-2xl border border-gray-200 bg-white p-4 text-sm text-gray-500 lg:w-80">
            <p>
              Status:
              <strong className="ml-2 text-gray-800">
                {TOOL_STATUS_LABELS[toolStatus] || toolStatus}
              </strong>
            </p>
            <p className="mt-2">
              Status deploy:
              <strong className="ml-2 text-gray-800">
                {getPromptToolDeployStatusLabel(tool.last_deploy_status)}
              </strong>
            </p>
            <p className="mt-2">
              Diperbarui: {formatMaterialDate(tool.updated_at)}
            </p>
            {tool.last_deploy_triggered_at && (
              <p className="mt-2">
                Deploy terakhir: {formatMaterialDate(tool.last_deploy_triggered_at)}
              </p>
            )}
            <PromptToolDeployProgress tool={tool} compact />
          </div>
        )}
      </div>

      {errorMessage && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm leading-relaxed text-red-700">
          {errorMessage}
        </div>
      )}

      {successMessage && (
        <div className="rounded-2xl border border-green-200 bg-green-50 p-4 text-sm leading-relaxed text-green-800">
          {successMessage}
        </div>
      )}

      {builderWarning && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-relaxed text-amber-800">
          {builderWarning}
        </div>
      )}

      <div className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b p-4">
          <nav className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className={`rounded px-3 py-2 ${activeTab === 'settings' ? 'bg-gray-900 text-white' : 'text-gray-600'}`}
              onClick={() => setActiveTab('settings')}
            >
              Pengaturan Tool
            </button>
            <button
              type="button"
              className={`rounded px-3 py-2 ${activeTab === 'builder' ? 'bg-gray-900 text-white' : 'text-gray-600'}`}
              onClick={() => setActiveTab('builder')}
              disabled={!isEditing}
            >
              Form & Pertanyaan
            </button>
          </nav>
        </div>

        <div className="p-5 sm:p-6">
          {activeTab === 'settings' ? (
            <section className="space-y-5">
              <TextInput
                label="Judul tool"
                value={form.title}
                onChange={updateTitle}
                placeholder="Contoh: Pembantu Ide Judul"
              />
              <TextInput
                label="Slug"
                value={form.slug}
                onChange={updateSlug}
                placeholder="pembantu-ide-judul"
                hint={!slugValid && form.slug ? 'Slug tidak valid' : ''}
              />
              <TextArea
                label="Deskripsi"
                value={form.description}
                onChange={(value) => updateField('description', value)}
                placeholder="Deskripsi singkat tool"
                rows={3}
                optional
              />

              <TextInput
                label="Kategori"
                value={form.category}
                onChange={(value) => updateField('category', value)}
                placeholder="umum"
              />

              <div>
                <FieldLabel>Template Prompt</FieldLabel>
                <textarea
                  value={form.prompt_template}
                  onChange={(event) => updateField(
                    'prompt_template',
                    event.target.value,
                  )}
                  placeholder="Tulis template prompt di sini..."
                  rows={10}
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-green-400"
                />
                <p className="mt-2 text-xs text-gray-400">
                  Gunakan placeholder seperti:
                  {' '}
                  <code className="rounded bg-gray-100 px-1 py-0.5">
                    {'{{program_studi}}'}
                  </code>
                  {' '}
                  <code className="rounded bg-gray-100 px-1 py-0.5">
                    {'{{topik_penelitian}}'}
                  </code>
                </p>
              </div>

              <div className="rounded-2xl border border-gray-100 bg-white p-4">
                <TemplatePlaceholderInfo
                  template={form.prompt_template}
                  questions={questionsList}
                />
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <TextInput
                  label="Label tombol submit"
                  value={form.submit_button_label}
                  onChange={(value) => updateField(
                    'submit_button_label',
                    value,
                  )}
                />
                <TextInput
                  label="Judul hasil"
                  value={form.result_title}
                  onChange={(value) => updateField('result_title', value)}
                />
                <TextInput
                  label="Label tombol salin"
                  value={form.copy_button_label}
                  onChange={(value) => updateField(
                    'copy_button_label',
                    value,
                  )}
                />
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <TextInput
                  label="Survey URL"
                  value={form.survey_url}
                  onChange={(value) => updateField('survey_url', value)}
                  placeholder="https://example.com/survey"
                  optional
                />
                <TextInput
                  label="Survey CTA"
                  value={form.survey_cta}
                  onChange={(value) => updateField('survey_cta', value)}
                  optional
                />
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <TextInput
                  label="Meta title"
                  value={form.meta_title}
                  onChange={(value) => updateField('meta_title', value)}
                  optional
                />
                <TextInput
                  label="Meta description"
                  value={form.meta_description}
                  onChange={(value) => updateField(
                    'meta_description',
                    value,
                  )}
                  optional
                />
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {!isEditing && (
                  <button
                    type="button"
                    onClick={saveDraft}
                    disabled={saving}
                    className="rounded-xl bg-gray-900 px-6 py-3 text-sm font-black text-white hover:bg-gray-800 disabled:opacity-50"
                  >
                    {savingAction === 'draft'
                      ? 'Menyimpan...'
                      : 'Simpan Draft'}
                  </button>
                )}

                {isEditing && toolStatus === 'draft' && (
                  <>
                    <button
                      type="button"
                      onClick={saveDraft}
                      disabled={saving}
                      className="rounded-xl border border-gray-300 bg-white px-6 py-3 text-sm font-black text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                      {savingAction === 'draft'
                        ? 'Menyimpan...'
                        : 'Simpan Draft'}
                    </button>
                    <button
                      type="button"
                      onClick={publishTool}
                      disabled={saving}
                      className="rounded-xl bg-green-700 px-6 py-3 text-sm font-black text-white hover:bg-green-800 disabled:opacity-50"
                    >
                      {savingAction === 'publish'
                        ? 'Memublikasikan...'
                        : 'Publikasikan'}
                    </button>
                  </>
                )}

                {isEditing && toolStatus === 'published' && (
                  <>
                    <button
                      type="button"
                      onClick={saveAndApplyChanges}
                      disabled={saving}
                      className="rounded-xl bg-green-700 px-6 py-3 text-sm font-black text-white hover:bg-green-800 disabled:opacity-50"
                    >
                      {savingAction === 'update_published'
                        ? 'Memproses...'
                        : 'Simpan & Terapkan Perubahan'}
                    </button>
                    <button
                      type="button"
                      onClick={saveWithoutDeploy}
                      disabled={saving}
                      className="rounded-xl border border-gray-300 bg-white px-6 py-3 text-sm font-black text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                      {savingAction === 'without_deploy'
                        ? 'Menyimpan...'
                        : 'Simpan Tanpa Deploy'}
                    </button>
                  </>
                )}

                {isEditing && toolStatus === 'archived' && (
                  <button
                    type="button"
                    onClick={saveDraft}
                    disabled={saving}
                    className="rounded-xl bg-gray-900 px-6 py-3 text-sm font-black text-white hover:bg-gray-800 disabled:opacity-50"
                  >
                    {savingAction === 'draft'
                      ? 'Menyimpan...'
                      : 'Simpan Perubahan'}
                  </button>
                )}

                <Link
                  to="/admin/tools"
                  className="text-sm font-bold text-gray-500"
                >
                  Batal
                </Link>
              </div>
            </section>
          ) : (
            <section className="space-y-5">
              {toolStatus === 'published' && hasUndeployedChanges && (
                <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4 text-sm leading-relaxed text-violet-800">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <span className="font-bold">
                      Ada perubahan struktur yang belum diterapkan ke halaman production.
                    </span>
                    <button
                      type="button"
                      onClick={applyBuilderChanges}
                      disabled={saving}
                      className="shrink-0 rounded-xl bg-green-700 px-4 py-2.5 text-sm font-black text-white hover:bg-green-800 disabled:opacity-50"
                    >
                      {savingAction === 'builder_deploy'
                        ? 'Memproses...'
                        : 'Terapkan Perubahan ke Publik'}
                    </button>
                  </div>
                </div>
              )}

              <PromptToolBuilder
                toolId={toolId}
                onToolChanged={handleBuilderChanged}
                readOnly={false}
              />
            </section>
          )}
        </div>
      </div>
    </div>
  )
}

export default AdminPromptToolFormPage
