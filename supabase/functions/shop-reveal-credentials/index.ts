import { createClient } from 'npm:@supabase/supabase-js@2'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const tokenPattern = /^[0-9a-f]{64}$/i
const json = (body: Record<string, unknown>, status: number, headers: Record<string, string>) =>
  new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

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
    || typeof body.token !== 'string' || !tokenPattern.test(body.token)) return json({ error: 'invalid_input' }, 400, cors)
  const url = Deno.env.get('SUPABASE_URL')
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !service) return json({ error: 'reveal_failed' }, 500, cors)
  try {
    const db = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } })
    const hash = await hashToken(body.token)
    const { data: order, error } = await db.from('shop_orders')
      .select('id,order_code,token_hash,status,account_id,variant_id,credentials_viewed_at').eq('id', body.order_id).maybeSingle()
    if (error) return json({ error: 'reveal_failed' }, 500, cors)
    if (!order || order.token_hash !== hash) return json({ error: 'unauthorized' }, 401, cors)
    if (order.status !== 'verified') return json({ error: 'not_verified' }, 409, cors)
    if (!order.account_id) return json({ error: 'account_revoked' }, 410, cors)
    const { data: account, error: accountError } = await db.from('shop_accounts')
      .select('email,password_enc,totp_secret_enc').eq('id', order.account_id).single()
    if (accountError || !account) return json({ error: 'reveal_failed' }, 500, cors)
    const hasTotp = account.totp_secret_enc !== null
    if (order.credentials_viewed_at) return json({ error: 'already_viewed', has_totp: hasTotp }, 410, cors)
    const password = await decrypt(account.password_enc)
    const { data: variant, error: variantError } = await db.from('shop_variants')
      .select('account_type,duration_days,option_values,product_id').eq('id', order.variant_id).single()
    if (variantError || !variant) return json({ error: 'reveal_failed' }, 500, cors)
    const { data: product, error: productError } = await db.from('shop_products')
      .select('name,terms').eq('id', variant.product_id).single()
    if (productError || !product) return json({ error: 'reveal_failed' }, 500, cors)
    const { data: claimed, error: claimError } = await db.from('shop_orders')
      .update({ credentials_viewed_at: new Date().toISOString() }).eq('id', order.id)
      .eq('token_hash', hash).eq('status', 'verified').not('account_id', 'is', null).is('credentials_viewed_at', null)
      .select('account_id,variant_id').maybeSingle()
    if (claimError) return json({ error: 'reveal_failed' }, 500, cors)
    if (!claimed) {
      const { data: current, error: lookupError } = await db.from('shop_orders')
        .select('token_hash,status,credentials_viewed_at').eq('id', order.id).maybeSingle()
      if (lookupError) return json({ error: 'reveal_failed' }, 500, cors)
      if (!current || current.token_hash !== hash) return json({ error: 'unauthorized' }, 401, cors)
      if (current.status !== 'verified') return json({ error: 'not_verified' }, 409, cors)
      return json({ error: 'already_viewed', has_totp: hasTotp }, 410, cors)
    }
    // A claimed view must still be delivered if audit transport fails.
    try {
      const { error: auditError } = await db.from('shop_audit_logs').insert({ order_id: order.id,
        actor: 'system', action: 'credentials_revealed', detail: { order_code: order.order_code } })
      if (auditError) console.error('credentials_audit_failed')
    } catch { console.error('credentials_audit_failed') }
    return json({ email: account.email, password, has_totp: hasTotp, product_name: product.name,
      variant_label_parts: { account_type: variant.account_type, duration_days: variant.duration_days, option_values: variant.option_values }, terms: product.terms }, 200, cors)
  } catch { return json({ error: 'reveal_failed' }, 500, cors) }
})
