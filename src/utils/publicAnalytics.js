const PRIVATE_EXACT_PATHS = new Set([
  '/login',
  '/dashboard',
  '/profile',
  '/ruang-belajar/saya',
  '/ruang-belajar/tulis',
  '/studio-artikel/saya',
  '/studio-artikel/tulis',
  '/__spa-fallback',
  '/__spa-fallback.html',
  '/__greenroomid-prerender-404',
])

const PRIVATE_PREFIX_PATHS = [
  '/admin',
  '/client',
  '/request',
  '/ruang-belajar/pembayaran',
  '/studio-artikel/pembayaran',
  '/f',
]

const PUBLIC_EXACT_PATHS = new Set([
  '/',
  '/cara-kerja',
  '/layanan',
  '/layanan-gratis',
  '/ruang-belajar',
  '/studio-artikel',
  '/image-to-table',
  '/layanan-gratis/image-to-table',
  '/daftar-hadir',
  '/layanan-gratis/daftar-hadir',
  '/kalkulator-aturan-angka',
  '/layanan-gratis/kalkulator-aturan-angka',
  '/donate-us',
  '/top-donatur',
  '/faq',
  '/tentang-kami',
  '/kontak',
  '/pengalaman-pelanggan',
  '/kebijakan-privasi',
  '/syarat-ketentuan',
  '/kebijakan-revisi',
  '/kritik-saran',
])

const PUBLIC_DYNAMIC_PREFIXES = [
  '/layanan',
  '/ruang-belajar',
  '/studio-artikel',
]

function isSegmentPath(pathname, prefix) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`)
}

function isPrivatePath(pathname) {
  return (
    PRIVATE_EXACT_PATHS.has(pathname)
    || PRIVATE_PREFIX_PATHS.some((prefix) => isSegmentPath(pathname, prefix))
  )
}

function isPublicPath(pathname) {
  if (PUBLIC_EXACT_PATHS.has(pathname)) {
    return true
  }

  return PUBLIC_DYNAMIC_PREFIXES.some((prefix) => {
    if (!isSegmentPath(pathname, prefix)) {
      return false
    }

    const segments = pathname.split('/').filter(Boolean)
    if (prefix === '/layanan') {
      return segments.length === 2 || segments.length === 3
    }

    if (prefix === '/ruang-belajar') {
      return segments.length === 2 || segments.length === 3
    }

    if (prefix === '/studio-artikel') {
      return segments.length === 3
    }

    return false
  })
}

export function filterPublicAnalyticsEvent(event) {
  if (!event?.url) {
    return null
  }

  let parsedUrl
  try {
    parsedUrl = new URL(event.url)
  } catch {
    return null
  }

  const pathname = parsedUrl.pathname

  if (isPrivatePath(pathname) || !isPublicPath(pathname)) {
    return null
  }

  const cleanUrl = new URL(parsedUrl.origin)
  cleanUrl.pathname = pathname

  return {
    ...event,
    url: cleanUrl.toString(),
  }
}
