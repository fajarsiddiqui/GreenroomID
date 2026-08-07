import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { applyPageHeadMeta } from '../utils/headMeta'
import { suppressPageSchemas } from '../utils/pageMeta'

function NotFoundPage() {
  useEffect(() => {
    const cleanupHeadMeta = applyPageHeadMeta({
      title: 'Halaman Tidak Ditemukan | GreenroomID',
      robots: 'noindex, nofollow',
      ogTitle: 'Halaman Tidak Ditemukan | GreenroomID',
      twitterTitle: 'Halaman Tidak Ditemukan | GreenroomID',
      suppressCanonical: true,
      suppressOgUrl: true
    })

    const cleanupSchemas = suppressPageSchemas()

    return () => {
      cleanupSchemas()
      cleanupHeadMeta()
    }
  }, [])

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-16 text-slate-900">
      <div className="mx-auto flex max-w-3xl flex-col items-start gap-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">404</p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Halaman tidak ditemukan</h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">
            URL yang dibuka tidak tersedia. Anda bisa kembali ke beranda atau melihat daftar layanan GreenroomID.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-800"
          >
            Ke Beranda
          </Link>
          <Link
            to="/layanan"
            className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition hover:border-emerald-700 hover:text-emerald-800"
          >
            Lihat Layanan
          </Link>
        </div>
      </div>
    </main>
  )
}

export default NotFoundPage
