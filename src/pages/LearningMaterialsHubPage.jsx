import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import PublicFooter from '../components/PublicFooter'
import { supabase } from '../supabase'
import { formatMaterialPublicDate } from '../utils/learningMaterials'

function LearningMaterialsHubPage() {
  const [materials, setMaterials] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')

  useEffect(() => {
    let active = true

    const fetchMaterials = async () => {
      setLoading(true)
      setError('')

      const { data, error: queryError } = await supabase
        .from('learning_materials')
        .select('id, title, slug, excerpt, category, published_at, updated_at')
        .eq('status', 'published')
        .order('published_at', { ascending: false })

      if (!active) return

      if (queryError) {
        setError('Ruang Belajar belum dapat dimuat. Silakan coba lagi.')
        setMaterials([])
      } else {
        setMaterials(data || [])
      }

      setLoading(false)
    }

    fetchMaterials()

    return () => {
      active = false
    }
  }, [])

  const categories = useMemo(() => (
    [...new Set(materials.map((material) => material.category).filter(Boolean))].sort((a, b) => a.localeCompare(b))
  ), [materials])

  const visibleMaterials = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    return materials.filter((material) => {
      const categoryMatches = !category || material.category === category
      const searchText = `${material.title || ''} ${material.excerpt || ''}`.toLowerCase()
      const searchMatches = !keyword || searchText.includes(keyword)
      return categoryMatches && searchMatches
    })
  }, [category, materials, search])

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <main>
        <section className="border-b border-slate-200 bg-white px-6 py-16">
          <div className="mx-auto max-w-6xl">
            <p className="text-sm font-bold uppercase tracking-wide text-green-700">Ruang Belajar</p>
            <h1 className="mt-3 max-w-4xl text-4xl font-black tracking-tight sm:text-5xl">Ruang Belajar GreenroomID</h1>
            <p className="mt-5 max-w-3xl text-base leading-8 text-slate-600">
              Panduan praktis tentang penulisan, pemformatan teknis, dokumen akademik, dan pekerjaan digital berdasarkan pengalaman penggunaan nyata.
            </p>
          </div>
        </section>

        <section className="px-6 py-10">
          <div className="mx-auto max-w-6xl">
            <div className="mb-6 grid gap-3 md:grid-cols-[1fr_260px]">
              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-slate-700">Cari materi</span>
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="w-full rounded-md border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-green-700 focus:ring-2 focus:ring-green-100"
                  placeholder="Cari judul atau ringkasan"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-slate-700">Kategori</span>
                <select
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                  className="w-full rounded-md border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-green-700 focus:ring-2 focus:ring-green-100"
                >
                  <option value="">Semua kategori</option>
                  {categories.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
            </div>

            {loading && (
              <div className="grid gap-4 md:grid-cols-2">
                {[0, 1, 2, 3].map((item) => <div key={item} className="h-44 animate-pulse rounded-md bg-white shadow-sm" />)}
              </div>
            )}

            {!loading && error && (
              <div className="rounded-md border border-red-100 bg-red-50 p-5 text-sm text-red-700">{error}</div>
            )}

            {!loading && !error && materials.length === 0 && (
              <div className="rounded-md border border-slate-200 bg-white p-8">
                <h2 className="text-2xl font-bold text-slate-900">Materi belum tersedia</h2>
                <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600">
                  Materi baru sedang disiapkan. Silakan kembali lagi atau lihat layanan GreenroomID yang tersedia.
                </p>
                <div className="mt-5 flex flex-wrap gap-3">
                  <Link to="/layanan" className="rounded-md bg-green-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-green-800">Lihat Layanan</Link>
                  <Link to="/studio-artikel" className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition hover:border-green-700 hover:text-green-800">Buka Studio Artikel</Link>
                </div>
              </div>
            )}

            {!loading && !error && materials.length > 0 && visibleMaterials.length === 0 && (
              <div className="rounded-md border border-slate-200 bg-white p-6 text-sm text-slate-600">Tidak ada materi yang cocok dengan filter saat ini.</div>
            )}

            {!loading && !error && visibleMaterials.length > 0 && (
              <div className="grid gap-4 md:grid-cols-2">
                {visibleMaterials.map((material) => (
                  <article key={material.id} className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
                    <p className="text-xs font-bold uppercase tracking-wide text-green-700">{material.category || 'Materi'}</p>
                    <h2 className="mt-2 text-xl font-bold text-slate-950">
                      <Link to={`/ruang-belajar/${material.slug}`} className="transition hover:text-green-700">{material.title}</Link>
                    </h2>
                    <p className="mt-3 text-sm leading-7 text-slate-600">{material.excerpt || 'Ringkasan materi belum tersedia.'}</p>
                    <div className="mt-5 flex items-center justify-between gap-3 text-sm">
                      <time className="text-slate-500" dateTime={material.published_at || material.updated_at || undefined}>
                        {formatMaterialPublicDate(material.published_at || material.updated_at)}
                      </time>
                      <Link to={`/ruang-belajar/${material.slug}`} className="font-semibold text-green-700 hover:text-green-900">Baca Materi</Link>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="px-6 pb-14">
          <div className="mx-auto max-w-6xl rounded-md border border-green-100 bg-green-50 p-6">
            <h2 className="text-2xl font-bold text-slate-950">Butuh bantuan langsung?</h2>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-700">
              Panduan membantu kebutuhan umum. Untuk dokumen atau format yang lebih kompleks, gunakan layanan GreenroomID.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link to="/layanan" className="rounded-md bg-green-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-green-800">Lihat Layanan</Link>
              <Link to="/kontak" className="rounded-md border border-green-200 bg-white px-4 py-2 text-sm font-semibold text-green-800 transition hover:border-green-700">Hubungi Kami</Link>
            </div>
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  )
}

export default LearningMaterialsHubPage
