import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../supabase'
import {
  ANALYSIS_TAG_OPTIONS,
  LEARNING_DISCIPLINES,
  METHOD_TAG_OPTIONS,
  formatLearningDate,
  getLearningPath,
  getSourceRecord
} from '../utils/learning'

const PAGE_SIZE = 12

const getPageNumbers = (currentPage, totalPages) => {
  const pages = []

  for (let page = 1; page <= totalPages; page += 1) {
    if (page === 1 || page === totalPages || Math.abs(page - currentPage) <= 1) pages.push(page)
    else if (pages[pages.length - 1] !== '…') pages.push('…')
  }

  return pages
}

const cleanSearchTerm = (value = '') => String(value).replace(/[(),]/g, ' ').replace(/\s+/g, ' ').trim()

function TagPill({ children, tone = 'gray' }) {
  const tones = {
    gray: 'bg-gray-100 text-gray-700 border-gray-200',
    green: 'bg-green-50 text-green-700 border-green-100',
    blue: 'bg-blue-50 text-blue-700 border-blue-100'
  }

  return <span className={'inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ' + (tones[tone] || tones.gray)}>{children}</span>
}

function LearningHubPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [entries, setEntries] = useState([])
  const [totalItems, setTotalItems] = useState(0)
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [signedIn, setSignedIn] = useState(false)

  const page = Math.max(1, Number(searchParams.get('page') || 1))
  const discipline = searchParams.get('kategori') || 'all'
  const method = searchParams.get('metode') || ''
  const analysis = searchParams.get('analisis') || ''
  const search = searchParams.get('q') || ''

  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)

  const updateFilters = (changes = {}) => {
    const next = new URLSearchParams(searchParams)

    Object.entries(changes).forEach(([key, value]) => {
      if (value === null || value === undefined || value === '' || value === 'all') next.delete(key)
      else next.set(key, value)
    })

    if (!Object.prototype.hasOwnProperty.call(changes, 'page')) next.delete('page')
    setSearchParams(next)
  }

  useEffect(() => {
    let active = true

    const syncSession = (session) => {
      if (active) setSignedIn(Boolean(session?.user))
    }

    supabase.auth.getSession().then(({ data: { session } }) => syncSession(session))
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => syncSession(session))

    return () => {
      active = false
      listener?.subscription?.unsubscribe()
    }
  }, [])

  useEffect(() => {
    let active = true

    const fetchEntries = async () => {
      setLoading(true)
      setErrorMessage('')

      const requestedPage = Math.max(1, Number(searchParams.get('page') || 1))
      const rangeStart = (requestedPage - 1) * PAGE_SIZE
      const rangeEnd = rangeStart + PAGE_SIZE - 1
      const term = cleanSearchTerm(searchParams.get('q') || '')
      const selectedDiscipline = searchParams.get('kategori') || 'all'
      const selectedMethod = searchParams.get('metode') || ''
      const selectedAnalysis = searchParams.get('analisis') || ''

      let request = supabase
        .from('learning_entries')
        .select(`
          id,
          slug,
          short_code,
          title,
          excerpt,
          discipline,
          method_tags,
          analysis_tags,
          studied_by_name,
          studied_at,
          published_at,
          source:learning_sources(source_title, source_year, source_url, doi_url)
        `, { count: 'exact' })
        .eq('status', 'published')
        .order('published_at', { ascending: false })
        .range(rangeStart, rangeEnd)

      if (selectedDiscipline !== 'all') request = request.eq('discipline', selectedDiscipline)
      if (selectedMethod) request = request.contains('method_tags', [selectedMethod])
      if (selectedAnalysis) request = request.contains('analysis_tags', [selectedAnalysis])

      if (term) {
        const escaped = term.replace(/[%_]/g, '')
        request = request.or(`title.ilike.%${escaped}%,excerpt.ilike.%${escaped}%,studied_by_name.ilike.%${escaped}%`)
      }

      const { data, error, count } = await request

      if (!active) return

      if (error) {
        setEntries([])
        setTotalItems(0)
        setErrorMessage('Ruang Belajar belum bisa dimuat. Jalankan file SQL RB-01 terlebih dahulu atau periksa hak akses Supabase. Detail: ' + error.message)
      } else {
        setEntries(data || [])
        setTotalItems(Number(count || 0))
      }

      setLoading(false)
    }

    fetchEntries()

    return () => {
      active = false
    }
  }, [searchParams])

  const activeFilterCount = useMemo(() => [discipline !== 'all', Boolean(method), Boolean(analysis), Boolean(search)].filter(Boolean).length, [discipline, method, analysis, search])

  const currentPageItems = getPageNumbers(safePage, totalPages)

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <header className="bg-gray-950 text-white rounded-[2rem] p-6 sm:p-8 shadow-lg">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
            <div className="max-w-3xl">
              <Link to="/" className="inline-flex items-center text-sm font-semibold text-green-300 hover:underline">
                ← Kembali ke Landing
              </Link>
              <p className="mt-5 inline-flex rounded-full bg-white/10 px-3 py-1 text-xs font-bold tracking-wide text-green-200 border border-white/10">
                RUANG BELAJAR GREENROOMID
              </p>
              <h1 className="text-3xl sm:text-4xl font-black tracking-tight mt-4">Hasil Pembelajaran Artikel</h1>
              <p className="text-gray-300 leading-relaxed mt-3 max-w-2xl">
                Perpustakaan publik berisi hasil pemahaman artikel ilmiah dengan ringkasan memakai kata-kata sendiri, peta metode, analisis, serta catatan pembelajaran.
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-gray-300 max-w-sm">
              <p className="font-bold text-white">Tahap awal: Pendidikan</p>
              <p className="mt-1 leading-relaxed">Hanya hasil pembelajaran yang sudah dipublikasikan tampil di halaman ini.</p>
              {signedIn && <div className="mt-4 flex flex-wrap gap-2"><Link to="/ruang-belajar/saya" className="rounded-xl border border-white/20 px-3 py-2 text-xs font-bold hover:bg-white/10">Pembelajaran Saya</Link><Link to="/ruang-belajar/tulis" className="rounded-xl bg-green-400 px-3 py-2 text-xs font-black text-gray-950 hover:bg-green-300">+ Tulis</Link></div>}
              {!signedIn && <Link to="/login" className="inline-flex mt-4 rounded-xl border border-white/20 px-3 py-2 text-xs font-bold hover:bg-white/10">Masuk untuk menulis</Link>}
            </div>
          </div>
        </header>

        <section className="mt-6 bg-white rounded-3xl border border-gray-200 shadow-sm p-5 sm:p-6">
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
            <div>
              <h2 className="text-xl font-black text-gray-900">Temukan hasil pembelajaran</h2>
              <p className="text-sm text-gray-500 mt-1">Filter mempersempit daftar yang sama. Artikel tidak dibuat ganda untuk setiap metode atau analisis.</p>
            </div>
            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={() => setSearchParams(new URLSearchParams())}
                className="text-sm font-bold text-green-700 hover:underline text-left lg:text-right"
              >
                Reset {activeFilterCount} filter
              </button>
            )}
          </div>

          <div className="mt-5 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            <label className="block xl:col-span-2">
              <span className="block text-xs font-bold text-gray-500 mb-2">Cari judul, ringkasan, atau nama pembelajar</span>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">⌕</span>
                <input
                  type="search"
                  value={search}
                  onChange={(event) => updateFilters({ q: event.target.value })}
                  placeholder="Contoh: quasi experiment, reliabilitas, motivasi"
                  className="w-full border border-gray-200 rounded-2xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                />
              </div>
            </label>

            <label className="block">
              <span className="block text-xs font-bold text-gray-500 mb-2">Kategori ilmu</span>
              <select
                value={discipline}
                onChange={(event) => updateFilters({ kategori: event.target.value })}
                className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-400"
              >
                <option value="all">Semua kategori aktif</option>
                {LEARNING_DISCIPLINES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>

            <label className="block">
              <span className="block text-xs font-bold text-gray-500 mb-2">Metode</span>
              <select
                value={method}
                onChange={(event) => updateFilters({ metode: event.target.value })}
                className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-400"
              >
                <option value="">Semua metode</option>
                {METHOD_TAG_OPTIONS.map((tag) => <option key={tag} value={tag}>{tag}</option>)}
              </select>
            </label>

            <label className="block md:col-span-2 xl:col-span-1">
              <span className="block text-xs font-bold text-gray-500 mb-2">Analisis</span>
              <select
                value={analysis}
                onChange={(event) => updateFilters({ analisis: event.target.value })}
                className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-400"
              >
                <option value="">Semua analisis</option>
                {ANALYSIS_TAG_OPTIONS.map((tag) => <option key={tag} value={tag}>{tag}</option>)}
              </select>
            </label>
          </div>
        </section>

        <section className="mt-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
            <div>
              <h2 className="text-lg font-black text-gray-900">Daftar Hasil Pembelajaran</h2>
              <p className="text-sm text-gray-500 mt-1">
                {loading ? 'Memuat daftar...' : `${new Intl.NumberFormat('id-ID').format(totalItems)} hasil pembelajaran ditemukan`}
              </p>
            </div>
            {!loading && totalItems > 0 && <p className="text-xs font-semibold text-gray-400">Maksimal {PAGE_SIZE} card per halaman</p>}
          </div>

          {errorMessage && (
            <div className="rounded-3xl border border-red-200 bg-red-50 p-5 text-sm text-red-700 leading-relaxed">
              {errorMessage}
            </div>
          )}

          {loading && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="bg-white border border-gray-200 rounded-3xl p-5 min-h-72 animate-pulse">
                  <div className="h-4 w-24 rounded bg-gray-100" />
                  <div className="h-7 w-4/5 rounded bg-gray-100 mt-5" />
                  <div className="h-4 w-full rounded bg-gray-100 mt-3" />
                  <div className="h-4 w-3/4 rounded bg-gray-100 mt-2" />
                  <div className="flex gap-2 mt-7"><div className="h-7 w-20 rounded-full bg-gray-100" /><div className="h-7 w-24 rounded-full bg-gray-100" /></div>
                </div>
              ))}
            </div>
          )}

          {!loading && !errorMessage && entries.length === 0 && (
            <div className="bg-white border border-dashed border-gray-300 rounded-3xl px-6 py-12 text-center">
              <div className="mx-auto w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center text-2xl">📚</div>
              <h3 className="mt-4 text-xl font-black text-gray-900">Belum ada hasil pembelajaran yang cocok</h3>
              <p className="text-sm text-gray-500 leading-relaxed mt-2 max-w-lg mx-auto">
                {activeFilterCount > 0
                  ? 'Coba ubah kata pencarian atau reset filter untuk melihat daftar lainnya.'
                  : 'Admin akan menerbitkan hasil pembelajaran pertama setelah catatan dan sumbernya selesai diperiksa.'}
              </p>
            </div>
          )}

          {!loading && !errorMessage && entries.length > 0 && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {entries.map((entry) => {
                  const source = getSourceRecord(entry)
                  const allTags = [...(entry.method_tags || []), ...(entry.analysis_tags || [])]
                  const visibleTags = allTags.slice(0, 4)
                  const remainingTags = Math.max(0, allTags.length - visibleTags.length)

                  return (
                    <Link
                      key={entry.id}
                      to={getLearningPath(entry)}
                      className="group bg-white border border-gray-200 rounded-3xl p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md hover:border-gray-300 flex flex-col min-h-80"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <TagPill tone="green">{entry.discipline || 'Pendidikan'}</TagPill>
                        <span className="text-xs text-gray-400 text-right">{formatLearningDate(entry.published_at)}</span>
                      </div>

                      <div className="mt-4">
                        <p className="text-[11px] font-bold tracking-wide text-gray-400 uppercase">Hasil Pembelajaran Artikel</p>
                        <h3 className="text-lg font-black text-gray-900 leading-snug mt-2 group-hover:text-green-800 transition line-clamp-3">{entry.title}</h3>
                        <p className="text-sm text-gray-500 leading-relaxed mt-3 line-clamp-3">{entry.excerpt || entry.summary_own_words || 'Catatan pembelajaran tersedia pada halaman detail.'}</p>
                      </div>

                      <div className="mt-4 text-xs text-gray-500 space-y-1">
                        <p><span className="font-semibold text-gray-700">Dipahami oleh:</span> {entry.studied_by_name || 'GreenroomID'}</p>
                        {source?.source_title && <p className="line-clamp-1"><span className="font-semibold text-gray-700">Sumber:</span> {source.source_title}</p>}
                      </div>

                      <div className="mt-5 flex flex-wrap gap-1.5">
                        {visibleTags.map((tag, index) => <TagPill key={`${tag}-${index}`} tone={index < (entry.method_tags || []).length ? 'blue' : 'gray'}>{tag}</TagPill>)}
                        {remainingTags > 0 && <TagPill>+ {remainingTags} tag lainnya</TagPill>}
                      </div>

                      <p className="mt-auto pt-6 text-sm font-bold text-green-700 group-hover:underline">Baca hasil pembelajaran →</p>
                    </Link>
                  )
                })}
              </div>

              {totalPages > 1 && (
                <nav aria-label="Pagination hasil pembelajaran" className="mt-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <p className="text-sm text-gray-500">Halaman {safePage} dari {totalPages}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      to={buildPageLink(searchParams, Math.max(1, safePage - 1))}
                      aria-disabled={safePage === 1}
                      className={'px-3 py-2 rounded-xl border text-sm font-semibold transition ' + (safePage === 1 ? 'pointer-events-none opacity-40 bg-gray-100 border-gray-200 text-gray-500' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50')}
                    >
                      ← Sebelumnya
                    </Link>
                    {currentPageItems.map((item, index) => item === '…' ? (
                      <span key={`dots-${index}`} className="px-1 text-gray-400">…</span>
                    ) : (
                      <Link
                        key={item}
                        to={buildPageLink(searchParams, item)}
                        aria-current={item === safePage ? 'page' : undefined}
                        className={'min-w-10 px-3 py-2 rounded-xl border text-sm font-semibold text-center transition ' + (item === safePage ? 'bg-gray-900 border-gray-900 text-white' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50')}
                      >
                        {item}
                      </Link>
                    ))}
                    <Link
                      to={buildPageLink(searchParams, Math.min(totalPages, safePage + 1))}
                      aria-disabled={safePage === totalPages}
                      className={'px-3 py-2 rounded-xl border text-sm font-semibold transition ' + (safePage === totalPages ? 'pointer-events-none opacity-40 bg-gray-100 border-gray-200 text-gray-500' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50')}
                    >
                      Berikutnya →
                    </Link>
                  </div>
                </nav>
              )}
            </>
          )}
        </section>

        <section className="mt-8 rounded-3xl bg-white border border-gray-200 p-5 sm:p-6 text-sm text-gray-600 leading-relaxed">
          <h2 className="font-black text-gray-900">Tentang Ruang Belajar</h2>
          <p className="mt-2">Konten yang terbit adalah hasil pembelajaran dan ulasan independen. Sumber asli selalu dicantumkan; file jurnal, data responden, tabel, gambar, serta PDF sumber tidak disimpan atau dipublikasikan oleh GreenroomID.</p>
        </section>
      </div>
    </div>
  )
}

function buildPageLink(searchParams, nextPage) {
  const next = new URLSearchParams(searchParams)
  if (nextPage <= 1) next.delete('page')
  else next.set('page', String(nextPage))

  const query = next.toString()
  return query ? `/ruang-belajar?${query}` : '/ruang-belajar'
}

export default LearningHubPage
