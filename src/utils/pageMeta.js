import { applyPageHeadMeta } from './headMeta'

const SITE_URL = 'https://www.greenroomid.com'

const truncateAtWord = (value = '', maxLength) => {
  const normalized = String(value).replace(/\s+/g, ' ').trim()

  if (normalized.length <= maxLength) return normalized

  const truncated = normalized.slice(0, maxLength + 1)
  const lastSpaceIndex = truncated.lastIndexOf(' ')

  if (lastSpaceIndex <= 0) return normalized.slice(0, maxLength).trim()
  return truncated.slice(0, lastSpaceIndex).trim()
}

export const applyLearningPageMeta = ({ title, description, canonicalUrl, entry, source }) => {
  if (typeof document === 'undefined') return () => {}

  const cleanupHeadMeta = applyPageHeadMeta({
    title,
    description,
    canonicalUrl,
    ogTitle: title,
    ogDescription: description,
    ogUrl: canonicalUrl,
    ogType: 'article',
    twitterTitle: title,
    twitterDescription: description
  })

  let schema = document.head.querySelector('#greenroomid-learning-schema')
  if (!schema) {
    schema = document.createElement('script')
    schema.id = 'greenroomid-learning-schema'
    schema.type = 'application/ld+json'
    document.head.appendChild(schema)
  }

  schema.textContent = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: entry?.title || title,
    description,
    datePublished: entry?.published_at || entry?.created_at || undefined,
    dateModified: entry?.updated_at || entry?.published_at || undefined,
    author: {
      '@type': 'Person',
      name: entry?.studied_by_name || 'GreenroomID'
    },
    publisher: {
      '@type': 'Organization',
      name: 'GreenroomID'
    },
    mainEntityOfPage: canonicalUrl,
    isBasedOn: source?.source_url || source?.doi_url || undefined
  })

  return () => {
    cleanupHeadMeta()
    schema?.remove()
  }
}

export const applyServiceCategoryPageMeta = ({ category }) => {
  if (typeof document === 'undefined') return () => {}

  const rawTitle = `${category.name} | Layanan GreenroomID`
  const title = truncateAtWord(rawTitle, 60)
  const rawDescription = category.description ||
    `Lihat daftar layanan ${category.name} di GreenroomID, termasuk estimasi harga, waktu pengerjaan, dan keterangan tiap paket layanan.`
  const description = truncateAtWord(rawDescription, 155)
  const canonicalUrl = `${SITE_URL}/layanan/${category.slug}`

  return applyPageHeadMeta({
    title,
    description,
    canonicalUrl,
    robots: 'index, follow',
    ogTitle: title,
    ogDescription: description,
    ogUrl: canonicalUrl,
    twitterTitle: title,
    twitterDescription: description
  })
}

export const applyServiceCategoryNotFoundMeta = ({ slug }) => {
  if (typeof document === 'undefined') return () => {}

  const title = 'Kategori Tidak Ditemukan | GreenroomID'
  const description = 'Kategori layanan yang Anda cari tidak tersedia atau sedang dinonaktifkan.'
  const canonicalUrl = `${SITE_URL}/layanan/${slug || ''}`

  return applyPageHeadMeta({
    title,
    description,
    canonicalUrl,
    robots: 'noindex, nofollow',
    ogTitle: title,
    ogDescription: description,
    ogUrl: canonicalUrl,
    twitterTitle: title,
    twitterDescription: description
  })
}

export const applyPublicFormPageMeta = ({ form }) => {
  if (typeof document === 'undefined') return () => {}

  const rawTitle = `${form.title} | Formulir GreenroomID`
  const title = truncateAtWord(rawTitle, 60)
  const rawDescription = form.description ||
    `Isi formulir ${form.title} melalui GreenroomID dengan tampilan publik yang ringan dan mudah digunakan.`
  const description = truncateAtWord(rawDescription, 155)
  const canonicalUrl = `${SITE_URL}/f/${form.slug}`

  return applyPageHeadMeta({
    title,
    description,
    canonicalUrl,
    robots: 'noindex, nofollow',
    ogTitle: title,
    ogDescription: description,
    ogUrl: canonicalUrl,
    twitterTitle: title,
    twitterDescription: description
  })
}

export const applyPublicFormNotFoundMeta = ({ slug }) => {
  if (typeof document === 'undefined') return () => {}

  const title = 'Formulir Tidak Tersedia | GreenroomID'
  const description = 'Formulir yang Anda cari tidak ditemukan, belum aktif, atau sudah ditutup.'
  const canonicalUrl = `${SITE_URL}/f/${slug || ''}`

  return applyPageHeadMeta({
    title,
    description,
    canonicalUrl,
    robots: 'noindex, nofollow',
    ogTitle: title,
    ogDescription: description,
    ogUrl: canonicalUrl,
    twitterTitle: title,
    twitterDescription: description
  })
}
