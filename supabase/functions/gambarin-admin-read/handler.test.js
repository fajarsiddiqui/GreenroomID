import assert from 'node:assert/strict'
import test from 'node:test'
import { createClient } from '@supabase/supabase-js'
import { createHandler } from './handler.js'

const origin = 'https://admin.example.invalid'
const endpoint = 'https://main.example.invalid/functions/v1/gambarin-admin-read/'
const allowedOrigins = ['https://www.greenroomid.com', 'https://greenroomid.com', 'http://localhost:5173']
const originList = ` , ${allowedOrigins.join(' , ')} , , `

function setup(overrides = {}, behavior = {}) {
  const config = {
    SUPABASE_URL: 'https://main.example.invalid',
    SUPABASE_ANON_KEY: 'test-main-key',
    GAMBARIN_SUPABASE_URL: 'https://gambarin.example.invalid',
    GAMBARIN_SUPABASE_SERVICE_ROLE_KEY: 'test-server-key',
    GAMBARIN_ADMIN_ALLOWED_ORIGIN: origin,
    ...overrides,
  }
  const calls = []
  const handler = createHandler({
    env: (name) => config[name],
    createClient: (url, key, options) => createClient(url, key, {
      ...options,
      global: { ...options.global, fetch: async (input, init) => {
        const request = new Request(input, init)
        const url = new URL(request.url)
        calls.push(request)
        if (url.host === 'main.example.invalid' && url.pathname === '/auth/v1/user') {
          if (behavior.invalidToken) return Response.json({ message: 'invalid token' }, { status: 401 })
          return Response.json({ id: 'verified-user', app_metadata: { provider: 'google' } })
        }
        if (url.host === 'main.example.invalid' && url.pathname === '/rest/v1/rpc/is_admin') {
          return behavior.rpcError
            ? Response.json({ message: 'private internal detail' }, { status: 403 })
            : Response.json(behavior.admin ?? true)
        }
        if (url.host === 'gambarin.example.invalid' && url.pathname.startsWith('/rest/v1/')) {
          if (behavior.throwRead) throw new Error('private connection detail')
          if (behavior.readError) return Response.json({ message: 'private database detail' }, { status: 400 })
          if (request.method === 'HEAD') {
            const count = { 'eq.pending': 2, 'eq.active': 3, 'eq.disabled': 1 }[url.searchParams.get('status')]
            return new Response(null, { headers: { 'Content-Range': `*/${count}` } })
          }
          if (url.pathname.endsWith('/gambarin_packages')) return Response.json([{ name: '1 Hari' }])
          return Response.json([{ id: 'account-id', username: 'sample' }], {
            headers: { 'Content-Range': '25-49/60' },
          })
        }
        throw new Error('Unexpected network target in local test')
      } },
    }),
  })
  const request = (path = 'packages', headers = {}, method = 'GET') => {
    const requestHeaders = new Headers({ Origin: origin, Authorization: 'Bearer main-test-token' })
    for (const [name, value] of Object.entries(headers)) {
      if (value === null) requestHeaders.delete(name)
      else requestHeaders.set(name, value)
    }
    return handler(new Request(endpoint + path, { method, headers: requestHeaders }))
  }
  return { request, calls }
}

test('missing bearer and invalid tokens are rejected before admin lookup or Gambarin', async () => {
  const missing = setup()
  assert.equal((await missing.request('packages', { Authorization: '' })).status, 401)
  assert.equal(missing.calls.length, 0)
  const invalid = setup({}, { invalidToken: true })
  assert.equal((await invalid.request('packages', { Authorization: 'Bearer gambarin-test-token' })).status, 401)
  assert.equal(invalid.calls.length, 1)
})

test('ordinary users, non-boolean admin values and RPC errors cannot read Gambarin', async () => {
  for (const behavior of [{ admin: false }, { admin: 'true' }, { rpcError: true }]) {
    const { request, calls } = setup({}, behavior)
    assert.equal((await request()).status, 403)
    assert.equal(calls.length, 2)
    assert.ok(calls.every((call) => new URL(call.url).host === 'main.example.invalid'))
  }
})

