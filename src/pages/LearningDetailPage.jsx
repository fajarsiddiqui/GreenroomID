import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useLocation, useParams } from 'react-router-dom'
import { supabase } from '../supabase'
import {
  formatLearningDate,
  getShortCodeFromPath,
  getSourceRecord,
  getLearningPath,
  ensureUrl
} from '../utils/learning'
import { applyLearningPageMeta } from '../utils/pageMeta'

function DetailSection({ title, eyebrow, children, className = '' }) {
  return (
    <section className={'bg-white border border-gray-200 rounded-3xl p-5 sm:p-7 shadow-sm print-break-avoid ' + className}>
      {eyebrow && <p className="text-[11px] font-bold tracking-[0.16em] text-green-700 uppercase">{eyebrow}</p>}
      <h2 className="text-xl font-black text-gray-900 mt-1">{title}</h2>
      <div className="mt-4 text-gray-600 leading-relaxed">{children}</div>
    </section>
  )
}

function DetailText({ value, empty = 'Belum dicatat.' }) {
  return <p className="whitespace-pre-line">{value || empty}</p>
}

function DetailTag({ children, tone = 'gray' }) {
  const tones = {
    gray: 'bg-gray-100 text-gray-700 border-gray-200',
    green: 'bg-green-50 text-green-700 border-green-100',
    blue: 'bg-blue-50 text-blue-700 border-blue-100'
  }

  return <span className={'inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold ' + (tones[tone] || tones.gray)}>{children}</span>
}

