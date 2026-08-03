import { Link } from 'react-router-dom'
import PublicFooter from '../components/PublicFooter'

const updatedAt = '3 Agustus 2026'

function Section({ title, children }) {
  return (
    <section className="rounded-2xl bg-white p-6 shadow-sm">
      <h2 className="text-xl font-black text-gray-900">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-gray-600">{children}</div>
    </section>
  )
}

function RevisionPolicyPage() {
  return (
    <div className="min-h-screen bg-gray-100">
      <main className="mx-auto max-w-4xl px-6 py-6">
        <div className="mb-10 flex items-center justify-between gap-4">
          <div>
            <p className="text-2xl font-bold text-gray-900">GreenroomID</p>
            <p className="text-sm text-gray-500">Terakhir diperbarui: {updatedAt}</p>
          </div>
          <Link to="/" className="rounded-xl border border-gray-200 bg-white px-5 py-2 text-sm text-gray-700 transition hover:bg-gray-50">
            Beranda
          </Link>
        </div>

        <section className="mb-6 rounded-3xl bg-white p-8 shadow-sm">
          <p className="mb-4 inline-block rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">
            Revisi dan refund
          </p>
          <h1 className="mb-4 text-4xl font-bold text-gray-900">Kebijakan Revisi dan Pengembalian Dana</h1>
          <p className="leading-relaxed text-gray-600">Terakhir diperbarui: {updatedAt}</p>
        </section>

        <div className="space-y-5">
          <Section title="Revisi gratis">
            <p>Maksimal 2 kali revisi.</p>
            <p>Revisi diajukan paling lambat 1 minggu setelah pembayaran dikonfirmasi dan file final dikirim.</p>
            <p>Revisi gratis berlaku untuk pekerjaan dan ruang lingkup yang sama dengan request awal.</p>
            <p>Perubahan yang keluar dari konteks, instruksi, atau ruang lingkup request awal dapat dianggap sebagai pekerjaan baru dan dapat dikenakan estimasi harga baru.</p>
            <p>Revisi diajukan melalui ruang diskusi request terkait.</p>
          </Section>

          <Section title="Pengembalian dana pekerjaan biasa">
            <p>Pembayaran dilakukan setelah pekerjaan selesai. Pengguna melihat preview PDF berwatermark sebelum membayar.</p>
            <p>Jika tidak sesuai, pengguna tidak perlu membayar. Setelah dibayar dan file hasil tersedia, pembayaran tidak dapat dikembalikan.</p>
          </Section>

          <Section title="Pengembalian dana pekerjaan khusus lebih dari 5 hari">
            <p>Pekerjaan khusus lebih dari 5 hari menggunakan uang muka 50% dan preview maksimal 50% target.</p>
            <p>Jika dibatalkan sebelum selesai dan belum ada file final, uang muka dikembalikan penuh. Jika sudah selesai atau file final tersedia, tidak ada refund.</p>
          </Section>

          <Section title="Pembayaran duplikat">
            <p>Pembayaran duplikat dikembalikan penuh setelah verifikasi.</p>
          </Section>

          <Section title="Cara meminta refund">
            <p>Permintaan refund dapat diajukan melalui ruang diskusi request, email, atau WhatsApp.</p>
            <p>Email: <a href="mailto:fajarsiddiqui00@gmail.com" className="font-bold text-green-700 hover:underline">fajarsiddiqui00@gmail.com</a></p>
            <p>WhatsApp: <a href="https://wa.me/62882006446617" target="_blank" rel="noopener noreferrer" className="font-bold text-green-700 hover:underline">+62 882-0064-46617</a></p>
          </Section>

          <Section title="Verifikasi">
            <p>Admin dapat meminta bukti transaksi. Refund dilakukan setelah transaksi duplikat atau kondisi refund terverifikasi.</p>
          </Section>

          <section className="rounded-3xl bg-gray-900 p-6">
            <Link to="/kontak" className="rounded-xl bg-white px-5 py-3 text-sm font-bold text-gray-900 transition hover:bg-gray-100">
              Hubungi GreenroomID
            </Link>
          </section>
        </div>
      </main>
      <PublicFooter />
    </div>
  )
}

export default RevisionPolicyPage
