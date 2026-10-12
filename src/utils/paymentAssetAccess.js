import { REQUEST_FILES_BUCKET, REQUEST_FILE_SIGNED_URL_EXPIRES_IN } from './requestFileAccess'

const ADMIN_QRIS_PREFIX = 'admin-qris/'
const ADMIN_QRIS_OBJECT_PATTERN = /^admin-qris\/[A-Za-z0-9][A-Za-z0-9._-]*$/
const QRIS_LOAD_ERROR = 'QRIS belum dapat dimuat. Silakan gunakan metode transfer bank atau muat ulang halaman.'

function normalizeAdminQrisPath(value) {
  const rawPath = String(value || '')
  if (!rawPath || rawPath !== rawPath.trim()) return ''
  if (!rawPath.startsWith(ADMIN_QRIS_PREFIX)) return ''
  if (rawPath.includes('\0') || rawPath.includes('\\') || rawPath.includes('..') || rawPath.includes('%')) return ''
  if (!ADMIN_QRIS_OBJECT_PATTERN.test(rawPath)) return ''

  return rawPath
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
