import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import PromptToolDeployProgress from '../components/admin/PromptToolDeployProgress'
import { supabase } from '../supabase'
import { formatMaterialDate } from '../utils/learningMaterials'
import {
  getPromptToolDeployStatusLabel,
  hasPromptToolUndeployedChanges,
  triggerPromptToolDeploy,
  validatePromptToolPublish,
} from '../utils/promptTools'

function StatusBadge({ status }) {
  const map = {
    draft: 'Draft',
    published: 'Published',
    archived: 'Diarsipkan',
  }
  const classes = {
    draft: 'bg-gray-100 text-gray-700 border-gray-200',
    published: 'bg-green-50 text-green-700 border-green-100',
    archived: 'bg-amber-50 text-amber-700 border-amber-100',
  }

  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold ${classes[status] || classes.draft}`}>
      {map[status] || status}
    </span>
  )
}

function DeployStatusBadge({ status }) {
  const classes = {
    pending: 'border-blue-100 bg-blue-50 text-blue-700',
    triggered: 'border-green-100 bg-green-50 text-green-700',
    failed_to_trigger: 'border-red-100 bg-red-50 text-red-700',
  }

  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold ${classes[status] || 'border-gray-200 bg-gray-50 text-gray-600'}`}>
      {getPromptToolDeployStatusLabel(status)}
    </span>
  )
}