test('verified admin uses caller JWT on main Auth/RPC and backend credential only on Gambarin', async () => {
  const { request, calls } = setup()
  const response = await request()
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { packages: [{ name: '1 Hari' }] })
  assert.equal(calls[0].headers.get('Authorization'), 'Bearer main-test-token')
  assert.equal(calls[1].headers.get('Authorization'), 'Bearer main-test-token')
  assert.equal(calls[1].method, 'POST')
  assert.equal(await calls[1].text(), '{}')
  assert.equal(calls[2].headers.get('Authorization'), 'Bearer test-server-key')
  const url = new URL(calls[2].url)
  assert.equal(url.searchParams.get('select'), 'id,name,duration_days,default_image_quota,is_active')
  assert.equal(url.searchParams.get('limit'), '5')
  assert.equal(response.headers.get('Cache-Control'), 'no-store')
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), origin)
})

test('accounts have bounded pagination, stable ordering and explicit safe columns', async () => {
  const { request, calls } = setup()
  const response = await request('accounts?page=2&page_size=25')
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), {
    accounts: [{ id: 'account-id', username: 'sample' }], page: 2, page_size: 25, total: 60,
  })
  const url = new URL(calls[2].url)
  assert.equal(url.searchParams.get('offset'), '25')
  assert.equal(url.searchParams.get('limit'), '25')
  assert.equal(url.searchParams.get('order'), 'created_at.desc,id.desc')
  assert.ok(!/\*|auth_user_id|password|token|metadata/.test(url.searchParams.get('select')))
})

test('invalid pagination never reads Gambarin', async () => {
  for (const query of ['page=0', 'page=-1', 'page=1.5', 'page_size=101', 'page_size=0', 'page=9007199254740992']) {
    const { request, calls } = setup()
    assert.equal((await request(`accounts?${query}`)).status, 400)
    assert.equal(calls.length, 2)
  }
})

test('summary uses HEAD counts for all three stored statuses', async () => {
  const { request, calls } = setup()
  const response = await request('summary')
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { counts: { pending: 2, active: 3, disabled: 1 }, total: 6 })
  assert.equal(calls.length, 5)
  assert.ok(calls.slice(2).every((call) => call.method === 'HEAD'))
})

test('all supported operations only GET or HEAD Gambarin data', async () => {
  for (const path of ['packages', 'accounts', 'summary']) {
    const { request, calls } = setup()
    assert.equal((await request(path)).status, 200)
    assert.ok(calls.filter((call) => new URL(call.url).host === 'gambarin.example.invalid')
      .every((call) => ['GET', 'HEAD'].includes(call.method)))
  }
})

test('missing or invalid backend configuration returns safe configuration errors', async () => {
  for (const override of [
    { GAMBARIN_ADMIN_ALLOWED_ORIGIN: '' }, { SUPABASE_URL: '' }, { SUPABASE_ANON_KEY: '' },
    { SUPABASE_URL: 'invalid' }, { GAMBARIN_SUPABASE_URL: '' },
    { GAMBARIN_SUPABASE_SERVICE_ROLE_KEY: '' }, { GAMBARIN_SUPABASE_URL: 'invalid' },
    { GAMBARIN_SUPABASE_URL: 'https://main.example.invalid' },
  ]) {
    const { request } = setup(override)
    const response = await request()
    assert.equal(response.status, 503)
    assert.match((await response.json()).error, /configuration_error$/)
  }
})

test('CORS rejects unknown origins, preflight does not access Auth or database', async () => {
  const { request, calls } = setup()
  assert.equal((await request('packages', { Origin: 'https://other.example.invalid' })).status, 403)
  assert.equal((await request('packages', {}, 'OPTIONS')).status, 204)
  assert.equal(calls.length, 0)
})

test('comma-separated origins trim whitespace, ignore empty entries and echo one exact origin', async () => {
  for (const allowed of allowedOrigins) {
    const { request } = setup({ GAMBARIN_ADMIN_ALLOWED_ORIGIN: originList })
    for (const path of ['packages', 'accounts', 'summary']) {
      const response = await request(path, { Origin: allowed })
      assert.equal(response.status, 200)
      assert.equal(response.headers.get('Access-Control-Allow-Origin'), allowed)
      assert.equal(response.headers.get('Vary'), 'Origin')
    }
  }
})

