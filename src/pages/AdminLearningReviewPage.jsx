import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase'
import {
  formatLearningDate,
  getLearningStatus,
  getSourceRecord
} from '../utils/learning'

const REVIEW_FILTERS = [
  { value: 'all', label: 'Semua antrean' },
  { value: 'submitted', label: 'Menunggu Review' },
  { value: 'under_review', label: 'Sedang Direview' },
  { value: 'revision_requested', label: 'Perlu Revisi' },
  { value: 'accepted_pending_payment', label: 'Diterima' },
  { value: 'rejected', label: 'Belum Diterima' }
]

function StatusBadge({ status }) {
  const item = getLearningStatus(status)
  return <span className={'inline-flex items-center rounded-full border px-3 py-1 text-xs font-bold ' + item.className}>{item.label}</span>
}

function ReadBlock({ label, value }) {
  if (!value) return null
  return (
    <section className="rounded-2xl border border-gray-200 p-4 print-break-avoid">
      <h4 className="text-xs font-black tracking-wide uppercase text-gray-500">{label}</h4>
      <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-gray-700">{value}</p>
    </section>
  )
}

function AdminLearningReviewPage({ user }) {
  const [entries, setEntries] = useState([])
  const [filterStatus, setFilterStatus] = useState('submitted')
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [selectedEntry, setSelectedEntry] = useState(null)
  const [reviewDecision, setReviewDecision] = useState('under_review')
  const [reviewNote, setReviewNote] = useState('')
  const [saving, setSaving] = useState(false)

  const fetchEntries = async () => {
    setLoading(true)
    setErrorMessage('')

    let query = supabase
      .from('learning_entries')
      .select(`
        *,
        source:learning_sources(*)
      `)
      .in('status', ['submitted', 'under_review', 'revision_requested', 'accepted_pending_payment', 'rejected'])
      .order('submitted_at', { ascending: true, nullsFirst: false })
      .order('updated_at', { ascending: false })

    if (filterStatus !== 'all') query = query.eq('status', filterStatus)

    const { data, error } = await query

    if (error) {
      setEntries([])
      setErrorMessage('Gagal memuat antrean review. Pastikan SQL RB-02 sudah dijalankan dan akun ini adalah admin. Detail: ' + error.message)
    } else {
      setEntries(data || [])
    }

    setLoading(false)
  }

  useEffect(() => {
    fetchEntries()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterStatus])

  const counts = useMemo(() => ({
    submitted: entries.filter((entry) => entry.status === 'submitted').length,
    underReview: entries.filter((entry) => entry.status === 'under_review').length,
    revision: entries.filter((entry) => entry.status === 'revision_requested').length,
    accepted: entries.filter((entry) => entry.status === 'accepted_pending_payment').length
  }), [entries])

  const openReview = (entry) => {
    setSelectedEntry(entry)
    setReviewDecision(entry.status === 'submitted' ? 'under_review' : entry.status === 'under_review' ? 'under_review' : entry.status)
    setReviewNote(entry.review_note || '')
    setErrorMessage('')
    setSuccessMessage('')
  }

  const saveReview = async () => {
    if (!selectedEntry) return

    if (['revision_requested', 'rejected'].includes(reviewDecision) && reviewNote.trim().length < 12) {
      setErrorMessage('Untuk meminta revisi atau menolak, isi catatan review minimal 12 karakter agar pembelajar memahami langkah berikutnya.')
      return
    }

    setSaving(true)
    setErrorMessage('')

    try {
      const now = new Date().toISOString()
      const { error: updateError } = await supabase
        .from('learning_entries')
        .update({
          status: reviewDecision,
          review_note: reviewNote.trim() || null,
          reviewed_at: now,
          reviewed_by: user.id,
          published_at: null,
          updated_at: now
        })
        .eq('id', selectedEntry.id)

      if (updateError) throw updateError

      const { error: reviewError } = await supabase
        .from('learning_reviews')
        .insert({
          entry_id: selectedEntry.id,
          admin_id: user.id,
          decision: reviewDecision,
          note: reviewNote.trim() || null
        })

      if (reviewError) throw reviewError

      setSuccessMessage(`Keputusan review tersimpan: ${getLearningStatus(reviewDecision).label}.`)
      setSelectedEntry(null)
      setReviewNote('')
      await fetchEntries()
    } catch (error) {
      setErrorMessage('Gagal menyimpan keputusan review. Detail: ' + (error?.message || 'Tidak diketahui'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div>
          <Link to="/admin/ruang-belajar" className="text-sm font-bold text-green-700 hover:underline">← Kembali ke Ruang Belajar</Link>
          <p className="text-xs text-gray-400 mt-4 mb-1">Admin / Ruang Belajar / Review</p>
          <h1 className="text-2xl font-black text-gray-900">Antrean Review Pembelajaran</h1>
          <p className="text-sm text-gray-500 mt-1 max-w-3xl">Baca hasil pembelajaran client, beri catatan yang jelas, lalu putuskan apakah perlu revisi, belum diterima, atau diterima secara editorial. Setelah diterima editorial, pembelajar melanjutkan kontribusi publikasi manual melalui QRIS/rekening. Artikel hanya terbit setelah admin memverifikasi transaksi.</p>
        </div>
        <button type="button" onClick={fetchEntries} disabled={loading} className="px-4 py-3 rounded-xl border border-gray-200 bg-white text-sm font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-50">{loading ? 'Memuat...' : 'Muat ulang'}</button>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {[
          ['Menunggu review', counts.submitted, '📨'],
          ['Sedang direview', counts.underReview, '🔎'],
          ['Perlu revisi', counts.revision, '✏️'],
          ['Diterima', counts.accepted, '✅']
        ].map(([label, value, icon]) => <div key={label} className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm"><div className="flex items-center justify-between"><p className="text-xs text-gray-400">{label}</p><span>{icon}</span></div><p className="text-2xl font-black text-gray-900 mt-2">{value}</p></div>)}
      </div>

      {errorMessage && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 leading-relaxed">{errorMessage}</div>}
      {successMessage && <div className="rounded-2xl border border-green-200 bg-green-50 p-4 text-sm text-green-800 leading-relaxed">{successMessage}</div>}

      <section className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-5 sm:p-6 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div><h2 className="text-lg font-black text-gray-900">Kiriman client</h2><p className="text-sm text-gray-500 mt-1">Client tidak dapat mempublikasikan sendiri dan tidak dapat mengubah kiriman saat status sedang direview.</p></div>
          <label className="text-sm font-bold text-gray-600">Filter <select value={filterStatus} onChange={(event) => setFilterStatus(event.target.value)} className="ml-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700">{REVIEW_FILTERS.map((filter) => <option key={filter.value} value={filter.value}>{filter.label}</option>)}</select></label>
        </div>

        {loading ? <div className="p-10 text-center text-sm text-gray-400">Memuat antrean review...</div> : entries.length === 0 ? (
          <div className="p-10 text-center"><div className="text-4xl">🗂️</div><h3 className="mt-3 font-black text-gray-900">Tidak ada kiriman pada filter ini</h3><p className="text-sm text-gray-500 mt-1">Saat user mengirim hasil pembelajaran, antrean akan muncul di sini.</p></div>
        ) : (
          <div className="divide-y divide-gray-100">
            {entries.map((entry) => {
              const source = getSourceRecord(entry)
              return (
                <article key={entry.id} className="p-5 sm:p-6 flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2"><StatusBadge status={entry.status} /><span className="text-xs text-gray-400">Dikirim {formatLearningDate(entry.submitted_at || entry.updated_at)}</span></div>
                    <h3 className="font-black text-gray-900 mt-3 leading-snug">{entry.title}</h3>
                    <p className="text-sm text-gray-500 mt-1 line-clamp-2">{entry.excerpt || entry.summary_own_words}</p>
                    <p className="text-xs text-gray-500 mt-3"><span className="font-bold text-gray-700">Pembelajar:</span> {entry.studied_by_name || '-'} · <span className="font-bold text-gray-700">Sumber:</span> {source?.source_title || 'Belum terbaca'}</p>
                    {entry.review_note && <p className="mt-3 rounded-xl border border-amber-100 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900"><span className="font-bold">Catatan review terakhir:</span> {entry.review_note}</p>}
                  </div>
                  <button type="button" onClick={() => openReview(entry)} className="px-4 py-3 rounded-xl bg-indigo-700 text-white text-sm font-bold hover:bg-indigo-800 shrink-0">Baca & Review</button>
                </article>
              )
            })}
          </div>
        )}
      </section>

      {selectedEntry && (
        <div className="fixed inset-0 z-50 bg-black/40 p-4 overflow-y-auto admin-fade-in" onClick={() => !saving && setSelectedEntry(null)}>
          <div className="max-w-4xl mx-auto my-6 bg-white rounded-3xl shadow-2xl admin-pop-panel overflow-hidden" onClick={(event) => event.stopPropagation()}>
            <div className="p-5 sm:p-6 border-b border-gray-100 flex items-start justify-between gap-4"><div><p className="text-xs font-black tracking-wide text-indigo-600">REVIEW KIRIMAN CLIENT</p><h2 className="text-xl font-black text-gray-900 mt-1">{selectedEntry.title}</h2><p className="text-sm text-gray-500 mt-1">Dipahami oleh {selectedEntry.studied_by_name || 'Pembelajar'} · Dikirim {formatLearningDate(selectedEntry.submitted_at || selectedEntry.updated_at)}</p></div><button type="button" onClick={() => setSelectedEntry(null)} disabled={saving} className="h-9 w-9 rounded-xl bg-gray-100 text-gray-600 hover:bg-gray-200">×</button></div>
            <div className="p-5 sm:p-6 space-y-5 max-h-[68vh] overflow-y-auto">
              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm"><p className="font-black text-gray-900">Artikel sumber</p><p className="mt-1 text-gray-700">{getSourceRecord(selectedEntry)?.source_title || 'Belum terbaca'}</p><a href={getSourceRecord(selectedEntry)?.source_url || getSourceRecord(selectedEntry)?.doi_url || '#'} target="_blank" rel="noreferrer" className="inline-flex mt-2 text-xs font-bold text-green-700 hover:underline">Buka sumber resmi ↗</a></div>
              <ReadBlock label="Ringkasan untuk card" value={selectedEntry.excerpt} />
              <ReadBlock label="Ringkasan dengan kata-kata sendiri" value={selectedEntry.summary_own_words} />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4"><ReadBlock label="Tujuan artikel" value={selectedEntry.research_purpose} /><ReadBlock label="Desain penelitian" value={selectedEntry.research_design} /><ReadBlock label="Subjek / konteks" value={selectedEntry.participants} /><ReadBlock label="Variabel atau fokus" value={selectedEntry.variables_focus} /><ReadBlock label="Instrumen" value={selectedEntry.instruments} /><ReadBlock label="Analisis data" value={selectedEntry.data_analysis} /></div>
              <ReadBlock label="Alur analisis" value={selectedEntry.analysis_flow} />
              <ReadBlock label="Hasil utama menurut artikel" value={selectedEntry.reported_findings} />
              <ReadBlock label="Hal yang dipelajari" value={selectedEntry.learning_points} />
              <ReadBlock label="Pertanyaan metodologis" value={selectedEntry.critical_notes} />
              <ReadBlock label="Rujukan tambahan" value={selectedEntry.references_text} />

              <section className="rounded-2xl border border-indigo-100 bg-indigo-50 p-5"><h3 className="font-black text-indigo-950">Keputusan review</h3><div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4"><label><span className="block text-sm font-bold text-indigo-950 mb-1.5">Ubah status menjadi</span><select value={reviewDecision} onChange={(event) => setReviewDecision(event.target.value)} className="w-full rounded-xl border border-indigo-200 bg-white px-3 py-3 text-sm"><option value="under_review">Sedang Direview</option><option value="revision_requested">Minta Revisi</option><option value="accepted_pending_payment">Terima Editorial</option><option value="rejected">Tolak</option></select></label><p className="text-xs leading-relaxed text-indigo-900 md:pt-7">“Terima Editorial” belum menerbitkan artikel. Pada RB-03, pembelajar akan melihat QRIS/rekening, mengirim konfirmasi pembayaran tanpa upload bukti, lalu admin memverifikasi transaksi secara manual sebelum artikel diterbitkan.</p></div><label className="block mt-4"><span className="block text-sm font-bold text-indigo-950 mb-1.5">Catatan untuk pembelajar</span><textarea value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} rows={5} placeholder="Tuliskan alasan, saran revisi, atau catatan keputusan dengan bahasa jelas dan sopan." className="w-full rounded-xl border border-indigo-200 bg-white px-4 py-3 text-sm leading-relaxed" /><p className="text-xs text-indigo-800 mt-1">Wajib diisi untuk Minta Revisi dan Tolak.</p></label></section>
            </div>
            <div className="p-5 sm:p-6 border-t border-gray-100 flex justify-end gap-2"><button type="button" onClick={() => setSelectedEntry(null)} disabled={saving} className="px-4 py-3 rounded-xl border border-gray-200 text-sm font-bold text-gray-600 hover:bg-gray-50">Batal</button><button type="button" onClick={saveReview} disabled={saving} className="px-5 py-3 rounded-xl bg-indigo-700 text-white text-sm font-black hover:bg-indigo-800 disabled:opacity-50">{saving ? 'Menyimpan...' : 'Simpan Keputusan Review'}</button></div>
          </div>
        </div>
      )}
    </div>
  )
}

export default AdminLearningReviewPage
