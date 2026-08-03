export const REQUEST_FILES_BUCKET = 'request-files'
export const REQUEST_FILE_SIGNED_URL_EXPIRES_IN = 600

const PUBLIC_STORAGE_MARKER = '/storage/v1/object/public/'

function normalizeStoragePath(path) {
  const value = String(path || '').trim()
  if (!value) return ''
  if (value.includes('\0') || value.includes('\\')) return ''

  const segments = value.split('/')
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) return ''

  return segments.join('/')
}

export function extractRequestFileStoragePath(value) {
  const rawValue = String(value || '').trim()
  if (!rawValue) return ''

  try {
    const parsedUrl = new URL(rawValue)
    const markerIndex = parsedUrl.pathname.indexOf(PUBLIC_STORAGE_MARKER)
    if (markerIndex < 0) return ''

    const objectPath = parsedUrl.pathname.slice(markerIndex + PUBLIC_STORAGE_MARKER.length)
    const [bucketName, ...pathSegments] = objectPath.split('/')
    if (bucketName !== REQUEST_FILES_BUCKET || pathSegments.length === 0) return ''

    const rawPath = pathSegments.join('/')
    if (/%00|%2e|%2f|%5c/i.test(rawPath)) return ''

    const decodedPath = decodeURIComponent(rawPath)
    return normalizeStoragePath(decodedPath)
  } catch {
    return ''
  }
}

export function getRequestFileStoragePath(file) {
  if (!file) return ''

  const explicitPath = normalizeStoragePath(file.storage_path)
  if (explicitPath) return explicitPath

  return (
    extractRequestFileStoragePath(file.file_url) ||
    extractRequestFileStoragePath(file.url) ||
    extractRequestFileStoragePath(file.hasil_url) ||
    extractRequestFileStoragePath(file.payment_proof_url)
  )
}

export async function createRequestFileSignedUrl(supabase, file, { download = false } = {}) {
  const storagePath = getRequestFileStoragePath(file)
  if (!storagePath) {
    return {
      url: '',
      error: 'Path file tidak tersedia untuk membuat akses sementara.'
    }
  }

  const options = download ? { download: true } : undefined
  const { data, error } = await supabase.storage
    .from(REQUEST_FILES_BUCKET)
    .createSignedUrl(storagePath, REQUEST_FILE_SIGNED_URL_EXPIRES_IN, options)

  if (error || !data?.signedUrl) {
    return {
      url: '',
      error: error?.message || 'Gagal membuat akses sementara file.'
    }
  }

  return { url: data.signedUrl, error: '' }
}

export async function openRequestFile(supabase, file, { download = false } = {}) {
  const { url, error } = await createRequestFileSignedUrl(supabase, file, { download })
  if (error) return { opened: false, error }

  window.open(url, '_blank', 'noopener,noreferrer')
  return { opened: true, error: '' }
}