function AdminPromptToolsPage() {
  const location = useLocation()
  const [tools, setTools] = useState([])
  const [loading, setLoading] = useState(true)
  const [processingAction, setProcessingAction] = useState({
    id: '',
    action: '',
  })
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [search, setSearch] = useState('')
  const [sectionCounts, setSectionCounts] = useState({})
  const [questionCounts, setQuestionCounts] = useState({})

  useEffect(() => {
    if (!location.state?.message) return

    if (location.state.messageType === 'error') {
      setErrorMessage(location.state.message)
    } else {
      setSuccessMessage(location.state.message)
    }

    window.history.replaceState({}, document.title, location.pathname)
  }, [location.pathname, location.state])

  const fetchTools = async ({ clearMessages = false } = {}) => {
    setLoading(true)

    if (clearMessages) {
      setErrorMessage('')
      setSuccessMessage('')
    }

    const { data, error } = await supabase
      .from('prompt_tools')
      .select(`
        id,
        title,
        slug,
        description,
        category,
        status,
        updated_at,
        published_at,
        last_deploy_status,
        last_deploy_triggered_at,
        structured_output_enabled
      `)
      .order('updated_at', { ascending: false })

    if (error) {
      setTools([])
      setErrorMessage('Gagal memuat AI Tools. Pastikan akun ini memiliki akses admin.')
    } else {
      setTools(data || [])
    }

    setLoading(false)
  }

  useEffect(() => {
    fetchTools({ clearMessages: false })
  }, [])

  const toolIds = useMemo(
    () => tools.map((tool) => tool.id).filter(Boolean),
    [tools],
  )

  useEffect(() => {
    if (!toolIds.length) {
      setSectionCounts({})
      setQuestionCounts({})
      return
    }

    let active = true

    const loadCounts = async () => {
      const [sectionsResult, questionsResult] = await Promise.all([
        supabase
          .from('prompt_tool_sections')
          .select('tool_id')
          .in('tool_id', toolIds),
        supabase
          .from('prompt_tool_questions')
          .select('tool_id')
          .in('tool_id', toolIds),
      ])

      if (!active) return

      const nextSectionCounts = (sectionsResult.data || []).reduce(
        (counts, section) => ({
          ...counts,
          [section.tool_id]: (counts[section.tool_id] || 0) + 1,
        }),
        {},
      )
      const nextQuestionCounts = (questionsResult.data || []).reduce(
        (counts, question) => ({
          ...counts,
          [question.tool_id]: (counts[question.tool_id] || 0) + 1,
        }),
        {},
      )

      setSectionCounts(nextSectionCounts)
      setQuestionCounts(nextQuestionCounts)
    }

    loadCounts()

    return () => {
      active = false
    }
  }, [toolIds])

  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase()

    if (!keyword) return tools

    return tools.filter((tool) => (
      String(tool.title || '').toLowerCase().includes(keyword)
      || String(tool.slug || '').toLowerCase().includes(keyword)
      || String(tool.category || '').toLowerCase().includes(keyword)
    ))
  }, [tools, search])

  const isProcessing = (toolId, action = '') => (
    processingAction.id === toolId
    && (!action || processingAction.action === action)
  )

  const startAction = (tool, action) => {
    setProcessingAction({ id: tool.id, action })
    setErrorMessage('')
    setSuccessMessage('')
  }

  const finishAction = () => {
    setProcessingAction({ id: '', action: '' })
  }

  const markDeployPendingLocally = (toolId) => {
    const requestedAt = new Date().toISOString()

    setTools((currentTools) => currentTools.map((item) => (
      item.id === toolId
        ? {
          ...item,
          last_deploy_status: 'pending',
          last_deploy_triggered_at: requestedAt,
        }
        : item
    )))
  }

  const handlePublish = async (tool) => {
    const confirmed = window.confirm(
      'AI Tool akan tersedia untuk publik dan deployment website akan diminta.',
    )

    if (!confirmed) return

    startAction(tool, 'publish')

    const validationResult = await validatePromptToolPublish(tool.id)

    if (!validationResult.success) {
      setErrorMessage(validationResult.error)
      finishAction()
      return
    }

    const { error: updateError } = await supabase
      .from('prompt_tools')
      .update({ status: 'published' })
      .eq('id', tool.id)

    if (updateError) {
      setErrorMessage('Tool belum dapat dipublikasikan. Silakan coba lagi.')
      finishAction()
      return
    }

    markDeployPendingLocally(tool.id)

    const deployResult = await triggerPromptToolDeploy(
      tool.id,
      'publish',
    )

    if (!deployResult.success) {
      setErrorMessage(
        'AI Tool sudah berstatus published, tetapi deployment belum berhasil diminta. Gunakan tombol Deploy Ulang. '
        + deployResult.error,
      )
    } else {
      setSuccessMessage('AI Tool dipublikasikan dan deployment berhasil diminta.')
    }

    await fetchTools()
    finishAction()
  }

  const handleApplyChanges = async (tool) => {
    startAction(tool, 'update_published')

    const validationResult = await validatePromptToolPublish(tool.id)

    if (!validationResult.success) {
      setErrorMessage(validationResult.error)
      finishAction()
      return
    }

    markDeployPendingLocally(tool.id)

    const deployResult = await triggerPromptToolDeploy(
      tool.id,
      'update_published',
    )

    if (!deployResult.success) {
      setErrorMessage(deployResult.error)
    } else {
      setSuccessMessage('Deployment perubahan berhasil diminta.')
    }

    await fetchTools()
    finishAction()
  }

  const handleRetryDeployment = async (tool) => {
    const confirmed = window.confirm(
      'Kirim ulang permintaan deployment untuk AI Tool ini?',
    )

    if (!confirmed) return

    startAction(tool, 'retry')

    if (tool.status === 'published') {
      const validationResult = await validatePromptToolPublish(tool.id)

      if (!validationResult.success) {
        setErrorMessage(validationResult.error)
        finishAction()
        return
      }
    }

    markDeployPendingLocally(tool.id)

    const deployResult = await triggerPromptToolDeploy(
      tool.id,
      'retry',
    )

    if (!deployResult.success) {
      setErrorMessage(deployResult.error)
    } else {
      setSuccessMessage('Permintaan deploy ulang berhasil dikirim.')
    }

    await fetchTools()
    finishAction()
  }

  const handleArchive = async (tool) => {
    const confirmed = window.confirm(
      'AI Tool akan disembunyikan dari katalog. Halaman statis baru benar-benar diperbarui setelah deployment selesai.',
    )

    if (!confirmed) return

    startAction(tool, 'archive')

    const { error: updateError } = await supabase
      .from('prompt_tools')
      .update({ status: 'archived' })
      .eq('id', tool.id)

    if (updateError) {
      setErrorMessage('Tool belum dapat diarsipkan. Silakan coba lagi.')
      finishAction()
      return
    }

    markDeployPendingLocally(tool.id)

    const deployResult = await triggerPromptToolDeploy(
      tool.id,
      'archive',
    )

    if (!deployResult.success) {
      setErrorMessage(
        'AI Tool sudah diarsipkan di database, tetapi halaman statis mungkin masih tersedia sampai deployment berhasil. '
        + deployResult.error,
      )
    } else {
      setSuccessMessage('AI Tool diarsipkan dan deployment berhasil diminta.')
    }

    await fetchTools()
    finishAction()
  }

  const handleRestoreDraft = async (tool) => {
    const confirmed = window.confirm(
      'Tool akan dipulihkan menjadi draft. Penerbitan ulang dilakukan lewat tombol Publikasikan.',
    )

    if (!confirmed) return

    startAction(tool, 'restore')

    const { error } = await supabase
      .from('prompt_tools')
      .update({ status: 'draft' })
      .eq('id', tool.id)

    if (error) {
      setErrorMessage('Tool belum dapat dipulihkan menjadi draft.')
    } else {
      setSuccessMessage('Tool berhasil dipulihkan sebagai draft.')
      await fetchTools()
    }

    finishAction()
  }

  const deleteTool = async (tool) => {
    if (tool.status === 'published') {
      setErrorMessage('Tool published tidak dapat dihapus dari halaman ini.')
      return
    }

    if (!window.confirm(
      `Hapus tool "${tool.title}"? Aksi ini menghapus bagian dan pertanyaan terkait secara permanen.`,
    )) return

    startAction(tool, 'delete')

    const { error } = await supabase
      .from('prompt_tools')
      .delete()
      .eq('id', tool.id)

    if (error) {
      setErrorMessage('Tool belum dapat dihapus. Silakan coba lagi.')
    } else {
      setSuccessMessage('Tool berhasil dihapus.')
      await fetchTools()
    }

    finishAction()
  }

  const renderToolActions = (tool) => {
    const processing = isProcessing(tool.id)
    const hasUndeployedChanges = hasPromptToolUndeployedChanges(tool)

    return (
      <div className="flex flex-wrap gap-2 shrink-0">
        <Link
          to={`/admin/tools/${tool.id}/edit`}
          className="rounded-xl bg-gray-900 px-4 py-3 text-sm font-bold text-white hover:bg-gray-800"
        >
          Edit
        </Link>

        {tool.status === 'draft' && (
          <>
            <button
              type="button"
              onClick={() => handlePublish(tool)}
              disabled={processing}
              className="rounded-xl bg-green-700 px-4 py-3 text-sm font-bold text-white hover:bg-green-800 disabled:opacity-50"
            >
              {isProcessing(tool.id, 'publish')
                ? 'Mempublikasikan...'
                : 'Publikasikan'}
            </button>
            <button
              type="button"
              onClick={() => deleteTool(tool)}
              disabled={processing}
              className="rounded-xl border border-red-200 px-4 py-3 text-sm font-bold text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              Hapus
            </button>
          </>
        )}

        {tool.status === 'published' && (
          <>
            <button
              type="button"
              onClick={() => (
                hasUndeployedChanges
                  ? handleApplyChanges(tool)
                  : handleRetryDeployment(tool)
              )}
              disabled={processing}
              className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-bold text-green-800 hover:bg-green-100 disabled:opacity-50"
            >
              {processing
                ? 'Memproses...'
                : hasUndeployedChanges
                  ? 'Terapkan Perubahan'
                  : 'Deploy Ulang'}
            </button>
            <button
              type="button"
              onClick={() => handleArchive(tool)}
              disabled={processing}
              className="rounded-xl border border-amber-200 px-4 py-3 text-sm font-bold text-amber-700 hover:bg-amber-50 disabled:opacity-50"
            >
              Arsipkan
            </button>
          </>
        )}

        {tool.status === 'archived' && (
          <>
            <button
              type="button"
              onClick={() => handleRestoreDraft(tool)}
              disabled={processing}
              className="rounded-xl border border-gray-200 px-4 py-3 text-sm font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Pulihkan ke Draft
            </button>

            {tool.last_deploy_status === 'failed_to_trigger' && (
              <button
                type="button"
                onClick={() => handleRetryDeployment(tool)}
                disabled={processing}
                className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-bold text-green-800 hover:bg-green-100 disabled:opacity-50"
              >
                Coba Deploy Lagi
              </button>
            )}

            <button
              type="button"
              onClick={() => deleteTool(tool)}
              disabled={processing}
              className="rounded-xl border border-red-200 px-4 py-3 text-sm font-bold text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              Hapus
            </button>
          </>
        )}
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="mb-1 text-xs text-gray-400">Admin / AI Tools</p>
          <h1 className="text-2xl font-black text-gray-900">AI Tools</h1>
          <p className="mt-1 max-w-3xl text-sm text-gray-500">
            Kelola identitas, form dinamis, publikasi, dan permintaan deployment AI Tools.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => fetchTools({ clearMessages: true })}
            disabled={loading}
            className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {loading ? 'Memuat...' : 'Muat ulang'}
          </button>
          <Link
            to="/admin/tools/baru"
            className="rounded-xl bg-gray-900 px-5 py-3 text-sm font-black text-white hover:bg-gray-800"
          >
            + Buat AI Tool Baru
          </Link>
        </div>
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

      <section className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-gray-100 p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-black text-gray-900">Daftar AI Tools</h2>
            <p className="mt-1 text-sm text-gray-500">
              Status “Deployment telah diminta” belum berarti pembaruan production sudah selesai.
            </p>
          </div>

          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Cari judul, slug, kategori"
            className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 lg:w-80"
          />
        </div>

        {loading ? (
          <div className="p-10 text-center text-sm text-gray-400">
            Memuat AI Tools...
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center">
            <h3 className="font-black text-gray-900">Belum ada AI Tool</h3>
            <p className="mt-1 text-sm text-gray-500">
              Buat draft AI Tool pertama untuk mulai menyiapkan template prompt.
            </p>
            <Link
              to="/admin/tools/baru"
              className="mt-4 inline-flex text-sm font-black text-green-700 hover:underline"
            >
              Buat AI Tool baru
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filtered.map((tool) => {
              const hasUndeployedChanges = (
                hasPromptToolUndeployedChanges(tool)
              )

              return (
                <article key={tool.id} className="p-5 sm:p-6">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge status={tool.status} />
                        <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-[11px] font-bold text-gray-500">
                          {tool.category || 'umum'}
                        </span>
                        <DeployStatusBadge status={tool.last_deploy_status} />

                        {hasUndeployedChanges && (
                          <span className="inline-flex rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-[11px] font-bold text-violet-700">
                            Ada perubahan yang belum diterapkan
                          </span>
                        )}
                      </div>

                      <p className="mt-2 text-xs text-gray-400">
                        Diperbarui {formatMaterialDate(tool.updated_at)}
                      </p>

                      <h3 className="mt-3 font-black leading-snug text-gray-900">
                        {tool.title || 'Tanpa judul'}
                      </h3>

                      <p className="mt-1 line-clamp-2 text-sm text-gray-500">
                        {tool.description || 'Belum ada deskripsi.'}
                      </p>

                      <p className="mt-3 text-xs text-gray-400">
                        Slug: {tool.slug}
                      </p>
                      <p className="mt-1 text-xs text-gray-400">
                        Bagian: {sectionCounts[tool.id] || 0} • Pertanyaan: {questionCounts[tool.id] || 0}
                      </p>

                      {tool.published_at && (
                        <p className="mt-1 text-xs text-gray-400">
                          Tanggal publish awal: {formatMaterialDate(tool.published_at)}
                        </p>
                      )}

                      {tool.last_deploy_triggered_at && (
                        <p className="mt-1 text-xs text-gray-500">
                          Permintaan deploy terakhir: {formatMaterialDate(tool.last_deploy_triggered_at)}
                        </p>
                      )}
                    </div>

                    {renderToolActions(tool)}
                  </div>

                  <PromptToolDeployProgress tool={tool} />
                </article>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}

export default AdminPromptToolsPage
