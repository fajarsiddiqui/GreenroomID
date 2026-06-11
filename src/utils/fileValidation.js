export const MAX_REQUEST_FILE_SIZE_MB = 5
export const MAX_ADDITIONAL_FILE_SIZE_MB = 5
export const MAX_PAYMENT_FILE_SIZE_MB = 10
export const MAX_PREVIEW_FILE_SIZE_MB = 20
export const MAX_RESULT_FILE_SIZE_MB = 50

export const allowedRequestFileTypes = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/zip',
  'image/jpeg',
  'image/png',
  'image/webp'
]

export const allowedAdditionalFileTypes = allowedRequestFileTypes

export const allowedPaymentFileTypes = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp'
]

export const allowedPreviewFileTypes = [
  'application/pdf'
]

export const allowedResultFileTypes = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/zip',
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4'
]

export function validateFile(file, allowedTypes, maxSizeMb) {
  if (!file) {
    return { valid: true, message: '' }
  }

  const fileSizeMb = file.size / 1024 / 1024

  if (fileSizeMb > maxSizeMb) {
    return {
      valid: false,
      message: `Ukuran file "${file.name}" terlalu besar. Maksimal ${maxSizeMb} MB per file.`
    }
  }

  if (!allowedTypes.includes(file.type)) {
    return {
      valid: false,
      message: `Format file "${file.name}" tidak didukung.`
    }
  }

  return { valid: true, message: '' }
}

export function validateFiles(files, allowedTypes, maxSizeMb) {
  const fileList = Array.from(files || [])

  for (const file of fileList) {
    const validation = validateFile(file, allowedTypes, maxSizeMb)

    if (!validation.valid) {
      return validation
    }
  }

  return { valid: true, message: '' }
}
