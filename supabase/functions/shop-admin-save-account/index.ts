import { createClient } from 'npm:@supabase/supabase-js@2'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const json = (body: Record<string, unknown>, status: number, headers: Record<string, string>) =>
  new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json' } })
const base64 = (bytes: Uint8Array) => btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''))

Deno.serve(async (request) => {
  const origin = request.headers.get('Origin')
  const allowed = (Deno.env.get('SHOP_ALLOWED_ORIGIN') ?? '').split(',').map((item) => item.trim()).filter(Boolean)
  if (!origin || !allowed.includes(origin)) return json({ error: 'origin_not_allowed' }, 403, {})
  const cors = { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type', Vary: 'Origin' }
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, cors)
  const jwt = request.headers.get('Authorization')?.match(/^Bearer (.+)$/i)?.[1]
  if (!jwt) return json({ error: 'unauthorized' }, 401, cors)
  const url = Deno.env.get('SUPABASE_URL')
  const anon = Deno.env.get('SUPABASE_ANON_KEY')
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !anon || !service) return json({ error: 'server_configuration_error' }, 500, cors)
  const caller = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false } })
  const { data: user, error: userError } = await caller.auth.getUser(jwt)
  if (userError || !user.user) return json({ error: 'unauthorized' }, 401, cors)
  const { data: admin, error: adminError } = await caller.rpc('is_admin')
  if (adminError || admin !== true) return json({ error: 'forbidden' }, 403, cors)
  const keyHex = Deno.env.get('ACCOUNT_ENC_KEY') ?? ''
  if (!/^[0-9a-f]{64}$/i.test(keyHex)) return json({ error: 'server_configuration_error' }, 500, cors)
  const keyBytes = Uint8Array.from(keyHex.match(/../g)!, (part) => parseInt(part, 16))
  const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt'])
  const encrypt = async (value: string) => {
    const nonce = crypto.getRandomValues(new Uint8Array(12))
    const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, new TextEncoder().encode(value)))
    const result = new Uint8Array(nonce.length + encrypted.length)
    result.set(nonce); result.set(encrypted, nonce.length)
    return base64(result)
  }
  let body: Record<string, unknown>
  try { body = await request.json() } catch { return json({ error: 'invalid_json' }, 400, cors) }
  const accountId = body.account_id
  const creating = accountId === undefined || accountId === null
  const variantId = body.variant_id
  const email = typeof body.email === 'string' ? body.email.trim() : ''
  const password = typeof body.password === 'string' ? body.password : ''
  const totp = typeof body.totp_secret === 'string' ? body.totp_secret.replace(/\s/g, '').toUpperCase() : ''
  const maxUses = body.max_uses
  const priority = body.priority
  if ((!creating && (typeof accountId !== 'string' || !uuid.test(accountId)))
    || (creating && (typeof variantId !== 'string' || !uuid.test(variantId)))
    || !emailPattern.test(email) || email.length > 320
    || (creating && !password) || password.length > 4096
    || (totp && !/^[A-Z2-7]{16,64}$/.test(totp))
    || !(maxUses === null || (Number.isInteger(maxUses) && (maxUses as number) >= 1 && (maxUses as number) <= 1000000))
    || !Number.isInteger(priority) || (priority as number) < 0 || (priority as number) > 9999) {
    return json({ error: 'invalid_input' }, 400, cors)
  }
  const db = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } })
  if (creating) {
    const { data: variant, error } = await db.from('shop_variants').select('id, is_active, shop_products(is_active)')
      .eq('id', variantId).maybeSingle()
    const product = variant?.shop_products as unknown as { is_active: boolean } | null
    if (error) return json({ error: 'lookup_failed' }, 500, cors)
    if (!variant?.is_active || !product?.is_active) return json({ error: 'invalid_variant' }, 400, cors)
  } else {
    const { data: existing, error } = await db.from('shop_accounts').select('id, variant_id, used_count')
      .eq('id', accountId).maybeSingle()
    if (error) return json({ error: 'lookup_failed' }, 500, cors)
    if (!existing) return json({ error: 'not_found' }, 404, cors)
    if (variantId !== existing.variant_id) return json({ error: 'variant_locked' }, 400, cors)
    if (maxUses !== null && (maxUses as number) < existing.used_count) return json({ error: 'stock_below_used' }, 400, cors)
  }
  const values: Record<string, unknown> = { email, max_uses: maxUses, priority }
  if (creating) values.variant_id = variantId
  if (password) values.password_enc = await encrypt(password)
  if (totp) values.totp_secret_enc = await encrypt(totp)
  const changed = Object.keys(values).filter((name) => name !== 'variant_id')
  const result = creating
    ? await db.from('shop_accounts').insert(values).select('id').single()
    : await db.from('shop_accounts').update(values).eq('id', accountId).select('id').single()
  if (result.error || !result.data) return json({ error: 'save_failed' }, 500, cors)
  const id = result.data.id
  const { error: auditError } = await db.from('shop_audit_logs').insert({ actor: 'admin',
    action: creating ? 'account_created' : 'account_credentials_updated',
    detail: { account_id: id, admin_id: user.user.id, changed_columns: changed } })
  if (auditError) return json({ error: 'audit_failed' }, 500, cors)
  return json({ ok: true, account_id: id }, 200, cors)
})
