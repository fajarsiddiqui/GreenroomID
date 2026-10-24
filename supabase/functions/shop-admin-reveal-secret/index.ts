import { createClient } from 'npm:@supabase/supabase-js@2'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const json = (body: Record<string, unknown>, status: number, headers: Record<string, string>) =>
  new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

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
  let body: Record<string, unknown>
  try { body = await request.json() } catch { return json({ error: 'invalid_json' }, 400, cors) }
  if (typeof body.account_id !== 'string' || !uuid.test(body.account_id)
    || (body.field !== 'password' && body.field !== 'totp_secret')) return json({ error: 'invalid_input' }, 400, cors)
  const keyHex = Deno.env.get('ACCOUNT_ENC_KEY') ?? ''
  if (!/^[0-9a-f]{64}$/i.test(keyHex)) return json({ error: 'server_configuration_error' }, 500, cors)
  const db = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } })
  const column = body.field === 'password' ? 'password_enc' : 'totp_secret_enc'
  const { data: account, error } = await db.from('shop_accounts').select(column).eq('id', body.account_id).maybeSingle()
  if (error) return json({ error: 'lookup_failed' }, 500, cors)
  if (!account) return json({ error: 'not_found' }, 404, cors)
  const { error: auditError } = await db.from('shop_audit_logs').insert({ actor: 'admin', action: 'account_secret_revealed',
    detail: { account_id: body.account_id, field: body.field, admin_id: user.user.id } })
  if (auditError) return json({ error: 'audit_failed' }, 500, cors)
  try {
    const encoded = account[column] as string | null
    if (!encoded) throw new Error('empty')
    const combined = Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0))
    if (combined.length < 29) throw new Error('invalid_ciphertext')
    const keyBytes = Uint8Array.from(keyHex.match(/../g)!, (part) => parseInt(part, 16))
    const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['decrypt'])
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: combined.slice(0, 12) }, key, combined.slice(12))
    return json({ value: new TextDecoder().decode(plain) }, 200, cors)
  } catch {
    return json({ error: 'not_decryptable' }, 422, cors)
  }
})
