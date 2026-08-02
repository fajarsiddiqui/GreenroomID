const SITE_URL = 'https://www.greenroomid.com'
const ORGANIZATION_ID = `${SITE_URL}/#organization`
const WEBSITE_ID = `${SITE_URL}/#website`

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

const createWebPageSchema = ({ name, meta }) => ({
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@id': `${meta.canonicalUrl}#webpage`,
      '@type': 'WebPage',
      name,
      description: meta.description,
      url: meta.canonicalUrl,
      isPartOf: {
        '@id': WEBSITE_ID
      },
      publisher: {
        '@id': ORGANIZATION_ID
      }
    },
    {
      '@id': `${meta.canonicalUrl}#breadcrumb`,
      '@type': 'BreadcrumbList',
      itemListElement: [
        {
          '@type': 'ListItem',
          position: 1,
          name: 'Beranda',
          item: SITE_URL
        },
        {
          '@type': 'ListItem',
          position: 2,
          name,
          item: meta.canonicalUrl
        }
      ]
    }
  ]
})

const createToolSchema = ({ name, meta }) => ({
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@id': `${meta.canonicalUrl}#webapp`,
      '@type': 'WebApplication',
      name,
      description: meta.description,
      url: meta.canonicalUrl,
      applicationCategory: 'UtilitiesApplication',
      operatingSystem: 'Any',
      browserRequirements: 'Requires JavaScript and a modern web browser',
      isAccessibleForFree: true,
      publisher: {
        '@id': ORGANIZATION_ID
      },
      isPartOf: {
        '@id': WEBSITE_ID
      },
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'IDR'
      }
    },
    {
      '@id': `${meta.canonicalUrl}#breadcrumb`,
      '@type': 'BreadcrumbList',
      itemListElement: [
        {
          '@type': 'ListItem',
          position: 1,
          name: 'Beranda',
          item: SITE_URL
        },
        {
          '@type': 'ListItem',
          position: 2,
          name: 'Layanan Gratis',
          item: `${SITE_URL}/layanan-gratis`
        },
        {
          '@type': 'ListItem',
          position: 3,
          name,
          item: meta.canonicalUrl
        }
      ]
    }
  ]
})

const imageToTableSchema = createToolSchema({
  name: 'Image to Table',
  meta: imageToTableMeta
})

const daftarHadirSchema = createToolSchema({
  name: 'Daftar Hadir',
  meta: daftarHadirMeta
})

const kalkulatorAturanAngkaSchema = createToolSchema({
  name: 'Kalkulator Aturan Angka',
  meta: kalkulatorAturanAngkaMeta
})

export const PUBLIC_PAGE_SCHEMA = {
  '/cara-kerja': createWebPageSchema({
    name: 'Cara Kerja Request',
    meta: PUBLIC_PAGE_META['/cara-kerja']
  }),
  '/layanan': createWebPageSchema({
    name: 'Kategori Layanan Digital',
    meta: PUBLIC_PAGE_META['/layanan']
  }),
  '/layanan-gratis': createWebPageSchema({
    name: 'Layanan Gratis Online',
    meta: PUBLIC_PAGE_META['/layanan-gratis']
  }),
  '/ruang-belajar': createWebPageSchema({
    name: 'Ruang Belajar Artikel',
    meta: PUBLIC_PAGE_META['/ruang-belajar']
  }),
  '/image-to-table': imageToTableSchema,
  '/layanan-gratis/image-to-table': imageToTableSchema,
  '/daftar-hadir': daftarHadirSchema,
  '/layanan-gratis/daftar-hadir': daftarHadirSchema,
  '/kalkulator-aturan-angka': kalkulatorAturanAngkaSchema,
  '/layanan-gratis/kalkulator-aturan-angka': kalkulatorAturanAngkaSchema,
  '/donate-us': createWebPageSchema({
    name: 'Dukung GreenroomID',
    meta: PUBLIC_PAGE_META['/donate-us']
  }),
  '/top-donatur': createWebPageSchema({
    name: 'Top Donatur',
    meta: PUBLIC_PAGE_META['/top-donatur']
  })
}
