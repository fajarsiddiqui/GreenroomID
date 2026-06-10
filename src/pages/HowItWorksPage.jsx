import { supabase } from '../supabase'

function HowItWorksPage({ onBack }) {
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
      <div className="max-w-5xl mx-auto px-6 py-6">
        <div className="flex items-center justify-between mb-10">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">GreenroomID</h1>
            <p className="text-sm text-gray-500">Cara Kerja Platform</p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={onBack}
              className="bg-white text-gray-700 border border-gray-200 px-5 py-2 rounded-xl text-sm hover:bg-gray-50 transition"
            >
              Kembali
            </button>

            <button
              onClick={handleGoogleLogin}
              className="bg-gray-900 text-white px-5 py-2 rounded-xl text-sm hover:bg-gray-800 transition"
            >
              Masuk
            </button>
          </div>
        </div>

        <div className="bg-white rounded-3xl shadow-sm p-8 mb-6">
          <p className="inline-block bg-blue-100 text-blue-700 text-xs font-medium px-3 py-1 rounded-full mb-4">
            Alur kerja GreenroomID
          </p>

          <h2 className="text-4xl font-bold text-gray-900 mb-4">
            Cara kerja request di GreenroomID
          </h2>

          <p className="text-gray-600 leading-relaxed max-w-3xl">
            GreenroomID dibuat agar proses request pekerjaan digital lebih rapi.
            Client tidak perlu mengirim instruksi, file, bukti pembayaran, dan hasil kerja
            secara terpisah di banyak tempat. Semua proses dikumpulkan dalam satu halaman request.
          </p>
        </div>

        <div className="space-y-4 mb-8">
          <div className="bg-white rounded-2xl shadow-sm p-6">
            <div className="flex gap-4">
              <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold">
                1
              </div>
              <div>
                <h3 className="font-bold text-gray-900 mb-2">Client membuat request</h3>
                <p className="text-sm text-gray-600 leading-relaxed">
                  Client login menggunakan akun Google, lalu membuat request dengan mengisi
                  judul, kategori, deskripsi kebutuhan, serta file pendukung jika diperlukan.
                  File bersifat opsional dan bisa lebih dari satu, dengan batas maksimal 5 MB
                  per file untuk menjaga sistem tetap ringan.
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm p-6">
            <div className="flex gap-4">
              <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold">
                2
              </div>
              <div>
                <h3 className="font-bold text-gray-900 mb-2">Admin melakukan review</h3>
                <p className="text-sm text-gray-600 leading-relaxed">
                  Admin melihat detail request, membaca deskripsi, mengecek file client,
                  lalu menentukan harga, deadline pengerjaan, dan status request.
                  Pada tahap ini request dapat dibuka untuk dikerjakan atau didiskusikan
                  lebih lanjut dengan client.
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm p-6">
            <div className="flex gap-4">
              <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold">
                3
              </div>
              <div>
                <h3 className="font-bold text-gray-900 mb-2">Diskusi berlangsung di halaman request</h3>
                <p className="text-sm text-gray-600 leading-relaxed">
                  Client dan admin dapat berdiskusi langsung di halaman detail request.
                  Dengan cara ini, instruksi dan catatan pekerjaan tersimpan lebih rapi
                  serta tidak tercecer di chat pribadi atau aplikasi lain.
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm p-6">
            <div className="flex gap-4">
              <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold">
                4
              </div>
              <div>
                <h3 className="font-bold text-gray-900 mb-2">Invoice dan pembayaran</h3>
                <p className="text-sm text-gray-600 leading-relaxed">
                  Setelah harga ditentukan, client dapat melihat invoice di halaman request.
                  Client kemudian mengupload bukti pembayaran. Admin akan memverifikasi
                  pembayaran secara manual sebelum file hasil dapat dikirimkan.
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm p-6">
            <div className="flex gap-4">
              <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold">
                5
              </div>
              <div>
                <h3 className="font-bold text-gray-900 mb-2">File hasil dikirim ke client</h3>
                <p className="text-sm text-gray-600 leading-relaxed">
                  Setelah pembayaran terverifikasi, admin mengupload file hasil.
                  Client dapat mengunduh file tersebut langsung dari halaman detail request.
                  Status request akan berubah sesuai proses yang sedang berjalan.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-gray-900 rounded-3xl p-8 text-center">
          <h2 className="text-2xl font-bold text-white mb-3">
            Mulai gunakan GreenroomID
          </h2>
          <p className="text-gray-300 mb-6">
            Masuk dengan akun Google untuk membuat request pertama.
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

export default HowItWorksPage