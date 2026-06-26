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
    defaultValue: 'GreenroomID - Platform Freelance Terkelola'
  },
  {
    key: 'site_description',
    label: 'Deskripsi Google',
    type: 'textarea',
    defaultValue:
      'GreenroomID adalah platform freelance terkelola untuk submit request desain, video, penulisan, programming, diskusi, invoice, pembayaran, dan pengiriman hasil kerja.'
  },
  {
    key: 'site_canonical_url',
    label: 'Domain Utama / Canonical URL',
    type: 'text',
    defaultValue: 'https://www.greenroomid.com'
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

const upsertMeta = (selector, attributes) => {
  let element = document.head.querySelector(selector)

  if (!element) {
    element = document.createElement('meta')
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

export const applySiteBrandingToHead = (branding = DEFAULT_SITE_BRANDING) => {
  if (typeof document === 'undefined') return

  const siteName = branding.site_name || DEFAULT_SITE_BRANDING.site_name
  const title = branding.site_title || DEFAULT_SITE_BRANDING.site_title
  const description = branding.site_description || DEFAULT_SITE_BRANDING.site_description
  const canonicalUrl = branding.site_canonical_url || DEFAULT_SITE_BRANDING.site_canonical_url
  const faviconUrl = branding.site_favicon_url || DEFAULT_SITE_BRANDING.site_favicon_url
  const ogImageUrl = branding.site_og_image_url || ''

  document.title = title

  upsertMeta('meta[name="description"]', { name: 'description', content: description })
  upsertMeta('meta[property="og:site_name"]', { property: 'og:site_name', content: siteName })
  upsertMeta('meta[property="og:title"]', { property: 'og:title', content: title })
  upsertMeta('meta[property="og:description"]', { property: 'og:description', content: description })
  upsertMeta('meta[property="og:url"]', { property: 'og:url', content: canonicalUrl })
  upsertMeta('meta[property="og:type"]', { property: 'og:type', content: 'website' })
  upsertMeta('meta[name="twitter:card"]', { name: 'twitter:card', content: ogImageUrl ? 'summary_large_image' : 'summary' })
  upsertMeta('meta[name="twitter:title"]', { name: 'twitter:title', content: title })
  upsertMeta('meta[name="twitter:description"]', { name: 'twitter:description', content: description })

  if (ogImageUrl) {
    upsertMeta('meta[property="og:image"]', { property: 'og:image', content: ogImageUrl })
    upsertMeta('meta[name="twitter:image"]', { name: 'twitter:image', content: ogImageUrl })
  }

  upsertLink('link[rel="canonical"]', { rel: 'canonical', href: canonicalUrl })
  upsertLink('link[rel="icon"]', { rel: 'icon', href: faviconUrl })
  upsertLink('link[rel="shortcut icon"]', { rel: 'shortcut icon', href: faviconUrl })

  let schema = document.head.querySelector('#greenroomid-website-schema')
  if (!schema) {
    schema = document.createElement('script')
    schema.id = 'greenroomid-website-schema'
    schema.type = 'application/ld+json'
    document.head.appendChild(schema)
  }

  schema.textContent = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: siteName,
    alternateName: siteName === 'GreenroomID' ? 'Greenroom ID' : 'GreenroomID',
    url: canonicalUrl
  })
}
