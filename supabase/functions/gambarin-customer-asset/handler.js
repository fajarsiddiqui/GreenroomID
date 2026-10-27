import { customerCors } from '../_shared/gambarin-customer-cors.js'

const authOptions = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function createHandler({ createClient, env, fetchImpl }) {
  return async function handle(request) {
    const cors = customerCors(request, env('GAMBARIN_CUSTOMER_ALLOWED_ORIGIN'))
    if (cors.denial) return cors.denial
    if (cors.preflight) return cors.preflight
    if (request.method !== 'POST') return cors.json({ error: 'method_not_allowed' }, 405)
    if (new URL(request.url).pathname.replace(/\/$/, '').split('/').at(-1) !== 'gambarin-customer-asset') {
      return cors.json({ error: 'not_found' }, 404)
    }
    const jwt = request.headers.get('Authorization')?.match(/^Bearer (\S+)$/i)?.[1]
    if (!jwt) return cors.json({ error: 'unauthorized' }, 401)
    const url = env('SUPABASE_URL')?.trim()
    const anonKey = env('SUPABASE_ANON_KEY')?.trim()
    const triggerKey = env('GAMBARIN_WORKER_TRIGGER_KEY')?.trim()
    if (!url || !anonKey || !triggerKey) return cors.json({ error: 'server_configuration_error' }, 503)
    try {
      const raw = await request.text()
      if (raw.length > 120) return cors.json({ error: 'invalid_input' }, 400)
      const input = JSON.parse(raw)
      if (!input || typeof input !== 'object' || Array.isArray(input)
        || Object.keys(input).some(key => !['job_id', 'download'].includes(key))
        || (input.download !== undefined && input.download !== true)
        || !uuidPattern.test(input.job_id || '')) {
        return cors.json({ error: 'invalid_input' }, 400)
      }
      const caller = createClient(url, anonKey, { auth: authOptions,
        global: { headers: { Authorization: `Bearer ${jwt}` } },
      })
      const { data: identity, error: authError } = await caller.auth.getUser(jwt)
      if (authError || !identity?.user?.id) return cors.json({ error: 'unauthorized' }, 401)
      const { data: ownJob, error: ownerError } = await caller.rpc('gambarin_my_job_status', { p_job_id: input.job_id })
      if (ownerError || !ownJob || ownJob.status !== 'succeeded'
        || ownJob.asset?.state !== 'resolvable') return cors.json({ error: 'asset_not_found' }, 404)
      const upstream = await fetchImpl(new URL('/functions/v1/gambarin-worker/resolve', url), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: anonKey,
          Authorization: `Bearer ${triggerKey}` },
        body: JSON.stringify({ job_id: input.job_id }),
      })
      const body = await upstream.json().catch(() => ({}))
      if (!upstream.ok || !body.asset?.url) return cors.json({ error: 'asset_unavailable' }, 503)
      if (input.download === true) {
        const assetUrl = new URL(body.asset.url)
        if (assetUrl.protocol !== 'https:' || assetUrl.username || assetUrl.password) {
          return cors.json({ error: 'asset_unavailable' }, 503)
        }
        const original = await fetchImpl(assetUrl, { redirect: 'error', signal: AbortSignal.timeout(45000) })
        const type = original.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase()
        if (!original.ok || !['image/jpeg', 'image/png', 'image/webp'].includes(type)) {
          return cors.json({ error: 'asset_unavailable' }, 503)
        }
        const limit = 25 * 1024 * 1024
        if (Number(original.headers.get('Content-Length')) > limit) {
          return cors.json({ error: 'asset_unavailable' }, 503)
        }
        const reader = original.body?.getReader()
        if (!reader) return cors.json({ error: 'asset_unavailable' }, 503)
        const chunks = []
        let size = 0
        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            size += value.byteLength
            if (size > limit) return cors.json({ error: 'asset_unavailable' }, 503)
            chunks.push(value)
          }
        } finally { await reader.cancel().catch(() => {}) }
        return new Response(new Blob(chunks, { type }), { headers: { ...cors.headers,
          'Content-Type': type, 'Cache-Control': 'private, no-store',
          'X-Content-Type-Options': 'nosniff' } })
      }
      return cors.json({ asset: body.asset })
    } catch {
      return cors.json({ error: 'asset_unavailable' }, 503)
    }
  }
}
