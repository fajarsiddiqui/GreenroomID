import { createClient } from 'npm:@supabase/supabase-js@2'

const json = (body: Record<string, unknown>, status: number, headers: Record<string, string>) =>
  new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

async function decrypt(encoded: string, key: CryptoKey) {
  const combined = Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0))
  if (combined.length < 29) throw new Error('invalid_ciphertext')
  return new TextDecoder().decode(await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: combined.slice(0, 12) }, key, combined.slice(12)
  ))
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

async function totp(secret: string, windowStartMs: number) {
  const message = new Uint8Array(8)
  let value = BigInt(Math.floor(windowStartMs / 30000))
  for (let index = 7; index >= 0; index -= 1) {
    message[index] = Number(value & 255n)
    value >>= 8n
  }
  const key = await crypto.subtle.importKey('raw', decodeBase32(secret),
    { name: 'HMAC', hash: 'SHA-1' }, false, ['sign'])
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
  const jwt = request.headers.get('Authorization')?.match(/^Bearer (.+)$/i)?.[1]
  if (!jwt) return json({ error: 'unauthorized' }, 401, cors)
  let body: Record<string, unknown>
  try { body = await request.json() } catch { return json({ error: 'invalid_input' }, 400, cors) }
  if (typeof body.page !== 'number' || !Number.isInteger(body.page) || body.page < 0 || body.page > 100000) {
    return json({ error: 'invalid_input' }, 400, cors)
  }
  const url = Deno.env.get('SUPABASE_URL')
  const anon = Deno.env.get('SUPABASE_ANON_KEY')
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const keyHex = Deno.env.get('ACCOUNT_ENC_KEY') ?? ''
  if (!url || !anon || !service || !/^[0-9a-f]{64}$/i.test(keyHex)) {
    return json({ error: 'server_configuration_error' }, 500, cors)
  }
  try {
    const caller = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { persistSession: false, autoRefreshToken: false } })
    const { data: user, error: userError } = await caller.auth.getUser(jwt)
    if (userError || !user.user) return json({ error: 'unauthorized' }, 401, cors)
    const { data: admin, error: adminError } = await caller.rpc('is_admin')
    if (adminError || admin !== true) return json({ error: 'forbidden' }, 403, cors)

    const db = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } })
    const page = body.page as number
    const { data: accounts, count, error: accountError } = await db.from('shop_accounts')
      .select('id,email,totp_secret_enc', { count: 'exact' })
      .eq('is_active', true).not('totp_secret_enc', 'is', null).neq('totp_secret_enc', '')
      .order('priority').order('created_at').order('id').range(page * 10, page * 10 + 9)
    if (accountError || !accounts) throw accountError ?? new Error('lookup_failed')
    const keyBytes = Uint8Array.from(keyHex.match(/../g)!, (part) => parseInt(part, 16))
    const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['decrypt'])
    const secrets = await Promise.all(accounts.map((account) => decrypt(account.totp_secret_enc, key)))
    const windowStartMs = Math.floor(Date.now() / 30000) * 30000
    const codes = await Promise.all(secrets.map((secret) => totp(secret, windowStartMs)))
    const windowEndMs = windowStartMs + 30000
    if (Date.now() >= windowEndMs) return json({ error: 'window_expired' }, 503, cors)
    if (accounts.length) {
      const { error: auditError } = await db.from('shop_audit_logs').insert(accounts.map((account) => ({
        actor: 'admin', action: 'admin_otp_code_viewed', detail: {
          account_id: account.id, admin_id: user.user.id, window_start_ms: windowStartMs
        }
      })))
      if (auditError) return json({ error: 'audit_failed' }, 500, cors)
    }
    if (Date.now() >= windowEndMs) return json({ error: 'window_expired' }, 503, cors)
    return json({ accounts: accounts.map((account, index) => ({
      id: account.id, email: account.email, code: codes[index]
    })), total: count ?? 0, server_now_ms: Date.now(), window_end_ms: windowEndMs }, 200, cors)
  } catch {
    return json({ error: 'otp_failed' }, 500, cors)
  }
})
