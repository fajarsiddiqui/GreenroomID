const DEFAULT_SITE_META = {
  title: 'GreenroomID - Bantuan Tugas Digital',
  description:
    'GreenroomID membantu kebutuhan tugas digital anda seperti dokumen, presentasi, penulisan, desain, dan materi online dengan harga terjangkau, free revisi, dan proses yang mudah.',
  canonicalUrl: 'https://www.greenroomid.com',
  robots: 'index, follow',
  ogTitle: 'GreenroomID - Bantuan Tugas Digital',
  ogDescription:
    'Bantuan tugas digital untuk dokumen, presentasi, penulisan, desain, dan kebutuhan online lainnya dengan harga terjangkau dan free revisi.',
  ogUrl: 'https://www.greenroomid.com',
  ogType: 'website',
  ogSiteName: 'GreenroomID',
  ogImage: '',
  twitterCard: 'summary',
  twitterTitle: 'GreenroomID - Bantuan Tugas Digital',
  twitterDescription:
    'Bantuan tugas digital untuk dokumen, presentasi, penulisan, desain, dan kebutuhan online lainnya dengan harga terjangkau dan free revisi.',
  twitterImage: ''
}

let siteHeadMeta = { ...DEFAULT_SITE_META }
let activePageHeadMeta = null
let pageMetaToken = 0

const compactMeta = (meta = {}) => {
  const nextMeta = {}

  Object.entries(meta).forEach(([key, value]) => {
    if (value !== undefined) nextMeta[key] = value
  })

  return nextMeta
}

const upsertMeta = (selector, attributes) => {
  let element = document.head.querySelector(selector)

  if (!element) {
    element = document.createElement('meta')
    document.head.appendChild(element)
  }

  Object.entries(attributes).forEach(([key, value]) => {
    if (value === null || value === undefined || value === '') element.removeAttribute(key)
    else element.setAttribute(key, value)
  })
}

const upsertLink = (selector, attributes) => {
  let element = document.head.querySelector(selector)

  if (!element) {
    element = document.createElement('link')
    document.head.appendChild(element)
  }

  Object.entries(attributes).forEach(([key, value]) => {
    if (value === null || value === undefined || value === '') element.removeAttribute(key)
    else element.setAttribute(key, value)
  })
}

const removeHeadElement = (selector) => {
  document.head.querySelector(selector)?.remove()
}

const applyHeadMeta = (meta) => {
  if (typeof document === 'undefined') return

  const suppressCanonical = meta.suppressCanonical === true
  const suppressOgUrl = meta.suppressOgUrl === true

  const title = meta.title || siteHeadMeta.title
  const description = meta.description || siteHeadMeta.description
  const canonicalUrl = suppressCanonical
    ? null
    : meta.canonicalUrl || siteHeadMeta.canonicalUrl
  const robots = meta.robots || siteHeadMeta.robots
  const ogTitle = meta.ogTitle || title
  const ogDescription = meta.ogDescription || description
  const ogUrl = suppressOgUrl
    ? null
    : meta.ogUrl || canonicalUrl
  const ogType = meta.ogType || siteHeadMeta.ogType
  const ogSiteName = meta.ogSiteName || siteHeadMeta.ogSiteName
  const ogImage = meta.ogImage ?? siteHeadMeta.ogImage
  const twitterCard = meta.twitterCard || (ogImage ? 'summary_large_image' : siteHeadMeta.twitterCard)
  const twitterTitle = meta.twitterTitle || ogTitle
  const twitterDescription = meta.twitterDescription || ogDescription
  const twitterImage = meta.twitterImage ?? ogImage

  document.title = title
  upsertMeta('meta[name="description"]', { name: 'description', content: description })
  upsertMeta('meta[name="robots"]', { name: 'robots', content: robots })
  upsertMeta('meta[property="og:site_name"]', { property: 'og:site_name', content: ogSiteName })
  upsertMeta('meta[property="og:title"]', { property: 'og:title', content: ogTitle })
  upsertMeta('meta[property="og:description"]', { property: 'og:description', content: ogDescription })

  if (suppressOgUrl) {
    removeHeadElement('meta[property="og:url"]')
  } else {
    upsertMeta('meta[property="og:url"]', { property: 'og:url', content: ogUrl })
  }

  upsertMeta('meta[property="og:type"]', { property: 'og:type', content: ogType })
  upsertMeta('meta[property="og:image"]', { property: 'og:image', content: ogImage })
  upsertMeta('meta[name="twitter:card"]', { name: 'twitter:card', content: twitterCard })
  upsertMeta('meta[name="twitter:title"]', { name: 'twitter:title', content: twitterTitle })
  upsertMeta('meta[name="twitter:description"]', { name: 'twitter:description', content: twitterDescription })
  upsertMeta('meta[name="twitter:image"]', { name: 'twitter:image', content: twitterImage })

  if (suppressCanonical) {
    removeHeadElement('link[rel="canonical"]')
  } else {
    upsertLink('link[rel="canonical"]', { rel: 'canonical', href: canonicalUrl })
  }
}

const applyCurrentHeadMeta = () => {
  applyHeadMeta(activePageHeadMeta || siteHeadMeta)
}

export const setSiteHeadMeta = (meta = {}) => {
  siteHeadMeta = {
    ...siteHeadMeta,
    ...compactMeta(meta)
  }

  applyCurrentHeadMeta()
}

export const applyPageHeadMeta = (meta = {}) => {
  const token = pageMetaToken + 1
  pageMetaToken = token
  activePageHeadMeta = compactMeta(meta)

  applyCurrentHeadMeta()

  return () => {
    if (pageMetaToken !== token) return

    activePageHeadMeta = null
    applyCurrentHeadMeta()
  }
}
