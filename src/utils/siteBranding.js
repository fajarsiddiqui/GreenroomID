import { setSiteHeadMeta } from './headMeta'

export const SITE_BRANDING_FIELDS = [
  {
    key: 'site_name',
    label: 'Nama Situs',
    type: 'text',
    defaultValue: 'GreenroomID'
  },
  {
    key: 'site_title',
    label: 'Judul Google / Browser',
    type: 'text',
    defaultValue: 'GreenroomID - Bantuan Tugas Digital'
  },
  {
    key: 'site_description',
    label: 'Deskripsi Google',
    type: 'textarea',
    defaultValue:
      'GreenroomID membantu kebutuhan tugas digital anda seperti dokumen, presentasi, penulisan, desain, dan materi online dengan harga terjangkau, free revisi, dan proses yang mudah.'
  },
  {
    key: 'site_canonical_url',
    label: 'Domain Utama / Canonical URL',
    type: 'text',
    defaultValue: 'https://www.greenroomid.com'
  },
  {
    key: 'site_logo_url',
    label: 'URL Logo Website / Header Landing',
    type: 'text',
    defaultValue: ''
  },
  {
    key: 'site_favicon_url',
    label: 'URL Favicon / Ikon Pencarian Google',
    type: 'text',
    defaultValue: '/favicon.svg'
  },
  {
    key: 'site_og_image_url',
    label: 'URL Gambar Preview Share',
    type: 'text',
    defaultValue: ''
  }
]

export const DEFAULT_SITE_BRANDING = SITE_BRANDING_FIELDS.reduce((acc, field) => {
  acc[field.key] = field.defaultValue
  return acc
}, {})

export const mergeSiteBrandingRows = (rows = []) => {
  const nextBranding = { ...DEFAULT_SITE_BRANDING }

  rows.forEach((row) => {
    if (row?.content_key && row.content_value !== null && row.content_value !== undefined) {
      nextBranding[row.content_key] = row.content_value
    }
  })

  return nextBranding
}

export const SITE_BRANDING_KEYS = SITE_BRANDING_FIELDS.map((field) => field.key)

const upsertLink = (selector, attributes) => {
  let element = document.head.querySelector(selector)

  if (!element) {
    element = document.createElement('link')
    document.head.appendChild(element)
  }

  Object.entries(attributes).forEach(([key, value]) => {
    if (value === null || value === undefined || value === '') {
      element.removeAttribute(key)
    } else {
      element.setAttribute(key, value)
    }
  })
}

const getValidRootUrl = (url) => {
  const fallback = new URL(DEFAULT_SITE_BRANDING.site_canonical_url).origin

  try {
    const parsed = new URL(String(url || '').trim())
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return fallback
    return parsed.origin
  } catch {
    return fallback
  }
}

const toAbsoluteUrl = (url, rootUrl) => {
  const value = String(url || '').trim()
  if (!value) return ''

  try {
    const parsed = new URL(value, `${rootUrl}/`)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return ''
    return parsed.href
  } catch {
    return ''
  }
}

export const applySiteBrandingToHead = (branding = DEFAULT_SITE_BRANDING) => {
  if (typeof document === 'undefined') return

  const siteName = branding.site_name || DEFAULT_SITE_BRANDING.site_name
  const title = branding.site_title || DEFAULT_SITE_BRANDING.site_title
  const description = branding.site_description || DEFAULT_SITE_BRANDING.site_description
  const rootUrl = getValidRootUrl(branding.site_canonical_url)
  const canonicalUrl = rootUrl
  const faviconUrl = branding.site_favicon_url || DEFAULT_SITE_BRANDING.site_favicon_url
  const ogImageUrl = branding.site_og_image_url || ''

  setSiteHeadMeta({
    title,
    description,
    canonicalUrl,
    robots: 'index, follow',
    ogSiteName: siteName,
    ogTitle: title,
    ogDescription: description,
    ogUrl: canonicalUrl,
    ogType: 'website',
    ogImage: ogImageUrl,
    twitterCard: ogImageUrl ? 'summary_large_image' : 'summary',
    twitterTitle: title,
    twitterDescription: description,
    twitterImage: ogImageUrl
  })

  upsertLink('link[rel="icon"]', { rel: 'icon', href: faviconUrl })
  upsertLink('link[rel="shortcut icon"]', { rel: 'shortcut icon', href: faviconUrl })

  let schema = document.head.querySelector('#greenroomid-website-schema')
  if (!schema) {
    schema = document.createElement('script')
    schema.id = 'greenroomid-website-schema'
    schema.type = 'application/ld+json'
    document.head.appendChild(schema)
  }

  const organizationId = `${rootUrl}/#organization`
  const websiteId = `${rootUrl}/#website`
  const logoUrl = toAbsoluteUrl(branding.site_logo_url || faviconUrl, rootUrl)
  const imageUrl = toAbsoluteUrl(ogImageUrl, rootUrl)

  const organization = {
    '@id': organizationId,
    '@type': 'Organization',
    name: siteName,
    url: rootUrl,
    description
  }

  if (logoUrl) organization.logo = logoUrl
  if (imageUrl) organization.image = imageUrl

  schema.textContent = JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      organization,
      {
        '@id': websiteId,
        '@type': 'WebSite',
        name: siteName,
        alternateName: siteName === 'GreenroomID' ? 'Greenroom ID' : 'GreenroomID',
        url: rootUrl,
        publisher: {
          '@id': organizationId
        }
      }
    ]
  })
}
