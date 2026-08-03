import { Fragment } from 'react'

const INLINE_TOKEN_PATTERN = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g
const blockSpacing = 'my-3'

function getSafeLinkTarget(rawHref = '') {
  const href = String(rawHref || '').trim()
  if (!href) return ''
  if (href.startsWith('/')) return href

  try {
    const parsed = new URL(href)
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:' || parsed.protocol === 'mailto:') return href
  } catch {
    return ''
  }

  return ''
}

function renderInline(text, keyPrefix) {
  const parts = String(text || '').split(INLINE_TOKEN_PATTERN).filter((part) => part !== '')

  return parts.map((part, index) => {
    const key = `${keyPrefix}-${index}`

    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={key}>{renderInline(part.slice(2, -2), `${key}-strong`)}</strong>
    }

    if (part.startsWith('*') && part.endsWith('*')) {
      return <em key={key}>{renderInline(part.slice(1, -1), `${key}-em`)}</em>
    }

    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={key} className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[0.95em] text-slate-800">{part.slice(1, -1)}</code>
    }

    const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
    if (linkMatch) {
      const href = getSafeLinkTarget(linkMatch[2])
      if (!href) return <Fragment key={key}>{linkMatch[1]}</Fragment>

      const isExternal = !href.startsWith('/')
      return (
        <a
          key={key}
          href={href}
          target={isExternal ? '_blank' : undefined}
          rel={isExternal ? 'noreferrer noopener' : undefined}
          className="font-semibold text-green-700 underline decoration-green-200 underline-offset-2 transition hover:text-green-900 hover:decoration-green-600"
        >
          {renderInline(linkMatch[1], `${key}-link`)}
        </a>
      )
    }

    return <Fragment key={key}>{part}</Fragment>
  })
}

function flushParagraph(lines, blocks) {
  if (!lines.length) return
  blocks.push({ type: 'paragraph', text: lines.join(' ') })
  lines.length = 0
}

function parseMarkdown(markdown = '') {
  const blocks = []
  const paragraphLines = []
  const lines = String(markdown || '').replace(/\r\n?/g, '\n').split('\n')
  let activeList = null

  const closeList = () => {
    if (activeList) {
      blocks.push(activeList)
      activeList = null
    }
  }

  lines.forEach((line) => {
    const trimmed = line.trim()

    if (!trimmed) {
      flushParagraph(paragraphLines, blocks)
      closeList()
      return
    }

    const unorderedMatch = trimmed.match(/^[-*+]\s+(.+)$/)
    const orderedMatch = trimmed.match(/^\d+[.)]\s+(.+)$/)
    if (unorderedMatch || orderedMatch) {
      flushParagraph(paragraphLines, blocks)
      const type = unorderedMatch ? 'ul' : 'ol'
      if (!activeList || activeList.type !== type) {
        closeList()
        activeList = { type, items: [] }
      }
      activeList.items.push(unorderedMatch?.[1] || orderedMatch?.[1] || '')
      return
    }

    closeList()

    if (/^---+$/.test(trimmed) || /^\*\*\*+$/.test(trimmed) || /^___+$/.test(trimmed)) {
      flushParagraph(paragraphLines, blocks)
      blocks.push({ type: 'hr' })
      return
    }

    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/)
    if (headingMatch) {
      flushParagraph(paragraphLines, blocks)
      const level = headingMatch[1].length <= 2 ? 2 : 3
      blocks.push({ type: `h${level}`, text: headingMatch[2] })
      return
    }

    const quoteMatch = trimmed.match(/^>\s?(.+)$/)
    if (quoteMatch) {
      flushParagraph(paragraphLines, blocks)
      blocks.push({ type: 'blockquote', text: quoteMatch[1] })
      return
    }

    paragraphLines.push(trimmed)
  })

  flushParagraph(paragraphLines, blocks)
  closeList()
  return blocks
}

function MarkdownContent({ markdown = '' }) {
  const blocks = parseMarkdown(markdown)

  return (
    <div className="space-y-3 text-base leading-7 text-slate-700">
      {blocks.map((block, index) => {
        if (block.type === 'h2') {
          return (
            <h2 key={index} className="pt-3 text-xl font-black leading-8 tracking-normal text-slate-950 sm:text-2xl">
              {renderInline(block.text, `h2-${index}`)}
            </h2>
          )
        }
        if (block.type === 'h3') {
          return (
            <h3 key={index} className="pt-2 text-lg font-bold leading-7 tracking-normal text-slate-900 sm:text-xl">
              {renderInline(block.text, `h3-${index}`)}
            </h3>
          )
        }
        if (block.type === 'blockquote') {
          return (
            <blockquote key={index} className="border-l-4 border-green-600 bg-green-50 px-4 py-3 text-base leading-7 text-slate-700">
              {renderInline(block.text, `quote-${index}`)}
            </blockquote>
          )
        }
        if (block.type === 'hr') return <hr key={index} className="my-5 border-slate-200" />
        if (block.type === 'ul') {
          return (
            <ul key={index} className={`${blockSpacing} list-disc space-y-1 pl-6 marker:text-green-700`}>
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex} className="pl-1 leading-7">
                  {renderInline(item, `ul-${index}-${itemIndex}`)}
                </li>
              ))}
            </ul>
          )
        }
        if (block.type === 'ol') {
          return (
            <ol key={index} className={`${blockSpacing} list-decimal space-y-1 pl-6 marker:font-semibold marker:text-green-700`}>
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex} className="pl-1 leading-7">
                  {renderInline(item, `ol-${index}-${itemIndex}`)}
                </li>
              ))}
            </ol>
          )
        }
        return <p key={index} className="text-base leading-7 text-slate-700">{renderInline(block.text, `p-${index}`)}</p>
      })}
    </div>
  )
}

export default MarkdownContent
