import { createServer } from 'node:http'
import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'
import { loadEnv } from 'vite'
import { getLearningPath } from '../src/utils/learning.js'

const SITE_URL = 'https://www.greenroomid.com'
const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIST_DIR = path.join(ROOT_DIR, 'dist')
const FALLBACK_FILE = path.join(DIST_DIR, '__spa-fallback.html')
const NOT_FOUND_FILE = path.join(DIST_DIR, '404.html')
const NOT_FOUND_RENDER_PATH = '/__greenroomid-prerender-404'
const PAGE_SIZE = 1000
const MAX_PAGES = 100
const STATIC_ROUTES = [
  '/',
  '/cara-kerja',
  '/layanan',
  '/layanan-gratis',
  '/ruang-belajar',
  '/image-to-table',
  '/daftar-hadir',
  '/kalkulator-aturan-angka',
  '/donate-us',
  '/top-donatur',
  '/faq'
]
const ALIAS_ROUTES = [
  ['/layanan-gratis/image-to-table', '/image-to-table'],
  ['/layanan-gratis/daftar-hadir', '/daftar-hadir'],
  ['/layanan-gratis/kalkulator-aturan-angka', '/kalkulator-aturan-angka']
]
const FORBIDDEN_SITEMAP_PATTERNS = [
  /^\/login(?:\/|$)/,
  /^\/kritik-saran(?:\/|$)/,
  /^\/f(?:\/|$)/,
  /^\/admin(?:\/|$)/,
  /^\/dashboard(?:\/|$)/,
  /^\/profile(?:\/|$)/,
  /^\/client(?:\/|$)/,
  /^\/request(?:\/|$)/,
  /^\/ruang-belajar\/(?:saya|tulis|pembayaran)(?:\/|$)/,
  /^\/layanan-gratis\/(?:image-to-table|daftar-hadir|kalkulator-aturan-angka)$/
]

const buildEnv = loadEnv(process.env.MODE || 'production', ROOT_DIR, '')
const supabaseUrl = process.env.VITE_SUPABASE_URL || buildEnv.VITE_SUPABASE_URL
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || buildEnv.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Prerender membutuhkan VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY.')
}

const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false
  }
})

const xmlEscape = (value = '') => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;')

const toCanonical = (routePath) => `${SITE_URL}${routePath === '/' ? '' : routePath}`

