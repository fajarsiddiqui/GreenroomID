export const LANDING_BACKGROUND_DEFAULT = '/landing/greenroom-rain-house.webp'

export const LANDING_CARD_ICON_OPTIONS = [
  { value: 'layanan-icon.svg', label: 'Layanan', src: '/landing/layanan-icon.svg' },
  { value: 'tools-gratis-icon.svg', label: 'Tools Gratis', src: '/landing/tools-gratis-icon.svg' },
  { value: 'ai-tools-icon.svg', label: 'AI Tools', src: '/landing/ai-tools-icon.svg' },
  { value: 'ruang-belajar-icon.svg', label: 'Ruang Belajar', src: '/landing/ruang-belajar-icon.svg' },
  { value: 'studio-artikel-icon.svg', label: 'Studio Artikel', src: '/landing/studio-artikel-icon.svg' }
]

const LANDING_CARD_ICON_PATHS = LANDING_CARD_ICON_OPTIONS.reduce((acc, option) => {
  acc[option.value] = option.src
  return acc
}, {})

export const HOME_CARD_CONTENT = [
  {
    id: 'services',
    to: '/layanan',
    labelKey: 'menu_services_label',
    descriptionKey: 'menu_services_description',
    iconKey: 'menu_services_icon',
    defaultLabel: 'Layanan',
    defaultDescription: 'Bantuan untuk kebutuhan Anda.',
    defaultIcon: 'layanan-icon.svg'
  },
  {
    id: 'free',
    to: '/tools-gratis',
    labelKey: 'menu_free_label',
    descriptionKey: 'menu_free_description',
    iconKey: 'menu_free_icon',
    defaultLabel: 'Tools Gratis',
    defaultDescription: 'Alat praktis yang langsung digunakan.',
    defaultIcon: 'tools-gratis-icon.svg'
  },
  {
    id: 'ai-tools',
    to: '/ai-tools',
    labelKey: 'menu_ai_tools_label',
    descriptionKey: 'menu_ai_tools_description',
    iconKey: 'menu_ai_tools_icon',
    defaultLabel: 'AI Tools',
    defaultDescription: 'Bekerja lebih cepat dengan bantuan AI.',
    defaultIcon: 'ai-tools-icon.svg'
  },
  {
    id: 'learning',
    to: '/ruang-belajar',
    labelKey: 'menu_learning_label',
    descriptionKey: 'menu_learning_description',
    iconKey: 'menu_learning_icon',
    defaultLabel: 'Ruang Belajar',
    defaultDescription: 'Panduan dan materi untuk dipelajari.',
    defaultIcon: 'ruang-belajar-icon.svg'
  },
  {
    id: 'studio',
    to: '/studio-artikel',
    labelKey: 'menu_studio_label',
    descriptionKey: 'menu_studio_description',
    iconKey: 'menu_studio_icon',
    defaultLabel: 'Studio Artikel',
    defaultDescription: 'Artikel dan publikasi pilihan.',
    defaultIcon: 'studio-artikel-icon.svg'
  }
]

export const resolveLandingCardIcon = (value, fallbackValue) => {
  const selectedValue = LANDING_CARD_ICON_PATHS[value] ? value : fallbackValue
  return LANDING_CARD_ICON_PATHS[selectedValue] || ''
}

