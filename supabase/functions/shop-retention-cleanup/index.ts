import { createClient } from 'npm:@supabase/supabase-js@2'

const dayMs = 24 * 60 * 60 * 1000
const maxBatches = 5
const batchSize = 100

async function sameSecret(received: string, expected: string): Promise<boolean> {
  const encoder = new TextEncoder()
  const [left, right] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(received)),
    crypto.subtle.digest('SHA-256', encoder.encode(expected))
  ])
  const a = new Uint8Array(left)
  const b = new Uint8Array(right)
  let difference = 0
  for (let i = 0; i < a.length; i += 1) difference |= a[i] ^ b[i]
  return difference === 0
}

function counts(deleted: number, failed: number, status = 200): Response {
  return new Response(JSON.stringify({ deleted, failed }), {
    status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  })
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response(null, { status: 405 })
  const expected = Deno.env.get('SHOP_CRON_SECRET') ?? ''
  const received = request.headers.get('x-internal-secret') ?? ''
  if (!expected || !received || !(await sameSecret(received, expected))) {
    return new Response(null, { status: 401 })
  }

  const url = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !serviceKey) return counts(0, 0, 500)
  const db = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  })
  const cutoff = new Date(Date.now() - 90 * dayMs).toISOString()
  const olderThanCutoff = `verified_at.lt.${cutoff},and(verified_at.is.null,updated_at.lt.${cutoff}),and(verified_at.is.null,updated_at.is.null,created_at.lt.${cutoff})`
  let deleted = 0
  let failed = 0
  let cursor: string | null = null

  try {
    for (let batch = 0; batch < maxBatches; batch += 1) {
    let query = db.from('shop_orders').select('id, status, proof_path')
      .in('status', ['verified', 'rejected', 'expired'])
      .not('proof_path', 'is', null).is('proof_deleted_at', null)
      .or(olderThanCutoff).order('id').limit(batchSize)
    if (cursor) query = query.gt('id', cursor)
    const { data: orders, error } = await query
    if (error || !orders) return counts(deleted, failed, 500)
    if (orders.length === 0) break
    cursor = orders[orders.length - 1].id

      for (let offset = 0; offset < orders.length; offset += 10) {
      const results = await Promise.all(orders.slice(offset, offset + 10).map(async (order) => {
        try {
          if (!order.proof_path) return false
          const { error: storageError } = await db.storage.from('proofs').remove([order.proof_path])
          if (storageError) return false
          const { data: updated, error: updateError } = await db.from('shop_orders')
            .update({ proof_path: null, proof_deleted_at: new Date().toISOString() })
            .eq('id', order.id).eq('status', order.status)
            .eq('proof_path', order.proof_path).is('proof_deleted_at', null)
            .or(olderThanCutoff).select('id').maybeSingle()
          return !updateError && !!updated
        } catch { return false }
      }))
      for (const succeeded of results) {
        if (succeeded) deleted += 1
        else failed += 1
      }
      }
      if (orders.length < batchSize) break
    }
  } catch { return counts(deleted, failed, 500) }

  return counts(deleted, failed)
})