const sanitizeFallbackHtml = (html) => {
  let nextHtml = html
  if (/<meta\s+name="robots"[^>]*>/i.test(nextHtml)) {
    nextHtml = nextHtml.replace(/<meta\s+name="robots"[^>]*>/i, '<meta name="robots" content="noindex, nofollow" />')
  } else {
    nextHtml = nextHtml.replace('</head>', '    <meta name="robots" content="noindex, nofollow" />\n  </head>')
  }

  return nextHtml
    .replace(/<link\s+[^>]*rel=["']canonical["'][^>]*>\s*/gi, '')
    .replace(/<meta\s+[^>]*property=["']og:url["'][^>]*>\s*/gi, '')
    .replace(/<script\s+[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>\s*/gi, '')
}

const rejectUnsafeRawPath = (value) => {
  if (typeof value !== 'string') throw new Error('Path harus berupa string.')
  if (!value.startsWith('/')) throw new Error(`Path harus diawali slash: ${value}`)
  if (value.includes('\0')) throw new Error(`Path mengandung null byte: ${value}`)
  if (/%00|%2f|%5c|%2e%2e/i.test(value)) throw new Error(`Path mengandung encoded segment tidak aman: ${value}`)
  if (value.includes('?') || value.includes('#')) throw new Error(`Path tidak boleh mengandung query/hash: ${value}`)
}

const decodeAndValidatePath = (value) => {
  rejectUnsafeRawPath(value)

  let decoded
  try {
    decoded = decodeURIComponent(value)
  } catch {
    throw new Error(`Path gagal didecode: ${value}`)
  }

  if (!decoded.startsWith('/')) throw new Error(`Decoded path harus diawali slash: ${value}`)
  if (decoded.includes('\0')) throw new Error(`Decoded path mengandung null byte: ${value}`)
  if (decoded.includes('\\')) throw new Error(`Decoded path mengandung backslash: ${value}`)
  for (const segment of decoded.split('/')) {
    if (segment === '.' || segment === '..') throw new Error(`Decoded path mengandung dot segment: ${value}`)
  }
  return decoded
}

const isValidDate = (value) => {
  if (!value) return false
  const date = new Date(value)
  return !Number.isNaN(date.getTime())
}

const latestDate = (...values) => {
  const valid = values.filter(isValidDate).map((value) => new Date(value))
  if (!valid.length) return ''
  return new Date(Math.max(...valid.map((date) => date.getTime()))).toISOString()
}

const assertSafeRoutePath = (routePath) => {
  const decoded = decodeAndValidatePath(routePath)
  const parsed = new URL(decoded, SITE_URL)
  if (parsed.pathname !== decoded) throw new Error(`Path route tidak aman: ${routePath}`)
  return decoded
}

const outputFileForPath = (routePath) => {
  const safePath = assertSafeRoutePath(routePath)
  const relative = safePath === '/' ? 'index.html' : `${safePath.slice(1)}.html`
  const outputFile = path.resolve(DIST_DIR, relative)
  const relativeToDist = path.relative(DIST_DIR, outputFile)
  if (relativeToDist.startsWith('..') || path.isAbsolute(relativeToDist)) {
    throw new Error(`Output keluar dari dist: ${routePath}`)
  }
  return outputFile
}

const route = ({ routePath, canonicalPath = routePath, kind, schemaId, includeInSitemap = true, lastmod = '' }) => {
  const safeRoutePath = assertSafeRoutePath(routePath)
  const safeCanonicalPath = assertSafeRoutePath(canonicalPath)
  return {
    path: safeRoutePath,
    canonicalUrl: toCanonical(safeCanonicalPath),
    schemaId,
    kind,
    includeInSitemap,
    lastmod: isValidDate(lastmod) ? new Date(lastmod).toISOString() : ''
  }
}

const fetchAllRows = async ({ datasetName, createQuery, pageSize = PAGE_SIZE }) => {
  const rows = []
  const seenIds = new Set()

  for (let pageIndex = 0; pageIndex < MAX_PAGES; pageIndex += 1) {
    const from = pageIndex * pageSize
    const to = from + pageSize - 1
    const { data, error } = await createQuery().range(from, to)

    if (error) throw new Error(`Gagal membaca ${datasetName}: ${error.message}`)

    const batch = data || []
    for (const row of batch) {
      if (row?.id !== undefined && row?.id !== null) {
        if (seenIds.has(row.id)) continue
        seenIds.add(row.id)
      }
      rows.push(row)
    }

    if (batch.length < pageSize) return rows
  }

  throw new Error(`Pagination ${datasetName} melewati batas aman ${MAX_PAGES} halaman.`)
}

const discoverRoutes = async () => {
  const routes = [
    ...STATIC_ROUTES.map((routePath) => route({
      routePath,
      kind: routePath === '/' ? 'homepage' : 'static',
      schemaId: routePath === '/' ? 'greenroomid-website-schema' : 'greenroomid-page-schema'
    })),
    ...ALIAS_ROUTES.map(([routePath, canonicalPath]) => route({
      routePath,
      canonicalPath,
      kind: 'alias',
      schemaId: 'greenroomid-page-schema',
      includeInSitemap: false
    }))
  ]

  const categories = await fetchAllRows({
    datasetName: 'service_categories',
    createQuery: () => supabase
      .from('service_categories')
      .select('id, slug, updated_at')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
  })

  const activeCategoryById = new Map((categories || []).map((category) => [category.id, category]))
  for (const category of categories || []) {
    routes.push(route({
      routePath: `/layanan/${category.slug}`,
      kind: 'service-category',
      schemaId: 'greenroomid-service-category-schema',
      lastmod: category.updated_at
    }))
  }

  const services = await fetchAllRows({
    datasetName: 'service_items',
    createQuery: () => supabase
      .from('service_items')
      .select('id, category_id, slug, updated_at')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
  })

  for (const service of services || []) {
    const category = activeCategoryById.get(service.category_id)
    if (!category) continue
    routes.push(route({
      routePath: `/layanan/${category.slug}/${service.slug}`,
      kind: 'service-detail',
      schemaId: 'greenroomid-service-detail-schema',
      lastmod: latestDate(category.updated_at, service.updated_at)
    }))
  }

  const entries = await fetchAllRows({
    datasetName: 'learning_entries',
    createQuery: () => supabase
      .from('learning_entries')
      .select('id, slug, title, short_code, discipline, updated_at, published_at')
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .order('id', { ascending: true })
  })

  for (const entry of entries || []) {
    routes.push(route({
      routePath: getLearningPath(entry),
      kind: 'learning-detail',
      schemaId: 'greenroomid-learning-schema',
      lastmod: latestDate(entry.updated_at, entry.published_at)
    }))
  }

  const byPath = new Map()
  const canonicalSeen = new Set()
  for (const item of routes) {
    if (byPath.has(item.path)) continue
    if (item.includeInSitemap && canonicalSeen.has(item.canonicalUrl)) continue
    if (item.includeInSitemap) canonicalSeen.add(item.canonicalUrl)
    byPath.set(item.path, item)
  }
  return [...byPath.values()]
}

const getContentType = (filePath) => {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.html') return 'text/html; charset=utf-8'
  if (ext === '.js') return 'text/javascript; charset=utf-8'
  if (ext === '.css') return 'text/css; charset=utf-8'
  if (ext === '.json') return 'application/json; charset=utf-8'
  if (ext === '.svg') return 'image/svg+xml'
  if (ext === '.png') return 'image/png'
  if (ext === '.webp') return 'image/webp'
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  if (ext === '.woff') return 'font/woff'
  if (ext === '.woff2') return 'font/woff2'
  if (ext === '.ico') return 'image/x-icon'
  if (ext === '.xml') return 'application/xml; charset=utf-8'
  return 'application/octet-stream'
}

const fileExists = async (filePath) => {
  try {
    const info = await stat(filePath)
    return info.isFile()
  } catch {
    return false
  }
}

const resolveRequestFile = async (requestPath) => {
  const rawPath = new URL(requestPath, 'http://localhost').pathname
  const decodedPath = decodeAndValidatePath(rawPath)
  const candidates = []
  if (decodedPath === '/') {
    candidates.push(path.join(DIST_DIR, 'index.html'))
  } else {
    const trimmed = decodedPath.replace(/^\/+/, '')
    candidates.push(path.join(DIST_DIR, trimmed))
    candidates.push(path.join(DIST_DIR, `${trimmed}.html`))
    candidates.push(path.join(DIST_DIR, trimmed, 'index.html'))
  }

  for (const candidate of candidates) {
    const resolved = path.resolve(candidate)
    const relative = path.relative(DIST_DIR, resolved)
    if (relative.startsWith('..') || path.isAbsolute(relative)) return ''
    if (await fileExists(resolved)) return resolved
  }
  return FALLBACK_FILE
}

const startServer = async () => new Promise((resolve, reject) => {
  const server = createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url || '/', 'http://localhost').pathname
      if (pathname.startsWith('/_vercel/')) {
        response.writeHead(204)
        response.end()
        return
      }
      const filePath = await resolveRequestFile(request.url || '/')
      if (!filePath) {
        response.writeHead(403)
        response.end('Forbidden')
        return
      }
      const body = await readFile(filePath)
      response.writeHead(200, { 'content-type': getContentType(filePath) })
      response.end(body)
    } catch {
      response.writeHead(404)
      response.end('Not found')
    }
  })
  server.once('error', reject)
  server.listen(0, '127.0.0.1', () => {
    const address = server.address()
    resolve({ server, baseUrl: `http://127.0.0.1:${address.port}` })
  })
})

const waitForRouteReady = async (page, item, hasLearningEntries) => {
  try {
    await page.waitForFunction(
      ({ expectedCanonical, schemaId, kind, hasLearningEntries: learningEntriesExist }) => {
      const canonical = document.querySelector('link[rel="canonical"]')?.href
      const title = document.title
      const description = document.querySelector('meta[name="description"]')?.content
      const robots = document.querySelector('meta[name="robots"]')?.content
      const ogTitle = document.querySelector('meta[property="og:title"]')?.content
      const ogDescription = document.querySelector('meta[property="og:description"]')?.content
      const ogUrl = document.querySelector('meta[property="og:url"]')?.content
      const rootText = document.querySelector('#root')?.textContent?.replace(/\s+/g, ' ').trim() || ''
      const loading = /Memuat|Loading/i.test(rootText)
      const schema = document.getElementById(schemaId)
      const schemaText = schema?.textContent || ''
      const schemaContainsCanonical = (value, expected) => {
        if (!value) return false
        if (typeof value === 'string') return value === expected
        if (Array.isArray(value)) return value.some((item) => schemaContainsCanonical(item, expected))
        if (typeof value === 'object') return Object.values(value).some((item) => schemaContainsCanonical(item, expected))
        return false
      }
      const normalizeUrl = (value = '') => {
        try {
          const parsed = new URL(value)
          const pathname = parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/+$/, '')
          return `${parsed.origin}${pathname}${parsed.search}${parsed.hash}`
        } catch {
          return String(value).replace(/\/+$/, '')
        }
      }
      let parsedSchema = null
      try {
        parsedSchema = schemaText ? JSON.parse(schemaText) : null
      } catch {
        parsedSchema = null
      }
      const hasExpectedSchemaUrl = kind === 'homepage'
        ? Boolean(schemaText)
        : schemaContainsCanonical(parsedSchema, expectedCanonical) || schemaText.includes(expectedCanonical)
      const categoryReady = kind !== 'static' || expectedCanonical !== 'https://www.greenroomid.com/layanan' || document.querySelector('a[href^="/layanan/"]')
      const learningHubReady = expectedCanonical !== 'https://www.greenroomid.com/ruang-belajar' || !learningEntriesExist || document.querySelector('a[href^="/ruang-belajar/"]')

      const canonicalMatches = canonical && normalizeUrl(canonical) === normalizeUrl(expectedCanonical)
      const ogUrlMatches = ogUrl && normalizeUrl(ogUrl) === normalizeUrl(expectedCanonical)

      return canonicalMatches &&
        title &&
        description &&
        robots &&
        ogTitle &&
        ogDescription &&
        ogUrlMatches &&
        rootText.length > 80 &&
        !loading &&
        schema &&
        hasExpectedSchemaUrl &&
        categoryReady &&
        learningHubReady
      },
      {
      expectedCanonical: item.canonicalUrl,
        schemaId: item.schemaId,
        kind: item.kind,
        hasLearningEntries
      },
      { timeout: 30000 }
    )
  } catch (error) {
    const state = await page.evaluate(({ schemaId }) => ({
      title: document.title,
      canonical: document.querySelector('link[rel="canonical"]')?.href || '',
      description: document.querySelector('meta[name="description"]')?.content || '',
      robots: document.querySelector('meta[name="robots"]')?.content || '',
      ogUrl: document.querySelector('meta[property="og:url"]')?.content || '',
      schemaPresent: Boolean(document.getElementById(schemaId)),
      rootText: (document.querySelector('#root')?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 240)
    }), { schemaId: item.schemaId })
    throw new Error(`Readiness timeout ${item.path}: ${JSON.stringify(state)}. ${error.message}`)
  }
  await page.waitForTimeout(250)
}

