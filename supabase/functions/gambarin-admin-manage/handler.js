const authOptions = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const operations = {
  'add-quota': { rpc: 'add_quota', field: 'additional_images', max: 2147483647 },
  extend: { rpc: 'extend', field: 'additional_days', max: 365 },
  reactivate: { rpc: 'reactivate', field: 'duration_days', max: 30 },
  disable: { rpc: 'disable' },
}
const accountFields = [
  'id', 'username', 'package_id', 'status', 'activated_at', 'expires_at',
  'quota_granted', 'quota_used', 'quota_reserved',
]
const rpcErrors = {
  'P0002:account_not_found': [404, 'account_not_found'],
  'P0001:invalid_status': [409, 'invalid_status'],
  'P0001:account_not_activated': [409, 'account_not_activated'],
  '23514:quota_conflict': [409, 'quota_conflict'],
  '22023:invalid_amount': [400, 'invalid_amount'],
  '22023:invalid_package': [400, 'invalid_package'],
}

export function createHandler({ createClient, env }) {
  return async function handle(request) {
    const origins = (env('GAMBARIN_ADMIN_ALLOWED_ORIGIN') ?? '')
      .split(',').map((value) => value.trim()).filter((value) => value && value !== '*')
    const origin = request.headers.get('Origin')
    const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', Vary: 'Origin' }
    const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers })
    if (!origins.length) return json({ error: 'server_configuration_error' }, 503)
    if (origin && !origins.includes(origin)) return json({ error: 'origin_not_allowed' }, 403)
    if (origin) Object.assign(headers, {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    })
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
    if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
    const segments = new URL(request.url).pathname.split('/').filter(Boolean)
    const route = segments.at(-1)
    if (segments.at(-2) !== 'gambarin-admin-manage' || !Object.hasOwn(operations, route)) {
      return json({ error: 'not_found' }, 404)
    }
    const jwt = request.headers.get('Authorization')?.match(/^Bearer (\S+)$/i)?.[1]
    if (!jwt) return json({ error: 'unauthorized' }, 401)

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
      const { data: identity, error: authError } = await caller.auth.getUser(jwt)
      if (authError || !identity?.user) return json({ error: 'unauthorized' }, 401)
      const { data: admin, error: adminError } = await caller.rpc('is_admin')
      if (adminError || admin !== true) return json({ error: 'forbidden' }, 403)

      let input
      try { input = await request.json() } catch { return json({ error: 'invalid_json' }, 400) }
      const operation = operations[route]
      if (!input || typeof input !== 'object' || Array.isArray(input)
        || Object.keys(input).some((key) => !['account_id', operation.field].includes(key))) {
        return json({ error: 'invalid_input' }, 400)
      }
      if (typeof input.account_id !== 'string' || !uuidPattern.test(input.account_id)
        || input.account_id === '00000000-0000-0000-0000-000000000000') {
        return json({ error: 'invalid_account_id' }, 400)
      }
      const amount = operation.field ? input[operation.field] : null
      if (operation.field && (!Number.isSafeInteger(amount) || amount <= 0 || amount > operation.max)) {
        return json({ error: 'invalid_amount' }, 400)
      }
      if (route === 'reactivate' && ![1, 3, 7, 14, 30].includes(amount)) {
        return json({ error: 'invalid_package' }, 400)
      }

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
      const params = route === 'disable'
        ? { p_account_id: input.account_id, p_main_admin_user_id: identity.user.id }
        : { p_account_id: input.account_id, p_operation: operation.rpc,
          p_amount: amount, p_main_admin_user_id: identity.user.id }
      const { data: account, error } = await gambarin.rpc(
        route === 'disable' ? 'gambarin_admin_disable_account' : 'gambarin_admin_manage_account', params,
      )
      if (error) {
        const known = rpcErrors[`${error.code}:${error.message}`]
        if (known) return json({ error: known[1] }, known[0])
        return json({ error: 'account_management_failed' }, 502)
      }
      if (!account?.id) return json({ error: 'account_management_failed' }, 502)
      return json({ account: Object.fromEntries(accountFields.map((key) => [key, account[key]])) })
    } catch {
      // An ambiguous network failure must not be automatically replayed: these
      // operations add values. Inspect account/audit state before a manual retry.
      return json({ error: 'account_management_unavailable' }, 503)
    }
  }
}
