import { customerCors } from '../_shared/gambarin-customer-cors.js'

const authOptions = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
const usernamePattern = /^[a-z0-9][a-z0-9_.-]{0,63}$/

async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function createHandler({ createClient, env }) {
  return async function handle(request) {
    const cors = customerCors(request, env('GAMBARIN_CUSTOMER_ALLOWED_ORIGIN'))
    if (cors.denial) return cors.denial
    if (cors.preflight) return cors.preflight
    if (request.method !== 'POST') return cors.json({ error: 'method_not_allowed' }, 405)
    if (new URL(request.url).pathname.replace(/\/$/, '').split('/').at(-1) !== 'gambarin-customer-login') {
      return cors.json({ error: 'not_found' }, 404)
    }

    const url = env('SUPABASE_URL')?.trim()
    const anonKey = env('SUPABASE_ANON_KEY')?.trim()
    const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY')?.trim()
    if (!url || !anonKey || !serviceKey) return cors.json({ error: 'server_configuration_error' }, 503)
    let input
    try {
      const text = await request.text()
      if (text.length > 1024) return cors.json({ error: 'invalid_input' }, 400)
      input = JSON.parse(text)
    } catch { return cors.json({ error: 'invalid_json' }, 400) }
    if (!input || typeof input !== 'object' || Array.isArray(input)
      || Object.keys(input).some((key) => !['username', 'password'].includes(key))
      || typeof input.username !== 'string' || typeof input.password !== 'string') {
      return cors.json({ error: 'invalid_input' }, 400)
    }
    const username = input.username.trim().toLowerCase()
    if (!usernamePattern.test(username) || input.password.length < 1 || input.password.length > 256) {
      return cors.json({ error: 'invalid_credentials' }, 401)
    }

    try {
      const admin = createClient(url, serviceKey, { auth: authOptions })
      const userHash = await sha256(username)
      const { data: allowed, error: limitError } = await admin.rpc('gambarin_login_rate_hit', {
        p_subject_hash: userHash,
      })
      if (limitError) return cors.json({ error: 'login_unavailable' }, 503)
      if (allowed !== true) return cors.json({ error: 'too_many_attempts' }, 429, { 'Retry-After': '900' })

      const { data: account, error: lookupError } = await admin.from('gambarin_accounts')
        .select('auth_user_id,status,expires_at').eq('username', username).maybeSingle()
      if (lookupError) return cors.json({ error: 'login_unavailable' }, 503)
      let email = 'missing-account@gambarin.invalid'
      if (account) {
        const { data: authUser, error: userError } = await admin.auth.admin.getUserById(account.auth_user_id)
        if (userError) return cors.json({ error: 'login_unavailable' }, 503)
        if (authUser?.user?.email) email = authUser.user.email
      }

      const passwordClient = createClient(url, anonKey, { auth: authOptions })
      const { data: signedIn, error: signInError } = await passwordClient.auth.signInWithPassword({
        email, password: input.password,
      })
      if (signInError || !account || signedIn?.user?.id !== account.auth_user_id
        || !signedIn?.session?.access_token || !signedIn?.session?.refresh_token) {
        return cors.json({ error: 'invalid_credentials' }, 401)
      }
      if (account.status !== 'active') return cors.json({ error: 'account_inactive' }, 403)
      if (!account.expires_at || Date.parse(account.expires_at) <= Date.now()) {
        return cors.json({ error: 'account_expired' }, 403)
      }
      return cors.json({ session: {
        access_token: signedIn.session.access_token,
        refresh_token: signedIn.session.refresh_token,
      } })
    } catch {
      return cors.json({ error: 'login_unavailable' }, 503)
    }
  }
}
