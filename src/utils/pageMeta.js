import { applyPageHeadMeta } from './headMeta'

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
