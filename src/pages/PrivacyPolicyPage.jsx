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

function PrivacyPolicyPage() {
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
            Kebijakan data
          </p>
          <h1 className="mb-4 text-4xl font-bold text-gray-900">Kebijakan Privasi GreenroomID</h1>
          <p className="leading-relaxed text-gray-600">Terakhir diperbarui: {updatedAt}</p>
        </section>

        <div className="space-y-5">
          <Section title="1. Pengelola layanan">
            <p>GreenroomID dikelola oleh Fajar Sidiq, S.Pd.I sebagai usaha perorangan yang saat ini belum berbadan usaha di Indonesia.</p>
          </Section>

          <Section title="2. Data yang diproses">
            <p>Data yang diproses dapat meliputi nama dan email akun Google, ID akun internal, informasi request, instruksi pekerjaan, diskusi request, dokumen atau file digital yang dikirim, status pekerjaan, invoice dan status transaksi, bukti pembayaran, serta data donasi jika pengguna menggunakan fitur donasi.</p>
          </Section>

          <Section title="3. Tujuan penggunaan">
            <p>Data digunakan untuk autentikasi akun, menerima dan mereview request, menentukan harga final, mengelola invoice dan pembayaran, mengirim preview dan file hasil, mengelola revisi, komunikasi dengan pengguna, administrasi layanan, serta menangani keluhan dan penghapusan data.</p>
          </Section>

          <Section title="4. Akses terhadap data dan file digital">
            <p>File digital pelanggan hanya dapat diakses oleh pelanggan terkait, admin GreenroomID, dan anggota tim yang ditugaskan untuk mengerjakan request tersebut, sebatas yang diperlukan untuk menyelesaikan layanan.</p>
            <p>Anggota tim tidak boleh menggunakan file untuk kepentingan pribadi, membagikan file di luar kebutuhan pengerjaan, atau menggunakan file sebagai portofolio tanpa izin pengguna.</p>
          </Section>

          <Section title="5. Penyimpanan file digital">
            <p>Batas upload langsung pelanggan maksimal 5 MB per file. File lebih besar dapat dikirim melalui metode yang disepakati dengan admin.</p>
            <p>File hasil besar dapat diberikan melalui Google Drive atau layanan penyimpanan pihak ketiga. Ini bukan integrasi otomatis dan bergantung pada metode yang disepakati.</p>
            <p>File digital disimpan selama 3 bulan dan paling lama 6 bulan setelah pekerjaan selesai. File dapat dihapus setelah melewati 3 bulan menyesuaikan kapasitas. Pengguna disarankan segera mengunduh file final.</p>
          </Section>

          <Section title="6. Masa penyimpanan data lain">
            <p>Riwayat request dan diskusi disimpan paling lama 2 tahun setelah request selesai. Data akun disimpan sampai pengguna meminta penghapusan akun.</p>
            <p>Data invoice dan transaksi dapat disimpan lebih lama untuk administrasi, pencatatan transaksi, penyelesaian sengketa, atau kewajiban hukum. Metadata file dapat tetap tersimpan setelah file digital dihapus.</p>
            <p>Metadata dapat berupa nama file, ukuran, jenis, tanggal upload, dan status penghapusan.</p>
          </Section>

          <Section title="7. Layanan pihak ketiga">
            <p>GreenroomID menggunakan Google untuk login, Supabase untuk autentikasi, database, dan penyimpanan, Vercel untuk hosting, Midtrans untuk pembayaran dan donasi, serta Google Drive atau layanan penyimpanan pihak ketiga jika digunakan untuk pengiriman file besar.</p>
            <p>GreenroomID menggunakan Vercel untuk hosting, pengukuran performa, dan statistik kunjungan halaman secara agregat. Pengukuran ini tidak digunakan untuk mengirim isi request, file digital, percakapan, informasi pembayaran, atau identitas akun ke layanan analytics.</p>
            <p>URL yang dikirim untuk statistik dibatasi pada halaman publik dan tidak menyertakan query string atau bagian hash.</p>
            <p>Penyedia tersebut dapat memproses data sesuai fungsi dan kebijakan mereka masing-masing.</p>
          </Section>

          <Section title="8. Permintaan akses, koreksi, dan penghapusan">
            <p>Pengguna dapat meminta koreksi data, penghapusan file digital, penghapusan akun, atau penghentian penggunaan file sebagai portofolio melalui ruang diskusi request, email, atau WhatsApp.</p>
            <p>Verifikasi identitas mungkin diperlukan. Data transaksi tertentu dapat tetap disimpan untuk administrasi atau kewajiban hukum.</p>
          </Section>

          <Section title="9. Keamanan">
            <p>GreenroomID menerapkan langkah teknis dan operasional yang wajar untuk membatasi akses dan mengurangi risiko kehilangan, perubahan, atau pengungkapan data tanpa izin. Namun, tidak ada sistem elektronik yang sepenuhnya bebas risiko.</p>
          </Section>

          <Section title="10. Perubahan kebijakan">
            <p>Kebijakan ini dapat diperbarui saat fitur, penyedia layanan, atau proses data berubah.</p>
          </Section>

          <Section title="11. Kontak privasi">
            <p>Email: <a href="mailto:fajarsiddiqui00@gmail.com" className="font-bold text-green-700 hover:underline">fajarsiddiqui00@gmail.com</a></p>
            <p>WhatsApp: <a href="https://wa.me/62882006446617" target="_blank" rel="noopener noreferrer" className="font-bold text-green-700 hover:underline">+62 882-0064-46617</a></p>
          </Section>
        </div>
      </main>
      <PublicFooter />
    </div>
  )
}

export default PrivacyPolicyPage
