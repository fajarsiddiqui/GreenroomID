const SITE_URL = 'https://www.greenroomid.com'

const imageToTableMeta = {
  title: 'Image to Table Gratis | GreenroomID',
  description: 'Susun gambar menjadi tabel dokumen, atur layout halaman dan caption, lalu unduh hasilnya sebagai PDF langsung dari browser.',
  canonicalUrl: `${SITE_URL}/image-to-table`,
  robots: 'index, follow'
}

const daftarHadirMeta = {
  title: 'Daftar Hadir Gratis | GreenroomID',
  description: 'Buat daftar hadir rapor dengan kolom, baris, data, tanda tangan, lalu print atau export dokumen langsung dari browser.',
  canonicalUrl: `${SITE_URL}/daftar-hadir`,
  robots: 'index, follow'
}

const kalkulatorAturanAngkaMeta = {
  title: 'Kalkulator Aturan Angka | GreenroomID',
  description: 'Cari angka yang cocok dari anggaran, harga, jumlah, total, sisa, dan rentang perhitungan tanpa menyimpan file hasil.',
  canonicalUrl: `${SITE_URL}/kalkulator-aturan-angka`,
  robots: 'index, follow'
}

export const PUBLIC_PAGE_META = {
  '/cara-kerja': {
    title: 'Cara Kerja Request | GreenroomID',
    description: 'Pelajari alur request di GreenroomID, mulai dari login, kirim kebutuhan, review admin, invoice, pembayaran, hingga pengiriman file hasil.',
    canonicalUrl: `${SITE_URL}/cara-kerja`,
    robots: 'index, follow'
  },
  '/layanan': {
    title: 'Kategori Layanan Digital | GreenroomID',
    description: 'Pilih kategori layanan GreenroomID untuk melihat daftar jasa, estimasi harga, waktu pengerjaan, dan keterangan tiap layanan digital.',
    canonicalUrl: `${SITE_URL}/layanan`,
    robots: 'index, follow'
  },
  '/layanan-gratis': {
    title: 'Layanan Gratis Online | GreenroomID',
    description: 'Gunakan tools gratis GreenroomID seperti Image to Table, Daftar Hadir, dan Kalkulator Aturan Angka langsung dari browser.',
    canonicalUrl: `${SITE_URL}/layanan-gratis`,
    robots: 'index, follow'
  },
  '/ruang-belajar': {
    title: 'Ruang Belajar Artikel | GreenroomID',
    description: 'Baca hasil pembelajaran artikel ilmiah dengan ringkasan mandiri, peta metode, analisis, catatan pembelajaran, dan sumber rujukan.',
    canonicalUrl: `${SITE_URL}/ruang-belajar`,
    robots: 'index, follow'
  },
  '/image-to-table': imageToTableMeta,
  '/layanan-gratis/image-to-table': imageToTableMeta,
  '/daftar-hadir': daftarHadirMeta,
  '/layanan-gratis/daftar-hadir': daftarHadirMeta,
  '/kalkulator-aturan-angka': kalkulatorAturanAngkaMeta,
  '/layanan-gratis/kalkulator-aturan-angka': kalkulatorAturanAngkaMeta,
  '/donate-us': {
    title: 'Dukung GreenroomID',
    description: 'Dukung pengembangan GreenroomID dan tools gratis melalui donasi online, dengan pilihan nama tampil publik atau anonim.',
    canonicalUrl: `${SITE_URL}/donate-us`,
    robots: 'index, follow'
  },
  '/top-donatur': {
    title: 'Top Donatur | GreenroomID',
    description: 'Lihat daftar donatur GreenroomID, total dukungan, ranking donatur, dan donasi terbaru yang berhasil diproses otomatis.',
    canonicalUrl: `${SITE_URL}/top-donatur`,
    robots: 'index, follow'
  },
  '/kritik-saran': {
    title: 'Kritik dan Saran | GreenroomID',
    description: 'Halaman kritik dan saran GreenroomID sedang disiapkan agar pengunjung bisa memberi masukan untuk pengembangan layanan.',
    canonicalUrl: `${SITE_URL}/kritik-saran`,
    robots: 'noindex, nofollow'
  }
}
