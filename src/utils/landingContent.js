export const LANDING_CONTENT_GROUPS = [
  {
    title: 'Header Card',
    fields: [
      { key: 'brand_name', label: 'Nama Brand', type: 'text', defaultValue: 'GreenroomID' },
      { key: 'brand_tagline', label: 'Tagline Singkat', type: 'text', defaultValue: 'Tugas digital, akademik, dan kreatif.' },
      { key: 'header_description', label: 'Deskripsi Singkat Header', type: 'textarea', defaultValue: 'GreenroomID membantu kebutuhan tugas digital dengan harga murah, alur rapi, free revisi, dan pilihan layanan yang bisa dicek langsung di website.' },
      { key: 'logo_url', label: 'URL Logo Header', type: 'text', defaultValue: '/favicon.svg' },
      { key: 'login_button', label: 'Tombol Login', type: 'text', defaultValue: 'Login' }
    ]
  },
  {
    title: 'Ringkasan Statistik',
    fields: [
      { key: 'stats_title', label: 'Judul Statistik', type: 'text', defaultValue: 'Ringkasan GreenroomID' },
      { key: 'stats_subtitle', label: 'Subtitle Statistik', type: 'text', defaultValue: 'Data singkat aktivitas website.' },
      { key: 'stats_total_views', label: 'Label Total Kunjungan', type: 'text', defaultValue: 'Kunjungan' },
      { key: 'stats_total_requests', label: 'Label Total Request', type: 'text', defaultValue: 'Request' },
      { key: 'stats_completed_requests', label: 'Label Request Selesai', type: 'text', defaultValue: 'Selesai' },
      { key: 'stats_active_services', label: 'Label Layanan Aktif', type: 'text', defaultValue: 'Layanan' },
      { key: 'stats_free_services_usage', label: 'Label Penggunaan Layanan Gratis', type: 'text', defaultValue: 'Penggunaan Gratis' }
    ]
  },
  {
    title: 'Menu Landing',
    fields: [
      { key: 'menu_title', label: 'Judul Menu', type: 'text', defaultValue: 'Menu Utama' },
      { key: 'menu_subtitle', label: 'Subtitle Menu', type: 'text', defaultValue: 'Pilih halaman yang ingin dibuka.' },
      { key: 'menu_services_label', label: 'Card 1 - Daftar Layanan', type: 'text', defaultValue: 'Daftar Layanan' },
      { key: 'menu_services_description', label: 'Deskripsi Daftar Layanan', type: 'text', defaultValue: 'Lihat {count} layanan aktif.' },
      { key: 'menu_free_label', label: 'Card 2 - Layanan Gratis', type: 'text', defaultValue: 'Layanan Gratis' },
      { key: 'menu_free_description', label: 'Deskripsi Layanan Gratis', type: 'text', defaultValue: 'Program gratis akan tersedia.' },
      { key: 'menu_learning_label', label: 'Card 3 - Ruang Belajar', type: 'text', defaultValue: 'Ruang Belajar' },
      { key: 'menu_learning_description', label: 'Deskripsi Ruang Belajar', type: 'text', defaultValue: 'Baca hasil pembelajaran artikel ilmiah yang dipublikasikan.' },
      { key: 'menu_donate_label', label: 'Card 4 - Donate Us', type: 'text', defaultValue: 'Donate Us' },
      { key: 'menu_donate_description', label: 'Deskripsi Donate Us', type: 'text', defaultValue: 'Dukung pengembangan GreenroomID.' },
      { key: 'menu_top_donatur_label', label: 'Card 5 - Top Donatur', type: 'text', defaultValue: 'Top Donatur' },
      { key: 'menu_top_donatur_description', label: 'Deskripsi Top Donatur', type: 'text', defaultValue: 'Daftar pendukung terbaik.' },
      { key: 'menu_feedback_label', label: 'Card 6 - Kritik dan Saran', type: 'text', defaultValue: 'Kritik dan Saran' },
      { key: 'menu_feedback_description', label: 'Deskripsi Kritik dan Saran', type: 'text', defaultValue: 'Kirim masukan untuk perbaikan website.' },
      { key: 'menu_card_hint', label: 'Hint Card', type: 'text', defaultValue: 'Buka halaman →' }
    ]
  },
  {
    title: 'Kontak',
    fields: [
      { key: 'contact_label', label: 'Label Kontak', type: 'text', defaultValue: 'Butuh bantuan cepat?' },
      { key: 'contact_text', label: 'Teks Link Kontak', type: 'text', defaultValue: 'Hubungi WhatsApp Business' },
      { key: 'contact_url', label: 'URL Kontak', type: 'text', defaultValue: 'https://wa.me/62882006446617' }
    ]
  },
  {
    title: 'CTA Bawah & Footer',
    fields: [
      { key: 'bottom_cta_title', label: 'Judul CTA Bawah', type: 'text', defaultValue: 'Mulai request digitalmu di GreenroomID.' },
      { key: 'bottom_cta_description', label: 'Deskripsi CTA Bawah', type: 'textarea', defaultValue: 'Login dengan akun Google untuk membuat request, cek harga layanan, diskusi dengan admin, dan menerima hasil kerja secara lebih teratur.' },
      { key: 'bottom_cta_button', label: 'Tombol CTA Bawah', type: 'text', defaultValue: 'Login dengan Google' },
      { key: 'footer_text', label: 'Teks Footer', type: 'text', defaultValue: 'GreenroomID. Layanan digital dengan harga terjangkau dan free revisi.' }
    ]
  }
]

export const DEFAULT_LANDING_CONTENT = LANDING_CONTENT_GROUPS.reduce((acc, group) => {
  group.fields.forEach((field) => {
    acc[field.key] = field.defaultValue
  })
  return acc
}, {})

export const LANDING_CONTENT_FIELDS = LANDING_CONTENT_GROUPS.flatMap((group) =>
  group.fields.map((field, index) => ({ ...field, groupTitle: group.title, sortOrder: index }))
)

export const mergeLandingContentRows = (rows = []) => {
  const nextContent = { ...DEFAULT_LANDING_CONTENT }

  rows.forEach((row) => {
    if (row?.content_key && row.content_value !== null && row.content_value !== undefined) {
      nextContent[row.content_key] = row.content_value
    }
  })

  return nextContent
}
