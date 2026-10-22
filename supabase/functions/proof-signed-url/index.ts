import { createClient } from 'npm:@supabase/supabase-js@2'

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function json(body: Record<string, unknown>, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...headers, 'Content-Type': 'application/json' }
  })
}

Deno.serve(async (request) => {
  const allowedOrigin = Deno.env.get('SHOP_ALLOWED_ORIGIN')
  if (!allowedOrigin || request.headers.get('Origin') !== allowedOrigin) {
    return json({ error: 'origin_not_allowed' }, 403, {})
  }
  const corsHeaders = {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
    Vary: 'Origin'
  }
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, corsHeaders)

  const jwt = request.headers.get('Authorization')?.match(/^Bearer (.+)$/i)?.[1]
  if (!jwt) return json({ error: 'unauthorized' }, 401, corsHeaders)
  let body: { order_id?: unknown; admin_token?: unknown }
  try { body = await request.json() } catch { return json({ error: 'invalid_json' }, 400, corsHeaders) }
  if (typeof body.order_id !== 'string' || !uuidPattern.test(body.order_id)
    || typeof body.admin_token !== 'string' || body.admin_token !== jwt) {
    return json({ error: 'invalid_input' }, 400, corsHeaders)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) return json({ error: 'server_configuration_error' }, 500, corsHeaders)
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  })
  const { data: userData, error: authError } = await supabase.auth.getUser(jwt)
  if (authError || !userData.user) return json({ error: 'unauthorized' }, 401, corsHeaders)

  const { data: order, error: orderError } = await supabase.from('orders')
    .select('proof_path').eq('id', body.order_id).maybeSingle()
  if (orderError) return json({ error: 'lookup_failed' }, 500, corsHeaders)
  if (!order?.proof_path) return json({ error: 'proof_not_found' }, 404, corsHeaders)
  const { data, error: signedError } = await supabase.storage.from('proofs')
    .createSignedUrl(order.proof_path, 60)
  if (signedError || !data?.signedUrl) return json({ error: 'signed_url_failed' }, 500, corsHeaders)
  return json({ signed_url: data.signedUrl }, 200, corsHeaders)
})
