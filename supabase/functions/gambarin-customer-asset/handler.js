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
      if (raw.length > 100) return cors.json({ error: 'invalid_input' }, 400)
      const input = JSON.parse(raw)
      if (!input || typeof input !== 'object' || Array.isArray(input)
        || Object.keys(input).length !== 1 || !uuidPattern.test(input.job_id || '')) {
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
      return cors.json({ asset: body.asset })
    } catch {
      return cors.json({ error: 'asset_unavailable' }, 503)
    }
  }
}