const cleanPageBeforeCapture = async (page) => {
  await page.evaluate(() => {
    document.querySelectorAll('[data-page-schema-token]').forEach((node) => {
      node.removeAttribute('data-page-schema-token')
    })
  })
}

const cleanNotFoundBeforeCapture = async (page) => {
  await page.evaluate(() => {
    document.querySelector('link[rel="canonical"]')?.remove()
    document.querySelector('meta[property="og:url"]')?.remove()
    document.querySelectorAll('script[type="application/ld+json"]').forEach((node) => node.remove())
    document.querySelectorAll('[data-page-schema-token]').forEach((node) => {
      node.removeAttribute('data-page-schema-token')
    })
  })
}

const writeRouteHtml = async (item, html) => {
  const outputFile = outputFileForPath(item.path)
  await mkdir(path.dirname(outputFile), { recursive: true })
  await writeFile(outputFile, html)
  return outputFile
}

const renderRoutes = async (routes) => {
  const { server, baseUrl } = await startServer()
  let browser
  let context
  let page
  const errors = []
  const hasLearningEntries = routes.some((item) => item.kind === 'learning-detail')

  try {
    browser = await chromium.launch({ headless: true })
    context = await browser.newContext()
    page = await context.newPage()

    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error') {
        const text = message.text()
        if (!/speed insights|vercel/i.test(text)) errors.push(text)
      }
    })

    const rendered = []
    for (const item of routes) {
      errors.length = 0
      await page.goto(`${baseUrl}${item.path}`, { waitUntil: 'domcontentloaded', timeout: 30000 })
      await waitForRouteReady(page, item, hasLearningEntries)
      if (errors.length) throw new Error(`Runtime error pada ${item.path}: ${errors.join('; ')}`)
      await cleanPageBeforeCapture(page)
      const html = await page.content()
      const outputFile = await writeRouteHtml(item, html)
      rendered.push({ ...item, outputFile: path.relative(DIST_DIR, outputFile).replace(/\\/g, '/') })
    }
    return rendered
  } finally {
    try {
      await page?.close()
    } catch {}
    try {
      await context?.close()
    } catch {}
    try {
      await browser?.close()
    } catch {}
    try {
      await new Promise((resolve) => server.close(resolve))
    } catch {}
  }
}

