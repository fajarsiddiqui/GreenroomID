const authOptions = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
const durations = [1, 3, 7, 14, 30]
const accountFields = [
  'id', 'username', 'package_id', 'status', 'activated_at', 'expires_at',
  'quota_granted', 'quota_used', 'quota_reserved',
]

function generatePassword() {
  // 192 random bits, 52 ASCII characters, including all four character classes.
  const random = crypto.getRandomValues(new Uint8Array(24))
  return 'Aa1!' + Array.from(random, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function removeUncommittedUser(client, id) {
  try {
    // Hard delete only this newly created Auth user. FK RESTRICT protects a
    // committed account if the RPC response was lost after database commit.
    const { error } = await client.auth.admin.deleteUser(id)
    return !error
  } catch {
    return false
  }
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
    if (new URL(request.url).pathname.replace(/\/$/, '')
      .split('/').at(-1) !== 'gambarin-admin-create') return json({ error: 'not_found' }, 404)
    const jwt = request.headers.get('Authorization')?.match(/^Bearer (\S+)$/i)?.[1]
    if (!jwt) return json({ error: 'unauthorized' }, 401)

    let gambarin
    let authUserId
    let committed = false
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
      if (!input || typeof input !== 'object' || Array.isArray(input)
        || Object.keys(input).some((key) => !['username', 'duration_days'].includes(key))
        || typeof input.username !== 'string') return json({ error: 'invalid_input' }, 400)
      const username = input.username.trim().toLowerCase()
      if (!/^[a-z0-9][a-z0-9_.-]{0,63}$/.test(username)) {
        return json({ error: 'invalid_username' }, 400)
      }
      if (!durations.includes(input.duration_days)) return json({ error: 'invalid_package' }, 400)

      const gambarinUrl = env('GAMBARIN_SUPABASE_URL')?.trim()
      const gambarinKey = env('GAMBARIN_SUPABASE_SERVICE_ROLE_KEY')?.trim()
      if (!gambarinUrl || !gambarinKey) return json({ error: 'gambarin_configuration_error' }, 503)
      try {
        if (new URL(mainUrl).origin === new URL(gambarinUrl).origin) {
          return json({ error: 'gambarin_configuration_error' }, 503)
        }
        gambarin = createClient(gambarinUrl, gambarinKey, { auth: authOptions })
      } catch {
        return json({ error: 'gambarin_configuration_error' }, 503)
      }

      // Advisory checks avoid unnecessary Auth creation. RPC checks remain authoritative.
      const { data: existing, error: lookupError } = await gambarin.from('gambarin_accounts')
        .select('id').ilike('username', username.replaceAll('_', '\\_')).limit(1).maybeSingle()
      if (lookupError) return json({ error: 'account_lookup_failed' }, 502)
      if (existing) return json({ error: 'username_taken' }, 409)
      const { data: pack, error: packageError } = await gambarin.from('gambarin_packages')
        .select('id').eq('duration_days', input.duration_days).eq('is_active', true).maybeSingle()
      if (packageError) return json({ error: 'package_lookup_failed' }, 502)
      if (!pack) return json({ error: 'invalid_package' }, 400)

      const password = generatePassword()
      const { data: created, error: createError } = await gambarin.auth.admin.createUser({
        email: `${crypto.randomUUID()}@gambarin.invalid`,
        password, email_confirm: true, ban_duration: '876000h',
      })
      if (createError || !created?.user?.id) return json({ error: 'auth_creation_failed' }, 502)
      authUserId = created.user.id
      if (!(Date.parse(created.user.banned_until) > Date.now())) {
        const removed = await removeUncommittedUser(gambarin, authUserId)
        return json({ error: removed ? 'auth_provisioning_failed' : 'account_creation_needs_review' }, 503)
      }

      const { data: account, error: databaseError } = await gambarin.rpc('gambarin_admin_create_account', {
        p_auth_user_id: authUserId, p_username: username,
        p_duration_days: input.duration_days, p_main_admin_user_id: identity.user.id,
      })
      if (databaseError || !account?.id) {
        const removed = await removeUncommittedUser(gambarin, authUserId)
        if (!removed) return json({ error: 'account_creation_needs_review' }, 503)
        if (databaseError?.code === '23505' && databaseError.message === 'username_taken') {
          return json({ error: 'username_taken' }, 409)
        }
        if (databaseError?.code === '22023' && databaseError.message === 'invalid_package') {
          return json({ error: 'invalid_package' }, 400)
        }
        return json({ error: 'account_creation_failed' }, 502)
      }
      committed = true
      const { data: activated, error: activationError } = await gambarin.auth.admin
        .updateUserById(authUserId, { ban_duration: 'none' })
      if (activationError || !activated?.user || Date.parse(activated.user.banned_until) > Date.now()) {
        return json({ error: 'account_activation_needs_review' }, 503)
      }
      // No Auth identity/email, password history, token, or service credential is returned.
      return json({
        account: Object.fromEntries(accountFields.map((key) => [key, account[key]])),
        initial_password: password,
      }, 201)
    } catch {
      if (authUserId && !committed) {
        const removed = await removeUncommittedUser(gambarin, authUserId)
        return json({ error: removed ? 'account_creation_failed' : 'account_creation_needs_review' }, 503)
      }
      return json({ error: committed ? 'account_activation_needs_review' : 'backend_unavailable' }, 503)
    }
  }
}
