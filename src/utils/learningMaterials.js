export const MATERIAL_STATUS = {
  draft: { label: 'Draft', className: 'bg-gray-100 text-gray-700 border-gray-200' },
  published: { label: 'Published', className: 'bg-green-50 text-green-700 border-green-100' },
  archived: { label: 'Archived', className: 'bg-amber-50 text-amber-700 border-amber-100' }
}

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
