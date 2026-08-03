import { REQUEST_FILES_BUCKET, REQUEST_FILE_SIGNED_URL_EXPIRES_IN } from './requestFileAccess'

const ADMIN_QRIS_PREFIX = 'admin-qris/'
const INVALID_ENCODED_PATH_PATTERN = /%00|%2e|%2f|%5c/i
const QRIS_LOAD_ERROR = 'QRIS belum dapat dimuat. Silakan gunakan metode transfer bank atau muat ulang halaman.'

function normalizeAdminQrisPath(value) {
  const path = String(value || '').trim()
  if (!path) return ''
  if (!path.startsWith(ADMIN_QRIS_PREFIX)) return ''
  if (path.includes('\0') || path.includes('\\') || path.includes('..')) return ''
  if (INVALID_ENCODED_PATH_PATTERN.test(path)) return ''

  const segments = path.split('/')
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) return ''

  return segments.join('/')
}

export function getAdminQrisStoragePath(value) {
  return normalizeAdminQrisPath(value)
}

export async function createAdminQrisSignedUrl(supabase, qrisStoragePath) {
  const storagePath = normalizeAdminQrisPath(qrisStoragePath)
  if (!storagePath) {
    return { url: '', error: QRIS_LOAD_ERROR }
  }

  const { data, error } = await supabase.storage
    .from(REQUEST_FILES_BUCKET)
    .createSignedUrl(storagePath, REQUEST_FILE_SIGNED_URL_EXPIRES_IN)

  if (error || !data?.signedUrl) {
    return { url: '', error: QRIS_LOAD_ERROR }
  }

  return { url: data.signedUrl, error: '' }
}
