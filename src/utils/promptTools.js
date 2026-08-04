export const PROMPT_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export const slugifyPromptTitle = (value = '') => {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export const isValidPromptSlug = (value = '') => PROMPT_SLUG_PATTERN.test(String(value || '').trim())

export const validatePromptDraft = (payload) => {
  const { title, slug, category, prompt_template, submit_button_label, result_title, copy_button_label, survey_url, survey_cta } = payload

  if (!String(title || '').trim()) return 'Judul wajib diisi.'
  if (!isValidPromptSlug(slug)) return 'Slug hanya boleh huruf kecil, angka, dan tanda hubung. Tidak boleh diawali atau diakhiri tanda hubung.'
  if (!String(category || '').trim()) return 'Kategori wajib diisi.'
  if (!String(prompt_template || '').trim()) return 'Template prompt wajib diisi.'
  if (!String(submit_button_label || '').trim()) return 'Label tombol submit wajib diisi.'
  if (!String(result_title || '').trim()) return 'Judul hasil wajib diisi.'
  if (!String(copy_button_label || '').trim()) return 'Label tombol salin wajib diisi.'

  const url = String(survey_url || '').trim()
  const cta = String(survey_cta || '').trim()
  if (url) {
    if (!/^(https?:)?\/\//i.test(url)) return 'Survey URL harus diawali dengan http:// atau https://'
    if (!cta) return 'Survey CTA wajib diisi bila Survey URL diisi.'
  }

  if (cta && !url) return 'Survey URL wajib diisi bila Survey CTA diisi.'

  return ''
}
