import { customerCors } from '../_shared/gambarin-customer-cors.js'

const authOptions = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const errorMap = {
  invalid_enqueue_input: [400, 'invalid_input'],
  idempotency_conflict: [409, 'idempotency_conflict'],
  account_not_found: [403, 'account_inactive'],
  account_inactive: [403, 'account_inactive'],
  account_expired: [403, 'account_expired'],
  quota_unavailable: [409, 'quota_unavailable'],
  queue_full: [409, 'queue_full'],
}

export function createHandler({ createClient, env }) {
  return async function handle(request) {
    const cors = customerCors(request, env('GAMBARIN_CUSTOMER_ALLOWED_ORIGIN'))
    if (cors.denial) return cors.denial
    if (cors.preflight) return cors.preflight
    if (request.method !== 'POST') return cors.json({ error: 'method_not_allowed' }, 405)
    if (new URL(request.url).pathname.replace(/\/$/, '').split('/').at(-1) !== 'gambarin-customer-enqueue') {
      return cors.json({ error: 'not_found' }, 404)
    }
    const jwt = request.headers.get('Authorization')?.match(/^Bearer (\S+)$/i)?.[1]
    if (!jwt) return cors.json({ error: 'unauthorized' }, 401)
    const url = env('SUPABASE_URL')?.trim()
    const anonKey = env('SUPABASE_ANON_KEY')?.trim()
    const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY')?.trim()
    if (!url || !anonKey || !serviceKey) return cors.json({ error: 'server_configuration_error' }, 503)

    try {
      const caller = createClient(url, anonKey, { auth: authOptions,
        global: { headers: { Authorization: `Bearer ${jwt}` } },
      })
      const { data: identity, error: authError } = await caller.auth.getUser(jwt)
      if (authError || !identity?.user?.id) return cors.json({ error: 'unauthorized' }, 401)
      let input
      try {
        const text = await request.text()
        if (text.length > 5000) return cors.json({ error: 'invalid_input' }, 400)
        input = JSON.parse(text)
      } catch { return cors.json({ error: 'invalid_json' }, 400) }
      if (!input || typeof input !== 'object' || Array.isArray(input)
        || Object.keys(input).some((key) => !['prompt', 'idempotency_key'].includes(key))
        || typeof input.prompt !== 'string' || !input.prompt.trim()
        || input.prompt.trim().length > 4000 || !uuidPattern.test(input.idempotency_key || '')) {
        return cors.json({ error: 'invalid_input' }, 400)
      }
      const admin = createClient(url, serviceKey, { auth: authOptions })
      const { data: job, error } = await admin.rpc('gambarin_enqueue_job', {
        p_auth_user_id: identity.user.id,
        p_idempotency_key: input.idempotency_key,
        p_prompt: input.prompt.trim(),
      })
      if (error) {
        const mapped = errorMap[error.message]
        return cors.json({ error: mapped?.[1] || 'enqueue_unavailable' }, mapped?.[0] || 503)
      }
      if (!job?.id) return cors.json({ error: 'enqueue_unavailable' }, 503)
      // A failure to read status cannot undo an enqueue. Always return the ID.
      const { data: status } = await caller.rpc('gambarin_my_job_status', { p_job_id: job.id })
      return cors.json({ job_id: job.id, status: job.status, queue_position: status?.queue_position ?? null })
    } catch {
      return cors.json({ error: 'enqueue_unavailable' }, 503)
    }
  }
}
