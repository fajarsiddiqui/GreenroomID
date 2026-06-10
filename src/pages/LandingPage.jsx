import { useEffect, useState } from 'react'
import { supabase } from '../supabase'

function LandingPage() {
    const [stats, setStats] = useState({
  total_views: 0,
  total_requests: 0,
  completed_requests: 0,
  service_categories: 4
})

useEffect(() => {
  const trackAndFetchStats = async () => {
    const isLocalhost =
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1'

    let visitorId = localStorage.getItem('greenroomid_visitor_id')

    if (!visitorId) {
      visitorId = crypto.randomUUID()
      localStorage.setItem('greenroomid_visitor_id', visitorId)
    }

    const alreadyTrackedThisSession = sessionStorage.getItem('greenroomid_landing_tracked')

    if (!isLocalhost && !alreadyTrackedThisSession) {
      await supabase.rpc('track_page_view', {
        p_visitor_id: visitorId,
        p_path: window.location.pathname
      })

      sessionStorage.setItem('greenroomid_landing_tracked', 'true')
    }

    const { data, error } = await supabase.rpc('get_public_stats')

    if (!error && data) {
      setStats({
        total_views: data.total_views || 0,
        total_requests: data.total_requests || 0,
        completed_requests: data.completed_requests || 0,
        service_categories: data.service_categories || 4
      })
    }
  }

  trackAndFetchStats()
}, [])

  const handleGoogleLogin = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin
      }
    })

    if (error) alert('Error: ' + error.message)
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="max-w-6xl mx-auto px-6 py-6">
        <div className="flex items-center justify-between mb-16">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">GreenroomID</h1>
            <p className="text-sm text-gray-500">Platform Freelance Terkelola</p>
          </div>

          <button
            onClick={handleGoogleLogin}
            className="bg-gray-900 text-white px-5 py-2 rounded-xl text-sm hover:bg-gray-800 transition"
          >
            Masuk
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center mb-16">
          <div>
            <p className="inline-block bg-green-100 text-green-700 text-xs font-medium px-3 py-1 rounded-full mb-4">
              Request kerja lebih rapi dan terpantau
            </p>

            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 leading-tight mb-5">
              Kelola request desain, video, penulisan, dan programming dalam satu tempat.
            </h2>

            <p className="text-gray-600 text-lg mb-8 leading-relaxed">
              GreenroomID membantu client mengirim request, melampirkan file,
              berdiskusi dengan admin, melihat invoice, upload bukti pembayaran,
              dan menerima hasil kerja secara lebih terstruktur.
            </p>

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={handleGoogleLogin}
                className="bg-blue-600 text-white px-6 py-3 rounded-xl text-sm font-medium hover:bg-blue-700 transition"
              >
                Mulai Request Sekarang
              </button>

              <a
                href="#alur"
                className="bg-white text-gray-700 border border-gray-200 px-6 py-3 rounded-xl text-sm font-medium hover:bg-gray-50 transition text-center"
              >
                Lihat Cara Kerja
              </a>
            </div>
          </div>

          <div className="bg-white rounded-3xl shadow-sm p-6">
            <div className="bg-gray-50 rounded-2xl p-5 mb-4">
              <div className="flex items-center justify-between mb-3">
                <p className="font-bold text-gray-800">Request Saya</p>
                <span className="text-xs bg-yellow-100 text-yellow-700 px-3 py-1 rounded-full">
                  PENDING
                </span>
              </div>
              <p className="text-sm text-gray-500 mb-3">
                Desain logo, edit video, revisi dokumen, atau kebutuhan digital lainnya.
              </p>
              <div className="flex gap-2 text-xs text-gray-400">
                <span>Kategori: Desain</span>
                <span>File: 3 lampiran</span>
              </div>
            </div>

            <div className="bg-blue-50 rounded-2xl p-5 mb-4">
              <p className="font-bold text-blue-800 mb-2">Diskusi Admin</p>
              <p className="text-sm text-blue-700">
                Semua komunikasi terkait request tersimpan dalam satu halaman detail.
              </p>
            </div>

            <div className="bg-green-50 rounded-2xl p-5">
              <p className="font-bold text-green-800 mb-2">File Hasil</p>
              <p className="text-sm text-green-700">
                Client dapat mengunduh hasil setelah proses pembayaran dan verifikasi selesai.
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-16">
        <div className="bg-white rounded-2xl p-5 shadow-sm">
            <p className="text-3xl font-bold text-gray-900 mb-1">
            {stats.total_views}
            </p>
            <p className="text-sm text-gray-500">Total Kunjungan</p>
        </div>

        <div className="bg-white rounded-2xl p-5 shadow-sm">
            <p className="text-3xl font-bold text-gray-900 mb-1">
            {stats.total_requests}
            </p>
            <p className="text-sm text-gray-500">Total Request</p>
        </div>

        <div className="bg-white rounded-2xl p-5 shadow-sm">
            <p className="text-3xl font-bold text-gray-900 mb-1">
            {stats.completed_requests}
            </p>
            <p className="text-sm text-gray-500">Request Selesai</p>
        </div>

        <div className="bg-white rounded-2xl p-5 shadow-sm">
            <p className="text-3xl font-bold text-gray-900 mb-1">
            {stats.service_categories}
            </p>
            <p className="text-sm text-gray-500">Kategori Layanan</p>
        </div>
        </div>

        <div id="alur" className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-16">
          <div className="bg-white rounded-2xl p-5 shadow-sm">
            <p className="text-2xl mb-3">1</p>
            <h3 className="font-bold text-gray-800 mb-2">Submit Request</h3>
            <p className="text-sm text-gray-500">
              Client mengisi judul, kategori, deskripsi, dan file pendukung jika diperlukan.
            </p>
          </div>

          <div className="bg-white rounded-2xl p-5 shadow-sm">
            <p className="text-2xl mb-3">2</p>
            <h3 className="font-bold text-gray-800 mb-2">Admin Review</h3>
            <p className="text-sm text-gray-500">
              Admin mengecek request, menentukan harga, deadline, dan status pengerjaan.
            </p>
          </div>

          <div className="bg-white rounded-2xl p-5 shadow-sm">
            <p className="text-2xl mb-3">3</p>
            <h3 className="font-bold text-gray-800 mb-2">Pembayaran</h3>
            <p className="text-sm text-gray-500">
              Client menerima invoice dan mengupload bukti pembayaran untuk diverifikasi.
            </p>
          </div>

          <div className="bg-white rounded-2xl p-5 shadow-sm">
            <p className="text-2xl mb-3">4</p>
            <h3 className="font-bold text-gray-800 mb-2">Terima Hasil</h3>
            <p className="text-sm text-gray-500">
              Setelah pembayaran valid, file hasil dapat diakses oleh client.
            </p>
          </div>
        </div>

        <div className="bg-gray-900 rounded-3xl p-8 text-center">
          <h2 className="text-2xl font-bold text-white mb-3">
            Siap membuat request pertama?
          </h2>
          <p className="text-gray-300 mb-6">
            Masuk dengan akun Google untuk mulai menggunakan GreenroomID.
          </p>
          <button
            onClick={handleGoogleLogin}
            className="bg-white text-gray-900 px-6 py-3 rounded-xl text-sm font-medium hover:bg-gray-100 transition"
          >
            Masuk dengan Google
          </button>
        </div>

        <div className="py-8 text-center text-xs text-gray-400">
          © {new Date().getFullYear()} GreenroomID. Platform Freelance Terkelola.
        </div>
      </div>
    </div>
  )
}

export default LandingPage