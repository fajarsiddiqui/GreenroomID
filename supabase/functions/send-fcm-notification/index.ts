import { createClient } from 'npm:@supabase/supabase-js@2.108.0'

type NotificationRecord = {
  id: string
  recipient_user_id: string
  type?: string
  priority?: 'critical' | 'important' | 'operational' | 'info'
  title: string
  body?: string | null
  target_route?: string | null
  metadata?: Record<string, unknown> | null
  push_sent_at?: string | null
}

type FirebaseServiceAccount = {
  project_id: string
  client_email: string
  private_key: string
  token_uri?: string
}

const encoder = new TextEncoder()
let cachedAccessToken: { token: string; expiresAt: number } | null = null

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' }
  })
}

function base64Url(input: string | Uint8Array) {
  const bytes = typeof input === 'string' ? encoder.encode(input) : input
  let binary = ''
  bytes.forEach((byte) => { binary += String.fromCharCode(byte) })
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function pemToArrayBuffer(pem: string) {
  const normalized = pem.replace(/\\n/g, '\n')
  const base64 = normalized
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s+/g, '')
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes.buffer
}

async function createSignedJwt(credentials: FirebaseServiceAccount) {
  const now = Math.floor(Date.now() / 1000)
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const payload = base64Url(JSON.stringify({
    iss: credentials.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: credentials.token_uri || 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  }))
  const unsigned = `${header}.${payload}`

  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(credentials.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, encoder.encode(unsigned))
  return `${unsigned}.${base64Url(new Uint8Array(signature))}`
}

async function getGoogleAccessToken(credentials: FirebaseServiceAccount) {
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 60_000) {
    return cachedAccessToken.token
  }

  const assertion = await createSignedJwt(credentials)
  const response = await fetch(credentials.token_uri || 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion
    })
  })
  const result = await response.json()
  if (!response.ok || !result.access_token) {
    throw new Error(`Google OAuth gagal: ${result.error_description || result.error || response.status}`)
  }

  cachedAccessToken = {
    token: result.access_token,
    expiresAt: Date.now() + Number(result.expires_in || 3600) * 1000
  }
  return result.access_token
}

function shouldSendPush(mode: string | null | undefined, priority: string | null | undefined) {
  if (mode === 'off') return false
  if (mode === 'all') return true
  if (mode === 'operational') return ['critical', 'important', 'operational'].includes(priority || 'info')
  return ['critical', 'important'].includes(priority || 'info')
}

function categoryEnabled(preferences: Record<string, unknown> | null, notification: NotificationRecord) {
  if (!preferences) return true
  const searchable = `${notification.type || ''} ${notification.title || ''} ${notification.body || ''}`.toLowerCase()
  if (/payment|pembayaran|invoice|revenue/.test(searchable)) return preferences.payment_enabled !== false
  if (/form|formulir/.test(searchable)) return preferences.form_enabled !== false
  if (/learning|pembelajaran|review|publikasi/.test(searchable)) return preferences.learning_enabled !== false
  if (/security|login|mencurigakan|unauthorized/.test(searchable)) return preferences.security_enabled !== false
  if (/request|pesanan/.test(searchable)) return preferences.request_enabled !== false
  return preferences.system_enabled !== false
}

function absoluteLink(siteUrl: string, route?: string | null) {
  try {
    return new URL(route || '/admin/audit-logs', siteUrl).href
  } catch {
    return `${siteUrl.replace(/\/$/, '')}/admin/audit-logs`
  }
}

function isInvalidTokenResponse(result: any) {
  const status = result?.error?.status
  const details = result?.error?.details || []
  return status === 'NOT_FOUND' || details.some((item: any) => item?.errorCode === 'UNREGISTERED')
}

