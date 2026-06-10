import { Link } from 'react-router-dom'
import { supabase } from '../supabase'

function ServiceCategoriesPage() {
  const handleGoogleLogin = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin
      }
    })

    if (error) alert('Error: ' + error.message)
  }

  const services = [
    {
      title: 'Desain',
      description:
        'Layanan untuk kebutuhan visual seperti desain logo, poster, banner, feed media sosial, presentasi, katalog produk, dan kebutuhan desain digital lainnya.',
      examples: ['Logo', 'Poster', 'Banner', 'Feed Instagram', 'Katalog Produk']
    },
    {
      title: 'Video',
      description:
        'Layanan untuk kebutuhan editing video sederhana hingga konten promosi, seperti video pendek, reels, TikTok, dokumentasi acara, dan video presentasi.',
      examples: ['Edit Video', 'Reels', 'TikTok', 'Video Promosi', 'Video Presentasi']
    },
    {
      title: 'Penulisan',
      description:
        'Layanan untuk kebutuhan teks dan dokumen, seperti artikel, caption, copywriting, laporan, proposal, parafrase, dan penyusunan dokumen akademik atau bisnis.',
      examples: ['Artikel', 'Caption', 'Copywriting', 'Proposal', 'Parafrase']
    },
    {
      title: 'Programming',
      description:
        'Layanan untuk kebutuhan teknis digital, seperti pembuatan website sederhana, perbaikan bug, landing page, integrasi database, dan pengembangan fitur aplikasi.',
      examples: ['Website', 'Landing Page', 'Bug Fixing', 'Database', 'Fitur Aplikasi']
    }
  ]

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="max-w-6xl mx-auto px-6 py-6">
        <div className="flex items-center justify-between mb-10">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">GreenroomID</h1>
            <p className="text-sm text-gray-500">Kategori Layanan</p>
          </div>

          <div className="flex gap-3">
            <Link
              to="/"
              className="bg-white text-gray-700 border border-gray-200 px-5 py-2 rounded-xl text-sm hover:bg-gray-50 transition"
            >
              Kembali
            </Link>

            <button
              onClick={handleGoogleLogin}
              className="bg-gray-900 text-white px-5 py-2 rounded-xl text-sm hover:bg-gray-800 transition"
            >
              Masuk
            </button>
          </div>
        </div>

        <div className="bg-white rounded-3xl shadow-sm p-8 mb-6">
          <p className="inline-block bg-green-100 text-green-700 text-xs font-medium px-3 py-1 rounded-full mb-4">
            4 kategori utama
          </p>

          <h2 className="text-4xl font-bold text-gray-900 mb-4">
            Layanan yang tersedia di GreenroomID
          </h2>

          <p className="text-gray-600 leading-relaxed max-w-3xl">
            GreenroomID menyediakan beberapa kategori layanan digital yang dapat
            diajukan melalui sistem request. Client dapat memilih kategori yang
            paling sesuai, menjelaskan kebutuhan, melampirkan file pendukung,
            lalu menunggu review dari admin.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-8">
          {services.map((service) => (
            <div key={service.title} className="bg-white rounded-3xl shadow-sm p-6">
              <h3 className="text-2xl font-bold text-gray-900 mb-3">
                {service.title}
              </h3>

              <p className="text-sm text-gray-600 leading-relaxed mb-5">
                {service.description}
              </p>

              <div className="flex flex-wrap gap-2">
                {service.examples.map((item) => (
                  <span
                    key={item}
                    className="bg-gray-100 text-gray-600 text-xs px-3 py-1 rounded-full"
                  >
                    {item}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="bg-gray-900 rounded-3xl p-8 text-center">
          <h2 className="text-2xl font-bold text-white mb-3">
            Ingin membuat request?
          </h2>
          <p className="text-gray-300 mb-6">
            Pilih kategori yang sesuai, lalu masuk dengan akun Google untuk mulai membuat request.
          </p>
          <button
            onClick={handleGoogleLogin}
            className="bg-white text-gray-900 px-6 py-3 rounded-xl text-sm font-medium hover:bg-gray-100 transition"
          >
            Mulai Request Sekarang
          </button>
        </div>

        <div className="py-8 text-center text-xs text-gray-400">
          © {new Date().getFullYear()} GreenroomID. Platform Freelance Terkelola.
        </div>
      </div>
    </div>
  )
}

export default ServiceCategoriesPage