export const LANDING_CONTENT_GROUPS = [
  {
    title: 'Background & Identitas',
    description: 'Atur gambar utama, posisi fokus, brand, logo, dan tombol header.',
    fields: [
      {
        key: 'landing_background_url',
        label: 'Gambar Background Landing',
        type: 'background',
        defaultValue: LANDING_BACKGROUND_DEFAULT
      },
      {
        key: 'landing_background_position',
        label: 'Posisi Fokus Background',
        type: 'select',
        options: [
          { value: 'center center', label: 'Tengah' },
          { value: 'center top', label: 'Atas' },
          { value: 'center bottom', label: 'Bawah' },
          { value: 'left center', label: 'Kiri' },
          { value: 'right center', label: 'Kanan' }
        ],
        defaultValue: 'center center'
      },
      { key: 'brand_name', label: 'Nama Brand', type: 'text', defaultValue: 'GreenroomID' },
      {
        key: 'brand_workspace_label',
        label: 'Label Kecil di Bawah Brand',
        type: 'text',
        defaultValue: 'Digital workspace'
      },
      {
        key: 'brand_tagline',
        label: 'Tagline / Eyebrow Beranda',
        type: 'text',
        defaultValue: 'Tugas digital, akademik, dan kreatif.'
      },
      { key: 'logo_url', label: 'URL Logo Header', type: 'text', defaultValue: '/favicon.svg' },
      { key: 'dashboard_button', label: 'Teks Tombol Dashboard', type: 'text', defaultValue: 'Dashboard' },
      { key: 'login_button', label: 'Teks Tombol Login', type: 'text', defaultValue: 'Login' }
    ]
  },
  {
    title: 'Navigasi Header',
    description: 'Label ini juga menjadi tombol perpindahan scene pada desktop dan mobile.',
    fields: [
      { key: 'nav_home_label', label: 'Menu Scene 1', type: 'text', defaultValue: 'Beranda' },
      { key: 'nav_services_label', label: 'Menu Scene 2', type: 'text', defaultValue: 'Layanan' },
      { key: 'nav_workspace_label', label: 'Menu Scene 3', type: 'text', defaultValue: 'Ruang & alat' },
      { key: 'nav_activity_label', label: 'Menu Scene 4', type: 'text', defaultValue: 'Aktivitas' }
    ]
  },
  {
    title: 'Scene 1 — Beranda',
    description: 'Konten pembuka yang pertama kali terlihat sebelum pengguna scroll.',
    fields: [
      {
        key: 'home_title_line_1',
        label: 'Judul Baris 1',
        type: 'text',
        defaultValue: 'Tugas digital.'
      },
      {
        key: 'home_title_line_2',
        label: 'Judul Baris 2',
        type: 'text',
        defaultValue: 'Selesai lebih tenang.'
      },
      {
        key: 'header_description',
        label: 'Deskripsi Beranda',
        type: 'textarea',
        defaultValue:
          'GreenroomID membantu kebutuhan tugas digital dengan harga murah, alur rapi, free revisi, dan pilihan layanan yang bisa dicek langsung di website.'
      },
      { key: 'trust_point_1', label: 'Keunggulan 1', type: 'text', defaultValue: 'Harga transparan' },
      { key: 'trust_point_2', label: 'Keunggulan 2', type: 'text', defaultValue: 'Free revisi' },
      { key: 'trust_point_3', label: 'Keunggulan 3', type: 'text', defaultValue: 'Progress terpantau' }
    ]
  },
    {
    title: 'Scene 2 — Layanan',
    description: 'Judul scene dan tiga kategori utama pada Scene Layanan.',
    fields: [
      {
        key: 'services_eyebrow',
        label: 'Eyebrow Scene',
        type: 'text',
        defaultValue: 'Pilih sesuai kebutuhanmu'
      },
      {
        key: 'services_title_line_1',
        label: 'Judul Baris 1',
        type: 'text',
        defaultValue: 'Satu pintu.'
      },
      {
        key: 'services_title_line_2',
        label: 'Judul Baris 2',
        type: 'text',
        defaultValue: 'Berbagai pekerjaan digital.'
      },
      {
        key: 'menu_services_label',
        label: 'Nama Layanan',
        type: 'text',
        defaultValue: 'Layanan'
      },
      {
        key: 'menu_services_description',
        label: 'Deskripsi Layanan',
        type: 'text',
        defaultValue: 'Bantuan untuk kebutuhan Anda.'
      },
      {
        key: 'menu_services_icon',
        label: 'Icon Layanan',
        type: 'select',
        options: LANDING_CARD_ICON_OPTIONS,
        helper: 'Icon tersimpan ke database melalui Simpan Konten.',
        defaultValue: 'layanan-icon.svg'
      },
      {
        key: 'menu_free_label',
        label: 'Nama Tools Gratis',
        type: 'text',
        defaultValue: 'Tools Gratis'
      },
      {
        key: 'menu_free_description',
        label: 'Deskripsi Tools Gratis',
        type: 'text',
        defaultValue: 'Alat praktis yang langsung digunakan.'
      },
      {
        key: 'menu_free_icon',
        label: 'Icon Tools Gratis',
        type: 'select',
        options: LANDING_CARD_ICON_OPTIONS,
        helper: 'Icon tersimpan ke database melalui Simpan Konten.',
        defaultValue: 'tools-gratis-icon.svg'
      },
      {
        key: 'menu_learning_label',
        label: 'Nama Ruang Belajar',
        type: 'text',
        defaultValue: 'Ruang Belajar'
      },
      {
        key: 'menu_learning_description',
        label: 'Deskripsi Ruang Belajar',
        type: 'text',
        defaultValue: 'Panduan dan materi untuk dipelajari.'
      },
      {
        key: 'menu_learning_icon',
        label: 'Icon Ruang Belajar',
        type: 'select',
        options: LANDING_CARD_ICON_OPTIONS,
        helper: 'Icon tersimpan ke database melalui Simpan Konten.',
        defaultValue: 'ruang-belajar-icon.svg'
      }
    ]
  },
  {
    title: 'Scene 3 — Ruang & Alat',
    description: 'Konten pengantar dan dua kategori pada Scene Ruang & Alat.',
    fields: [
      {
        key: 'workspace_eyebrow',
        label: 'Eyebrow Scene',
        type: 'text',
        defaultValue: 'Lebih dari tempat memesan'
      },
      {
        key: 'workspace_title_line_1',
        label: 'Judul Baris 1',
        type: 'text',
        defaultValue: 'Belajar dan bekerja.'
      },
      {
        key: 'workspace_title_line_2',
        label: 'Judul Baris 2',
        type: 'text',
        defaultValue: 'Lebih rapi, lebih ringan.'
      },
      {
        key: 'workspace_description',
        label: 'Deskripsi Scene',
        type: 'textarea',
        defaultValue:
          'Buka Studio Artikel dan AI Tools melalui ruang yang terpisah sesuai kebutuhan.'
      },
      {
        key: 'menu_studio_label',
        label: 'Nama Studio Artikel',
        type: 'text',
        defaultValue: 'Studio Artikel'
      },
      {
        key: 'menu_studio_description',
        label: 'Deskripsi Studio Artikel',
        type: 'text',
        defaultValue: 'Artikel dan publikasi pilihan.'
      },
      {
        key: 'menu_studio_icon',
        label: 'Icon Studio Artikel',
        type: 'select',
        options: LANDING_CARD_ICON_OPTIONS,
        helper: 'Icon tersimpan ke database melalui Simpan Konten.',
        defaultValue: 'studio-artikel-icon.svg'
      },
      {
        key: 'menu_ai_tools_label',
        label: 'Nama AI Tools',
        type: 'text',
        defaultValue: 'AI Tools'
      },
      {
        key: 'menu_ai_tools_description',
        label: 'Deskripsi AI Tools',
        type: 'text',
        defaultValue: 'Bekerja lebih cepat dengan bantuan AI.'
      },
      {
        key: 'menu_ai_tools_icon',
        label: 'Icon AI Tools',
        type: 'select',
        options: LANDING_CARD_ICON_OPTIONS,
        helper: 'Icon tersimpan ke database melalui Simpan Konten.',
        defaultValue: 'ai-tools-icon.svg'
      },
      {
        key: 'free_usage_template',
        label: 'Teks Penggunaan Gratis',
        type: 'text',
        helper: 'Gunakan {count} untuk menampilkan jumlah penggunaan.',
        defaultValue: '{count} penggunaan tercatat'
      }
    ]
  },

  {
    title: 'Scene 4 — Aktivitas',
    description: 'Judul statistik, label angka, dan pintasan menu tambahan.',
    fields: [
      {
        key: 'stats_title',
        label: 'Eyebrow Statistik',
        type: 'text',
        defaultValue: 'Ringkasan GreenroomID'
      },
      {
        key: 'activity_title_line_1',
        label: 'Judul Baris 1',
        type: 'text',
        defaultValue: 'Aktivitas nyata.'
      },
      {
        key: 'activity_title_line_2',
        label: 'Judul Baris 2',
        type: 'text',
        defaultValue: 'Tanpa tampilan berlebihan.'
      },
      {
        key: 'stats_subtitle',
        label: 'Deskripsi Statistik',
        type: 'text',
        defaultValue: 'Data singkat aktivitas website.'
      },
      { key: 'stats_total_views', label: 'Label Total Kunjungan', type: 'text', defaultValue: 'Kunjungan' },
      { key: 'stats_total_requests', label: 'Label Total Request', type: 'text', defaultValue: 'Request' },
      { key: 'stats_completed_requests', label: 'Label Request Selesai', type: 'text', defaultValue: 'Selesai' },
      { key: 'stats_active_services', label: 'Label Layanan Aktif', type: 'text', defaultValue: 'Layanan' },
      {
        key: 'stats_free_services_usage',
        label: 'Label Penggunaan Gratis',
        type: 'text',
        defaultValue: 'Penggunaan Gratis'
      },
      { key: 'menu_donate_label', label: 'Nama Donate Us', type: 'text', defaultValue: 'Donate Us' },
      {
        key: 'menu_donate_description',
        label: 'Deskripsi Donate Us',
        type: 'text',
        defaultValue: 'Dukung pengembangan GreenroomID.'
      },
      { key: 'menu_top_donatur_label', label: 'Nama Top Donatur', type: 'text', defaultValue: 'Top Donatur' },
      {
        key: 'menu_top_donatur_description',
        label: 'Deskripsi Top Donatur',
        type: 'text',
        defaultValue: 'Daftar pendukung terbaik.'
      },
      {
        key: 'menu_feedback_label',
        label: 'Nama Kritik dan Saran',
        type: 'text',
        defaultValue: 'Kritik dan Saran'
      },
      {
        key: 'menu_feedback_description',
        label: 'Deskripsi Kritik dan Saran',
        type: 'text',
        defaultValue: 'Kirim masukan untuk perbaikan website.'
      }
    ]
  },
  {
    title: 'Tombol Tetap',
    description: 'Tombol ini tetap tersedia ketika scene berganti.',
    fields: [
      {
        key: 'primary_action_label',
        label: 'Tombol Utama Layanan',
        type: 'text',
        defaultValue: 'Lihat layanan'
      },
      {
        key: 'bottom_cta_button',
        label: 'Tombol Login CTA',
        type: 'text',
        defaultValue: 'Login dengan Google'
      }
    ]
  }
]

export const DEFAULT_LANDING_CONTENT = LANDING_CONTENT_GROUPS.reduce((acc, group) => {
  group.fields.forEach((field) => {
    acc[field.key] = field.defaultValue
  })
  return acc
}, {})

export const LANDING_CONTENT_FIELDS = LANDING_CONTENT_GROUPS.flatMap((group, groupIndex) =>
  group.fields.map((field, fieldIndex) => ({
    ...field,
    groupTitle: group.title,
    sortOrder: groupIndex * 100 + fieldIndex
  }))
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
