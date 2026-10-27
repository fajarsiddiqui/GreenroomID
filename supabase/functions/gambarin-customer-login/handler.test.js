import assert from 'node:assert/strict'
import test from 'node:test'
import { createHandler as loginHandler } from './handler.js'
import { createHandler as enqueueHandler } from '../gambarin-customer-enqueue/handler.js'

const base = 'https://gambarin.example.invalid/functions/v1/'
const origin = 'https://www.greenroomid.com'
const id = '11111111-1111-4111-8111-111111111111'
const key = '22222222-2222-4222-8222-222222222222'
const config = {
  SUPABASE_URL: 'https://gambarin.example.invalid',
  SUPABASE_ANON_KEY: 'test-publishable',
  SUPABASE_SERVICE_ROLE_KEY: 'test-server-only',
  GAMBARIN_CUSTOMER_ALLOWED_ORIGIN: 'https://www.greenroomid.com, https://greenroomid.com, http://localhost:5173',
}

function setupLogin(behavior = {}) {
  const calls = []
  const account = behavior.missing ? null : {
    auth_user_id: id, status: behavior.status || 'active',
    expires_at: behavior.expired ? '2020-01-01T00:00:00Z' : '2099-01-01T00:00:00Z',
  }
  const createClient = (_url, apiKey) => {
    calls.push(['client', apiKey])
    if (apiKey === config.SUPABASE_SERVICE_ROLE_KEY) return {
      rpc: async (name, args) => {
        calls.push(['rpc', name, args])
        return { data: behavior.limited ? false : true, error: behavior.rateError ? { message: 'private' } : null }
      },
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => {
        calls.push(['lookup'])
        return { data: account, error: null }
      } }) }) }),
      auth: { admin: { getUserById: async (userId) => {
        calls.push(['user', userId])
        return { data: { user: { email: 'internal@gambarin.invalid' } }, error: null }
      } } },
    }
    assert.equal(apiKey, config.SUPABASE_ANON_KEY)
    return { auth: { signInWithPassword: async (credentials) => {
      calls.push(['password', credentials.email])
      return behavior.wrongPassword || behavior.missing
        ? { data: null, error: { message: 'private auth detail' } }
        : { data: { user: { id }, session: { access_token: 'user-access', refresh_token: 'user-refresh' } }, error: null }
    } } }
  }
  const handler = loginHandler({ createClient, env: (name) => config[name] })
  const request = (username = 'sample', password = 'strong-password', extra = {}) => handler(new Request(base + 'gambarin-customer-login', {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', ...extra },
    body: JSON.stringify({ username, password }),
  }))
  return { request, calls, handler }
}

function setupEnqueue(behavior = {}) {
  const calls = []
  const jobs = new Map()
  const createClient = (_url, apiKey) => {
    calls.push(['client', apiKey])
    if (apiKey === config.SUPABASE_ANON_KEY) return {
      auth: { getUser: async (jwt) => {
        calls.push(['getUser', jwt])
        return behavior.invalidJwt
          ? { data: null, error: { message: 'private' } }
          : { data: { user: { id } }, error: null }
      } },
      rpc: async (name, args) => {
        calls.push(['status', name, args])
        return { data: { queue_position: 2 }, error: null }
      },
    }
    assert.equal(apiKey, config.SUPABASE_SERVICE_ROLE_KEY)
    return { rpc: async (name, args) => {
      calls.push(['enqueue', name, args])
      if (behavior.rpcError) return { data: null, error: { message: behavior.rpcError } }
      if (!jobs.has(args.p_idempotency_key)) jobs.set(args.p_idempotency_key, { id: key, status: 'queued' })
      return { data: jobs.get(args.p_idempotency_key), error: null }
    } }
  }
  const handler = enqueueHandler({ createClient, env: (name) => config[name] })
  const request = (headers = {}, body = { prompt: 'Pohon di bukit', idempotency_key: key }) => handler(new Request(base + 'gambarin-customer-enqueue', {
    method: 'POST', headers: { Origin: origin, Authorization: 'Bearer gambarin-jwt', ...headers },
    body: JSON.stringify(body),
  }))
  return { request, calls, jobs, handler }
}

