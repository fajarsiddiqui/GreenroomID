import { Link } from 'react-router-dom'
import PublicFooter from '../components/PublicFooter'

const contactReasons = [
  'pertanyaan layanan',
  'file lebih dari 5 MB',
  'kendala request',
  'permintaan penghapusan data atau file digital'
]

function ContactPage() {
  return (
    <div className="min-h-screen bg-gray-100">
      <main className="mx-auto max-w-5xl px-6 py-6">
        <div className="mb-10 flex items-center justify-between gap-4">
          <div>
            <p className="text-2xl font-bold text-gray-900">GreenroomID</p>
            <p className="text-sm text-gray-500">Kontak resmi</p>
          </div>
          <Link to="/" className="rounded-xl border border-gray-200 bg-white px-5 py-2 text-sm text-gray-700 transition hover:bg-gray-50">
            Beranda
          </Link>
        </div>

        <section className="mb-6 rounded-3xl bg-white p-8 shadow-sm">
          <p className="mb-4 inline-block rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">
            Bantuan dan informasi
          </p>
          <h1 className="mb-4 text-4xl font-bold text-gray-900">Hubungi GreenroomID</h1>
          <p className="max-w-3xl leading-relaxed text-gray-600">
            Hubungi admin GreenroomID untuk pertanyaan layanan, kendala request, pengiriman file besar, atau permintaan terkait data dan file digital.
          </p>
        </section>

        <section className="mb-8 grid gap-4 md:grid-cols-2">
          <article className="rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="text-lg font-black text-gray-900">Email</h2>
            <a href="mailto:fajarsiddiqui00@gmail.com" className="mt-3 inline-block text-sm font-bold text-green-700 hover:underline">
              fajarsiddiqui00@gmail.com
            </a>
          </article>

          <article className="rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="text-lg font-black text-gray-900">WhatsApp</h2>
            <a href="https://wa.me/62882006446617" target="_blank" rel="noopener noreferrer" className="mt-3 inline-block text-sm font-bold text-green-700 hover:underline">
              +62 882-0064-46617
            </a>
          </article>

          <article className="rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="text-lg font-black text-gray-900">Jam layanan</h2>
            <p className="mt-3 text-sm text-gray-600">07.00–23.00 WIB</p>
          </article>

          <article className="rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="text-lg font-black text-gray-900">Lokasi umum</h2>
            <p className="mt-3 text-sm text-gray-600">Kec. Bumiayu, Kab. Brebes, Jawa Tengah, Indonesia</p>
          </article>
        </section>

        <section className="mb-8 rounded-3xl bg-white p-8 shadow-sm">
          <h2 className="text-2xl font-bold text-gray-900">Hal yang dapat dibantu</h2>
          <ul className="mt-4 grid gap-3 text-sm text-gray-600 md:grid-cols-2">
            {contactReasons.map((reason) => (
              <li key={reason} className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                {reason}
              </li>
            ))}
          </ul>
          <p className="mt-5 text-sm leading-relaxed text-gray-600">
            Jika file kebutuhan melebihi batas unggahan langsung 5 MB, hubungi admin untuk menyepakati metode pengiriman file.
          </p>
        </section>

        <section className="mb-8 flex flex-wrap gap-3 rounded-3xl bg-gray-900 p-6">
          <Link to="/faq" className="rounded-xl bg-white px-5 py-3 text-sm font-bold text-gray-900 transition hover:bg-gray-100">
            FAQ
          </Link>
          <Link to="/cara-kerja" className="rounded-xl border border-white/20 px-5 py-3 text-sm font-bold text-white transition hover:bg-white/10">
            Cara Kerja
          </Link>
        </section>
      </main>
      <PublicFooter />
    </div>
  )
}

export default ContactPage
