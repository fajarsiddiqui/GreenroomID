import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import MarkdownContent from '../components/MarkdownContent'
import PublicFooter from '../components/PublicFooter'
import { supabase } from '../supabase'
import { formatMaterialPublicDate, isValidMaterialSlug } from '../utils/learningMaterials'
import { applyLearningMaterialNotFoundMeta, applyLearningMaterialPageMeta } from '../utils/pageMeta'
import NotFoundPage from './NotFoundPage'

function LearningMaterialDetailPage() {
  const { slug } = useParams()
  const [material, setMaterial] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    let active = true
    let cleanupMeta = () => {}

    const fetchMaterial = async () => {
      setLoading(true)
      setNotFound(false)
      setMaterial(null)

      if (!isValidMaterialSlug(slug)) {
        cleanupMeta = applyLearningMaterialNotFoundMeta({ slug })
        if (active) {
          setNotFound(true)
          setLoading(false)
        }
        return
      }

      const { data, error } = await supabase
        .from('learning_materials')
        .select('id, title, slug, excerpt, content_markdown, category, meta_title, meta_description, published_at, updated_at')
        .eq('slug', slug)
        .eq('status', 'published')
        .maybeSingle()

      if (!active) return

      if (error || !data) {
        cleanupMeta = applyLearningMaterialNotFoundMeta({ slug })
        setNotFound(true)
        setLoading(false)
        return
      }

      cleanupMeta = applyLearningMaterialPageMeta(data)
      setMaterial(data)
      setLoading(false)
    }

    fetchMaterial()

    return () => {
      active = false
      cleanupMeta()
    }
  }, [slug])

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 px-6 py-16">
        <div className="mx-auto max-w-3xl space-y-5">
          <div className="h-4 w-48 animate-pulse rounded bg-slate-200" />
          <div className="h-10 w-4/5 animate-pulse rounded bg-slate-200" />
          <div className="h-5 w-2/3 animate-pulse rounded bg-slate-200" />
          <div className="space-y-3 pt-8">
            {[0, 1, 2, 3].map((item) => <div key={item} className="h-4 animate-pulse rounded bg-slate-200" />)}
          </div>
        </div>
      </div>
    )
  }

  if (notFound || !material) return <NotFoundPage />

  const publishedDate = formatMaterialPublicDate(material.published_at)
  const updatedDate = formatMaterialPublicDate(material.updated_at)
  const showUpdatedDate = material.updated_at && material.updated_at !== material.published_at

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <main>
        <article className="mx-auto max-w-3xl px-6 py-12">
          <nav className="mb-8 flex flex-wrap items-center gap-2 text-sm text-slate-500" aria-label="Breadcrumb">
            <Link to="/" className="hover:text-green-700">Beranda</Link>
            <span>/</span>
            <Link to="/ruang-belajar" className="hover:text-green-700">Ruang Belajar</Link>
            <span>/</span>
            <span className="text-slate-700">{material.title}</span>
          </nav>

          <header className="border-b border-slate-200 pb-8">
            <p className="text-sm font-bold uppercase tracking-wide text-green-700">{material.category || 'Materi'}</p>
            <h1 className="mt-3 text-4xl font-black tracking-tight text-slate-950 sm:text-5xl">{material.title}</h1>
            {material.excerpt && <p className="mt-5 text-lg leading-8 text-slate-600">{material.excerpt}</p>}
            <div className="mt-5 flex flex-wrap gap-3 text-sm text-slate-500">
              {publishedDate !== '-' && <time dateTime={material.published_at}>Dipublikasikan {publishedDate}</time>}
              {showUpdatedDate && updatedDate !== '-' && <time dateTime={material.updated_at}>Diperbarui {updatedDate}</time>}
            </div>
          </header>

          <div className="py-9">
            <MarkdownContent markdown={material.content_markdown || ''} />
          </div>

          <footer className="rounded-md border border-green-100 bg-green-50 p-6">
            <h2 className="text-2xl font-bold text-slate-950">Masih membutuhkan bantuan?</h2>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link to="/layanan" className="rounded-md bg-green-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-green-800">Lihat Layanan</Link>
              <Link to="/kontak" className="rounded-md border border-green-200 bg-white px-4 py-2 text-sm font-semibold text-green-800 transition hover:border-green-700">Hubungi Kami</Link>
              <Link to="/ruang-belajar" className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition hover:border-green-700 hover:text-green-800">Materi Lainnya</Link>
            </div>
          </footer>
        </article>
      </main>
      <PublicFooter />
    </div>
  )
}

export default LearningMaterialDetailPage
