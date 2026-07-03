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

export const applyLearningPageMeta = ({ title, description, canonicalUrl, entry, source }) => {
  if (typeof document === 'undefined') return () => {}

  const oldTitle = document.title
  const oldDescription = document.head.querySelector('meta[name="description"]')?.getAttribute('content') || ''
  const oldCanonical = document.head.querySelector('link[rel="canonical"]')?.getAttribute('href') || ''
  const oldOgTitle = document.head.querySelector('meta[property="og:title"]')?.getAttribute('content') || ''
  const oldOgDescription = document.head.querySelector('meta[property="og:description"]')?.getAttribute('content') || ''
  const oldOgUrl = document.head.querySelector('meta[property="og:url"]')?.getAttribute('content') || ''

  document.title = title
  upsertMeta('meta[name="description"]', { name: 'description', content: description })
  upsertMeta('meta[property="og:title"]', { property: 'og:title', content: title })
  upsertMeta('meta[property="og:description"]', { property: 'og:description', content: description })
  upsertMeta('meta[property="og:url"]', { property: 'og:url', content: canonicalUrl })
  upsertMeta('meta[property="og:type"]', { property: 'og:type', content: 'article' })
  upsertLink('link[rel="canonical"]', { rel: 'canonical', href: canonicalUrl })

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
    document.title = oldTitle
    upsertMeta('meta[name="description"]', { name: 'description', content: oldDescription })
    upsertMeta('meta[property="og:title"]', { property: 'og:title', content: oldOgTitle })
    upsertMeta('meta[property="og:description"]', { property: 'og:description', content: oldOgDescription })
    upsertMeta('meta[property="og:url"]', { property: 'og:url', content: oldOgUrl })
    upsertMeta('meta[property="og:type"]', { property: 'og:type', content: 'website' })
    upsertLink('link[rel="canonical"]', { rel: 'canonical', href: oldCanonical })
    schema?.remove()
  }
}
