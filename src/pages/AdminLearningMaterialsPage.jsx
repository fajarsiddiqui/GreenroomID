import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase'
import { formatMaterialDate, getMaterialStatus } from '../utils/learningMaterials'

function StatusBadge({ status }) {
  const item = getMaterialStatus(status)
  return <span className={'inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold ' + item.className}>{item.label}</span>
}

function AdminLearningMaterialsPage() {
  const [materials, setMaterials] = useState([])
  const [loading, setLoading] = useState(true)
  const [processingAction, setProcessingAction] = useState({ id: '', action: '' })
  const [search, setSearch] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  const fetchMaterials = async () => {
    setLoading(true)
    setErrorMessage('')

    const { data, error } = await supabase
      .from('learning_materials')
      .select('id, title, slug, excerpt, category, status, published_at, updated_at, created_at, last_deploy_status')
      .order('updated_at', { ascending: false })

    if (error) {
      setMaterials([])
      setErrorMessage('Gagal memuat materi. Pastikan migration H35 sudah diterapkan dan akun ini adalah admin. Detail: ' + error.message)
    } else {
      setMaterials(data || [])
    }

    setLoading(false)
  }

  useEffect(() => {
    fetchMaterials()
  }, [])

  const filteredMaterials = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    if (!keyword) return materials

    return materials.filter((material) => (
      material.title?.toLowerCase().includes(keyword)
      || material.slug?.toLowerCase().includes(keyword)
      || material.category?.toLowerCase().includes(keyword)
    ))
  }, [materials, search])

  const stats = useMemo(() => ({
    total: materials.length,
    draft: materials.filter((material) => material.status === 'draft').length,
    published: materials.filter((material) => material.status === 'published').length,
    archived: materials.filter((material) => material.status === 'archived').length
  }), [materials])

  const updateMaterialStatus = async (material, nextStatus) => {
    const actionLabel = nextStatus === 'archived' ? 'Arsipkan' : 'Pulihkan'
    const successLabel = nextStatus === 'archived' ? 'Materi berhasil diarsipkan.' : 'Materi berhasil dipulihkan sebagai draft.'

    setProcessingAction({ id: material.id, action: nextStatus })
    setErrorMessage('')
    setSuccessMessage('')

    const { error } = await supabase
      .from('learning_materials')
      .update({ status: nextStatus })
      .eq('id', material.id)

    if (error) {
      setErrorMessage(`Gagal ${actionLabel.toLowerCase()} materi. Detail: ` + error.message)
    } else {
      setSuccessMessage(successLabel)
      await fetchMaterials()
    }

    setProcessingAction({ id: '', action: '' })
  }

  const deleteMaterial = async (material) => {
    if (material.status === 'published') {
      setErrorMessage('Materi published tidak dapat dihapus dari halaman ini.')
      return
    }

    if (!window.confirm(`Hapus materi "${material.title}"?\n\nAksi ini menghapus data dari tabel learning_materials.`)) return

    setProcessingAction({ id: material.id, action: 'delete' })
    setErrorMessage('')
    setSuccessMessage('')

    const { error } = await supabase
      .from('learning_materials')
      .delete()
      .eq('id', material.id)

    if (error) {
      setErrorMessage('Gagal menghapus materi. Detail: ' + error.message)
    } else {
      setSuccessMessage('Materi berhasil dihapus.')
      await fetchMaterials()
    }

    setProcessingAction({ id: '', action: '' })
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div>
          <p className="text-xs text-gray-400 mb-1">Admin / Materi Publik</p>
          <h1 className="text-2xl font-black text-gray-900">Materi Publik</h1>
          <p className="text-sm text-gray-500 mt-1 max-w-3xl">Kelola draft materi Markdown untuk Ruang Belajar. Tahap ini belum menyediakan publikasi, halaman publik, atau Deploy Hook.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={fetchMaterials} disabled={loading} className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-50">{loading ? 'Memuat...' : 'Muat ulang'}</button>
          <Link to="/admin/materi/baru" className="rounded-xl bg-gray-900 px-5 py-3 text-sm font-black text-white hover:bg-gray-800">+ Buat Materi</Link>
        </div>
      </div>

      <section className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {[
          ['Semua', stats.total, 'bg-white text-gray-800'],
          ['Draft', stats.draft, 'bg-gray-100 text-gray-700'],
          ['Published', stats.published, 'bg-green-50 text-green-700'],
          ['Archived', stats.archived, 'bg-amber-50 text-amber-700']
        ].map(([label, value, tone]) => (
          <div key={label} className={'rounded-2xl border border-gray-200 p-4 shadow-sm ' + tone}>
            <p className="text-2xl font-black">{new Intl.NumberFormat('id-ID').format(value)}</p>
            <p className="mt-1 text-xs font-bold">{label}</p>
          </div>
        ))}
      </section>

      {errorMessage && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm leading-relaxed text-red-700">{errorMessage}</div>}
      {successMessage && <div className="rounded-2xl border border-green-200 bg-green-50 p-4 text-sm leading-relaxed text-green-800">{successMessage}</div>}

      <section className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-gray-100 p-5 sm:p-6">
          <div>
            <h2 className="text-lg font-black text-gray-900">Daftar materi</h2>
            <p className="mt-1 text-sm text-gray-500">Draft dan arsip tidak tampil publik karena RLS membatasi pembacaan non-admin.</p>
          </div>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Cari judul, slug, kategori"
            className="w-full lg:w-80 rounded-xl border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
          />
        </div>

        {loading ? (
          <div className="p-10 text-center text-sm text-gray-400">Memuat materi...</div>
        ) : filteredMaterials.length === 0 ? (
          <div className="p-10 text-center">
            <h3 className="font-black text-gray-900">Belum ada materi</h3>
            <p className="mt-1 text-sm text-gray-500">{search ? 'Tidak ada materi yang cocok dengan pencarian.' : 'Buat draft materi pertama untuk mulai menyiapkan Ruang Belajar baru.'}</p>
            {!search && <Link to="/admin/materi/baru" className="mt-4 inline-flex text-sm font-black text-green-700 hover:underline">Buat materi pertama</Link>}
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filteredMaterials.map((material) => {
              const processingThisRow = processingAction.id === material.id
              const isDraft = material.status === 'draft'
              const isArchived = material.status === 'archived'
              const isPublished = material.status === 'published'

              return (
                <article key={material.id} className="p-5 sm:p-6">
                  <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge status={material.status} />
                        <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-[11px] font-bold text-gray-500">{material.category || 'umum'}</span>
                        <span className="text-xs text-gray-400">Diperbarui {formatMaterialDate(material.updated_at)}</span>
                      </div>
                      <h3 className="mt-3 font-black leading-snug text-gray-900">{material.title || 'Tanpa judul'}</h3>
                      <p className="mt-1 text-sm text-gray-500 line-clamp-2">{material.excerpt || 'Belum ada excerpt.'}</p>
                      <p className="mt-3 text-xs text-gray-400">Slug: {material.slug}</p>
                      {material.published_at && <p className="mt-1 text-xs text-gray-400">Tanggal publish awal: {formatMaterialDate(material.published_at)}</p>}
                      {isPublished && <p className="mt-3 rounded-xl border border-green-100 bg-green-50 px-4 py-3 text-xs leading-relaxed text-green-800">Perubahan status published akan tersedia setelah alur publikasi selesai.</p>}
                    </div>
                    <div className="flex flex-wrap gap-2 shrink-0">
                      <Link to={`/admin/materi/${material.id}/edit`} className="rounded-xl bg-gray-900 px-4 py-3 text-sm font-bold text-white hover:bg-gray-800">Edit</Link>
                      {isDraft && <button type="button" onClick={() => updateMaterialStatus(material, 'archived')} disabled={processingThisRow} className="rounded-xl border border-amber-200 px-4 py-3 text-sm font-bold text-amber-700 hover:bg-amber-50 disabled:opacity-50">{processingThisRow && processingAction.action === 'archived' ? 'Mengarsipkan...' : 'Arsipkan'}</button>}
                      {isArchived && <button type="button" onClick={() => updateMaterialStatus(material, 'draft')} disabled={processingThisRow} className="rounded-xl border border-green-200 px-4 py-3 text-sm font-bold text-green-700 hover:bg-green-50 disabled:opacity-50">{processingThisRow && processingAction.action === 'draft' ? 'Memulihkan...' : 'Pulihkan'}</button>}
                      {(isDraft || isArchived) && <button type="button" onClick={() => deleteMaterial(material)} disabled={processingThisRow} className="rounded-xl border border-red-200 px-4 py-3 text-sm font-bold text-red-700 hover:bg-red-50 disabled:opacity-50">{processingThisRow && processingAction.action === 'delete' ? 'Menghapus...' : 'Hapus'}</button>}
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}

export default AdminLearningMaterialsPage
