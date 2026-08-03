import { Link } from 'react-router-dom'
import PublicFooter from '../components/PublicFooter'
import { CUSTOMER_SURVEY_SUMMARY } from '../data/customerSurveySummary'

function HighlightCard({ item }) {
  return (
    <article className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <p className="text-4xl font-black text-green-700">{item.value}</p>
      <h2 className="mt-4 text-lg font-black text-gray-950">{item.title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-gray-600">{item.description}</p>
    </article>
  )
}

function DetailStat({ item, total }) {
  const percentage = Math.round((item.count / total) * 100)

  return (
    <article className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-black text-gray-950">{item.label}</h2>
          <p className="mt-1 text-sm leading-relaxed text-gray-600">{item.summary}</p>
        </div>
        <p className="shrink-0 text-sm font-black text-green-700">{item.count} dari {total}</p>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-gray-100" aria-hidden="true">
        <div className="h-full rounded-full bg-green-600" style={{ width: `${percentage}%` }} />
      </div>
    </article>
  )
}

function CustomerExperiencePage() {
  const survey = CUSTOMER_SURVEY_SUMMARY

  return (
    <div className="min-h-screen bg-gray-100 text-gray-900">
      <main className="mx-auto max-w-6xl px-6 py-6">
        <header className="mb-8 rounded-3xl bg-white p-8 shadow-sm">
          <Link to="/" className="text-sm font-bold text-green-700 transition hover:text-green-800">
            GreenroomID
          </Link>
          <p className="mt-8 inline-flex rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-700">
            Survei pelanggan nyata
          </p>
          <h1 className="mt-4 max-w-3xl text-4xl font-black leading-tight text-gray-950 md:text-5xl">
            Pengalaman Pelanggan GreenroomID
          </h1>
          <p className="mt-5 max-w-3xl text-base leading-relaxed text-gray-600">
            Ringkasan berdasarkan 6 respons survei pelanggan yang dikumpulkan melalui formulir online GreenroomID pada 23-24 Juli 2026. Hasil ditampilkan secara agregat tanpa mengungkap identitas responden.
          </p>
        </header>

        <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4" aria-label="Ringkasan utama survei">
          {survey.highlights.map((item) => (
            <HighlightCard key={item.title} item={item} />
          ))}
        </section>

        <section className="mt-8 rounded-3xl bg-white p-6 shadow-sm">
          <div className="max-w-3xl">
            <p className="text-sm font-bold uppercase text-green-700">Detail pengalaman</p>
            <h2 className="mt-2 text-2xl font-black text-gray-950">Ringkasan jawaban agregat</h2>
            <p className="mt-3 text-sm leading-relaxed text-gray-600">
              Statistik berikut menampilkan jumlah respons pada indikator pengalaman utama, tanpa menampilkan jawaban per responden.
            </p>
          </div>
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            {survey.details.map((item) => (
              <DetailStat key={item.label} item={item} total={survey.responseCount} />
            ))}
          </div>
        </section>

        <section className="mt-8 grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-3xl bg-white p-6 shadow-sm">
            <p className="text-sm font-bold uppercase text-green-700">Distribusi layanan</p>
            <h2 className="mt-2 text-2xl font-black text-gray-950">Layanan yang digunakan responden</h2>
            <div className="mt-5 space-y-3">
              {survey.serviceDistribution.map((item) => (
                <div key={item.label} className="flex items-center justify-between rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3">
                  <span className="font-bold text-gray-800">{item.label}</span>
                  <span className="text-sm font-black text-green-700">{item.count} respons</span>
                </div>
              ))}
            </div>
            <p className="mt-4 text-sm leading-relaxed text-gray-600">
              Survei ini hanya mencakup dua jenis layanan tersebut dan belum mewakili seluruh kategori layanan GreenroomID.
            </p>
          </div>

          <div className="rounded-3xl bg-white p-6 shadow-sm">
            <p className="text-sm font-bold uppercase text-green-700">Masukan</p>
            <h2 className="mt-2 text-2xl font-black text-gray-950">Hal yang dapat kami tingkatkan</h2>
            <p className="mt-4 text-sm leading-relaxed text-gray-600">
              Masukan spesifik yang muncul adalah meningkatkan kecepatan respons admin. Masukan lain meminta agar kualitas layanan yang sudah ada tetap dipertahankan.
            </p>
          </div>
        </section>

        <section className="mt-8 rounded-3xl bg-white p-6 shadow-sm">
          <p className="text-sm font-bold uppercase text-green-700">Metodologi</p>
          <h2 className="mt-2 text-2xl font-black text-gray-950">Tentang survei ini</h2>
          <div className="mt-4 space-y-3 text-sm leading-relaxed text-gray-600">
            <p>
              Survei dikumpulkan melalui formulir online GreenroomID yang dibagikan kepada pelanggan setelah menggunakan layanan. Halaman ini menggunakan hasil agregat dari 6 respons pada 23-24 Juli 2026. Survei tidak mengumpulkan nama responden pada data yang dipublikasikan.
            </p>
            <p>
              Persentase dibulatkan ke bilangan bulat terdekat. Sampel survei masih terbatas dan hasilnya tidak menjamin bahwa setiap pekerjaan akan memberikan pengalaman yang sama.
            </p>
          </div>
        </section>

        <section className="mt-8 rounded-3xl bg-green-700 p-6 text-white shadow-sm">
          <h2 className="text-2xl font-black">Ingin mencoba layanan GreenroomID?</h2>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <Link to="/layanan" className="rounded-xl bg-white px-5 py-3 text-center text-sm font-black text-green-800 transition hover:bg-green-50">
              Lihat Layanan
            </Link>
            <Link to="/cara-kerja" className="rounded-xl border border-white/40 px-5 py-3 text-center text-sm font-black text-white transition hover:bg-white/10">
              Pelajari Cara Kerja
            </Link>
            <Link to="/kontak" className="rounded-xl border border-white/40 px-5 py-3 text-center text-sm font-black text-white transition hover:bg-white/10">
              Hubungi Kami
            </Link>
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  )
}

export default CustomerExperiencePage
