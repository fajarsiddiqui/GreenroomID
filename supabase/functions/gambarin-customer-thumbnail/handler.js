import { customerCors } from '../_shared/gambarin-customer-cors.js'

const authOptions = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function createHandler({ createClient, env }) {
  return async function handle(request) {
    const cors = customerCors(request, env('GAMBARIN_CUSTOMER_ALLOWED_ORIGIN'))
    if (cors.denial) return cors.denial
    if (cors.preflight) return cors.preflight
    if (request.method !== 'POST') return cors.json({ error: 'method_not_allowed' }, 405)
    const jwt = request.headers.get('Authorization')?.match(/^Bearer (\S+)$/i)?.[1]
    if (!jwt) return cors.json({ error: 'unauthorized' }, 401)
    const url = env('SUPABASE_URL')?.trim()
    const anonKey = env('SUPABASE_ANON_KEY')?.trim()
    const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY')?.trim()
    if (!url || !anonKey || !serviceKey) return cors.json({ error: 'server_configuration_error' }, 503)
    let input
    try {
      const raw = await request.text()
      if (raw.length > 100) return cors.json({ error: 'invalid_input' }, 400)
      input = JSON.parse(raw)
    } catch { return cors.json({ error: 'invalid_input' }, 400) }
    if (!input || typeof input !== 'object' || Array.isArray(input)
      || Object.keys(input).length !== 1 || !uuidPattern.test(input.job_id || '')) {
      return cors.json({ error: 'invalid_input' }, 400)
    }
    try {
      const caller = createClient(url, anonKey, { auth: authOptions,
        global: { headers: { Authorization: `Bearer ${jwt}` } } })
      const { data: identity, error: authError } = await caller.auth.getUser(jwt)
      if (authError || !identity?.user?.id) return cors.json({ error: 'unauthorized' }, 401)
      const { data: job, error: jobError } = await caller.rpc('gambarin_my_job_status', {
        p_job_id: input.job_id,
      })
      if (jobError || !job || job.status !== 'succeeded') return cors.json({ error: 'not_found' }, 404)
      const { data: row, error: rowError } = await caller.from('gambarin_thumbnails')
        .select('job_id,status').eq('job_id', input.job_id).maybeSingle()
      if (rowError || !row) return cors.json({ error: 'thumbnail_unavailable' }, 404)
      if (row.status !== 'ready') return cors.json({ error: row.status }, 409)
      const admin = createClient(url, serviceKey, { auth: authOptions })
      // Derive the path from the verified owner's account rather than any
      // browser-supplied path; the table is never writable by customers.
      const { data: account, error: accountError } = await caller.from('gambarin_accounts')
        .select('id').eq('auth_user_id', identity.user.id).maybeSingle()
      if (accountError || !account) return cors.json({ error: 'not_found' }, 404)
      const path = `${account.id}/${input.job_id}.webp`
      const { data: blob, error: downloadError } = await admin.storage
        .from('gambarin-thumbnails').download(path)
      if (downloadError || !blob || blob.type !== 'image/webp' || blob.size > 1048576) {
        return cors.json({ error: 'thumbnail_unavailable' }, 503)
      }
      return new Response(blob, { headers: { ...cors.headers,
        'Content-Type': 'image/webp', 'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff' } })
    } catch { return cors.json({ error: 'thumbnail_unavailable' }, 503) }
  }
}
