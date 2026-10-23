import { createClient } from 'npm:@supabase/supabase-js@2'

const maxFileBytes = 5 * 1024 * 1024
const tokenPattern = /^[0-9a-f]{64}$/i
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const extensions: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'image/bmp': 'bmp',
  'application/pdf': 'pdf'
}

function json(body: Record<string, unknown>, status: number, headers: HeadersInit) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' }
  })
}

async function hashToken(rawToken: string) {
  const bytes = new Uint8Array(32)
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(rawToken.slice(index * 2, index * 2 + 2), 16)
  }
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (request) => {
  const allowedOrigin = Deno.env.get('SHOP_ALLOWED_ORIGIN')
  const origin = request.headers.get('Origin')
  if (!allowedOrigin || origin !== allowedOrigin) {
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

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) return json({ error: 'server_configuration_error' }, 500, corsHeaders)

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return json({ error: 'invalid_form_data' }, 400, corsHeaders)
  }
  const orderId = form.get('order_id')
  const rawToken = form.get('token')
  const file = form.get('file')
  if (typeof orderId !== 'string' || !uuidPattern.test(orderId)
    || typeof rawToken !== 'string' || !tokenPattern.test(rawToken)
    || !(file instanceof File)) {
    return json({ error: 'invalid_input' }, 400, corsHeaders)
  }
  const extension = extensions[file.type]
  if (!extension || file.size === 0 || file.size > maxFileBytes) {
    return json({ error: 'invalid_file' }, 400, corsHeaders)
  }

  const tokenHash = await hashToken(rawToken)
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  })
  const { data: order, error: orderError } = await supabase
    .from('shop_orders')
    .select('token_hash, status, proof_path')
    .eq('id', orderId)
    .maybeSingle()
  if (orderError) return json({ error: 'lookup_failed' }, 500, corsHeaders)
  if (!order || order.token_hash !== tokenHash) return json({ error: 'unauthorized' }, 401, corsHeaders)
  if (order.status !== 'waiting_verification' || order.proof_path) {
    return json({ error: 'order_not_waiting_or_proof_exists' }, 409, corsHeaders)
  }

  const path = `${orderId}/${Date.now()}.${extension}`
  const { error: uploadError } = await supabase.storage.from('proofs').upload(path, file, {
    contentType: file.type,
    upsert: false
  })
  if (uploadError) return json({ error: 'upload_failed' }, 500, corsHeaders)

  const { error: recordError } = await supabase.rpc('shop_record_proof_upload', {
    p_order_id: orderId,
    p_token_hash: tokenHash,
    p_proof_path: path
  })
  if (recordError) {
    await supabase.storage.from('proofs').remove([path])
    return json({ error: 'record_failed' }, 409, corsHeaders)
  }
  return json({ ok: true }, 200, corsHeaders)
})
