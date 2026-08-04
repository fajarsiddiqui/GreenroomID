export const MATERIAL_STATUS = {
  draft: { label: 'Draft', className: 'bg-gray-100 text-gray-700 border-gray-200' },
  published: { label: 'Published', className: 'bg-green-50 text-green-700 border-green-100' },
  archived: { label: 'Archived', className: 'bg-amber-50 text-amber-700 border-amber-100' }
}

import { supabase } from '../supabase'

export const MATERIAL_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export const slugifyMaterialTitle = (value = '') => {
  const slug = String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')

  return slug
}

export const isValidMaterialSlug = (value = '') => MATERIAL_SLUG_PATTERN.test(String(value || '').trim())

export const getMaterialStatus = (status) => MATERIAL_STATUS[status] || MATERIAL_STATUS.draft

export const formatMaterialDate = (value) => {
  if (!value) return '-'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'

  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date)
}

export const formatMaterialPublicDate = (value) => {
  if (!value) return '-'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'

  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).format(date)
}

export const validateMaterialDraft = ({ title, slug, category }) => {
  if (String(title || '').trim().length < 3) return 'Judul materi minimal 3 karakter.'
  if (!isValidMaterialSlug(slug)) return 'Slug hanya boleh huruf kecil, angka, dan tanda hubung. Tidak boleh diawali atau diakhiri tanda hubung.'
  if (!String(category || '').trim()) return 'Kategori wajib diisi.'
  return ''
}

export const validateMaterialPublish = ({ title, slug, excerpt, content_markdown, category }) => {
  if (!String(title || '').trim()) return 'Judul wajib diisi sebelum materi dipublikasikan.'
  if (!isValidMaterialSlug(slug)) return 'Slug hanya boleh huruf kecil, angka, dan tanda hubung. Tidak boleh diawali atau diakhiri tanda hubung.'
  if (!String(excerpt || '').trim()) return 'Ringkasan wajib diisi sebelum materi dipublikasikan.'
  if (!String(content_markdown || '').trim()) return 'Isi materi wajib diisi sebelum materi dipublikasikan.'
  if (!String(category || '').trim()) return 'Kategori wajib diisi sebelum materi dipublikasikan.'
  return ''
}

const DEPLOY_ACTIONS = ['publish', 'update_published', 'archive', 'retry']

const DEPLOY_STATUS_LABELS = {
  pending: 'Menyiapkan deployment',
  triggered: 'Deployment telah diminta',
  failed_to_trigger: 'Gagal meminta deployment'
}

const getDeployErrorMessage = (error, status) => {
  const safeMessage = String(error?.message || '').replace(/\b(JWT|token|authorization|Auth|Vercel|hook|Supabase)\b/gi, '').trim()

  switch (status) {
    case 401:
      return 'Sesi admin perlu diperbarui. Silakan login ulang.'
    case 403:
      return 'Anda tidak memiliki akses admin untuk melakukan deployment.'
    case 409:
      return 'Status materi sudah berubah. Segarkan daftar dan coba lagi.'
    case 429:
      return safeMessage || 'Terlalu banyak permintaan. Silakan tunggu sebelum mencoba lagi.'
    case 502:
      return safeMessage || 'Deployment belum dapat diminta. Silakan coba lagi.'
    default:
      return safeMessage || 'Deployment belum dapat diminta. Silakan coba lagi.'
  }
}

export const getDeployStatusLabel = (status) => {
  if (!status) return 'Belum ada permintaan deploy'
  return DEPLOY_STATUS_LABELS[status] || 'Belum ada permintaan deploy'
}

export const triggerLearningMaterialDeploy = async (materialId, action) => {
  if (!materialId || !String(materialId).trim()) {
    return { success: false, error: 'materialId tidak boleh kosong.' }
  }

  if (!DEPLOY_ACTIONS.includes(action)) {
    return { success: false, error: 'Action deploy tidak valid.' }
  }

  const response = await supabase.functions.invoke('trigger-content-deploy', {
    body: {
      materialId,
      action
    }
  })

  if (response.error) {
    const errorMessage = getDeployErrorMessage(response.error, response.status)
    return {
      success: false,
      error: errorMessage,
      status: response.status,
      data: response.data ?? null
    }
  }

  return {
    success: true,
    data: response.data ?? null,
    status: response.status,
    message: response.data?.message || null
  }
}
