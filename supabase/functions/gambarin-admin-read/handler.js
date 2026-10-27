const authOptions = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
const packageColumns = 'id,name,duration_days,default_image_quota,is_active'
const accountColumns = 'id,username,package_id,status,activated_at,expires_at,quota_granted,quota_used,quota_reserved,created_at,updated_at'
const statuses = ['pending', 'active', 'disabled']

// Dependency injection keeps request tests local, without database access.
export function createHandler({ createClient, env }) {
  return async function handle(request) {
    const origins = (env('GAMBARIN_ADMIN_ALLOWED_ORIGIN') ?? '')
      .split(',').map((value) => value.trim()).filter((value) => value && value !== '*')
    const origin = request.headers.get('Origin')
    const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', Vary: 'Origin' }
    const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers })

    if (!origins.length) return json({ error: 'server_configuration_error' }, 503)
    if (origin && !origins.includes(origin)) return json({ error: 'origin_not_allowed' }, 403)
    if (origin) {
      Object.assign(headers, {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
      })
    }
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
    if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405)

    const jwt = request.headers.get('Authorization')?.match(/^Bearer (\S+)$/i)?.[1]
    if (!jwt) return json({ error: 'unauthorized' }, 401)

    const url = new URL(request.url)
    const segments = url.pathname.split('/').filter(Boolean)
    const resource = segments.at(-1)
    if (segments.at(-2) !== 'gambarin-admin-read'
      || !['packages', 'accounts', 'summary'].includes(resource)) {
      return json({ error: 'not_found' }, 404)
    }

    try {
      const mainUrl = env('SUPABASE_URL')?.trim()
      const mainKey = env('SUPABASE_ANON_KEY')?.trim()
      if (!mainUrl || !mainKey) return json({ error: 'server_configuration_error' }, 503)
      let caller
      try {
        caller = createClient(mainUrl, mainKey, {
          global: { headers: { Authorization: `Bearer ${jwt}` } }, auth: authOptions,
        })
      } catch {
        return json({ error: 'server_configuration_error' }, 503)
      }
      // Auth and RPC both use the main project and the verified caller's JWT.
      const { data: userData, error: authError } = await caller.auth.getUser(jwt)
      if (authError || !userData?.user) return json({ error: 'unauthorized' }, 401)
      const { data: admin, error: adminError } = await caller.rpc('is_admin')
      if (adminError || admin !== true) return json({ error: 'forbidden' }, 403)

      const gambarinUrl = env('GAMBARIN_SUPABASE_URL')?.trim()
      const gambarinKey = env('GAMBARIN_SUPABASE_SERVICE_ROLE_KEY')?.trim()
      if (!gambarinUrl || !gambarinKey) return json({ error: 'gambarin_configuration_error' }, 503)
      let gambarin
      try {
        if (new URL(mainUrl).origin === new URL(gambarinUrl).origin) {
          return json({ error: 'gambarin_configuration_error' }, 503)
        }
        gambarin = createClient(gambarinUrl, gambarinKey, { auth: authOptions })
      } catch {
        return json({ error: 'gambarin_configuration_error' }, 503)
      }

      if (resource === 'packages') {
        const { data, error } = await gambarin.from('gambarin_packages')
          .select(packageColumns).order('duration_days', { ascending: true }).limit(5)
        if (error) return json({ error: 'gambarin_read_failed' }, 502)
        return json({ packages: data ?? [] })
      }

      if (resource === 'accounts') {
        const pageValue = url.searchParams.get('page') ?? '1'
        const sizeValue = url.searchParams.get('page_size') ?? '25'
        const page = Number(pageValue)
        const pageSize = Number(sizeValue)
        const offset = (page - 1) * pageSize
        if (!/^[1-9]\d*$/.test(pageValue) || !/^[1-9]\d*$/.test(sizeValue)
          || !Number.isSafeInteger(page) || !Number.isSafeInteger(pageSize)
          || pageSize > 100 || !Number.isSafeInteger(offset + pageSize)) {
          return json({ error: 'invalid_pagination' }, 400)
        }
        const { data, error, count } = await gambarin.from('gambarin_accounts')
          .select(accountColumns, { count: 'exact' })
          .order('created_at', { ascending: false }).order('id', { ascending: false })
          .range(offset, offset + pageSize - 1)
        if (error || count === null) return json({ error: 'gambarin_read_failed' }, 502)
        return json({ accounts: data ?? [], page, page_size: pageSize, total: count })
      }

      // Count stored statuses; an expired active account remains in active here.
      const results = await Promise.all(statuses.map((status) => gambarin.from('gambarin_accounts')
        .select('id', { count: 'exact', head: true }).eq('status', status)))
      if (results.some((result) => result.error || result.count === null)) {
        return json({ error: 'gambarin_read_failed' }, 502)
      }
      const counts = Object.fromEntries(statuses.map((status, index) => [status, results[index].count]))
      return json({ counts, total: results.reduce((total, result) => total + result.count, 0) })
    } catch {
      // Never return SDK errors, credentials, JWTs or database details.
      return json({ error: 'backend_unavailable' }, 502)
    }
  }
}
