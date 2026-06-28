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

const sha512Hex = async (text: string) => {
  const encoder = new TextEncoder()
  const data = encoder.encode(text)
  const hashBuffer = await crypto.subtle.digest('SHA-512', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

const mapDonationStatus = (transactionStatus: string, fraudStatus?: string) => {
  const status = String(transactionStatus || '').toLowerCase()
  const fraud = String(fraudStatus || '').toLowerCase()

  if (status === 'settlement') return 'paid'
  if (status === 'capture') return !fraud || fraud === 'accept' ? 'paid' : 'failed'
  if (status === 'pending') return 'pending'
  if (status === 'expire') return 'expired'
  if (status === 'cancel') return 'cancelled'
  if (status === 'deny' || status === 'failure') return 'failed'
  if (status === 'refund' || status === 'partial_refund') return 'refunded'
  return 'pending'
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const midtransServerKey = Deno.env.get('MIDTRANS_SERVER_KEY')

    if (!supabaseUrl || !serviceRoleKey || !midtransServerKey) {
      return jsonResponse({ error: 'Environment variable Supabase/Midtrans belum lengkap.' }, 500)
    }

    const body = await req.json().catch(() => null)
    if (!body) return jsonResponse({ error: 'Invalid JSON' }, 400)

    const orderId = String(body.order_id || '')
    const statusCode = String(body.status_code || '')
    const grossAmount = String(body.gross_amount || '')
    const incomingSignature = String(body.signature_key || '')

    if (!orderId || !statusCode || !grossAmount || !incomingSignature) {
      return jsonResponse({ error: 'Payload Midtrans tidak lengkap.' }, 400)
    }

    const expectedSignature = await sha512Hex(`${orderId}${statusCode}${grossAmount}${midtransServerKey}`)
    if (expectedSignature !== incomingSignature) {
      return jsonResponse({ error: 'Invalid signature_key.' }, 403)
    }

    const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false }
    })

    const transactionStatus = String(body.transaction_status || '')
    const fraudStatus = String(body.fraud_status || '')
    const nextStatus = mapDonationStatus(transactionStatus, fraudStatus)
    const isPaid = nextStatus === 'paid'

    const updatePayload: Record<string, unknown> = {
      status: nextStatus,
      payment_method: body.payment_type || null,
      midtrans_transaction_id: body.transaction_id || null,
      midtrans_transaction_status: transactionStatus || null,
      midtrans_fraud_status: fraudStatus || null,
      midtrans_status_code: statusCode,
      midtrans_gross_amount: grossAmount,
      raw_notification: body,
      updated_at: new Date().toISOString()
    }

    if (isPaid) {
      updatePayload.paid_at = body.settlement_time ? new Date(body.settlement_time).toISOString() : new Date().toISOString()
    }

    if (nextStatus === 'expired') {
      updatePayload.expired_at = new Date().toISOString()
    }

    const { data, error } = await serviceClient
      .from('donations')
      .update(updatePayload)
      .eq('order_id', orderId)
      .select('id, order_id, status')
      .maybeSingle()

    if (error) return jsonResponse({ error: error.message }, 500)
    if (!data) return jsonResponse({ error: 'Order ID tidak ditemukan.' }, 404)

    return jsonResponse({ ok: true, order_id: orderId, status: nextStatus })
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'Unknown error' }, 500)
  }
})
