import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })

const cleanName = (value: unknown) => String(value || '').trim().replace(/\s+/g, ' ').slice(0, 80)
const cleanText = (value: unknown) => String(value || '').trim().replace(/\s+/g, ' ').slice(0, 180)
const cleanGuestId = (value: unknown) => String(value || '').trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 96)

const createOrderId = () => {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)
  const random = crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()
  return `GRD-DON-${stamp}-${random}`
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const midtransServerKey = Deno.env.get('MIDTRANS_SERVER_KEY')
    const isProduction = Deno.env.get('MIDTRANS_IS_PRODUCTION') === 'true'
    const siteUrl = Deno.env.get('SITE_URL') || 'https://greenroomid.com'

    if (!supabaseUrl || !anonKey || !serviceRoleKey || !midtransServerKey) {
      return jsonResponse({ error: 'Environment variable Supabase/Midtrans belum lengkap.' }, 500)
    }

    const body = await req.json().catch(() => ({}))
    const amount = Math.round(Number(body.amount || 0))
    const donorMessage = cleanText(body.donor_message)
    const showPublic = body.show_public !== false
    const incomingGuestId = cleanGuestId(body.guest_id)
    const authHeader = req.headers.get('Authorization') || ''

    const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false }
    })

    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: authHeader ? { Authorization: authHeader } : {} },
      auth: { persistSession: false }
    })

    const { data: settings } = await serviceClient
      .from('donation_settings')
      .select('is_enabled, show_donate_page, min_amount')
      .eq('id', 'default')
      .maybeSingle()

    if (settings?.is_enabled === false || settings?.show_donate_page === false) {
      return jsonResponse({ error: 'Donasi sedang ditutup sementara.' }, 403)
    }

    const minAmount = Number(settings?.min_amount || 5000)
    if (!Number.isFinite(amount) || amount < minAmount) {
      return jsonResponse({ error: `Minimal donasi adalah Rp${minAmount}.` }, 400)
    }

    const { data: authData } = authHeader ? await authClient.auth.getUser() : { data: { user: null } }
    const user = authData?.user || null

    let profile: Record<string, unknown> | null = null
    if (user?.id) {
      const { data } = await serviceClient
        .from('user_profiles')
        .select('full_name, donor_display_name, donor_public_default, phone')
        .eq('id', user.id)
        .maybeSingle()
      profile = data || null
    }

    const incomingName = cleanName(body.donor_name)
    const profileName = cleanName(profile?.donor_display_name || profile?.full_name)
    const fallbackName = cleanName(user?.user_metadata?.full_name || user?.user_metadata?.name || String(user?.email || '').split('@')[0])
    const publicName = incomingName || profileName || fallbackName || 'Anonim'
    const donorEmail = user?.email || cleanName(body.donor_email) || null
    const donorPhone = cleanName(profile?.phone || body.donor_phone) || null
    const orderId = createOrderId()
    const guestId = user?.id ? null : (incomingGuestId || crypto.randomUUID())

    let donorName = publicName
    let displayMode = 'public'
    let donorIdentityKey = user?.id ? `user:${user.id}` : `guest:${guestId}`
    let anonymousAlias: string | null = null
    let leaderboardKey = user?.id
      ? `public:user:${user.id}`
      : `public:guest:${guestId}:${publicName.toLowerCase().replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '') || 'donatur'}`
    let leaderboardName = publicName

    if (!showPublic) {
      displayMode = 'anonymous'
      const { data: anonymousRows, error: anonymousError } = await serviceClient.rpc('ensure_donor_anonymous_identity', {
        p_user_id: user?.id || null,
        p_guest_id: guestId
      })

      if (anonymousError) {
        return jsonResponse({ error: anonymousError.message }, 500)
      }

      const anonymousIdentity = Array.isArray(anonymousRows) ? anonymousRows[0] : anonymousRows
      donorIdentityKey = String(anonymousIdentity?.identity_key || donorIdentityKey)
      anonymousAlias = String(anonymousIdentity?.anonymous_alias || 'Anonim')
      donorName = anonymousAlias
      leaderboardKey = `anonymous:${donorIdentityKey}`
      leaderboardName = anonymousAlias
    }

    const { data: donation, error: insertError } = await serviceClient
      .from('donations')
      .insert({
        order_id: orderId,
        user_id: user?.id || null,
        guest_id: guestId,
        donor_name: donorName,
        donor_email: donorEmail,
        donor_phone: donorPhone,
        donor_message: donorMessage || null,
        show_public: showPublic,
        display_mode: displayMode,
        donor_identity_key: donorIdentityKey,
        anonymous_alias: anonymousAlias,
        leaderboard_key: leaderboardKey,
        leaderboard_name: leaderboardName,
        amount,
        status: 'pending'
      })
      .select('id, order_id')
      .single()

    if (insertError) {
      return jsonResponse({ error: insertError.message }, 500)
    }

    const endpoint = isProduction
      ? 'https://app.midtrans.com/snap/v1/transactions'
      : 'https://app.sandbox.midtrans.com/snap/v1/transactions'

    const basicAuth = btoa(`${midtransServerKey}:`)
    const snapPayload = {
      transaction_details: {
        order_id: orderId,
        gross_amount: amount
      },
      item_details: [
        {
          id: 'greenroomid-donation',
          price: amount,
          quantity: 1,
          name: 'Donasi GreenroomID'
        }
      ],
      customer_details: {
        first_name: donorName,
        email: donorEmail || undefined,
        phone: donorPhone || undefined
      },
      callbacks: {
        finish: `${siteUrl}/top-donatur?donation=success&order_id=${encodeURIComponent(orderId)}`,
        error: `${siteUrl}/donate-us?status=error&order_id=${encodeURIComponent(orderId)}`,
        pending: `${siteUrl}/top-donatur?donation=pending&order_id=${encodeURIComponent(orderId)}`
      },
      custom_field1: 'greenroomid_donation'
    }

    const midtransResponse = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basicAuth}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify(snapPayload)
    })

    const midtransData = await midtransResponse.json().catch(() => ({}))
    if (!midtransResponse.ok) {
      await serviceClient
        .from('donations')
        .update({
          status: 'failed',
          raw_notification: { source: 'create-donation', response: midtransData },
          updated_at: new Date().toISOString()
        })
        .eq('id', donation.id)

      return jsonResponse({ error: 'Midtrans gagal membuat invoice.', detail: midtransData }, 502)
    }

    await serviceClient
      .from('donations')
      .update({
        midtrans_token: midtransData.token || null,
        midtrans_redirect_url: midtransData.redirect_url || null,
        updated_at: new Date().toISOString()
      })
      .eq('id', donation.id)

    return jsonResponse({
      order_id: orderId,
      token: midtransData.token,
      redirect_url: midtransData.redirect_url
    })
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'Unknown error' }, 500)
  }
})
