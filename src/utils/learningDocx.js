import JSZip from 'jszip'
import {
  LEARNING_DISCIPLINES,
  normalizeTags,
  splitTagsForForm
} from './learning.js'

export const GREENROOM_LEARNING_TEMPLATE_VERSION = 'GR-LEARNING-V1.0'

const REQUIRED_TEMPLATE_FIELDS = [
  'LEARNING_TITLE',
  'DISCIPLINE',
  'STUDIED_BY_NAME',
  'STUDIED_AT',
  'EXCERPT',
  'METHOD_TAGS',
  'ANALYSIS_TAGS',
  'SOURCE_TITLE',
  'SOURCE_AUTHORS',
  'SOURCE_YEAR',
  'SOURCE_JOURNAL',
  'SOURCE_VOLUME_ISSUE',
  'SOURCE_URL',
  'DOI_URL',
  'SUMMARY_OWN_WORDS',
  'RESEARCH_PURPOSE',
  'REPORTED_FINDINGS',
  'LEARNING_POINTS',
  'CRITICAL_NOTES',
  'RESEARCH_DESIGN',
  'PARTICIPANTS',
  'VARIABLES_FOCUS',
  'INSTRUMENTS',
  'DATA_ANALYSIS',
  'ANALYSIS_FLOW',
  'ORIGINALITY_CONFIRMATION'
]

const MAX_IMPORT_SIZE_BYTES = 5 * 1024 * 1024

const isPlaceholderValue = (value = '') => /^\{\{[A-Z0-9_]+\}\}$/i.test(String(value).trim())

const decodeXmlEntities = (value = '') => String(value)
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'")
  .replace(/&amp;/g, '&')

const normalizeImportedText = (value = '') => String(value)
  .replace(/\r/g, '')
  .replace(/[ \t]+\n/g, '\n')
  .replace(/\n{3,}/g, '\n\n')
  .trim()

const extractTextFromXml = (xml = '') => {
  const withBreaks = String(xml)
    .replace(/<w:(?:br|cr)\b[^>]*\/>/g, '\n')
    .replace(/<w:tab\b[^>]*\/>/g, '\t')

  const text = [...withBreaks.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
    .map((match) => decodeXmlEntities(match[1]))
    .join('')

  return normalizeImportedText(text)
}

const extractContentControls = (documentXml = '') => {
  const values = {}
  const controls = String(documentXml).matchAll(/<w:sdt>([\s\S]*?)<\/w:sdt>/g)

  for (const control of controls) {
    const block = control[1]
    const tagMatch = block.match(/<w:tag\b[^>]*w:val="([^"]+)"[^>]*\/>/)
    const contentMatch = block.match(/<w:sdtContent>([\s\S]*?)<\/w:sdtContent>/)

    if (!tagMatch || !contentMatch) continue

    const tag = tagMatch[1]
    const value = extractTextFromXml(contentMatch[1])
    values[tag] = isPlaceholderValue(value) ? '' : value
  }

  return values
}

const monthNumbers = {
  januari: '01',
  februari: '02',
  maret: '03',
  april: '04',
  mei: '05',
  juni: '06',
  juli: '07',
  agustus: '08',
  september: '09',
  oktober: '10',
  november: '11',
  desember: '12'
}

export const parseLearningDate = (value = '') => {
  const raw = String(value || '').trim()
  if (!raw) return ''

  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (isoMatch) return raw

  const slashMatch = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  if (slashMatch) {
    const [, day, month, year] = slashMatch
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }

  const indonesianMatch = raw
    .toLocaleLowerCase('id-ID')
    .match(/^(\d{1,2})\s+([a-z]+)\s+(\d{4})$/i)

  if (indonesianMatch) {
    const [, day, monthWord, year] = indonesianMatch
    const month = monthNumbers[monthWord]
    if (month) return `${year}-${month}-${String(day).padStart(2, '0')}`
  }

  return ''
}

const isOriginalityStatementFilled = (value = '') => {
  const normalized = String(value || '').toLocaleLowerCase('id-ID')
  if (!normalized || isPlaceholderValue(normalized)) return false

  return /saya\s+menyatakan|saya\s+memahami|setuju|orisinal|pemahaman\s+saya/.test(normalized)
}

const toTagDraft = (value, knownOptions) => {
  const tags = normalizeTags(String(value || '').split(/[\n,;]+/))
  const split = splitTagsForForm(tags, knownOptions)

  return {
    selected: split.selected,
    extra: split.extraText
  }
}

