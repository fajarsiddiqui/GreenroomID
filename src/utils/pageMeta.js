import { applyPageHeadMeta } from './headMeta'

const SITE_URL = 'https://www.greenroomid.com'
const ORGANIZATION_ID = `${SITE_URL}/#organization`
const WEBSITE_ID = `${SITE_URL}/#website`

const truncateAtWord = (value = '', maxLength) => {
  const normalized = String(value).replace(/\s+/g, ' ').trim()

  if (normalized.length <= maxLength) return normalized

  const truncated = normalized.slice(0, maxLength + 1)
  const lastSpaceIndex = truncated.lastIndexOf(' ')

  if (lastSpaceIndex <= 0) return normalized.slice(0, maxLength).trim()
  return truncated.slice(0, lastSpaceIndex).trim()
}

const compactObject = (value) => Object.fromEntries(
  Object.entries(value).filter(([, entryValue]) => entryValue !== undefined && entryValue !== null && entryValue !== '')
)

export const applyPageSchema = ({ id, data }) => {
  if (typeof document === 'undefined' || !id || !data) return () => {}

  const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  let schema = document.head.querySelector(`#${id}`)
  if (!schema) {
    schema = document.createElement('script')
    schema.id = id
    schema.type = 'application/ld+json'
    document.head.appendChild(schema)
  }

  schema.dataset.pageSchemaToken = token
  schema.textContent = JSON.stringify(data)

  return () => {
    const currentSchema = document.head.querySelector(`#${id}`)
    if (currentSchema?.dataset.pageSchemaToken === token) currentSchema.remove()
  }
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

  const cleanupSchema = applyPageSchema({
    id: 'greenroomid-learning-schema',
    data: {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@id': `${canonicalUrl}#article`,
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
          '@id': 'https://www.greenroomid.com/#organization'
        },
        mainEntityOfPage: canonicalUrl,
        url: canonicalUrl,
        isBasedOn: source?.source_url || source?.doi_url || undefined
      },
      {
        '@id': `${canonicalUrl}#breadcrumb`,
        '@type': 'BreadcrumbList',
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'Beranda',
            item: 'https://www.greenroomid.com'
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: 'Ruang Belajar',
            item: 'https://www.greenroomid.com/ruang-belajar'
          },
          {
            '@type': 'ListItem',
            position: 3,
            name: entry?.title || title,
            item: canonicalUrl
          }
        ]
      }
    ]
    }
  })

  return () => {
    cleanupHeadMeta()
    cleanupSchema()
  }
}