Deno.serve(async (request: Request) => {
    if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

    const expectedSecret = Deno.env.get('GREENROOM_WEBHOOK_SECRET') || ''
    const suppliedSecret = request.headers.get('x-greenroom-webhook-secret') || ''
    if (!expectedSecret || suppliedSecret !== expectedSecret) {
      return jsonResponse({ error: 'Unauthorized webhook' }, 401)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const siteUrl =
      Deno.env.get('SITE_URL_FIREBASE') ||
      Deno.env.get('SITE_URL') ||
      'https://greenroomid.com'
    const serviceAccountRaw = Deno.env.get('FIREBASE_SERVICE_ACCOUNT_JSON') || ''

    if (!supabaseUrl || !serviceRoleKey || !serviceAccountRaw) {
      return jsonResponse({ error: 'Edge Function secrets belum lengkap' }, 500)
    }

    let credentials: FirebaseServiceAccount
    try {
      credentials = JSON.parse(serviceAccountRaw)
    } catch {
      return jsonResponse({ error: 'FIREBASE_SERVICE_ACCOUNT_JSON bukan JSON valid' }, 500)
    }

    const payload = await request.json().catch(() => null)
    const notification = (payload?.record || payload) as NotificationRecord | null
    if (!notification?.id || !notification?.recipient_user_id) {
      return jsonResponse({ error: 'Payload notification tidak valid' }, 400)
    }

    if (notification.push_sent_at) {
      return jsonResponse({ ok: true, skipped: 'already-sent' })
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    })

    const [{ data: preferences }, { data: subscriptions, error: subscriptionError }] = await Promise.all([
      supabase
        .from('notification_preferences')
        .select('*')
        .eq('user_id', notification.recipient_user_id)
        .maybeSingle(),
      supabase
        .from('push_subscriptions')
        .select('id, fcm_token')
        .eq('user_id', notification.recipient_user_id)
        .eq('enabled', true)
    ])

    if (subscriptionError) return jsonResponse({ error: subscriptionError.message }, 500)

    const mode = preferences?.notification_mode || 'important'
    if (!shouldSendPush(mode, notification.priority) || !categoryEnabled(preferences, notification)) {
      return jsonResponse({ ok: true, skipped: 'preference' })
    }

    if (!subscriptions?.length) {
      return jsonResponse({ ok: true, skipped: 'no-active-device' })
    }

    const accessToken = await getGoogleAccessToken(credentials)
    const endpoint = `https://fcm.googleapis.com/v1/projects/${credentials.project_id}/messages:send`
    const link = absoluteLink(siteUrl, notification.target_route)
    const results = []

    for (const subscription of subscriptions) {
      const { data: delivery } = await supabase
        .from('notification_deliveries')
        .insert({
          notification_id: notification.id,
          push_subscription_id: subscription.id,
          status: 'pending'
        })
        .select('id')
        .single()

      const fcmResponse = await fetch(endpoint, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          message: {
            token: subscription.fcm_token,
            data: {
              title: String(notification.title || 'Aktivitas baru'),
              body: String(notification.body || 'Buka GreenroomID untuk melihat pembaruan.'),
              link,
              priority: String(notification.priority || 'info'),
              notification_id: String(notification.id),
              tag: `greenroom-${notification.type || 'activity'}-${notification.id}`,
              icon: '/icons/greenroomid-192.png',
              badge: '/icons/greenroomid-192.png'
            },
            webpush: {
              headers: {
                Urgency: ['critical', 'important'].includes(notification.priority || '') ? 'high' : 'normal',
                TTL: '86400'
              }
            }
          }
        })
      })

      const fcmResult = await fcmResponse.json().catch(() => ({}))
      if (fcmResponse.ok) {
        await supabase
          .from('notification_deliveries')
          .update({ status: 'sent', provider_message_id: fcmResult.name || null, sent_at: new Date().toISOString() })
          .eq('id', delivery?.id)
        results.push({ subscriptionId: subscription.id, status: 'sent' })
      } else {
        const reason = JSON.stringify(fcmResult).slice(0, 1500)
        await supabase
          .from('notification_deliveries')
          .update({ status: 'failed', failure_reason: reason, failed_at: new Date().toISOString() })
          .eq('id', delivery?.id)

        if (isInvalidTokenResponse(fcmResult)) {
          await supabase
            .from('push_subscriptions')
            .update({ enabled: false, updated_at: new Date().toISOString() })
            .eq('id', subscription.id)
        }
        results.push({ subscriptionId: subscription.id, status: 'failed', reason })
      }
    }

    const sentCount = results.filter((item) => item.status === 'sent').length
    await supabase
      .from('notifications')
      .update(sentCount > 0
        ? { push_sent_at: new Date().toISOString(), push_failed_at: null }
        : { push_failed_at: new Date().toISOString() })
      .eq('id', notification.id)

    return jsonResponse({ ok: true, sent: sentCount, total: results.length, results })
})
