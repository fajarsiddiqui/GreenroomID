export const LANDING_CONTENT_GROUPS = [
  {
    title: 'Header',
    fields: [
      { key: 'brand_name', label: 'Nama Brand', type: 'text', defaultValue: 'GreenroomID' },
      { key: 'brand_tagline', label: 'Tagline Header', type: 'text', defaultValue: 'Platform Freelance Terkelola' },
      { key: 'login_button', label: 'Tombol Masuk', type: 'text', defaultValue: 'Masuk' }
    ]
  },
  {
    title: 'Hero Section',
    fields: [
      { key: 'hero_badge', label: 'Badge Hero', type: 'text', defaultValue: 'Request kerja lebih rapi dan terpantau' },
      { key: 'hero_title', label: 'Judul Utama', type: 'textarea', defaultValue: 'Kelola request desain, video, penulisan, dan programming dalam satu tempat.' },
      { key: 'hero_description', label: 'Deskripsi Hero', type: 'textarea', defaultValue: 'GreenroomID membantu client mengirim request, melampirkan file, berdiskusi dengan admin, melihat invoice, upload bukti pembayaran, dan menerima hasil kerja secara lebih terstruktur.' },
      { key: 'primary_cta', label: 'Tombol CTA Utama', type: 'text', defaultValue: 'Mulai Request Sekarang' },
      { key: 'secondary_cta', label: 'Tombol CTA Kedua', type: 'text', defaultValue: 'Lihat Cara Kerja' }
    ]
  },
  {
    title: 'Kontak',
    fields: [
      { key: 'contact_label', label: 'Label Kontak', type: 'text', defaultValue: 'Kontak Person' },
      { key: 'contact_text', label: 'Teks Link Kontak', type: 'text', defaultValue: 'WhatsApp Business' },
      { key: 'contact_url', label: 'URL Kontak', type: 'text', defaultValue: 'https://wa.me/62882006446617' }
    ]
  },
  {
    title: 'Statistik',
    fields: [
      { key: 'stats_title', label: 'Judul Statistik', type: 'text', defaultValue: 'Statistik Platform' },
      { key: 'stats_subtitle', label: 'Subtitle Statistik', type: 'text', defaultValue: 'Ringkasan aktivitas GreenroomID' },
      { key: 'stats_total_views', label: 'Label Total Kunjungan', type: 'text', defaultValue: 'Total Kunjungan' },
      { key: 'stats_total_requests', label: 'Label Total Request', type: 'text', defaultValue: 'Total Request' },
      { key: 'stats_completed_requests', label: 'Label Request Selesai', type: 'text', defaultValue: 'Request Selesai' },
      { key: 'stats_active_services', label: 'Label Layanan Aktif', type: 'text', defaultValue: 'Layanan Aktif' },
      { key: 'stats_services_hint', label: 'Hint Layanan Aktif', type: 'text', defaultValue: 'Klik untuk lihat layanan →' }
    ]
  },
  {
    title: 'Preview Card Landing',
    fields: [
      { key: 'sample_request_title', label: 'Judul Card Request', type: 'text', defaultValue: 'Request Saya' },
      { key: 'sample_request_status', label: 'Status Card Request', type: 'text', defaultValue: 'PENDING' },
      { key: 'sample_request_description', label: 'Deskripsi Card Request', type: 'textarea', defaultValue: 'Desain logo, edit video, revisi dokumen, atau kebutuhan digital lainnya.' },
      { key: 'sample_request_category', label: 'Info Kategori', type: 'text', defaultValue: 'Kategori: Desain' },
      { key: 'sample_request_file', label: 'Info File', type: 'text', defaultValue: 'File: 3 lampiran' },
      { key: 'discussion_title', label: 'Judul Diskusi', type: 'text', defaultValue: 'Diskusi Admin' },
      { key: 'discussion_description', label: 'Deskripsi Diskusi', type: 'textarea', defaultValue: 'Semua komunikasi terkait request tersimpan dalam satu halaman detail.' },
      { key: 'result_title', label: 'Judul File Hasil', type: 'text', defaultValue: 'File Hasil' },
      { key: 'result_description', label: 'Deskripsi File Hasil', type: 'textarea', defaultValue: 'Client dapat mengunduh hasil setelah proses pembayaran dan verifikasi selesai.' }
    ]
  },
  {
    title: 'CTA Bawah & Footer',
    fields: [
      { key: 'bottom_cta_title', label: 'Judul CTA Bawah', type: 'text', defaultValue: 'Siap membuat request pertama?' },
      { key: 'bottom_cta_description', label: 'Deskripsi CTA Bawah', type: 'textarea', defaultValue: 'Masuk dengan akun Google untuk mulai menggunakan GreenroomID.' },
      { key: 'bottom_cta_button', label: 'Tombol CTA Bawah', type: 'text', defaultValue: 'Masuk dengan Google' },
      { key: 'footer_text', label: 'Teks Footer', type: 'text', defaultValue: 'GreenroomID. Platform Freelance Terkelola.' }
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
