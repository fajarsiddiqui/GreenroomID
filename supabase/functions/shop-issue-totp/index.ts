import { createClient } from 'npm:@supabase/supabase-js@2'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const tokenPattern = /^[0-9a-f]{64}$/i
const json = (body: Record<string, unknown>, status: number, headers: Record<string, string>) =>
  new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
type Order = {
  id: string; token_hash: string; status: string; account_id: string; variant_id: string
  totp_issued_at: string | null; totp_window_start: string | null
  access_started_at: string | null; access_expires_at: string | null
}
async function hashToken(rawToken: string) {
  const bytes = new Uint8Array(32)
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(rawToken.slice(index * 2, index * 2 + 2), 16)
  }
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('')
}
async function decrypt(encoded: string) {
  const keyHex = Deno.env.get('ACCOUNT_ENC_KEY') ?? ''
  if (!/^[0-9a-f]{64}$/i.test(keyHex)) throw new Error('server_configuration_error')
  const combined = Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0))
  if (combined.length < 29) throw new Error('invalid_ciphertext')
  const keyBytes = Uint8Array.from(keyHex.match(/../g)!, (part) => parseInt(part, 16))
  const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['decrypt'])
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: combined.slice(0, 12) }, key, combined.slice(12))
  return new TextDecoder().decode(plain)
}
// Keep these helpers identical in shop-issue-totp/index.ts and tests/totp_vectors.mjs.
function decodeBase32(secret = '') {
  const normalized = secret.replace(/\s/g, '').toUpperCase().replace(/=+$/, '')
  if (!normalized || !/^[A-Z2-7]+$/.test(normalized)) throw new Error('invalid_totp_secret')
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  const output = []
  let buffer = 0
  let bits = 0
  for (const character of normalized) {
    buffer = (buffer << 5) | alphabet.indexOf(character)
    bits += 5
    if (bits >= 8) {
      bits -= 8
      output.push((buffer >>> bits) & 255)
      buffer &= (1 << bits) - 1
    }
  }
  return Uint8Array.from(output)
}
async function hotp(secretBytes = new Uint8Array(), counter = 0) {
  const message = new Uint8Array(8)
  let value = BigInt(counter)
  for (let index = 7; index >= 0; index -= 1) {
    message[index] = Number(value & 255n)
    value >>= 8n
  }
  const key = await crypto.subtle.importKey('raw', secretBytes, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign'])
  const digest = new Uint8Array(await crypto.subtle.sign('HMAC', key, message))
  const offset = digest[digest.length - 1] & 15
  const binary = ((digest[offset] & 127) << 24) | (digest[offset + 1] << 16)
    | (digest[offset + 2] << 8) | digest[offset + 3]
  return String(binary % 1000000).padStart(6, '0')
}
async function totp(secret = '', windowStartMs = 0) {
  return hotp(decodeBase32(secret), Math.floor(windowStartMs / 30000))
}

Deno.serve(async (request) => {
  const origin = request.headers.get('Origin')
  const allowed = (Deno.env.get('SHOP_ALLOWED_ORIGIN') ?? '').split(',').map((item) => item.trim()).filter(Boolean)
  if (!origin || !allowed.includes(origin)) return json({ error: 'origin_not_allowed' }, 403, {})
  const cors = { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', Vary: 'Origin' }
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, cors)
  let body: Record<string, unknown>
  try { body = await request.json() } catch { return json({ error: 'invalid_input' }, 400, cors) }
  if (typeof body.order_id !== 'string' || !uuid.test(body.order_id)
    || typeof body.token !== 'string' || !tokenPattern.test(body.token)
    || (body.action !== 'start' && body.action !== 'code')) return json({ error: 'invalid_input' }, 400, cors)
  const url = Deno.env.get('SUPABASE_URL')
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !service) return json({ error: 'totp_failed' }, 500, cors)
  try {
    const db = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } })
    const hash = await hashToken(body.token)
    const columns = 'id,token_hash,status,account_id,variant_id,totp_issued_at,totp_window_start,access_started_at,access_expires_at'
    const readOrder = () => db.from('shop_orders').select(columns).eq('id', body.order_id).maybeSingle()
    const initial = await readOrder()
    if (initial.error) return json({ error: 'totp_failed' }, 500, cors)
    let order = initial.data as Order | null
    if (!order || order.token_hash !== hash) return json({ error: 'unauthorized' }, 401, cors)
    if (order.status !== 'verified') return json({ error: 'not_verified' }, 409, cors)
    const { data: account, error: accountError } = await db.from('shop_accounts')
      .select('totp_secret_enc').eq('id', order.account_id).single()
    if (accountError || !account) return json({ error: 'totp_failed' }, 500, cors)
    if (account.totp_secret_enc === null) return json({ error: 'no_totp_configured' }, 409, cors)
    const secret = await decrypt(account.totp_secret_enc)
    decodeBase32(secret) // Reject invalid plaintext before consuming the one available window.
    const audit = async (action: string) => {
      try {
        const { error } = await db.from('shop_audit_logs').insert({ order_id: order!.id,
          actor: 'system', action })
        if (error) console.error('totp_audit_failed')
      } catch { console.error('totp_audit_failed') }
    }
    if (body.action === 'start' && order.totp_issued_at === null) {
      const { data: variant, error: variantError } = await db.from('shop_variants')
        .select('duration_days').eq('id', order.variant_id).single()
      if (variantError || !variant || ![1, 3, 7, 14, 30].includes(variant.duration_days)) {
        return json({ error: 'totp_failed' }, 500, cors)
      }
      const now = Date.now()
      const nextBoundary = (Math.floor(now / 30000) + 1) * 30000
      // Only the winner of this conditional UPDATE can initialize the access period.
      const { data: claimed, error: claimError } = await db.from('shop_orders').update({
        totp_issued_at: new Date(now).toISOString(), totp_window_start: new Date(nextBoundary).toISOString(),
        access_started_at: order.access_started_at ?? new Date(now).toISOString(),
        access_expires_at: order.access_expires_at ?? new Date(now + variant.duration_days * 86400000).toISOString()
      }).eq('id', order.id).eq('token_hash', hash).eq('status', 'verified')
        .is('totp_issued_at', null).select(columns).maybeSingle()
      if (claimError) return json({ error: 'totp_failed' }, 500, cors)
      if (claimed) {
        order = claimed as Order
        await audit('totp_issue_started')
      } else {
        const refreshed = await readOrder()
        if (refreshed.error) return json({ error: 'totp_failed' }, 500, cors)
        order = refreshed.data as Order | null
        if (!order || order.token_hash !== hash) return json({ error: 'unauthorized' }, 401, cors)
        if (order.status !== 'verified') return json({ error: 'not_verified' }, 409, cors)
      }
    }
    if (!order.totp_issued_at) return json({ error: 'not_started' }, 409, cors)
    const start = Date.parse(order.totp_window_start ?? '')
    if (!Number.isFinite(start)) return json({ error: 'totp_failed' }, 500, cors)
    const end = start + 30000
    if (body.action === 'start') {
      if (Date.now() >= end) return json({ error: 'totp_already_issued' }, 410, cors)
      return json({ server_now_ms: Date.now(), window_start_ms: start, window_end_ms: end,
        access_expires_at: order.access_expires_at }, 200, cors)
    }
    if (Date.now() >= end) return json({ error: 'totp_expired' }, 410, cors)
    const delay = Math.max(0, start - Date.now())
    if (delay > 35000) return json({ error: 'totp_failed' }, 500, cors)
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay))
    if (Date.now() < start) return json({ error: 'totp_failed' }, 500, cors)
    if (Date.now() >= end) return json({ error: 'totp_expired' }, 410, cors)
    const code = await totp(secret, start)
    await audit('totp_code_delivered')
    if (Date.now() >= end) return json({ error: 'totp_expired' }, 410, cors)
    return json({ code, window_end_ms: end, server_now_ms: Date.now() }, 200, cors)
  } catch { return json({ error: 'totp_failed' }, 500, cors) }
})

