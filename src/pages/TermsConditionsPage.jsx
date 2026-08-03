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

function TermsConditionsPage() {
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
            Ketentuan layanan
          </p>
          <h1 className="mb-4 text-4xl font-bold text-gray-900">Syarat dan Ketentuan GreenroomID</h1>
          <p className="leading-relaxed text-gray-600">Terakhir diperbarui: {updatedAt}</p>
        </section>

        <div className="space-y-5">
          <Section title="1. Tentang layanan">
            <p>GreenroomID membantu kebutuhan dokumen digital, presentasi, data, serta kebutuhan akademik dan administrasi untuk mahasiswa dan guru.</p>
          </Section>

          <Section title="2. Akun pengguna">
            <p>Request memerlukan login Google. Pengguna bertanggung jawab menjaga akses akunnya dan memberikan informasi request dengan benar.</p>
          </Section>

          <Section title="3. Dokumen pengguna">
            <p>Pengguna bertanggung jawab memastikan berhak menggunakan file yang dikirim. Pengguna disarankan menghapus data sensitif yang tidak diperlukan. File hanya digunakan untuk kebutuhan request terkait.</p>
          </Section>

          <Section title="4. Proses request">
            <p>Pengguna memilih layanan dan mengirim detail. Admin mereview kebutuhan sebelum menentukan harga final.</p>
            <p>Estimasi harga dan waktu bukan keputusan final. Harga final ditentukan setelah review, dan invoice dibuat setelah harga dikonfirmasi.</p>
          </Section>

          <Section title="5. Pembayaran pekerjaan biasa">
            <p>Untuk pekerjaan biasa, pembayaran dilakukan setelah pekerjaan selesai. Pelanggan dapat melihat preview berwatermark dalam format PDF sebelum melakukan pembayaran. Jika preview dinilai tidak sesuai, pelanggan tidak wajib melakukan pembayaran.</p>
            <p>Setelah pembayaran dilakukan untuk pekerjaan yang telah selesai dan file hasil telah tersedia, pembayaran tidak dapat dikembalikan, kecuali terjadi pembayaran terduplikasi.</p>
          </Section>

          <Section title="6. Pekerjaan khusus lebih dari 5 hari">
            <p>Untuk pekerjaan yang memerlukan waktu lebih dari 5 hari, pelanggan dapat melihat preview hingga maksimal 50% target dan membayar uang muka sebesar 50%.</p>
            <p>Jika dibatalkan sebelum pekerjaan selesai dan file final belum tersedia, uang muka dikembalikan penuh. Jika pekerjaan selesai atau file final sudah tersedia, uang muka tidak dapat dikembalikan.</p>
          </Section>

          <Section title="7. Pembayaran duplikat">
            <p>Jika pembayaran terduplikasi dan kedua transaksi telah terkonfirmasi masuk, pembayaran tambahan akan dikembalikan penuh setelah verifikasi.</p>
          </Section>

          <Section title="8. Revisi">
            <p>Ketentuan revisi dijelaskan di halaman <Link to="/kebijakan-revisi" className="font-bold text-green-700 hover:underline">Kebijakan Revisi dan Pengembalian Dana</Link>.</p>
          </Section>

          <Section title="9. File digital dan penyimpanan">
            <p>File digital disimpan selama 3 bulan dan maksimal 6 bulan setelah pekerjaan selesai. Pengguna harus mengunduh salinan final. File besar dapat dikirim melalui metode yang disepakati.</p>
          </Section>

          <Section title="10. Perubahan atau penolakan request">
            <p>GreenroomID dapat meminta penyesuaian atau menolak request apabila kebutuhan tidak dapat dipenuhi, berada di luar ruang lingkup layanan, atau bertentangan dengan ketentuan yang berlaku.</p>
          </Section>

          <Section title="11. Perubahan ketentuan">
            <p>Syarat dan ketentuan ini dapat diperbarui. Tanggal pembaruan ditampilkan pada halaman ini.</p>
          </Section>

          <Section title="12. Kontak">
            <p>Hubungi GreenroomID melalui halaman <Link to="/kontak" className="font-bold text-green-700 hover:underline">Kontak</Link>.</p>
          </Section>
        </div>
      </main>
      <PublicFooter />
    </div>
  )
}

export default TermsConditionsPage
