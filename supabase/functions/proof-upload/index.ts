import { createClient } from 'npm:@supabase/supabase-js@2'

const maxFileBytes = 5 * 1024 * 1024
const tokenPattern = /^[0-9a-f]{64}$/i
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const maxBodyBytes = maxFileBytes + 64 * 1024
function sniff(bytes: Uint8Array): { extension: string; contentType: string } | null {
  const at = (offset: number, value: string) => bytes.length >= offset + value.length
    && Array.from(value).every((char, index) => bytes[offset + index] === char.charCodeAt(0))
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { extension: 'jpg', contentType: 'image/jpeg' }
  if (bytes[0] === 0x89 && at(1, 'PNG\r\n\x1a\n')) return { extension: 'png', contentType: 'image/png' }
  if (at(0, 'GIF8')) return { extension: 'gif', contentType: 'image/gif' }
  if (at(0, 'RIFF') && at(8, 'WEBP')) return { extension: 'webp', contentType: 'image/webp' }
  if (at(0, 'BM')) return { extension: 'bmp', contentType: 'image/bmp' }
  if (at(0, '%PDF-')) return { extension: 'pdf', contentType: 'application/pdf' }
  if (at(4, 'ftyp')) {
    const boxSize = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0)
    if (boxSize < 16 || boxSize > bytes.length) return null
    const brands = [8, ...Array.from({ length: Math.floor((boxSize - 16) / 4) }, (_, index) => 16 + index * 4)]
    if (brands.some((offset) => at(offset, 'avif') || at(offset, 'avis'))) return { extension: 'avif', contentType: 'image/avif' }
    if (brands.some((offset) => ['heic', 'heix', 'hevc', 'hevx'].some((brand) => at(offset, brand)))) return { extension: 'heic', contentType: 'image/heic' }
    if (brands.some((offset) => ['mif1', 'msf1', 'heif'].some((brand) => at(offset, brand)))) return { extension: 'heif', contentType: 'image/heif' }
  }
  return null
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
  const allowedOrigins = (Deno.env.get('SHOP_ALLOWED_ORIGIN') ?? '')
    .split(',').map((item) => item.trim()).filter(Boolean)
  const origin = request.headers.get('Origin')
  if (!origin || !allowedOrigins.includes(origin)) {
    return json({ error: 'origin_not_allowed' }, 403, {})
  }

  const corsHeaders = {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    Vary: 'Origin'
  }
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, corsHeaders)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) return json({ error: 'server_configuration_error' }, 500, corsHeaders)

  const contentType = request.headers.get('Content-Type') ?? ''
  if (!contentType.toLowerCase().startsWith('multipart/form-data')) return json({ error: 'invalid_content_type' }, 415, corsHeaders)
  const length = request.headers.get('Content-Length')
  if (!length) return json({ error: 'length_required' }, 411, corsHeaders)
  if (!/^\d+$/.test(length)) return json({ error: 'invalid_content_length' }, 400, corsHeaders)
  if (Number(length) > maxBodyBytes) return json({ error: 'payload_too_large' }, 413, corsHeaders)
  let form: FormData
  try {
    // Bound actual bytes too: Content-Length alone is not a trusted size limit.
    const reader = request.body?.getReader()
    if (!reader) return json({ error: 'invalid_form_data' }, 400, corsHeaders)
    const chunks: Uint8Array[] = []
    let received = 0
    try {
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        received += value.byteLength
        if (received > maxBodyBytes) {
          await reader.cancel()
          return json({ error: 'payload_too_large' }, 413, corsHeaders)
        }
        chunks.push(value)
      }
    } finally { reader.releaseLock() }
    form = await new Response(new Blob(chunks), { headers: { 'Content-Type': contentType } }).formData()
  } catch {
    return json({ error: 'invalid_form_data' }, 400, corsHeaders)
  }
  const orderId = form.get('order_id')
  const rawToken = form.get('token')
  const methodId = form.get('method_id')
  const file = form.get('file')
  if (typeof orderId !== 'string' || !uuidPattern.test(orderId)
    || typeof rawToken !== 'string' || !tokenPattern.test(rawToken)
    || typeof methodId !== 'string' || !uuidPattern.test(methodId)
    || !(file instanceof File)) {
    return json({ error: 'invalid_input' }, 400, corsHeaders)
  }
  if (file.size === 0 || file.size > maxFileBytes) {
    return json({ error: 'invalid_file' }, 400, corsHeaders)
  }
  const detected = sniff(new Uint8Array(await file.arrayBuffer()))
  if (!detected) return json({ error: 'invalid_file' }, 400, corsHeaders)

  const tokenHash = await hashToken(rawToken)
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  })
  const { data: order, error: orderError } = await supabase
    .from('shop_orders')
    .select('token_hash, status, proof_path, expires_at, account_revoked_at')
    .eq('id', orderId)
    .maybeSingle()
  if (orderError) return json({ error: 'lookup_failed' }, 500, corsHeaders)
  if (!order || order.token_hash !== tokenHash) return json({ error: 'unauthorized' }, 401, corsHeaders)
  if (order.account_revoked_at) return json({ error: 'account_revoked' }, 410, corsHeaders)
  if (order.status === 'expired' || (order.status === 'draft' && Date.parse(order.expires_at) <= Date.now())) return json({ error: 'order_expired' }, 410, corsHeaders)
  if (order.status !== 'draft' || order.proof_path) return json({ error: 'invalid_status' }, 409, corsHeaders)

  const path = `${orderId}/${crypto.randomUUID()}.${detected.extension}`
  const { error: uploadError } = await supabase.storage.from('proofs').upload(path, file, {
    contentType: detected.contentType,
    upsert: false
  })
  if (uploadError) return json({ error: 'upload_failed' }, 500, corsHeaders)

  const { error: recordError } = await supabase.rpc('shop_record_proof_upload', {
    p_order_id: orderId,
    p_token_hash: tokenHash,
    p_proof_path: path, p_method_id: methodId
  })
  if (recordError) {
    await supabase.storage.from('proofs').remove([path])
    const errors: Record<string, number> = { unauthorized: 401, invalid_status: 409, order_expired: 410, invalid_method: 409, invalid_path: 400 }
    const code = Object.hasOwn(errors, recordError.message) ? recordError.message : 'record_failed'
    return json({ error: code }, errors[code] ?? 500, corsHeaders)
  }
  return json({ ok: true }, 200, corsHeaders)
})
