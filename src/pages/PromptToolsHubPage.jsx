import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import PublicFooter from '../components/PublicFooter'
import { supabase } from '../supabase'
import { applyPageHeadMeta } from '../utils/headMeta'
import { applyPageSchema } from '../utils/pageMeta'

function PromptToolsHubPage() {
  const [tools, setTools] = useState([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    const pageTitle = 'AI Tools | GreenroomID'
    const pageDescription =
      'Gunakan AI Tools GreenroomID untuk mengisi formulir terstruktur dan menghasilkan prompt siap pakai langsung dari browser.'
    const canonicalUrl = 'https://www.greenroomid.com/ai-tools'

    const cleanupMeta = applyPageHeadMeta({
      title: pageTitle,
      description: pageDescription,
      canonicalUrl,
      robots: 'index, follow',
      ogTitle: pageTitle,
      ogDescription:
        'Kumpulan AI Tools GreenroomID untuk membantu menghasilkan prompt siap pakai melalui formulir terstruktur.',
      ogUrl: canonicalUrl,
      ogType: 'website',
      twitterTitle: pageTitle,
      twitterDescription:
        'Kumpulan AI Tools GreenroomID untuk membantu menghasilkan prompt siap pakai melalui formulir terstruktur.',
    })

    const cleanupSchema = applyPageSchema({
      id: 'greenroomid-ai-tools-schema',
      data: {
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@id': `${canonicalUrl}#webpage`,
            '@type': 'CollectionPage',
            name: 'AI Tools',
            description: pageDescription,
            url: canonicalUrl,
            isPartOf: {
              '@id': 'https://www.greenroomid.com/#website',
            },
            publisher: {
              '@id': 'https://www.greenroomid.com/#organization',
            },
          },
          {
            '@id': `${canonicalUrl}#breadcrumb`,
            '@type': 'BreadcrumbList',
            itemListElement: [
              {
                '@type': 'ListItem',
                position: 1,
                name: 'Beranda',
                item: 'https://www.greenroomid.com',
              },
              {
                '@type': 'ListItem',
                position: 2,
                name: 'AI Tools',
                item: canonicalUrl,
              },
            ],
          },
        ],
      },
    })

    return () => {
      cleanupSchema()
      cleanupMeta()
    }
  }, [])

  useEffect(() => {
    let active = true

    const fetchTools = async () => {
      setLoading(true)
      setErrorMessage('')

      const { data, error } = await supabase
        .from('prompt_tools')
        .select(`
          id,
          title,
          slug,
          description,
          category,
          submit_button_label,
          updated_at,
          published_at
        `)
        .eq('status', 'published')
        .order('published_at', {
          ascending: false,
          nullsFirst: false,
        })
        .order('title', {
          ascending: true,
        })

      if (!active) return

      if (error) {
        setTools([])
        setErrorMessage(
          'AI Tools belum dapat dimuat. Silakan coba lagi.',
        )
      } else {
        setTools(data || [])
      }

      setLoading(false)
    }

    fetchTools()

    return () => {
      active = false
    }
  }, [])

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <main>
        <section className="border-b border-slate-200 bg-white px-5 py-14 sm:px-6 sm:py-16">
          <div className="mx-auto max-w-6xl">
            <Link
              to="/"
              className="text-sm font-semibold text-green-700 transition hover:text-green-900 hover:underline"
            >
              ← Kembali ke Beranda
            </Link>

            <p className="mt-8 text-sm font-bold uppercase tracking-wide text-green-700">
              AI Tools
            </p>

            <h1 className="mt-3 max-w-4xl text-4xl font-black tracking-tight sm:text-5xl">
              AI Tools untuk membantu pekerjaan Anda
            </h1>

            <p className="mt-5 max-w-3xl text-base leading-8 text-slate-600">
              Isi formulir terstruktur dan dapatkan prompt siap pakai.
              Seluruh jawaban hanya diproses sementara di browser dan tidak
              disimpan oleh GreenroomID.
            </p>
          </div>
        </section>

        <section className="px-5 py-10 sm:px-6">
          <div className="mx-auto max-w-6xl">
            {loading && (
              <div
                className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
                role="status"
                aria-live="polite"
                aria-label="Memuat AI Tools"
              >
                {[0, 1, 2].map((item) => (
                  <div
                    key={item}
                    className="h-64 animate-pulse rounded-3xl border border-slate-200 bg-white shadow-sm"
                  />
                ))}
              </div>
            )}

            {!loading && errorMessage && (
              <div
                className="rounded-2xl border border-red-100 bg-red-50 p-5 text-sm leading-7 text-red-700"
                role="alert"
              >
                {errorMessage}
              </div>
            )}

            {!loading && !errorMessage && tools.length === 0 && (
              <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
                <h2 className="text-2xl font-bold text-slate-900">
                  Belum ada AI Tools yang tersedia.
                </h2>

                <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600">
                  Tool baru sedang disiapkan. Silakan kembali lagi untuk
                  melihat pembaruan berikutnya.
                </p>
              </div>
            )}

            {!loading && !errorMessage && tools.length > 0 && (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {tools.map((tool) => (
                  <article
                    key={tool.id}
                    className="flex min-h-64 flex-col justify-between rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-green-200 hover:shadow-md"
                  >
                    <div>
                      <span className="inline-flex max-w-full rounded-full border border-green-100 bg-green-50 px-3 py-1 text-xs font-bold text-green-700">
                        {tool.category || 'Umum'}
                      </span>

                      <h2 className="mt-4 wrap-break-word text-xl font-black text-slate-950">
                        {tool.title}
                      </h2>

                      <p className="mt-3 wrap-break-word text-sm leading-7 text-slate-600">
                        {tool.description ||
                          'AI Tool yang dapat digunakan langsung dari browser.'}
                      </p>
                    </div>

                    <div className="mt-6">
                      <Link
                        to={`/ai-tools/${tool.slug}`}
                        className="inline-flex min-h-11 items-center justify-center rounded-xl bg-green-700 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-green-800 focus:outline-none focus:ring-2 focus:ring-green-300 focus:ring-offset-2"
                      >
                        Buka Tool
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  )
}

export default PromptToolsHubPage