export const applyServiceCategoryPageMeta = ({ category, items = [] }) => {
  if (typeof document === 'undefined') return () => {}

  const rawTitle = `${category.name} | Layanan GreenroomID`
  const title = truncateAtWord(rawTitle, 60)
  const rawDescription = category.description ||
    `Lihat daftar layanan ${category.name} di GreenroomID, termasuk estimasi harga, waktu pengerjaan, dan keterangan tiap paket layanan.`
  const description = truncateAtWord(rawDescription, 155)
  const canonicalUrl = `${SITE_URL}/layanan/${category.slug}`

  const cleanupHeadMeta = applyPageHeadMeta({
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

  const serviceItems = (items || []).map((service, index) => ({
    '@type': 'ListItem',
    position: index + 1,
    item: compactObject({
      '@id': `${SITE_URL}/layanan/${category.slug}/${service.slug}#service`,
      '@type': 'Service',
      name: service.name,
      description: service.short_description || service.description,
      serviceType: service.name,
      category: category.name,
      url: `${SITE_URL}/layanan/${category.slug}/${service.slug}`,
      provider: {
        '@id': ORGANIZATION_ID
      }
    })
  }))

  const cleanupSchema = applyPageSchema({
    id: 'greenroomid-service-category-schema',
    data: {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@id': `${canonicalUrl}#collection`,
          '@type': 'CollectionPage',
          name: category.name,
          description,
          url: canonicalUrl,
          isPartOf: {
            '@id': WEBSITE_ID
          },
          mainEntity: {
            '@id': `${canonicalUrl}#item-list`
          }
        },
        {
          '@id': `${canonicalUrl}#item-list`,
          '@type': 'ItemList',
          name: `Daftar layanan ${category.name}`,
          numberOfItems: serviceItems.length,
          itemListOrder: 'https://schema.org/ItemListOrderAscending',
          itemListElement: serviceItems
        },
        {
          '@id': `${canonicalUrl}#breadcrumb`,
          '@type': 'BreadcrumbList',
          itemListElement: [
            {
              '@type': 'ListItem',
              position: 1,
              name: 'Beranda',
              item: SITE_URL
            },
            {
              '@type': 'ListItem',
              position: 2,
              name: 'Layanan',
              item: `${SITE_URL}/layanan`
            },
            {
              '@type': 'ListItem',
              position: 3,
              name: category.name,
              item: canonicalUrl
            }
          ]
        }
      ]
    }
  })

  return () => {
    cleanupHeadMeta()
    cleanupSchema()
  }
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

export const applyServiceDetailPageMeta = ({ category, service }) => {
  if (typeof document === 'undefined') return () => {}

  const rawTitle = `${service.name} | ${category.name} | GreenroomID`
  const title = truncateAtWord(rawTitle, 60)
  const rawDescription = service.short_description || service.description ||
    `Lihat informasi layanan ${service.name} dari kategori ${category.name} di GreenroomID.`
  const description = truncateAtWord(rawDescription, 155)
  const canonicalUrl = `${SITE_URL}/layanan/${category.slug}/${service.slug}`

  const cleanupHeadMeta = applyPageHeadMeta({
    title,
    description,
    canonicalUrl,
    robots: 'index, follow',
    ogTitle: title,
    ogDescription: description,
    ogUrl: canonicalUrl,
    ogType: 'website',
    twitterTitle: title,
    twitterDescription: description
  })

  const cleanupSchema = applyPageSchema({
    id: 'greenroomid-service-detail-schema',
    data: {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@id': `${canonicalUrl}#webpage`,
          '@type': 'WebPage',
          name: service.name,
          description,
          url: canonicalUrl,
          isPartOf: {
            '@id': WEBSITE_ID
          },
          mainEntity: {
            '@id': `${canonicalUrl}#service`
          }
        },
        {
          '@id': `${canonicalUrl}#service`,
          '@type': 'Service',
          name: service.name,
          serviceType: service.name,
          category: category.name,
          description,
          url: canonicalUrl,
          provider: {
            '@id': ORGANIZATION_ID
          }
        },
        {
          '@id': `${canonicalUrl}#breadcrumb`,
          '@type': 'BreadcrumbList',
          itemListElement: [
            {
              '@type': 'ListItem',
              position: 1,
              name: 'Beranda',
              item: SITE_URL
            },
            {
              '@type': 'ListItem',
              position: 2,
              name: 'Layanan',
              item: `${SITE_URL}/layanan`
            },
            {
              '@type': 'ListItem',
              position: 3,
              name: category.name,
              item: `${SITE_URL}/layanan/${category.slug}`
            },
            {
              '@type': 'ListItem',
              position: 4,
              name: service.name,
              item: canonicalUrl
            }
          ]
        }
      ]
    }
  })

  return () => {
    cleanupHeadMeta()
    cleanupSchema()
  }
}

export const applyServiceDetailNotFoundMeta = ({ categorySlug, serviceSlug }) => {
  if (typeof document === 'undefined') return () => {}

  const title = 'Layanan Tidak Ditemukan | GreenroomID'
  const description = 'Layanan yang Anda cari tidak tersedia atau sedang dinonaktifkan.'
  const canonicalUrl = `${SITE_URL}/layanan/${categorySlug || ''}/${serviceSlug || ''}`

  return applyPageHeadMeta({
    title,
    description,
    canonicalUrl,
    robots: 'noindex, nofollow',
    ogTitle: title,
    ogDescription: description,
    ogUrl: canonicalUrl,
    ogType: 'website',
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
