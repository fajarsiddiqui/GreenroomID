import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { supabase } from '../supabase'
import { formatMaterialDate } from '../utils/learningMaterials'

function StatusBadge({ status }) {
  const map = {
    draft: 'Draft',
    published: 'Published',
    archived: 'Diarsipkan'
  }
  const classes = {
    draft: 'bg-gray-100 text-gray-700 border-gray-200',
    published: 'bg-green-50 text-green-700 border-green-100',
    archived: 'bg-amber-50 text-amber-700 border-amber-100'
  }
  return <span className={'inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold ' + (classes[status] || classes.draft)}>{map[status] || status}</span>
}

function AdminPromptToolsPage() {
  const location = useLocation()
  const [tools, setTools] = useState([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!location.state?.message) return
    if (location.state.messageType === 'error') setErrorMessage(location.state.message)
    else setSuccessMessage(location.state.message)
    window.history.replaceState({}, document.title, location.pathname)
  }, [location.pathname, location.state])

  const fetchTools = async () => {
    setLoading(true)
    setErrorMessage('')
    setSuccessMessage('')

    const { data, error } = await supabase
      .from('prompt_tools')
      .select('id, title, slug, description, category, status, published_at, updated_at, last_deploy_status, last_deploy_triggered_at')
      .order('updated_at', { ascending: false })

    if (error) {
      setTools([])
      setErrorMessage('Gagal memuat tools. Pastikan migration H37 sudah diterapkan dan akun ini adalah admin. Detail: ' + error.message)
    } else {
      setTools(data || [])
    }

    setLoading(false)
  }

  useEffect(() => { fetchTools() }, [])

  const toolIds = useMemo(() => tools.map((t) => t.id).filter(Boolean), [tools])

  const [sectionCounts, setSectionCounts] = useState({})
  const [questionCounts, setQuestionCounts] = useState({})

  useEffect(() => {
    if (!toolIds.length) return
    const loadCounts = async () => {
      const { data: sections } = await supabase.from('prompt_tool_sections').select('tool_id') .in('tool_id', toolIds)
      const { data: questions } = await supabase.from('prompt_tool_questions').select('tool_id') .in('tool_id', toolIds)

      const sCounts = (sections || []).reduce((acc, s) => { acc[s.tool_id] = (acc[s.tool_id] || 0) + 1; return acc }, {})
      const qCounts = (questions || []).reduce((acc, q) => { acc[q.tool_id] = (acc[q.tool_id] || 0) + 1; return acc }, {})

      setSectionCounts(sCounts)
      setQuestionCounts(qCounts)
    }
    loadCounts()
  }, [toolIds])

  const filtered = useMemo(() => {
    const kw = search.trim().toLowerCase()
    if (!kw) return tools
    return tools.filter((t) => (t.title || '').toLowerCase().includes(kw) || (t.slug || '').toLowerCase().includes(kw) || (t.category || '').toLowerCase().includes(kw))
  }, [tools, search])

  const deleteTool = async (tool) => {
    if (tool.status === 'published') {
      setErrorMessage('Tool published tidak dapat dihapus dari halaman ini.')
      return
    }
    if (!window.confirm(`Hapus tool "${tool.title}"? Aksi ini menghapus bagian dan pertanyaan terkait secara permanen.`)) return

    const { error } = await supabase.from('prompt_tools').delete().eq('id', tool.id)
    if (error) setErrorMessage('Gagal menghapus tool. Detail: ' + error.message)
    else {
      setSuccessMessage('Tool berhasil dihapus.')
      await fetchTools()
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div>
          <p className="text-xs text-gray-400 mb-1">Admin / Tools Gratis</p>
          <h1 className="text-2xl font-black text-gray-900">Tools Gratis</h1>
          <p className="text-sm text-gray-500 mt-1 max-w-3xl">Kelola identitas tool dan template prompt. Tahap ini belum menyediakan builder pertanyaan atau publikasi otomatis.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={fetchTools} disabled={loading} className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-50">{loading ? 'Memuat...' : 'Muat ulang'}</button>
          <Link to="/admin/tools/baru" className="rounded-xl bg-gray-900 px-5 py-3 text-sm font-black text-white hover:bg-gray-800">+ Buat Tool Baru</Link>
        </div>
      </div>

      {errorMessage && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm leading-relaxed text-red-700">{errorMessage}</div>}
      {successMessage && <div className="rounded-2xl border border-green-200 bg-green-50 p-4 text-sm leading-relaxed text-green-800">{successMessage}</div>}

      <section className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-gray-100 p-5 sm:p-6">
          <div>
            <h2 className="text-lg font-black text-gray-900">Daftar Tools</h2>
            <p className="mt-1 text-sm text-gray-500">Hanya admin dapat melihat draft dan arsip karena RLS.</p>
          </div>
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari judul, slug, kategori" className="w-full lg:w-80 rounded-xl border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
        </div>

        {loading ? (
          <div className="p-10 text-center text-sm text-gray-400">Memuat tools...</div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center">
            <h3 className="font-black text-gray-900">Belum ada tool</h3>
            <p className="mt-1 text-sm text-gray-500">Buat draft tool pertama untuk mulai menyiapkan template prompt.</p>
            <Link to="/admin/tools/baru" className="mt-4 inline-flex text-sm font-black text-green-700 hover:underline">Buat tool baru</Link>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filtered.map((tool) => (
              <article key={tool.id} className="p-5 sm:p-6">
                <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={tool.status} />
                      <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-[11px] font-bold text-gray-500">{tool.category || 'umum'}</span>
                      <span className="text-xs text-gray-400">Diperbarui {formatMaterialDate(tool.updated_at)}</span>
                    </div>
                    <h3 className="mt-3 font-black leading-snug text-gray-900">{tool.title || 'Tanpa judul'}</h3>
                    <p className="mt-1 text-sm text-gray-500 line-clamp-2">{tool.description || 'Belum ada deskripsi.'}</p>
                    <p className="mt-3 text-xs text-gray-400">Slug: {tool.slug}</p>
                    <p className="mt-1 text-xs text-gray-400">Bagian: {sectionCounts[tool.id] || 0} • Pertanyaan: {questionCounts[tool.id] || 0}</p>
                    {tool.published_at && <p className="mt-1 text-xs text-gray-400">Tanggal publish awal: {formatMaterialDate(tool.published_at)}</p>}
                    <p className="mt-1 text-xs text-gray-500">Status deploy: {tool.last_deploy_status || 'Belum ada permintaan deploy'}{tool.last_deploy_triggered_at ? ` • ${formatMaterialDate(tool.last_deploy_triggered_at)}` : ''}</p>
                  </div>
                  <div className="flex flex-wrap gap-2 shrink-0">
                    <Link to={`/admin/tools/${tool.id}/edit`} className="rounded-xl bg-gray-900 px-4 py-3 text-sm font-bold text-white hover:bg-gray-800">Edit</Link>
                    {(tool.status === 'draft' || tool.status === 'archived') && <button type="button" onClick={() => deleteTool(tool)} className="rounded-xl border border-red-200 px-4 py-3 text-sm font-bold text-red-700 hover:bg-red-50">Hapus</button>}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

export default AdminPromptToolsPage
