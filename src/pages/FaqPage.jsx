import { Link } from 'react-router-dom'
import PublicFooter from '../components/PublicFooter'

const faqItems = [
  {
    question: 'Bagaimana cara mengajukan request?',
    answer: 'Pilih kategori dan layanan yang dibutuhkan, buka halaman detail layanan, lalu tekan Ajukan Request. Anda akan diminta masuk dengan Google sebelum melengkapi kebutuhan request.'
  },
  {
    question: 'Apakah harga yang tampil merupakan harga final?',
    answer: 'Tidak. Harga pada halaman layanan merupakan estimasi awal. Admin akan meninjau detail kebutuhan sebelum menentukan dan mengonfirmasi harga final.'
  },
  {
    question: 'Kapan invoice dibuat?',
    answer: 'Invoice dibuat setelah admin mereview request dan menetapkan harga final berdasarkan kebutuhan yang dikirim.'
  },
  {
    question: 'Apakah estimasi waktu selalu sama?',
    answer: 'Tidak selalu. Estimasi waktu merupakan gambaran awal dan dapat disesuaikan setelah admin memeriksa detail serta kompleksitas kebutuhan.'
  },
  {
    question: 'Apa yang terjadi setelah request dikirim?',
    answer: 'Request akan masuk ke proses review admin. Informasi harga final, invoice, status pengerjaan, dan file hasil dikelola melalui alur request GreenroomID.'
  },
  {
    question: 'Apakah tools gratis memerlukan login?',
    answer: 'Tools pada halaman Layanan Gratis dapat dibuka dan digunakan langsung melalui browser tanpa mengajukan request layanan.'
  },
  {
    question: 'Apakah donasi dapat dibuat anonim?',
    answer: 'Ya. Pada halaman donasi tersedia pilihan untuk menampilkan nama secara publik atau menjadi donatur anonim.'
  }
]

function FaqPage() {
  return (
    <div className="min-h-screen bg-gray-100">
      <main className="mx-auto max-w-5xl px-6 py-6">
        <div className="mb-10 flex items-center justify-between">
          <div>
            <p className="text-2xl font-bold text-gray-900">GreenroomID</p>
            <p className="text-sm text-gray-500">FAQ Layanan</p>
          </div>

          <div className="flex gap-3">
            <Link to="/" className="rounded-xl border border-gray-200 bg-white px-5 py-2 text-sm text-gray-700 transition hover:bg-gray-50">
              Beranda
            </Link>
            <Link to="/layanan" className="rounded-xl bg-gray-900 px-5 py-2 text-sm text-white transition hover:bg-gray-800">
              Layanan
            </Link>
          </div>
        </div>

        <section className="mb-6 rounded-3xl bg-white p-8 shadow-sm">
          <p className="mb-4 inline-block rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">
            Bantuan awal
          </p>
          <h1 className="mb-4 text-4xl font-bold text-gray-900">
            Pertanyaan yang Sering Diajukan
          </h1>
          <p className="max-w-3xl leading-relaxed text-gray-600">
            Temukan jawaban singkat tentang cara mengajukan request, estimasi harga dan waktu, proses review, invoice, tools gratis, dan donasi GreenroomID.
          </p>
        </section>

        <section className="mb-8 space-y-4">
          {faqItems.map((item) => (
            <article key={item.question} className="rounded-2xl bg-white p-6 shadow-sm">
              <h2 className="text-lg font-black text-gray-900">{item.question}</h2>
              <p className="mt-3 text-sm leading-relaxed text-gray-600">{item.answer}</p>
            </article>
          ))}
        </section>

        <section className="mb-8 rounded-3xl bg-gray-900 p-8 text-center">
          <h2 className="mb-3 text-2xl font-bold text-white">Lihat alur dan layanan</h2>
          <p className="mx-auto mb-6 max-w-2xl text-sm leading-relaxed text-gray-300">
            Gunakan halaman cara kerja untuk memahami proses request, atau buka daftar layanan untuk melihat estimasi awal.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link to="/cara-kerja" className="rounded-xl bg-white px-5 py-3 text-sm font-bold text-gray-900 transition hover:bg-gray-100">
              Pelajari Cara Kerja
            </Link>
            <Link to="/layanan" className="rounded-xl bg-gray-800 px-5 py-3 text-sm font-bold text-white transition hover:bg-gray-700">
              Lihat Layanan
            </Link>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  )
}

export default FaqPage
