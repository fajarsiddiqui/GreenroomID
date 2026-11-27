import { createClient } from 'npm:@supabase/supabase-js@2'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const tokenPattern = /^[0-9a-f]{64}$/i
const wibTime = new Intl.DateTimeFormat('id-ID', {
  timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
})

async function hashToken(token: string) {
  const bytes = Uint8Array.from(token.match(/../g)!, (part) => Number.parseInt(part, 16))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function sendTelegram(botToken: string, chatId: string, text: string, eventId: string) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, link_preview_options: { is_disabled: true } }),
      signal: AbortSignal.timeout(5000),
    })
    const result = await response.json()
    if (response.ok && result?.ok === true) return

    // Telegram explicitly rejects rate-limited sends. A timeout could have already delivered the message.
    const retryAfter = result?.parameters?.retry_after
    if (attempt === 0 && response.status === 429 && Number.isInteger(retryAfter) && retryAfter >= 0 && retryAfter <= 3) {
      await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000))
      continue
    }
    console.error('otp_copy_telegram_rejected', { event_id: eventId, status: response.status })
    return
  }
}

Deno.serve(async (request) => {
  const origin = request.headers.get('Origin')
  const allowed = (Deno.env.get('SHOP_ALLOWED_ORIGIN') ?? '').split(',').map((item) => item.trim()).filter(Boolean)
  if (!origin || !allowed.includes(origin)) return new Response(null, { status: 403 })
  const cors = {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Cache-Control': 'no-store', Vary: 'Origin',
  }
  const reply = (status: number) => new Response(null, { status, headers: cors })
  if (request.method === 'OPTIONS') return reply(204)
  if (request.method !== 'POST') return reply(405)

  let body: Record<string, unknown>
  try {
    body = await request.json()
    if (!body || typeof body !== 'object' || Array.isArray(body)) return reply(400)
  } catch { return reply(400) }

  const { source, id, token, access, window_start_ms: windowStartMs, event_id: eventId } = body
  if ((source !== 'order' && source !== 'reissue') || typeof id !== 'string' || !uuid.test(id)
    || typeof token !== 'string' || !tokenPattern.test(token)
    || (access === undefined ? source === 'reissue' : typeof access !== 'string' || !tokenPattern.test(access))
    || typeof eventId !== 'string' || !uuid.test(eventId) || typeof windowStartMs !== 'number'
    || !Number.isSafeInteger(windowStartMs) || windowStartMs <= 0 || windowStartMs % 30000 !== 0) return reply(400)

  const url = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !serviceKey) return reply(500)

  try {
    const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data, error } = await db.rpc('shop_record_otp_copy', {
      p_source: source, p_id: id, p_token_hash: await hashToken(token),
      p_access_hash: typeof access === 'string' ? await hashToken(access) : null,
      p_window_start_ms: windowStartMs, p_copy_event_id: eventId,
    })
    if (error) throw error
    if (data?.state === 'duplicate') return reply(204)
    if (data?.state === 'rate_limited') return reply(429)
    if (data?.state !== 'recorded') return reply(403)

    const botToken = Deno.env.get('SHOP_TELEGRAM_BOT_TOKEN')
    const chatId = Deno.env.get('SHOP_TELEGRAM_CHAT_ID')
    if (!botToken || !/^\d+:[\w-]+$/.test(botToken) || !chatId || !/^[1-9]\d*$/.test(chatId)) {
      console.error('otp_copy_telegram_not_configured', { event_id: eventId })
      return reply(204)
    }
    const time = wibTime.format(new Date(data.received_at))
    const buyerName = String(data.buyer_name).replace(/\s+/g, ' ').trim()
    const text = `${buyerName} telah mengambil OTP di akun ${data.account_email} pada ${time} WIB.`
    try { await sendTelegram(botToken, chatId, text, eventId) }
    catch { console.error('otp_copy_telegram_delivery_unknown', { event_id: eventId }) }
    return reply(204)
  } catch {
    console.error('otp_copy_report_failed', { event_id: eventId })
    return reply(500)
  }
})