const renderNotFoundPage = async () => {
  const { server, baseUrl } = await startServer()
  let browser
  let context
  let page
  const errors = []

  try {
    browser = await chromium.launch({ headless: true })
    context = await browser.newContext()
    page = await context.newPage()

    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error') {
        const text = message.text()
        if (!/speed insights|vercel/i.test(text)) errors.push(text)
      }
    })

    await page.goto(`${baseUrl}${NOT_FOUND_RENDER_PATH}`, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.waitForFunction(() => {
      const title = document.title
      const robots = document.querySelector('meta[name="robots"]')?.content
      const rootText = document.querySelector('#root')?.textContent?.replace(/\s+/g, ' ').trim() || ''
      return title.includes('Halaman Tidak Ditemukan') &&
        robots === 'noindex, nofollow' &&
        rootText.includes('Halaman tidak ditemukan') &&
        !/Memuat|Loading/i.test(rootText)
    }, null, { timeout: 30000 })
    await page.waitForTimeout(250)
    if (errors.length) throw new Error(`Runtime error pada 404 prerender: ${errors.join('; ')}`)
    await cleanNotFoundBeforeCapture(page)
    const html = await page.content()
    await writeFile(NOT_FOUND_FILE, html)
    return {
      outputFile: '404.html',
      indexable: false,
      includeInSitemap: false
    }
  } finally {
    try {
      await page?.close()
    } catch {}
    try {
      await context?.close()
    } catch {}
    try {
      await browser?.close()
    } catch {}
    try {
      await new Promise((resolve) => server.close(resolve))
    } catch {}
  }
}