export const createLearningDraftFromImportedFields = ({
  fields,
  defaults,
  methodOptions,
  analysisOptions
}) => {
  const warnings = []
  const methodTags = toTagDraft(fields.METHOD_TAGS, methodOptions)
  const analysisTags = toTagDraft(fields.ANALYSIS_TAGS, analysisOptions)
  const parsedDate = parseLearningDate(fields.STUDIED_AT)
  const expectedDiscipline = String(fields.DISCIPLINE || '').trim()
  const validDisciplines = LEARNING_DISCIPLINES.map((item) => item.value)

  if (fields.STUDIED_AT && !parsedDate) {
    warnings.push('Tanggal dipelajari tidak dikenali. Silakan pilih ulang tanggal di form sebelum menyimpan.')
  }

  if (expectedDiscipline && !validDisciplines.includes(expectedDiscipline)) {
    warnings.push(`Kategori “${expectedDiscipline}” belum dibuka pada RB-01, sehingga form memakai kategori Pendidikan.`)
  }

  if (!fields.SOURCE_URL && fields.DOI_URL) {
    warnings.push('Link sumber resmi belum diisi. Link DOI digunakan sementara sebagai link sumber resmi.')
  }

  if (!isOriginalityStatementFilled(fields.ORIGINALITY_CONFIRMATION)) {
    warnings.push('Pernyataan keaslian belum terbaca. Centang konfirmasi di bagian akhir form sebelum menyimpan.')
  }

  return {
    draft: {
      ...defaults,
      title: fields.LEARNING_TITLE || '',
      excerpt: fields.EXCERPT || '',
      discipline: validDisciplines.includes(expectedDiscipline) ? expectedDiscipline : defaults.discipline,
      studied_by_name: fields.STUDIED_BY_NAME || defaults.studied_by_name,
      studied_at: parsedDate || defaults.studied_at,
      method_tags: methodTags.selected,
      analysis_tags: analysisTags.selected,
      extra_method_tags: methodTags.extra,
      extra_analysis_tags: analysisTags.extra,
      summary_own_words: fields.SUMMARY_OWN_WORDS || '',
      research_purpose: fields.RESEARCH_PURPOSE || '',
      research_design: fields.RESEARCH_DESIGN || '',
      participants: fields.PARTICIPANTS || '',
      variables_focus: fields.VARIABLES_FOCUS || '',
      instruments: fields.INSTRUMENTS || '',
      data_analysis: fields.DATA_ANALYSIS || '',
      analysis_flow: fields.ANALYSIS_FLOW || '',
      reported_findings: fields.REPORTED_FINDINGS || '',
      learning_points: fields.LEARNING_POINTS || '',
      critical_notes: fields.CRITICAL_NOTES || '',
      references_text: fields.REFERENCES_TEXT || '',
      status: 'draft',
      published_at: '',
      source_mode: 'new',
      existing_source_id: '',
      source_title: fields.SOURCE_TITLE || '',
      source_authors: fields.SOURCE_AUTHORS || '',
      source_year: String(fields.SOURCE_YEAR || '').replace(/[^0-9]/g, '').slice(0, 4),
      source_journal: fields.SOURCE_JOURNAL || '',
      source_volume_issue: fields.SOURCE_VOLUME_ISSUE || '',
      source_url: fields.SOURCE_URL || fields.DOI_URL || '',
      doi_url: fields.DOI_URL || '',
      confirms_original_learning: isOriginalityStatementFilled(fields.ORIGINALITY_CONFIRMATION)
    },
    warnings
  }
}

export const parseGreenroomLearningDocx = async (file) => {
  const fileName = String(file?.name || '')

  if (!file || !fileName.toLocaleLowerCase('id-ID').endsWith('.docx')) {
    throw new Error('Gunakan file .docx dari Template Hasil Pembelajaran Artikel GreenroomID.')
  }

  if (file.size > MAX_IMPORT_SIZE_BYTES) {
    throw new Error('Ukuran template Word maksimal 5 MB. Dokumen ini tidak membutuhkan gambar atau lampiran.')
  }

  const zip = await JSZip.loadAsync(file)
  const documentFile = zip.file('word/document.xml')

  if (!documentFile) {
    throw new Error('Struktur file .docx tidak dikenali. Unduh ulang template resmi GreenroomID lalu isi kembali.')
  }

  const documentXml = await documentFile.async('string')
  const footerFiles = Object.keys(zip.files).filter((name) => /^word\/footer\d+\.xml$/i.test(name))
  const footerText = (await Promise.all(footerFiles.map(async (name) => zip.file(name).async('string')))).join('\n')
  const fields = extractContentControls(documentXml)
  const matchedRequiredFields = REQUIRED_TEMPLATE_FIELDS.filter((field) => Object.prototype.hasOwnProperty.call(fields, field))
  const hasTemplateMarker = documentXml.includes(GREENROOM_LEARNING_TEMPLATE_VERSION) || footerText.includes(GREENROOM_LEARNING_TEMPLATE_VERSION)

  if (matchedRequiredFields.length < 18 || !hasTemplateMarker) {
    throw new Error('Template tidak dikenali. Gunakan file template Word resmi GreenroomID v1.0 tanpa menghapus label atau format fieldnya.')
  }

  const emptyRequiredFields = [
    'LEARNING_TITLE',
    'SOURCE_TITLE',
    'SOURCE_URL',
    'SUMMARY_OWN_WORDS'
  ].filter((field) => !fields[field])

  return {
    version: GREENROOM_LEARNING_TEMPLATE_VERSION,
    fields,
    matchedFieldCount: matchedRequiredFields.length,
    emptyRequiredFields,
    hasVersionConfirmation: String(fields.TEMPLATE_VERSION_CONFIRM || '').trim() === GREENROOM_LEARNING_TEMPLATE_VERSION
  }
}
