import { URL } from 'node:url'
import totpHandler from '../api/totp.js'
import adminTotpHandler from '../api/admin/totp.js'

const handlers = new Map([
  ['/api/totp', totpHandler],
  ['/api/admin/totp', adminTotpHandler],
])

async function parseBody(req) {
  if (['GET', 'HEAD'].includes(req.method)) return undefined
  const chunks = []; let length = 0
  for await (const chunk of req) { length += chunk.length; if (length > 1024 * 1024) throw new Error('Payload too large'); chunks.push(chunk) }
  if (!length) return undefined
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { throw new Error('Invalid JSON') }
}

export function createTotpViteMiddleware() {
  return async (req, res, next) => {
    const url = new URL(req.url || '/', 'http://localhost'); const handler = handlers.get(url.pathname)
    if (!handler) return next()
    try { req.query = Object.fromEntries(url.searchParams.entries()); req.body = await parseBody(req) } catch (error) { res.statusCode = error.message === 'Payload too large' ? 413 : 400; res.setHeader('cache-control', 'no-store'); res.setHeader('content-type', 'application/json; charset=utf-8'); return res.end(JSON.stringify({ error: error.message })) }
    let statusCode = 200
    const response = { status(code) { statusCode = code; return response }, setHeader(name, value) { res.setHeader(name, value); return response }, json(body) { res.statusCode = statusCode; if (!res.hasHeader('content-type')) res.setHeader('content-type', 'application/json; charset=utf-8'); return res.end(JSON.stringify(body)) }, end(body) { res.statusCode = statusCode; return res.end(body) } }
    try { await handler(req, response) } catch { if (!res.headersSent) { res.statusCode = 500; res.setHeader('cache-control', 'no-store'); res.setHeader('content-type', 'application/json; charset=utf-8'); res.end(JSON.stringify({ error: 'Internal TOTP error' })) } }
  }
}
