export const LANDING_BACKGROUND_DEFAULT = '/landing/greenroom-rain-house.webp'

export const LANDING_CARD_ICON_OPTIONS = [
  { value: 'layanan-icon.svg', label: 'Layanan', src: '/landing/layanan-icon.svg' },
  { value: 'Icon shop.svg', label: 'Shop', src: '/landing/Icon shop.svg' },
  { value: 'authenticator-icon.svg', label: 'Authenticator', src: '/landing/authenticator-icon.svg' },
  { value: 'GambarinAI-icon.svg', label: 'Gambarin AI', src: '/landing/GambarinAI-icon.svg' }
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
    id: 'shop',
    to: '/shop',
    labelKey: 'menu_shop_label',
    descriptionKey: 'menu_shop_description',
    iconKey: 'menu_shop_icon',
    defaultLabel: 'Shop',
    defaultDescription: 'Beli akun OpenAI resmi.',
    defaultIcon: 'Icon shop.svg'
  },
  {
    id: 'authenticator',
    to: '/akses-totp',
    labelKey: 'menu_authenticator_label',
    descriptionKey: 'menu_authenticator_description',
    iconKey: 'menu_authenticator_icon',
    defaultLabel: 'Authenticator',
    defaultDescription: 'Akses kode autentikasi akun Anda.',
    defaultIcon: 'authenticator-icon.svg'
  },
  {
    id: 'gambarin',
    to: '/GambarinAI',
    labelKey: 'menu_gambarin_label',
    descriptionKey: 'menu_gambarin_description',
    iconKey: 'menu_gambarin_icon',
    defaultLabel: 'Gambarin AI',
    defaultDescription: 'Buat gambar dari ide Anda.',
    defaultIcon: 'GambarinAI-icon.svg'
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
    description: 'Judul scene dan pilihan layanan utama pada Scene Layanan.',
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
        key: 'menu_authenticator_label',
        label: 'Nama Authenticator',
        type: 'text',
        defaultValue: 'Authenticator'
      },
      {
        key: 'menu_authenticator_description',
        label: 'Deskripsi Authenticator',
        type: 'text',
        defaultValue: 'Akses kode autentikasi akun Anda.'
      },
      {
        key: 'menu_authenticator_icon',
        label: 'Icon Authenticator',
        type: 'select',
        options: LANDING_CARD_ICON_OPTIONS,
        helper: 'Icon tersimpan ke database melalui Simpan Konten.',
        defaultValue: 'authenticator-icon.svg'
      },
      {
        key: 'menu_gambarin_label',
        label: 'Nama Gambarin AI',
        type: 'text',
        defaultValue: 'Gambarin AI'
      },
      {
        key: 'menu_gambarin_description',
        label: 'Deskripsi Gambarin AI',
        type: 'text',
        defaultValue: 'Buat gambar dari ide Anda.'
      },
      {
        key: 'menu_gambarin_icon',
        label: 'Icon Gambarin AI',
        type: 'select',
        options: LANDING_CARD_ICON_OPTIONS,
        defaultValue: 'GambarinAI-icon.svg'
      }
    ]
  },
  {
    title: 'Scene 4 — Aktivitas',
    description: 'Judul statistik dan label angka.',
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
