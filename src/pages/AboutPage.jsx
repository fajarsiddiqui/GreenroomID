import { Link } from 'react-router-dom'
import PublicFooter from '../components/PublicFooter'

const focusItems = [
  'dokumen digital',
  'presentasi',
  'pengolahan data',
  'kebutuhan akademik dan administrasi'
]

const processItems = [
  'Pengguna memilih layanan yang sesuai.',
  'Pengguna mengirim detail request.',
  'Admin melakukan review kebutuhan.',
  'Harga final dikonfirmasi setelah review.',
  'Pekerjaan dan file hasil dikelola melalui request.'
]

function AboutPage() {
  return (
    <div className="min-h-screen bg-gray-100">
      <main className="mx-auto max-w-5xl px-6 py-6">
        <div className="mb-10 flex items-center justify-between gap-4">
          <div>
            <p className="text-2xl font-bold text-gray-900">GreenroomID</p>
            <p className="text-sm text-gray-500">Tentang platform</p>
          </div>
          <Link to="/" className="rounded-xl border border-gray-200 bg-white px-5 py-2 text-sm text-gray-700 transition hover:bg-gray-50">
            Beranda
          </Link>
        </div>

        <section className="mb-6 rounded-3xl bg-white p-8 shadow-sm">
          <p className="mb-4 inline-block rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">
            Informasi resmi
          </p>
          <h1 className="mb-4 text-4xl font-bold text-gray-900">Tentang GreenroomID</h1>
          <p className="max-w-3xl leading-relaxed text-gray-600">
            GreenroomID adalah platform bantuan digital untuk mahasiswa dan guru, dengan fokus pada penyusunan, perapian, dan pengolahan dokumen digital, presentasi, data, serta kebutuhan akademik dan administrasi.
          </p>
        </section>

        <section className="mb-8 grid gap-4 md:grid-cols-2">
          <article className="rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="text-lg font-black text-gray-900">Pengguna utama</h2>
            <p className="mt-3 text-sm leading-relaxed text-gray-600">
              GreenroomID dibuat untuk membantu mahasiswa dan guru mengelola kebutuhan digital yang berkaitan dengan tugas, dokumen, data, presentasi, dan administrasi.
            </p>
          </article>

          <article className="rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="text-lg font-black text-gray-900">Fokus layanan</h2>
            <ul className="mt-3 space-y-2 text-sm text-gray-600">
              {focusItems.map((item) => (
                <li key={item}>- {item}</li>
              ))}
            </ul>
          </article>
        </section>

        <section className="mb-8 rounded-3xl bg-white p-8 shadow-sm">
          <h2 className="text-2xl font-bold text-gray-900">Cara kerja singkat</h2>
          <div className="mt-5 grid gap-3 md:grid-cols-5">
            {processItems.map((item, index) => (
              <div key={item} className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                <p className="text-xs font-bold text-green-700">Langkah {index + 1}</p>
                <p className="mt-2 text-sm leading-relaxed text-gray-700">{item}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-8 rounded-3xl bg-gray-900 p-8 text-white">
          <h2 className="text-2xl font-bold">Identitas pengelola</h2>
          <div className="mt-5 grid gap-4 text-sm md:grid-cols-3">
            <div>
              <p className="text-gray-400">Pengelola</p>
              <p className="mt-1 font-bold">Fajar Sidiq, S.Pd.I</p>
            </div>
            <div>
              <p className="text-gray-400">Status</p>
              <p className="mt-1 font-bold">Usaha perorangan yang saat ini belum berbadan usaha</p>
            </div>
            <div>
              <p className="text-gray-400">Wilayah</p>
              <p className="mt-1 font-bold">Kec. Bumiayu, Kab. Brebes, Jawa Tengah, Indonesia</p>
            </div>
          </div>
        </section>

        <section className="mb-8 flex flex-wrap gap-3 rounded-3xl bg-white p-6 shadow-sm">
          <Link to="/layanan" className="rounded-xl bg-gray-900 px-5 py-3 text-sm font-bold text-white transition hover:bg-gray-800">
            Lihat Layanan
          </Link>
          <Link to="/cara-kerja" className="rounded-xl border border-gray-200 px-5 py-3 text-sm font-bold text-gray-700 transition hover:bg-gray-50">
            Cara Kerja
          </Link>
          <Link to="/kontak" className="rounded-xl border border-green-200 bg-green-50 px-5 py-3 text-sm font-bold text-green-700 transition hover:bg-green-100">
            Kontak
          </Link>
        </section>
      </main>
      <PublicFooter />
    </div>
  )
}

export default AboutPage