function LearningDetailPage() {
  const { entrySlug } = useParams()
  const location = useLocation()
  const [entry, setEntry] = useState(null)
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')

  const shortCode = useMemo(() => getShortCodeFromPath(entrySlug), [entrySlug])
  const source = getSourceRecord(entry)
  const sourceUrl = ensureUrl(source?.source_url || source?.doi_url || '')
  const canonicalUrl = typeof window !== 'undefined' ? `${window.location.origin}${location.pathname}` : ''

  useEffect(() => {
    let active = true

    const fetchEntry = async () => {
      if (!shortCode) {
        if (!active) return
        setEntry(null)
        setErrorMessage('Tautan hasil pembelajaran tidak lengkap.')
        setLoading(false)
        return
      }

      setLoading(true)
      setErrorMessage('')

      const { data, error } = await supabase
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
          published_at,
          created_at,
          updated_at,
          source:learning_sources(
            source_title,
            source_authors,
            source_year,
            source_journal,
            source_volume_issue,
            source_url,
            doi_url
          )
        `)
        .eq('short_code', shortCode)
        .eq('status', 'published')
        .maybeSingle()

      if (!active) return

      if (error) {
        setEntry(null)
        setErrorMessage('Hasil pembelajaran belum bisa dimuat. Detail: ' + error.message)
      } else if (!data) {
        setEntry(null)
        setErrorMessage('Hasil pembelajaran tidak ditemukan atau belum dipublikasikan.')
      } else {
        setEntry(data)
      }

      setLoading(false)
    }

    fetchEntry()

    return () => {
      active = false
    }
  }, [shortCode])

  useEffect(() => {
    if (!entry) return undefined

    const description = entry.excerpt || entry.summary_own_words?.slice(0, 155) || 'Hasil Pembelajaran Artikel di Ruang Belajar GreenroomID.'
    return applyLearningPageMeta({
      title: `${entry.title} | Ruang Belajar GreenroomID`,
      description,
      canonicalUrl,
      entry,
      source
    })
  }, [entry, canonicalUrl, source])

  if (!loading && !entry && errorMessage.includes('tidak ditemukan')) return <Navigate to="/ruang-belajar" replace />

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 animate-pulse">
          <div className="h-6 w-40 rounded bg-gray-200" />
          <div className="mt-6 bg-white rounded-[2rem] border border-gray-200 p-7 sm:p-9">
            <div className="h-5 w-32 rounded bg-gray-100" />
            <div className="h-10 w-4/5 rounded bg-gray-100 mt-5" />
            <div className="h-5 w-full rounded bg-gray-100 mt-5" />
            <div className="h-5 w-3/4 rounded bg-gray-100 mt-3" />
          </div>
        </div>
      </div>
    )
  }

  if (!entry) {
    return (
      <div className="min-h-screen bg-gray-100">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
          <Link to="/ruang-belajar" className="text-sm font-bold text-green-700 hover:underline">← Kembali ke Ruang Belajar</Link>
          <div className="mt-5 bg-white border border-red-200 rounded-3xl p-6 text-red-700 text-sm leading-relaxed">{errorMessage || 'Hasil pembelajaran tidak tersedia.'}</div>
        </div>
      </div>
    )
  }

  if (location.pathname !== getLearningPath(entry)) {
    return <Navigate to={getLearningPath(entry)} replace />
  }

  const petaPenelitian = [
    ['Pendekatan / desain', entry.research_design],
    ['Subjek / sampel / konteks', entry.participants],
    ['Variabel atau fokus', entry.variables_focus],
    ['Instrumen', entry.instruments],
    ['Analisis data', entry.data_analysis]
  ].filter(([, value]) => value)

  return (
    <div className="min-h-screen bg-gray-100 learning-print-document">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <div className="no-print flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
          <Link to="/ruang-belajar" className="text-sm font-bold text-green-700 hover:underline">← Kembali ke Ruang Belajar</Link>
          <button type="button" onClick={() => window.print()} className="bg-gray-900 text-white px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-gray-800">
            Cetak / Simpan sebagai PDF
          </button>
        </div>

        <div className="print-only print-document-header">
          <div className="flex items-center gap-3">
            <img src="/greenroomid-icon.png" alt="Logo GreenroomID" className="w-10 h-10 object-contain" />
            <div>
              <p className="font-black text-gray-900">GreenroomID</p>
              <p className="text-[10px] tracking-[0.13em] uppercase text-gray-500">Ruang Belajar · Hasil Pembelajaran Artikel</p>
            </div>
          </div>
          <p className="text-[10px] text-gray-500 text-right">Dicetak {formatLearningDate(new Date(), { day: '2-digit', month: 'short', year: 'numeric' })}</p>
        </div>

        <article>
          <header className="bg-gray-950 text-white rounded-[2rem] p-6 sm:p-9 shadow-lg print-header-card">
            <div className="flex flex-wrap gap-2">
              <DetailTag tone="green">{entry.discipline || 'Pendidikan'}</DetailTag>
              <DetailTag>Hasil Pembelajaran Artikel</DetailTag>
            </div>
            <h1 className="text-3xl sm:text-4xl font-black tracking-tight leading-tight mt-5">{entry.title}</h1>
            <p className="text-gray-300 leading-relaxed mt-4 max-w-3xl whitespace-pre-line">{entry.excerpt || entry.summary_own_words?.slice(0, 300)}</p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-7 text-sm">
              <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
                <p className="text-xs text-gray-400">Dipahami oleh</p>
                <p className="font-bold text-white mt-1">{entry.studied_by_name || 'GreenroomID'}</p>
              </div>
              <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
                <p className="text-xs text-gray-400">Tanggal dipelajari</p>
                <p className="font-bold text-white mt-1">{formatLearningDate(entry.studied_at)}</p>
              </div>
              <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
                <p className="text-xs text-gray-400">Tanggal diterbitkan</p>
                <p className="font-bold text-white mt-1">{formatLearningDate(entry.published_at)}</p>
              </div>
            </div>
          </header>

          <section className="mt-5 bg-white border border-gray-200 rounded-3xl p-5 sm:p-7 shadow-sm print-break-avoid">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-5">
              <div>
                <p className="text-[11px] font-bold tracking-[0.16em] text-green-700 uppercase">Sumber artikel</p>
                <h2 className="text-xl font-black text-gray-900 mt-1">{source?.source_title || 'Artikel sumber'}</h2>
                <div className="mt-3 text-sm text-gray-600 leading-relaxed space-y-1">
                  {source?.source_authors && <p><span className="font-semibold text-gray-800">Penulis:</span> {source.source_authors}</p>}
                  {source?.source_year && <p><span className="font-semibold text-gray-800">Tahun:</span> {source.source_year}</p>}
                  {source?.source_journal && <p><span className="font-semibold text-gray-800">Jurnal / penerbit:</span> {source.source_journal}</p>}
                  {source?.source_volume_issue && <p><span className="font-semibold text-gray-800">Edisi sumber:</span> {source.source_volume_issue}</p>}
                </div>
              </div>
              {sourceUrl && (
                <a href={sourceUrl} target="_blank" rel="noreferrer" className="no-print inline-flex items-center justify-center shrink-0 rounded-2xl bg-green-700 text-white px-4 py-3 text-sm font-bold hover:bg-green-800">
                  Buka sumber asli ↗
                </a>
              )}
            </div>
            {sourceUrl && <p className="print-source-link mt-5 text-xs text-gray-500 break-all"><span className="font-semibold text-gray-700">Link sumber resmi:</span> <a href={sourceUrl} target="_blank" rel="noreferrer">{sourceUrl}</a></p>}
          </section>

          <section className="mt-5 bg-white border border-gray-200 rounded-3xl p-5 sm:p-7 shadow-sm print-break-avoid">
            <h2 className="text-xl font-black text-gray-900">Peta pembelajaran</h2>
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-2xl bg-gray-50 border border-gray-100 p-4">
                <p className="text-xs font-bold text-gray-400">Kategori ilmu</p>
                <p className="font-bold text-gray-800 mt-1">{entry.discipline || 'Pendidikan'}</p>
              </div>
              <div className="rounded-2xl bg-gray-50 border border-gray-100 p-4">
                <p className="text-xs font-bold text-gray-400">Metode yang terlihat</p>
                <div className="mt-2 flex flex-wrap gap-1.5">{(entry.method_tags || []).length ? entry.method_tags.map((tag) => <DetailTag key={tag} tone="blue">{tag}</DetailTag>) : <span className="text-sm text-gray-500">Belum ditandai.</span>}</div>
              </div>
              <div className="sm:col-span-2 rounded-2xl bg-gray-50 border border-gray-100 p-4">
                <p className="text-xs font-bold text-gray-400">Analisis yang terlihat</p>
                <div className="mt-2 flex flex-wrap gap-1.5">{(entry.analysis_tags || []).length ? entry.analysis_tags.map((tag) => <DetailTag key={tag}>{tag}</DetailTag>) : <span className="text-sm text-gray-500">Belum ditandai.</span>}</div>
              </div>
            </div>
          </section>

          <div className="mt-5 grid grid-cols-1 gap-5">
            <DetailSection eyebrow="Pemahaman pembelajar" title="Ringkasan dengan kata-kata sendiri">
              <DetailText value={entry.summary_own_words} />
            </DetailSection>

            <DetailSection eyebrow="Tujuan" title="Apa yang ingin dijawab artikel?">
              <DetailText value={entry.research_purpose} />
            </DetailSection>

            {petaPenelitian.length > 0 && (
              <DetailSection eyebrow="Peta penelitian" title="Bagian penting yang dipahami">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] text-sm">
                    <tbody>
                      {petaPenelitian.map(([label, value]) => (
                        <tr key={label} className="border-b border-gray-100 last:border-b-0">
                          <th scope="row" className="w-48 text-left align-top font-bold text-gray-800 py-3 pr-4">{label}</th>
                          <td className="py-3 whitespace-pre-line">{value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </DetailSection>
            )}

            <DetailSection eyebrow="Alur" title="Alur analisis yang dipelajari">
              <DetailText value={entry.analysis_flow} />
            </DetailSection>

            <DetailSection eyebrow="Menurut artikel" title="Hasil utama yang dilaporkan">
              <DetailText value={entry.reported_findings} />
            </DetailSection>

            <DetailSection eyebrow="Catatan GreenroomID" title="Hal yang dipelajari">
              <DetailText value={entry.learning_points} />
            </DetailSection>

            <DetailSection eyebrow="Pertanyaan metodologis" title="Hal yang perlu diperhatikan">
              <DetailText value={entry.critical_notes} empty="Belum ada catatan kritis yang ditulis." />
            </DetailSection>

            {entry.references_text && (
              <DetailSection eyebrow="Rujukan tambahan" title="Catatan referensi">
                <DetailText value={entry.references_text} />
              </DetailSection>
            )}
          </div>

          <section className="mt-5 rounded-3xl border border-green-100 bg-green-50 p-5 sm:p-6 text-sm text-green-900 leading-relaxed print-break-avoid">
            <h2 className="font-black">Catatan pembelajaran dan hak cipta</h2>
            <p className="mt-2">Dokumen ini adalah hasil pembelajaran dan ulasan independen berdasarkan sumber yang dicantumkan. Ini bukan publikasi ulang, salinan, atau pengganti artikel sumber asli. Hak cipta artikel sumber tetap berada pada penulis dan penerbitnya.</p>
            {sourceUrl && <p className="mt-3"><span className="font-bold">Rujukan asli:</span> <a href={sourceUrl} target="_blank" rel="noreferrer" className="underline break-all">{sourceUrl}</a></p>}
          </section>
        </article>

        <footer className="print-footer mt-8 text-center text-xs text-gray-400">
          GreenroomID · Ruang Belajar · {canonicalUrl || getLearningPath(entry)}
        </footer>
      </div>
    </div>
  )
}

export default LearningDetailPage