test('all three allowed origins accept unauthenticated OPTIONS with no data access', async () => {
  const { request, calls } = setup({ GAMBARIN_ADMIN_ALLOWED_ORIGIN: originList })
  for (const allowed of allowedOrigins) {
    const response = await request('packages', {
      Origin: allowed, Authorization: '', 'Access-Control-Request-Method': 'GET',
      'Access-Control-Request-Headers': 'authorization,apikey',
    }, 'OPTIONS')
    assert.equal(response.status, 204)
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), allowed)
    assert.equal(response.headers.get('Access-Control-Allow-Methods'), 'GET, OPTIONS')
    assert.match(response.headers.get('Access-Control-Allow-Headers'), /authorization/)
    assert.equal(response.headers.get('Vary'), 'Origin')
  }
  assert.equal(calls.length, 0)
})

test('unrecognized origins and lookalikes receive no permissive CORS headers', async () => {
  const { request, calls } = setup({ GAMBARIN_ADMIN_ALLOWED_ORIGIN: originList })
  for (const rejected of [
    'https://evil.example', 'https://greenroomid.com.evil.example',
    'http://greenroomid.com', 'http://localhost:5174', 'https://greenroomid.com/',
    'null', '*', allowedOrigins.join(','),
  ]) {
    for (const method of ['GET', 'OPTIONS']) {
      const response = await request('packages', { Origin: rejected }, method)
      assert.equal(response.status, 403)
      assert.equal(response.headers.get('Access-Control-Allow-Origin'), null)
    }
  }
  assert.equal(calls.length, 0)
})

test('wildcard configuration cannot produce a wildcard CORS header', async () => {
  const { request } = setup({ GAMBARIN_ADMIN_ALLOWED_ORIGIN: `${originList},*` })
  const response = await request('packages', { Origin: '*' })
  assert.equal(response.status, 403)
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), null)
})

test('empty or missing Origin still requires valid main Auth and admin authorization', async () => {
  for (const value of ['', null]) {
    const headers = { Origin: value }
    const anonymous = setup({ GAMBARIN_ADMIN_ALLOWED_ORIGIN: originList })
    const response = await anonymous.request('packages', { ...headers, Authorization: '' })
    assert.equal(response.status, 401)
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), null)
    assert.equal(anonymous.calls.length, 0)

    const invalid = setup({ GAMBARIN_ADMIN_ALLOWED_ORIGIN: originList }, { invalidToken: true })
    assert.equal((await invalid.request('packages', headers)).status, 401)
    assert.equal(invalid.calls.length, 1)

    const ordinary = setup({ GAMBARIN_ADMIN_ALLOWED_ORIGIN: originList }, { admin: false })
    assert.equal((await ordinary.request('packages', headers)).status, 403)
    assert.equal(ordinary.calls.length, 2)

    const admin = setup({ GAMBARIN_ADMIN_ALLOWED_ORIGIN: originList })
    for (const path of ['packages', 'accounts', 'summary']) {
      const response = await admin.request(path, headers)
      assert.equal(response.status, 200)
      assert.equal(response.headers.get('Access-Control-Allow-Origin'), null)
    }
  }
})

test('allowed browser origins still reject anonymous and non-admin data requests', async () => {
  for (const allowed of allowedOrigins) {
    for (const path of ['packages', 'accounts', 'summary']) {
      const anonymous = setup({ GAMBARIN_ADMIN_ALLOWED_ORIGIN: originList })
      const response = await anonymous.request(path, { Origin: allowed, Authorization: '' })
      assert.equal(response.status, 401)
      assert.equal(response.headers.get('Access-Control-Allow-Origin'), allowed)
      assert.equal(anonymous.calls.length, 0)
      const ordinary = setup({ GAMBARIN_ADMIN_ALLOWED_ORIGIN: originList }, { admin: false })
      assert.equal((await ordinary.request(path, { Origin: allowed })).status, 403)
      assert.equal(ordinary.calls.length, 2)
    }
  }
})

test('write methods and unknown endpoints are rejected', async () => {
  const { request, calls } = setup()
  assert.equal((await request('accounts', {}, 'POST')).status, 405)
  assert.equal((await request('create-account')).status, 404)
  assert.equal(calls.length, 0)
})

test('database errors are redacted for every endpoint', async () => {
  for (const path of ['packages', 'accounts', 'summary']) {
    const { request } = setup({}, { readError: true })
    const response = await request(path)
    assert.equal(response.status, 502)
    assert.deepEqual(await response.json(), { error: 'gambarin_read_failed' })
  }
})
