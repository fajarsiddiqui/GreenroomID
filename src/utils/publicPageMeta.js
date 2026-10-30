const SITE_URL = 'https://www.greenroomid.com'
const ORGANIZATION_ID = `${SITE_URL}/#organization`
const WEBSITE_ID = `${SITE_URL}/#website`

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
  '/faq': {
    title: 'FAQ Layanan GreenroomID',
    description: 'Temukan jawaban tentang cara mengajukan request, estimasi harga dan waktu, proses review, dan invoice GreenroomID.',
    canonicalUrl: `${SITE_URL}/faq`,
    robots: 'index, follow'
  },
  '/tentang-kami': {
    title: 'Tentang GreenroomID',
    description: 'Kenali GreenroomID, platform bantuan digital untuk mahasiswa dan guru dalam mengelola dokumen, presentasi, data, serta kebutuhan akademik dan administrasi.',
    canonicalUrl: `${SITE_URL}/tentang-kami`,
    robots: 'index, follow'
  },
  '/kontak': {
    title: 'Hubungi GreenroomID',
    description: 'Hubungi GreenroomID melalui email atau WhatsApp untuk pertanyaan layanan, kendala request, pengiriman file besar, dan permintaan terkait data.',
    canonicalUrl: `${SITE_URL}/kontak`,
    robots: 'index, follow'
  },
  '/pengalaman-pelanggan': {
    title: 'Pengalaman Pelanggan GreenroomID',
    description: 'Lihat ringkasan survei pengalaman pelanggan GreenroomID tentang proses pemesanan, kualitas hasil, ketepatan waktu, harga, dan kemungkinan merekomendasikan.',
    canonicalUrl: `${SITE_URL}/pengalaman-pelanggan`,
    robots: 'index, follow'
  },
  '/kebijakan-privasi': {
    title: 'Kebijakan Privasi GreenroomID',
    description: 'Pelajari bagaimana GreenroomID memproses, menggunakan, menyimpan, dan melindungi data akun, request, transaksi, dan file digital pengguna.',
    canonicalUrl: `${SITE_URL}/kebijakan-privasi`,
    robots: 'index, follow'
  },
  '/syarat-ketentuan': {
    title: 'Syarat dan Ketentuan GreenroomID',
    description: 'Baca ketentuan penggunaan layanan GreenroomID, proses request, estimasi, pembayaran, file digital, dan tanggung jawab pengguna.',
    canonicalUrl: `${SITE_URL}/syarat-ketentuan`,
    robots: 'index, follow'
  },
  '/kebijakan-revisi': {
    title: 'Kebijakan Revisi dan Refund GreenroomID',
    description: 'Pelajari ketentuan dua kali revisi gratis, batas waktu revisi, pembayaran, uang muka pekerjaan khusus, dan pengembalian dana GreenroomID.',
    canonicalUrl: `${SITE_URL}/kebijakan-revisi`,
    robots: 'index, follow'
  },
  '/kritik-saran': {
    title: 'Kritik dan Saran | GreenroomID',
    description: 'Halaman kritik dan saran GreenroomID sedang disiapkan agar pengunjung bisa memberi masukan untuk pengembangan layanan.',
    canonicalUrl: `${SITE_URL}/kritik-saran`,
    robots: 'noindex, nofollow'
  }
}

const createWebPageSchema = ({ name, meta, pageType = 'WebPage' }) => ({
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@id': `${meta.canonicalUrl}#webpage`,
      '@type': pageType,
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

export const PUBLIC_PAGE_SCHEMA = {
  '/cara-kerja': createWebPageSchema({
    name: 'Cara Kerja Request',
    meta: PUBLIC_PAGE_META['/cara-kerja']
  }),
  '/layanan': createWebPageSchema({
    name: 'Kategori Layanan Digital',
    meta: PUBLIC_PAGE_META['/layanan']
  }),
  '/faq': createWebPageSchema({
    name: 'FAQ GreenroomID',
    meta: PUBLIC_PAGE_META['/faq']
  }),
  '/tentang-kami': createWebPageSchema({
    name: 'Tentang GreenroomID',
    meta: PUBLIC_PAGE_META['/tentang-kami'],
    pageType: 'AboutPage'
  }),
  '/kontak': createWebPageSchema({
    name: 'Hubungi GreenroomID',
    meta: PUBLIC_PAGE_META['/kontak'],
    pageType: 'ContactPage'
  }),
  '/pengalaman-pelanggan': createWebPageSchema({
    name: 'Pengalaman Pelanggan',
    meta: PUBLIC_PAGE_META['/pengalaman-pelanggan']
  }),
  '/kebijakan-privasi': createWebPageSchema({
    name: 'Kebijakan Privasi GreenroomID',
    meta: PUBLIC_PAGE_META['/kebijakan-privasi']
  }),
  '/syarat-ketentuan': createWebPageSchema({
    name: 'Syarat dan Ketentuan GreenroomID',
    meta: PUBLIC_PAGE_META['/syarat-ketentuan']
  }),
  '/kebijakan-revisi': createWebPageSchema({
    name: 'Kebijakan Revisi dan Pengembalian Dana',
    meta: PUBLIC_PAGE_META['/kebijakan-revisi']
  })
}
