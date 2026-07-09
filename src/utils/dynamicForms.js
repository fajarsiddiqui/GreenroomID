export const FORM_REQUEST_TYPE = 'form_link_request'
export const SERVICE_REQUEST_TYPE = 'service_request'

export const FORM_STATUS_LABELS = {
  draft: 'Draft / menunggu pembayaran',
  active: 'Aktif',
  disabled: 'Dinonaktifkan',
  deleted_by_owner: 'Dihapus pemilik link'
}

export const QUESTION_TYPE_OPTIONS = [
  { value: 'short_text', label: 'Jawaban singkat' },
  { value: 'paragraph', label: 'Paragraf' },
  { value: 'number', label: 'Angka' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Nomor HP' },
  { value: 'date', label: 'Tanggal' },
  { value: 'single_choice', label: 'Pilihan ganda' },
  { value: 'dropdown', label: 'Dropdown' },
  { value: 'checkbox', label: 'Checkbox' }
]

export const CHOICE_QUESTION_TYPES = ['single_choice', 'dropdown', 'checkbox']

export const CONDITION_OPERATORS = [
  { value: 'equals', label: 'Sama dengan' },
  { value: 'not_equals', label: 'Tidak sama dengan' },
  { value: 'contains', label: 'Mengandung' },
  { value: 'not_empty', label: 'Sudah diisi' }
]

export const isFormRequest = (request) => {
  return request?.request_type === FORM_REQUEST_TYPE || String(request?.kategori || '').toLowerCase().includes('formulir')
}

export const isRequestPaymentVerified = (request) => {
  return request?.payment_status === 'VERIFIED' || request?.invoice_status === 'PAID'
}

export const normalizeSlug = (value) => {
  const base = String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70)

  return base || `form-${Date.now()}`
}

export const makeUniqueSlug = (value) => {
  return `${normalizeSlug(value)}-${Math.random().toString(36).slice(2, 7)}`
}

export const getQuestionTypeLabel = (type) => {
  return QUESTION_TYPE_OPTIONS.find((item) => item.value === type)?.label || type || '-'
}

export const getFormStatusLabel = (status) => {
  return FORM_STATUS_LABELS[status] || status || '-'
}

export const buildPublicFormUrl = (slug) => {
  if (!slug) return ''
  if (typeof window === 'undefined') return `/f/${slug}`
  return `${window.location.origin}/f/${slug}`
}

export const parseOptionsText = (text) => {
  return String(text || '')
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean)
}

export const optionsToText = (options = []) => {
  return options
    .slice()
    .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0))
    .map((item) => item.option_label || item.option_value || '')
    .filter(Boolean)
    .join('\n')
}

export const shouldShowQuestion = (question, answers) => {
  if (!question?.conditional_parent_question_id) return true

  const parentValue = answers?.[question.conditional_parent_question_id]
  const conditionValue = String(question.conditional_value || '').trim()
  const operator = question.conditional_operator || 'equals'

  if (operator === 'not_empty') {
    if (Array.isArray(parentValue)) return parentValue.length > 0
    return String(parentValue || '').trim() !== ''
  }

  if (Array.isArray(parentValue)) {
    const hasValue = parentValue.map(String).includes(conditionValue)
    if (operator === 'equals' || operator === 'contains') return hasValue
    if (operator === 'not_equals') return !hasValue
    return hasValue
  }

  const left = String(parentValue || '').trim()
  if (operator === 'equals') return left === conditionValue
  if (operator === 'not_equals') return left !== conditionValue
  if (operator === 'contains') return left.toLowerCase().includes(conditionValue.toLowerCase())
  return true
}

export const formatAnswerValue = (value) => {
  if (Array.isArray(value)) return value.join(', ')
  if (value === null || value === undefined || value === '') return '-'
  return String(value)
}

export const downloadCsv = (filename, rows) => {
  const csv = rows
    .map((row) => row.map((cell) => {
      const value = cell === null || cell === undefined ? '' : String(cell)
      return `"${value.replace(/"/g, '""')}"`
    }).join(','))
    .join('\n')

  const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
