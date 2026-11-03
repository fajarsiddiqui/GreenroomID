import { createClient } from 'npm:@supabase/supabase-js@2'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const tokenPattern = /^[0-9a-f]{64}$/i
const json = (body: Record<string, unknown>, status: number, headers: Record<string, string>) =>
  new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

async function hashToken(raw: string) {
  const bytes = Uint8Array.from(raw.match(/../g)!, (part) => Number.parseInt(part, 16))
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function decrypt(encoded: string) {
  const keyHex = Deno.env.get('ACCOUNT_ENC_KEY') ?? ''
  if (!tokenPattern.test(keyHex)) throw new Error('server_configuration_error')
  const combined = Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0))
  if (combined.length < 29) throw new Error('invalid_ciphertext')
  const keyBytes = Uint8Array.from(keyHex.match(/../g)!, (part) => Number.parseInt(part, 16))
  const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['decrypt'])
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: combined.slice(0, 12) }, key, combined.slice(12))
  return new TextDecoder().decode(plain)
}

function decodeBase32(secret: string) {
  const normalized = secret.replace(/\s/g, '').toUpperCase().replace(/=+$/, '')
  if (!normalized || !/^[A-Z2-7]+$/.test(normalized)) throw new Error('invalid_totp_secret')
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  const output: number[] = []
  let buffer = 0, bits = 0
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

async function totp(secret: string, start: number) {
  const message = new Uint8Array(8)
  let value = BigInt(Math.floor(start / 30000))
  for (let index = 7; index >= 0; index -= 1) {
    message[index] = Number(value & 255n)
    value >>= 8n
  }
  const key = await crypto.subtle.importKey('raw', decodeBase32(secret), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign'])
  const digest = new Uint8Array(await crypto.subtle.sign('HMAC', key, message))
  const offset = digest[digest.length - 1] & 15
  const binary = ((digest[offset] & 127) << 24) | (digest[offset + 1] << 16)
    | (digest[offset + 2] << 8) | digest[offset + 3]
  return String(binary % 1000000).padStart(6, '0')
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
  if (typeof body.id !== 'string' || !uuid.test(body.id) || typeof body.token !== 'string' ||
    !tokenPattern.test(body.token) || typeof body.claim !== 'string' || !tokenPattern.test(body.claim) ||
    (body.action !== 'start' && body.action !== 'code')) return json({ error: 'invalid_input' }, 400, cors)
  const url = Deno.env.get('SUPABASE_URL'), service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !service) return json({ error: 'totp_failed' }, 500, cors)
  try {
    const db = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } })
    const tokenHash = await hashToken(body.token), claimHash = await hashToken(body.claim)
    const { data: started, error: startError } = await db.rpc('shop_otp_reissue_start', {
      p_id: body.id, p_token_hash: tokenHash, p_claim_hash: claimHash
    })
    if (startError) throw startError
    if (started?.state !== 'ready') return json({ error: 'unavailable' }, 410, cors)
    const start = Number(started.window_start_ms), end = start + 30000
    if (body.action === 'start') return json({ server_now_ms: Date.now(), window_start_ms: start, window_end_ms: end }, 200, cors)
    const { data: account, error: accountError } = await db.from('shop_accounts')
      .select('totp_secret_enc').eq('id', started.account_id).single()
    if (accountError || !account?.totp_secret_enc) throw accountError ?? new Error('no_totp')
    const secret = await decrypt(account.totp_secret_enc)
    decodeBase32(secret)
    const delay = Math.max(0, start - Date.now())
    if (delay > 31000) throw new Error('invalid_window')
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay))
    if (Date.now() >= end) return json({ error: 'expired' }, 410, cors)
    const code = await totp(secret, start)
    const { data: delivered, error: finishError } = await db.rpc('shop_otp_reissue_finish', {
      p_id: body.id, p_token_hash: tokenHash, p_claim_hash: claimHash, p_window_start_ms: start
    })
    if (finishError) throw finishError
    if (delivered !== true) return json({ error: 'unavailable' }, 410, cors)
    return json({ code, window_end_ms: end, server_now_ms: Date.now() }, 200, cors)
  } catch {
    return json({ error: 'totp_failed' }, 500, cors)
  }
})
