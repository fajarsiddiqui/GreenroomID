import { customerCors } from '../_shared/gambarin-customer-cors.js'

const authOptions = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const assetPattern = /^mock-asset-[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function mockSvg(assetId) {
  const hue = [...assetId].reduce((value, char) => (value * 31 + char.charCodeAt(0)) % 360, 0)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="640" viewBox="0 0 960 640" role="img" aria-label="Gambar simulasi Gambarin AI"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="hsl(${hue} 45% 23%)"/><stop offset="1" stop-color="hsl(${(hue + 85) % 360} 60% 43%)"/></linearGradient></defs><rect width="960" height="640" fill="url(#g)"/><circle cx="670" cy="195" r="138" fill="#ffffff" opacity=".13"/><circle cx="220" cy="445" r="220" fill="#ffffff" opacity=".09"/><path d="M0 520 Q240 340 480 500 T960 470 V640 H0" fill="#ffffff" opacity=".17"/><text x="480" y="290" text-anchor="middle" font-family="sans-serif" font-size="76" font-weight="700" fill="white">SIMULASI</text><text x="480" y="348" text-anchor="middle" font-family="sans-serif" font-size="30" fill="white">Gambarin AI • Mock Test</text></svg>`
}

export function createHandler({ createClient, env }) {
  return async function handle(request) {
    const cors = customerCors(request, env('GAMBARIN_CUSTOMER_ALLOWED_ORIGIN'))
    if (cors.denial) return cors.denial
    if (cors.preflight) return cors.preflight
    if (request.method !== 'POST') return cors.json({ error: 'method_not_allowed' }, 405)
    if (new URL(request.url).pathname.replace(/\/$/, '').split('/').at(-1) !== 'gambarin-customer-mock-asset') {
      return cors.json({ error: 'not_found' }, 404)
    }
    const jwt = request.headers.get('Authorization')?.match(/^Bearer (\S+)$/i)?.[1]
    if (!jwt) return cors.json({ error: 'unauthorized' }, 401)
    const url = env('SUPABASE_URL')?.trim()
    const anonKey = env('SUPABASE_ANON_KEY')?.trim()
    const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY')?.trim()
    if (!url || !anonKey || !serviceKey) return cors.json({ error: 'server_configuration_error' }, 503)
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
      // The owner RPC hides all other users' jobs, including their existence.
      const { data: ownJob, error: ownerError } = await caller.rpc('gambarin_my_job_status', { p_job_id: input.job_id })
      if (ownerError || !ownJob || ownJob.status !== 'succeeded') return cors.json({ error: 'asset_not_found' }, 404)
      const admin = createClient(url, serviceKey, { auth: authOptions })
      const { data: row, error: readError } = await admin.from('gambarin_jobs')
        .select('provider_asset_id').eq('id', input.job_id).maybeSingle()
      if (readError || !assetPattern.test(row?.provider_asset_id || '')) {
        return cors.json({ error: 'asset_not_found' }, 404)
      }
      const headers = new Headers(cors.json({}, 200).headers)
      headers.set('Content-Type', 'image/svg+xml; charset=utf-8')
      headers.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox")
      return new Response(mockSvg(row.provider_asset_id), { status: 200, headers })
    } catch {
      return cors.json({ error: 'asset_unavailable' }, 503)
    }
  }
}
