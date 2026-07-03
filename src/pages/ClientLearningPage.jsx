import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import ClientPortalHeader from '../components/ClientPortalHeader'
import {
  SUBMISSION_EDITABLE_STATUSES,
  formatLearningDate,
  getLearningPath,
  getLearningStatus,
  getSourceRecord
} from '../utils/learning'

function StatusBadge({ status }) {
  const item = getLearningStatus(status)
  return <span className={'inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold ' + item.className}>{item.label}</span>
}

function ClientLearningPage({ user }) {
  const location = useLocation()
  const navigate = useNavigate()
  const [entries, setEntries] = useState([])
  const [reviewsByEntry, setReviewsByEntry] = useState({})
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState(location.state?.message || '')

  const fetchData = async () => {
    setLoading(true)
    setErrorMessage('')

    const { data: entryRows, error: entryError } = await supabase
      .from('learning_entries')
      .select(`
        id,
        source_id,
        author_id,
        title,
        slug,
        short_code,
        excerpt,
        discipline,
        method_tags,
        analysis_tags,
        studied_by_name,
        studied_at,
        status,
        submitted_at,
        reviewed_at,
        review_note,
        published_at,
        created_at,
        updated_at,
        source:learning_sources(*)
      `)
      .eq('author_id', user.id)
      .order('updated_at', { ascending: false })

    if (entryError) {
      setEntries([])
      setReviewsByEntry({})
      setErrorMessage('Gagal memuat hasil pembelajaran Anda. Pastikan SQL RB-02 sudah dijalankan. Detail: ' + entryError.message)
      setLoading(false)
      return
    }

    const entryIds = (entryRows || []).map((entry) => entry.id)
    let reviewRows = []

    if (entryIds.length > 0) {
      const { data, error } = await supabase
        .from('learning_reviews')
        .select('id, entry_id, decision, note, created_at')
        .in('entry_id', entryIds)
        .order('created_at', { ascending: false })

      if (!error) reviewRows = data || []
    }

    const groupedReviews = reviewRows.reduce((result, review) => {
      result[review.entry_id] = [...(result[review.entry_id] || []), review]
      return result
    }, {})

    setEntries(entryRows || [])
    setReviewsByEntry(groupedReviews)
    setLoading(false)
  }

  useEffect(() => {
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id])

  useEffect(() => {
    if (!location.state?.message) return
    window.history.replaceState({}, document.title, location.pathname)
  }, [location.pathname, location.state])

  const stats = useMemo(() => ({
    total: entries.length,
    drafts: entries.filter((entry) => entry.status === 'draft').length,
    review: entries.filter((entry) => ['submitted', 'under_review'].includes(entry.status)).length,
    revision: entries.filter((entry) => entry.status === 'revision_requested').length,
    payment: entries.filter((entry) => ['accepted_pending_payment', 'payment_pending'].includes(entry.status)).length,
    published: entries.filter((entry) => entry.status === 'published').length
  }), [entries])

  const deleteDraft = async (entry) => {
    const confirmed = window.confirm(`Hapus draft “${entry.title}”?\n\nDraft akan dihapus permanen, tetapi artikel sumber tidak ikut dihapus.`)
    if (!confirmed) return

    const { error } = await supabase
      .from('learning_entries')
      .delete()
      .eq('id', entry.id)

    if (error) {
      setErrorMessage('Draft tidak dapat dihapus. Detail: ' + error.message)
      return
    }

    setSuccessMessage('Draft berhasil dihapus.')
    await fetchData()
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <ClientPortalHeader user={user} subtitle="Ruang Belajar · Pembelajaran Saya" />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-7 sm:py-9">
        <header className="bg-gray-950 text-white rounded-[2rem] p-6 sm:p-8 shadow-lg">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-5">
            <div>
              <p className="inline-flex rounded-full bg-white/10 border border-white/10 px-3 py-1 text-xs font-black tracking-wide text-green-200">RUANG BELAJAR GREENROOMID</p>
              <h1 className="text-3xl font-black mt-4">Pembelajaran Saya</h1>
              <p className="text-sm text-gray-300 leading-relaxed mt-2 max-w-2xl">Tulis hasil pembelajaran artikel dengan bahasa sendiri, simpan sebagai draft, lalu kirim untuk review admin. Artikel hanya tampil publik setelah seluruh tahapan publikasi selesai.</p>
            </div>
            <div className="flex flex-wrap gap-2 shrink-0"><Link to="/ruang-belajar" className="px-4 py-3 rounded-xl border border-white/20 text-sm font-bold hover:bg-white/10">Lihat Perpustakaan</Link><Link to="/ruang-belajar/tulis" className="px-4 py-3 rounded-xl bg-green-500 text-gray-950 text-sm font-black hover:bg-green-400">+ Tulis Pembelajaran</Link></div>
          </div>
        </header>

        <section className="mt-6 grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          {[
            ['Semua', stats.total, 'bg-white text-gray-800'],
            ['Draft', stats.drafts, 'bg-gray-100 text-gray-700'],
            ['Direview', stats.review, 'bg-blue-50 text-blue-700'],
            ['Perlu Revisi', stats.revision, 'bg-amber-50 text-amber-700'],
            ['Pembayaran', stats.payment, 'bg-violet-50 text-violet-700'],
            ['Terbit', stats.published, 'bg-green-50 text-green-700']
          ].map(([label, count, tone]) => <div key={label} className={'rounded-2xl border border-gray-200 p-4 ' + tone}><p className="text-2xl font-black">{count}</p><p className="text-xs font-bold mt-1">{label}</p></div>)}
        </section>

        {errorMessage && <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{errorMessage}</div>}
        {successMessage && <div className="mt-6 rounded-2xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">{successMessage}</div>}

        <section className="mt-6 bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="p-5 sm:p-6 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"><div><h2 className="text-lg font-black text-gray-900">Daftar hasil pembelajaran</h2><p className="text-sm text-gray-500 mt-1">Status review dan catatan admin hanya dapat dilihat oleh Anda dan admin.</p></div><button type="button" onClick={fetchData} disabled={loading} className="text-sm font-bold text-green-700 hover:underline disabled:opacity-50">{loading ? 'Memuat...' : 'Muat ulang'}</button></div>

          {loading ? <div className="p-10 text-center text-sm text-gray-400">Memuat pembelajaran Anda...</div> : entries.length === 0 ? (
            <div className="p-10 text-center"><div className="text-4xl">✍️</div><h3 className="mt-3 text-lg font-black text-gray-900">Belum ada hasil pembelajaran</h3><p className="text-sm text-gray-500 mt-1">Mulai dari satu artikel pendidikan yang Anda pahami.</p><Link to="/ruang-belajar/tulis" className="inline-flex mt-4 text-sm font-black text-green-700 hover:underline">Tulis hasil pembelajaran pertama →</Link></div>
          ) : (
            <div className="divide-y divide-gray-100">
              {entries.map((entry) => {
                const source = getSourceRecord(entry)
                const editable = SUBMISSION_EDITABLE_STATUSES.includes(entry.status)
                const reviews = reviewsByEntry[entry.id] || []
                const latestReview = reviews[0]

                return (
                  <article key={entry.id} className="p-5 sm:p-6">
                    <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex flex-wrap gap-2 items-center"><StatusBadge status={entry.status} /><span className="text-xs text-gray-400">Diperbarui {formatLearningDate(entry.updated_at)}</span></div>
                        <h3 className="font-black text-gray-900 mt-3 leading-snug">{entry.title}</h3>
                        <p className="text-sm text-gray-500 mt-1 line-clamp-2">{entry.excerpt}</p>
                        <p className="text-xs text-gray-500 mt-3"><span className="font-bold text-gray-700">Artikel sumber:</span> {source?.source_title || 'Belum terbaca'}</p>
                        {entry.submitted_at && <p className="text-xs text-gray-400 mt-1">Dikirim untuk review: {formatLearningDate(entry.submitted_at)}</p>}
                      </div>
                      <div className="flex flex-wrap gap-2 shrink-0">
                        {editable && <button type="button" onClick={() => navigate(`/ruang-belajar/tulis?edit=${entry.id}`)} className="px-3 py-2 rounded-xl bg-gray-900 text-white text-sm font-bold hover:bg-gray-800">{entry.status === 'revision_requested' ? 'Perbaiki & Kirim Ulang' : 'Lanjutkan Edit'}</button>}
                        {entry.status === 'draft' && <button type="button" onClick={() => deleteDraft(entry)} className="px-3 py-2 rounded-xl border border-red-200 text-red-700 text-sm font-bold hover:bg-red-50">Hapus Draft</button>}
                        {entry.status === 'accepted_pending_payment' && <Link to={`/ruang-belajar/pembayaran/${entry.id}`} className="px-3 py-2 rounded-xl bg-violet-700 text-white text-sm font-black hover:bg-violet-800">Lanjut Pembayaran</Link>}
                        {entry.status === 'payment_pending' && <Link to={`/ruang-belajar/pembayaran/${entry.id}`} className="px-3 py-2 rounded-xl border border-sky-200 bg-sky-50 text-sky-800 text-sm font-bold hover:bg-sky-100">Lihat Status Pembayaran</Link>}
                        {entry.status === 'published' && <Link to={getLearningPath(entry)} className="px-3 py-2 rounded-xl border border-gray-200 text-gray-700 text-sm font-bold hover:bg-gray-50">Buka Publik ↗</Link>}
                      </div>
                    </div>

                    {(entry.review_note || latestReview?.note) && (
                      <div className="mt-4 rounded-2xl border border-amber-100 bg-amber-50 p-4 text-sm text-amber-950"><p className="font-black">Catatan review admin</p><p className="mt-1 leading-relaxed whitespace-pre-line">{entry.review_note || latestReview.note}</p>{entry.reviewed_at && <p className="mt-2 text-xs text-amber-800">Diperbarui {formatLearningDate(entry.reviewed_at)}</p>}</div>
                    )}

                    {entry.status === 'accepted_pending_payment' && <div className="mt-4 rounded-2xl border border-violet-100 bg-violet-50 p-4 text-sm text-violet-900"><p className="font-black">Hasil pembelajaran diterima secara editorial.</p><p className="mt-1">Lanjutkan ke Kontribusi Kurasi dan Publikasi. Pembayaran tidak memengaruhi keputusan editorial dan artikel hanya terbit setelah admin memverifikasi transaksi secara manual.</p></div>}
                    {entry.status === 'payment_pending' && <div className="mt-4 rounded-2xl border border-sky-100 bg-sky-50 p-4 text-sm text-sky-950"><p className="font-black">Konfirmasi pembayaran sedang diperiksa.</p><p className="mt-1">Admin sedang mencocokkan transaksi QRIS/rekening. Tidak perlu mengunggah screenshot atau bukti transfer.</p></div>}
                  </article>
                )
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}

export default ClientLearningPage