test('login verifies password through Gambarin Auth and returns only session tokens', async () => {
  const { request, calls } = setupLogin()
  const response = await request()
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { session: { access_token: 'user-access', refresh_token: 'user-refresh' } })
  assert.equal(response.headers.get('Cache-Control'), 'no-store')
  assert.ok(calls.some((call) => call[0] === 'rpc' && call[1] === 'gambarin_login_rate_hit'))
  assert.ok(calls.some((call) => call[0] === 'password' && call[1] === 'internal@gambarin.invalid'))
})

test('wrong password and missing username have identical public response', async () => {
  for (const behavior of [{ wrongPassword: true }, { missing: true }]) {
    const { request, calls } = setupLogin(behavior)
    const response = await request()
    assert.equal(response.status, 401)
    assert.deepEqual(await response.json(), { error: 'invalid_credentials' })
    assert.ok(calls.some((call) => call[0] === 'password'))
  }
})

test('valid password on disabled or expired account yields no session', async () => {
  for (const behavior of [{ status: 'disabled' }, { expired: true }]) {
    const { request } = setupLogin(behavior)
    const response = await request()
    assert.equal(response.status, 403)
    assert.ok(['account_inactive', 'account_expired'].includes((await response.json()).error))
  }
})

test('login rate limit fails closed before account lookup and gives retry delay', async () => {
  const { request, calls } = setupLogin({ limited: true })
  const response = await request()
  assert.equal(response.status, 429)
  assert.equal(response.headers.get('Retry-After'), '900')
  assert.ok(!calls.some((call) => call[0] === 'lookup'))
})

test('enqueue rejects anonymous and invalid JWT before privileged RPC', async () => {
  const missing = setupEnqueue()
  assert.equal((await missing.request({ Authorization: '' })).status, 401)
  assert.equal(missing.calls.length, 0)
  const invalid = setupEnqueue({ invalidJwt: true })
  assert.equal((await invalid.request()).status, 401)
  assert.ok(!invalid.calls.some((call) => call[0] === 'enqueue'))
})

test('verified user enqueues with server-derived identity and reads owner queue position', async () => {
  const { request, calls } = setupEnqueue()
  const response = await request()
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { job_id: key, status: 'queued', queue_position: 2 })
  assert.deepEqual(calls.find((call) => call[0] === 'enqueue').slice(1), [
    'gambarin_enqueue_job', { p_auth_user_id: id, p_idempotency_key: key, p_prompt: 'Pohon di bukit' },
  ])
  assert.equal(calls.find((call) => call[0] === 'status')[1], 'gambarin_my_job_status')
})

test('repeated idempotency key returns one logical job', async () => {
  const { request, jobs } = setupEnqueue()
  const first = await (await request()).json()
  const second = await (await request()).json()
  assert.equal(first.job_id, second.job_id)
  assert.equal(jobs.size, 1)
})

test('quota, expiry, and full queue errors are safe and explicit', async () => {
  for (const [databaseError, code] of [
    ['quota_unavailable', 'quota_unavailable'],
    ['account_expired', 'account_expired'],
    ['queue_full', 'queue_full'],
  ]) {
    const { request } = setupEnqueue({ rpcError: databaseError })
    const response = await request()
    assert.equal(response.status, databaseError === 'account_expired' ? 403 : 409)
    assert.deepEqual(await response.json(), { error: code })
  }
})

test('body identity spoofing and invalid prompt are rejected', async () => {
  const { request, calls } = setupEnqueue()
  assert.equal((await request({}, { prompt: 'Pohon', idempotency_key: key, account_id: id })).status, 400)
  assert.equal((await request({}, { prompt: ' ', idempotency_key: key })).status, 400)
  assert.ok(!calls.some((call) => call[0] === 'enqueue'))
})

test('CORS allows exact GreenroomID origin and rejects foreign origin without CORS grant', async () => {
  const { handler } = setupLogin()
  const preflight = await handler(new Request(base + 'gambarin-customer-login', { method: 'OPTIONS', headers: { Origin: origin } }))
  assert.equal(preflight.status, 204)
  assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), origin)
  const foreign = await handler(new Request(base + 'gambarin-customer-login', { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } }))
  assert.equal(foreign.status, 403)
  assert.equal(foreign.headers.get('Access-Control-Allow-Origin'), null)
})