const generateSitemap = async (routes) => {
  const seen = new Set()
  const entries = []
  for (const item of routes) {
    if (!item.includeInSitemap) continue
    if (FORBIDDEN_SITEMAP_PATTERNS.some((pattern) => pattern.test(new URL(item.canonicalUrl).pathname))) continue
    if (seen.has(item.canonicalUrl)) continue
    seen.add(item.canonicalUrl)
    entries.push(item)
  }

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entries.map((item) => [
      '  <url>',
      `    <loc>${xmlEscape(item.canonicalUrl)}</loc>`,
      item.lastmod ? `    <lastmod>${xmlEscape(item.lastmod.slice(0, 10))}</lastmod>` : '',
      '  </url>'
    ].filter(Boolean).join('\n')),
    '</urlset>',
    ''
  ].join('\n')

  await writeFile(path.join(DIST_DIR, 'sitemap.xml'), xml)
  return entries.length
}

const validateHtml = async (routes) => {
  for (const item of routes) {
    const outputFile = outputFileForPath(item.path)
    const html = await readFile(outputFile, 'utf8')
    const canonicalPattern = item.path === '/'
      ? /rel="canonical" href="https:\/\/www\.greenroomid\.com\/?"/
      : new RegExp(`rel="canonical" href="${item.canonicalUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`)
    if (!html.includes('<div id="root">') || /<div id="root"><\/div>/.test(html)) throw new Error(`Root kosong: ${item.path}`)
    if (/localhost|127\.0\.0\.1/i.test(html)) throw new Error(`HTML mengandung localhost: ${item.path}`)
    if (!/<title>[^<]+<\/title>/.test(html)) throw new Error(`Title kosong: ${item.path}`)
    if (!canonicalPattern.test(html)) throw new Error(`Canonical salah: ${item.path}`)
    if (!/<meta name="description" content="[^"]+"/.test(html)) throw new Error(`Description kosong: ${item.path}`)
    if (!html.includes('name="robots" content="index, follow"')) throw new Error(`Robots bukan index, follow: ${item.path}`)
    if (!html.includes(`id="${item.schemaId}"`)) throw new Error(`Schema tidak ada: ${item.path}`)
    if (!/<script[^>]+type="module"[^>]+src="\/assets\//.test(html)) throw new Error(`Script Vite tidak ada: ${item.path}`)
    if (!/<link[^>]+rel="stylesheet"[^>]+href="\/assets\//.test(html)) throw new Error(`Stylesheet Vite tidak ada: ${item.path}`)
  }
}

const validateFallbackHtml = async () => {
  const html = await readFile(FALLBACK_FILE, 'utf8')
  if (/localhost|127\.0\.0\.1/i.test(html)) throw new Error('SPA fallback mengandung localhost.')
  if (!html.includes('<div id="root"></div>')) throw new Error('SPA fallback bukan shell root kosong.')
  if (!html.includes('name="robots" content="noindex, nofollow"')) throw new Error('SPA fallback robots bukan noindex, nofollow.')
  if (/<link\s+[^>]*rel=["']canonical["'][^>]*>/i.test(html)) throw new Error('SPA fallback masih memiliki canonical.')
  if (/<meta\s+[^>]*property=["']og:url["'][^>]*>/i.test(html)) throw new Error('SPA fallback masih memiliki og:url.')
  if (/<script\s+[^>]*type=["']application\/ld\+json["'][^>]*>/i.test(html)) throw new Error('SPA fallback masih memiliki JSON-LD.')
  if (!/<script[^>]+type="module"[^>]+src="\/assets\//.test(html)) throw new Error('SPA fallback tidak memiliki script module Vite.')
}

const validateNotFoundHtml = async () => {
  const html = await readFile(NOT_FOUND_FILE, 'utf8')
  if (/localhost|127\.0\.0\.1/i.test(html)) throw new Error('404.html mengandung localhost.')
  if (html.includes(NOT_FOUND_RENDER_PATH)) throw new Error('404.html mengandung route dummy.')
  if (!/<title>Halaman Tidak Ditemukan \| GreenroomID<\/title>/.test(html)) throw new Error('404.html title tidak sesuai.')
  if (!/<meta name="description" content="[^"]+"/.test(html)) throw new Error('404.html description tidak tersedia.')
  if (!html.includes('name="robots" content="noindex, nofollow"')) throw new Error('404.html robots bukan noindex, nofollow.')
  if (/<link\s+[^>]*rel=["']canonical["'][^>]*>/i.test(html)) throw new Error('404.html masih memiliki canonical.')
  if (/<meta\s+[^>]*property=["']og:url["'][^>]*>/i.test(html)) throw new Error('404.html masih memiliki og:url.')
  if (/<script\s+[^>]*type=["']application\/ld\+json["'][^>]*>/i.test(html)) throw new Error('404.html masih memiliki JSON-LD.')
  if (!html.includes('Halaman tidak ditemukan')) throw new Error('404.html tidak berisi konten NotFoundPage.')
  if (!/<script[^>]+type="module"[^>]+src="\/assets\//.test(html)) throw new Error('404.html tidak memiliki script module Vite.')
  if (!/<link[^>]+rel="stylesheet"[^>]+href="\/assets\//.test(html)) throw new Error('404.html tidak memiliki stylesheet Vite.')
}

const validateSitemap = async (routes, sitemapUrlCount) => {
  const xml = await readFile(path.join(DIST_DIR, 'sitemap.xml'), 'utf8')
  if (!xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')) throw new Error('Sitemap tidak memiliki XML declaration.')
  if (xml.includes('localhost') || xml.includes('127.0.0.1')) throw new Error('Sitemap mengandung localhost.')
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1])
  const duplicateLocs = locs.filter((loc, index) => locs.indexOf(loc) !== index)
  if (duplicateLocs.length) throw new Error(`Sitemap mengandung URL duplikat: ${[...new Set(duplicateLocs)].join(', ')}`)
  for (const pattern of FORBIDDEN_SITEMAP_PATTERNS) {
    if ([...xml.matchAll(/<loc>https:\/\/www\.greenroomid\.com([^<]*)<\/loc>/g)].some((match) => pattern.test(match[1]))) {
      throw new Error(`Sitemap mengandung route terlarang: ${pattern}`)
    }
  }
  const canonicalCount = routes.filter((item) => item.includeInSitemap).length
  if (sitemapUrlCount > canonicalCount) throw new Error('Sitemap memiliki URL duplikat/tidak dikenal.')
}

const main = async () => {
  const shellHtml = await readFile(path.join(DIST_DIR, 'index.html'), 'utf8')
  await copyFile(path.join(DIST_DIR, 'index.html'), FALLBACK_FILE)
  await writeFile(FALLBACK_FILE, sanitizeFallbackHtml(shellHtml))
  await validateFallbackHtml()

  const routes = await discoverRoutes()
  const rendered = await renderRoutes(routes)
  const notFoundOutput = await renderNotFoundPage()
  const sitemapUrlCount = await generateSitemap(rendered)

  await writeFile(path.join(DIST_DIR, 'prerender-manifest.json'), JSON.stringify({
    generatedAt: new Date().toISOString(),
    routeCount: rendered.length,
    specialOutputs: {
      notFound: notFoundOutput
    },
    routes: rendered.map((item) => ({
      path: item.path,
      canonicalUrl: item.canonicalUrl,
      schemaId: item.schemaId,
      outputFile: item.outputFile,
      kind: item.kind,
      includeInSitemap: item.includeInSitemap,
      lastmod: item.lastmod || undefined
    }))
  }, null, 2))

  await validateHtml(rendered)
  await validateFallbackHtml()
  await validateNotFoundHtml()
  await validateSitemap(rendered, sitemapUrlCount)

  const counts = rendered.reduce((acc, item) => {
    acc[item.kind] = (acc[item.kind] || 0) + 1
    return acc
  }, {})
  console.log(`Prerender selesai: ${rendered.length} route.`)
  console.log(`Jenis route: ${JSON.stringify(counts)}`)
  console.log(`Sitemap URL: ${sitemapUrlCount}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
