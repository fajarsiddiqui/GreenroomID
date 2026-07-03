export const LEARNING_DISCIPLINES = [
  { value: 'Pendidikan', label: 'Pendidikan' }
]

export const METHOD_TAG_OPTIONS = [
  'Kuantitatif',
  'Kualitatif',
  'Mixed Method',
  'PTK',
  'Eksperimen',
  'Quasi Experiment',
  'Survei',
  'Studi Literatur',
  'Studi Kasus'
]

export const ANALYSIS_TAG_OPTIONS = [
  'Statistik Deskriptif',
  'Validitas',
  'Reliabilitas',
  'Uji Normalitas',
  'Uji Homogenitas',
  'Korelasi',
  'Regresi',
  'Independent t-test',
  'Paired t-test',
  'Mann–Whitney',
  'Wilcoxon',
  'ANOVA',
  'Kruskal–Wallis',
  'Analisis Tematik'
]

export const LEARNING_STATUS = {
  draft: { label: 'Draft', className: 'bg-gray-100 text-gray-700 border-gray-200' },
  submitted: { label: 'Menunggu Review', className: 'bg-blue-50 text-blue-700 border-blue-100' },
  under_review: { label: 'Sedang Direview', className: 'bg-indigo-50 text-indigo-700 border-indigo-100' },
  revision_requested: { label: 'Perlu Revisi', className: 'bg-amber-50 text-amber-700 border-amber-100' },
  rejected: { label: 'Belum Diterima', className: 'bg-red-50 text-red-700 border-red-100' },
  accepted_pending_payment: { label: 'Diterima · Menunggu Kontribusi', className: 'bg-violet-50 text-violet-700 border-violet-100' },
  published: { label: 'Dipublikasikan', className: 'bg-green-50 text-green-700 border-green-100' },
  withdrawn: { label: 'Ditarik', className: 'bg-gray-100 text-gray-600 border-gray-200' },
  archived: { label: 'Diarsipkan', className: 'bg-amber-50 text-amber-700 border-amber-100' }
}

export const SUBMISSION_EDITABLE_STATUSES = ['draft', 'revision_requested']

export const getLearningStatus = (status) => LEARNING_STATUS[status] || LEARNING_STATUS.draft

export const normalizeTags = (values = []) => {
  const seen = new Set()

  return values
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .filter((value) => {
      const key = value.toLocaleLowerCase('id-ID')
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
}

export const parseExtraTags = (value = '') => {
  return normalizeTags(String(value).split(/[\n,;]+/))
}

export const splitTagsForForm = (tags = [], knownTags = []) => {
  const known = new Set(knownTags.map((tag) => tag.toLocaleLowerCase('id-ID')))
  const selected = []
  const extra = []

  normalizeTags(tags).forEach((tag) => {
    if (known.has(tag.toLocaleLowerCase('id-ID'))) selected.push(tag)
    else extra.push(tag)
  })

  return {
    selected,
    extraText: extra.join(', ')
  }
}

export const slugify = (value = '') => {
  const slug = String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('id-ID')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 92)

  return slug || 'hasil-pembelajaran-artikel'
}

export const disciplineToSlug = (discipline = '') => slugify(discipline)

export const generateShortCode = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 7).toLowerCase()
  }

  return Math.random().toString(36).slice(2, 9).toLowerCase()
}

export const getLearningPath = (entry) => {
  if (!entry) return '/ruang-belajar'

  const discipline = disciplineToSlug(entry.discipline || 'pendidikan')
  const title = slugify(entry.slug || entry.title || 'hasil-pembelajaran-artikel')
  const code = String(entry.short_code || '').toLowerCase()

  return code
    ? `/ruang-belajar/${discipline}/${title}-${code}`
    : `/ruang-belajar/${discipline}/${title}`
}

export const getShortCodeFromPath = (entrySlug = '') => {
  const match = String(entrySlug).match(/-([a-z0-9]{6,12})$/i)
  return match ? match[1].toLowerCase() : ''
}

export const formatLearningDate = (value, options = {}) => {
  if (!value) return '-'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'

  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    ...options
  }).format(date)
}

export const getSourceRecord = (entry) => {
  const source = entry?.source || entry?.learning_sources || null
  return Array.isArray(source) ? source[0] || null : source
}

export const ensureUrl = (value = '') => {
  const raw = String(value || '').trim()
  if (!raw) return ''
  if (/^https?:\/\//i.test(raw)) return raw
  return `https://${raw}`
}

export const isHttpUrl = (value = '') => {
  try {
    const parsed = new URL(ensureUrl(value))
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}
