import assert from 'node:assert/strict'
import test from 'node:test'
import { createClient } from '@supabase/supabase-js'
import { createHandler } from './handler.js'

const origin = 'https://greenroomid.com'
const endpoint = 'https://main.example.invalid/functions/v1/gambarin-admin-create'
const actor = '00000000-0000-4000-8000-000000000001'
const now = '2026-10-26T03:00:00.000Z'
const quotas = { 1: 4, 3: 8, 7: 14, 14: 20, 30: 35 }

function setup(behavior = {}, overrides = {}) {
  const config = {
    SUPABASE_URL: 'https://main.example.invalid', SUPABASE_ANON_KEY: 'test-main-key',
    GAMBARIN_SUPABASE_URL: 'https://gambarin.example.invalid',
    GAMBARIN_SUPABASE_SERVICE_ROLE_KEY: 'test-server-key',
    GAMBARIN_ADMIN_ALLOWED_ORIGIN: ` https://www.greenroomid.com, ${origin}, ,http://localhost:5173 `,
    ...overrides,
  }
  const calls = []
  const users = new Map()
  const accounts = []
  const events = []
  const jsonError = (message, code = 'XX000', status = 400) => Response.json({ message, code }, { status })
  const handle = createHandler({
    env: (name) => config[name],
    createClient: (url, key, options) => createClient(url, key, {
      ...options, global: { ...options.global, fetch: async (input, init) => {
        const request = new Request(input, init)
        const url = new URL(request.url)
        const body = request.method === 'GET' ? null : JSON.parse(await request.text() || '{}')
        calls.push({ url, method: request.method, headers: request.headers, body })
        if (url.host === 'main.example.invalid') {
          if (url.pathname === '/auth/v1/user') return behavior.invalidToken
            ? jsonError('invalid token', 'bad_jwt', 401) : Response.json({ id: actor })
          if (url.pathname === '/rest/v1/rpc/is_admin') return behavior.adminError
            ? jsonError('private admin failure') : Response.json(behavior.admin ?? true)
        }
        assert.equal(url.host, 'gambarin.example.invalid', 'no unexpected network target')
        assert.equal(request.headers.get('Authorization'), 'Bearer test-server-key')
        if (url.pathname === '/rest/v1/gambarin_accounts') {
          if (behavior.lookupFailure) return jsonError('private lookup failure')
          const username = url.searchParams.get('username').slice('ilike.'.length).replaceAll('\\_', '_')
          return Response.json(behavior.duplicate
            ? [{ id: 'existing-account' }]
            : accounts.filter((row) => row.username.toLowerCase() === username.toLowerCase()).map(({ id }) => ({ id })))
        }
        if (url.pathname === '/rest/v1/gambarin_packages') {
          return behavior.packageFailure ? jsonError('private package failure')
            : Response.json(behavior.inactivePackage ? [] : [{ id: 'package-id' }])
        }
        if (url.pathname === '/auth/v1/admin/users' && request.method === 'POST') {
          if (behavior.authFailure) return jsonError('private Auth failure')
          const user = { id: crypto.randomUUID(), banned_until: '2126-01-01T00:00:00.000Z' }
          users.set(user.id, user)
          return Response.json({ ...user, email: body.email })
        }
        if (url.pathname === '/rest/v1/rpc/gambarin_admin_create_account') {
          if (behavior.databaseFailure || behavior.auditFailure) return jsonError('private transactional failure')
          if (behavior.raceDuplicate || accounts.some((row) => row.username === body.p_username)) {
            return jsonError('username_taken', '23505', 409)
          }
          if (behavior.packageChanged) return jsonError('invalid_package', '22023')
          const account = {
            id: crypto.randomUUID(), username: body.p_username, package_id: 'package-id', status: 'active',
            activated_at: now,
            expires_at: new Date(Date.parse(now) + body.p_duration_days * 86400000).toISOString(),
            quota_granted: behavior.packageQuota ?? quotas[body.p_duration_days], quota_used: 0, quota_reserved: 0,
          }
          accounts.push({ ...account, auth_user_id: body.p_auth_user_id })
          events.push(...['account_created', 'activated'].map((action) => ({
            account_id: account.id, action, main_admin_user_id: body.p_main_admin_user_id,
            metadata: { duration_days: body.p_duration_days, quota_granted: account.quota_granted },
          })))
          if (behavior.lostCommitResponse) return jsonError('private connection failure')
          // Deliberate extra fields verify response projection, even for unexpected RPC data.
          return Response.json({ ...account, email: 'private@gambarin.invalid', service_role: 'test-server-key' })
        }
        if (url.pathname.startsWith('/auth/v1/admin/users/')) {
          const id = url.pathname.split('/').at(-1)
          const user = users.get(id)
          assert.ok(user)
          if (request.method === 'DELETE') {
            if (behavior.cleanupFailure || accounts.some((row) => row.auth_user_id === id)) {
              return jsonError('private delete failure')
            }
            users.delete(id)
            return Response.json(user)
          }
          if (request.method === 'PUT') {
            if (behavior.activationFailure) return jsonError('private activation failure')
            user.banned_until = null
            return Response.json(user)
          }
        }
        throw new Error('unexpected local mock operation')
      } },
    }),
  })
  const request = (body = { username: 'Customer_One', duration_days: 7 }, headers = {}, method = 'POST') => {
    const requestHeaders = new Headers({ Origin: origin, Authorization: 'Bearer main-admin-token', 'Content-Type': 'application/json' })
    for (const [name, value] of Object.entries(headers)) {
      if (value === null) requestHeaders.delete(name)
      else requestHeaders.set(name, value)
    }
    return handle(new Request(endpoint, {
      method, headers: requestHeaders,
      ...(['GET', 'OPTIONS'].includes(method) ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
    }))
  }
  return { request, calls, users, accounts, events }
}

test('admin creates each package with activation dates, default quota and two audit events', async () => {
  for (const duration of [1, 3, 7, 14, 30]) {
    const { request, calls, users, accounts, events } = setup()
    const response = await request({ username: ' Customer_One ', duration_days: duration })
    assert.equal(response.status, 201)
    assert.equal(response.headers.get('Cache-Control'), 'no-store')
    const result = await response.json()
    assert.equal(result.account.username, 'customer_one')
    assert.equal(result.account.status, 'active')
    assert.equal(result.account.quota_granted, quotas[duration])
    assert.equal(result.account.quota_used, 0)
    assert.equal(result.account.quota_reserved, 0)
    assert.equal(Date.parse(result.account.expires_at) - Date.parse(result.account.activated_at), duration * 86400000)
    assert.equal(accounts.length, 1)
    assert.deepEqual(events.map((event) => event.action), ['account_created', 'activated'])
    assert.ok(events.every((event) => event.main_admin_user_id === actor))
    assert.equal([...users.values()][0].banned_until, null)
    const createCall = calls.find((call) => call.url.pathname === '/auth/v1/admin/users')
    assert.equal(createCall.body.email_confirm, true)
    assert.equal(createCall.body.ban_duration, '876000h')
    assert.match(createCall.body.email, /^[0-9a-f-]+@gambarin\.invalid$/)
    assert.equal(createCall.body.password, result.initial_password)
    assert.equal(calls[0].headers.get('Authorization'), 'Bearer main-admin-token')
    assert.equal(calls[1].headers.get('Authorization'), 'Bearer main-admin-token')
    assert.deepEqual(calls[1].body, {})
    assert.equal(calls.at(-1).body.ban_duration, 'none')
    assert.ok(calls.at(-2).url.pathname.endsWith('/rpc/gambarin_admin_create_account'))
  }
})

test('quota comes from current package defaults rather than a frontend-supplied value', async () => {
  const { request } = setup({ packageQuota: 99 })
  assert.equal((await (await request()).json()).account.quota_granted, 99)
  assert.equal((await request({ username: 'new', duration_days: 7, quota_granted: 999 })).status, 400)
})

test('anonymous, invalid-token and non-admin callers cannot create any Auth user', async () => {
  const anonymous = setup()
  assert.equal((await anonymous.request(undefined, { Authorization: '' })).status, 401)
  assert.equal(anonymous.calls.length, 0)
  for (const behavior of [{ invalidToken: true }, { admin: false }, { admin: 'true' }, { adminError: true }]) {
    const sample = setup(behavior)
    const response = await sample.request()
    assert.equal(response.status, behavior.invalidToken ? 401 : 403)
    assert.ok(sample.calls.every((call) => call.url.host === 'main.example.invalid'))
    assert.equal(sample.users.size, 0)
  }
})

test('input validation rejects invalid usernames, packages, fields and malformed JSON', async () => {
  const sample = setup()
  for (const body of [
    { username: '', duration_days: 7 }, { username: 'a b', duration_days: 7 },
    { username: 'a%b', duration_days: 7 }, { username: 'a'.repeat(65), duration_days: 7 },
    { username: 'user', duration_days: 2 }, { username: 'user', duration_days: '7' },
    { username: 'user', duration_days: 7, password: 'caller-password' },
    { username: 'user', duration_days: 7, main_admin_user_id: 'spoofed' }, [], 'null', '{',
  ]) assert.equal((await sample.request(body)).status, 400)
  assert.equal(sample.users.size, 0)
})

test('case-insensitive duplicates are rejected before Auth creation; successful password cannot be fetched again', async () => {
  const sample = setup()
  const first = await sample.request({ username: 'Customer_One', duration_days: 7 })
  assert.equal(first.status, 201)
  const duplicate = await sample.request({ username: 'CUSTOMER_ONE', duration_days: 30 })
  assert.equal(duplicate.status, 409)
  assert.deepEqual(await duplicate.json(), { error: 'username_taken' })
  assert.equal(sample.users.size, 1)
  assert.equal(sample.accounts.length, 1)
  const lookup = sample.calls.find((call) => call.url.pathname.endsWith('/gambarin_accounts'))
  assert.equal(lookup.url.searchParams.get('username'), 'ilike.customer\\_one')
})

test('duplicate race at RPC is rejected and its newly created banned Auth user is deleted', async () => {
  const sample = setup({ raceDuplicate: true })
  const response = await sample.request()
  assert.equal(response.status, 409)
  assert.equal(sample.users.size, 0)
  assert.equal(sample.accounts.length, 0)
  assert.equal(sample.events.length, 0)
  assert.equal(sample.calls.at(-1).method, 'DELETE')
})

test('inactive or concurrently deactivated packages cannot create an account', async () => {
  const inactive = setup({ inactivePackage: true })
  assert.equal((await inactive.request()).status, 400)
  assert.equal(inactive.users.size, 0)
  const changed = setup({ packageChanged: true })
  assert.equal((await changed.request()).status, 400)
  assert.equal(changed.users.size, 0)
  assert.equal(changed.accounts.length, 0)
})

test('database or audit failure rolls back records and compensates the banned Auth user', async () => {
  for (const behavior of [{ databaseFailure: true }, { auditFailure: true }]) {
    const sample = setup(behavior)
    const response = await sample.request()
    assert.equal(response.status, 502)
    assert.deepEqual(await response.json(), { error: 'account_creation_failed' })
    assert.equal(sample.users.size, 0)
    assert.equal(sample.accounts.length, 0)
    assert.equal(sample.events.length, 0)
    assert.ok(!sample.calls.some((call) => call.method === 'PUT'))
  }
})

test('failed compensation leaves only a banned user, never an active orphan', async () => {
  const sample = setup({ databaseFailure: true, cleanupFailure: true })
  const response = await sample.request()
  assert.equal(response.status, 503)
  assert.deepEqual(await response.json(), { error: 'account_creation_needs_review' })
  assert.equal(sample.accounts.length, 0)
  assert.ok([...sample.users.values()].every((user) => Date.parse(user.banned_until) > Date.now()))
  assert.ok(!sample.calls.some((call) => call.method === 'PUT'))
})

test('lost commit response does not delete the committed account or release its Auth ban', async () => {
  const sample = setup({ lostCommitResponse: true })
  const response = await sample.request()
  assert.equal(response.status, 503)
  assert.deepEqual(await response.json(), { error: 'account_creation_needs_review' })
  assert.equal(sample.accounts.length, 1)
  assert.equal(sample.events.length, 2)
  assert.equal(sample.users.size, 1)
  assert.ok([...sample.users.values()].every((user) => Date.parse(user.banned_until) > Date.now()))
  assert.ok(!sample.calls.some((call) => call.method === 'PUT'))
})

test('unban failure keeps the committed record/audit and does not expose the password', async () => {
  const sample = setup({ activationFailure: true })
  const response = await sample.request()
  assert.equal(response.status, 503)
  assert.deepEqual(await response.json(), { error: 'account_activation_needs_review' })
  assert.equal(sample.accounts.length, 1)
  assert.equal(sample.events.length, 2)
  assert.ok(!sample.calls.some((call) => call.method === 'DELETE'))
  assert.ok([...sample.users.values()].every((user) => Date.parse(user.banned_until) > Date.now()))
})

test('password is random and returned only on success, never in RPC, audit, logs or Auth identity fields', async (t) => {
  const logs = []
  for (const method of ['log', 'error', 'warn', 'info']) t.mock.method(console, method, (...args) => logs.push(args))
  const passwords = []
  for (let i = 0; i < 2; i++) {
    const sample = setup()
    const response = await sample.request()
    const result = await response.json()
    const password = result.initial_password
    passwords.push(password)
    assert.equal(password.length, 52)
    for (const expression of [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/]) assert.match(password, expression)
    assert.ok(!JSON.stringify(result.account).includes(password))
    assert.ok(!JSON.stringify(sample.events).includes(password))
    const rpc = sample.calls.find((call) => call.url.pathname.endsWith('/rpc/gambarin_admin_create_account'))
    assert.ok(!/password|token|email|test-server-key/.test(JSON.stringify(rpc.body)))
    assert.ok(!/auth_user_id|email|service_role|test-server-key|main-admin-token/.test(JSON.stringify(result)))
  }
  assert.notEqual(passwords[0], passwords[1])
  assert.deepEqual(logs, [])
})

test('configuration, lookup and Auth errors are safe and do not expose internal details', async () => {
  for (const overrides of [
    { GAMBARIN_ADMIN_ALLOWED_ORIGIN: '' }, { SUPABASE_URL: '' },
    { GAMBARIN_SUPABASE_SERVICE_ROLE_KEY: '' }, { GAMBARIN_SUPABASE_URL: 'invalid' },
    { GAMBARIN_SUPABASE_URL: 'https://main.example.invalid' },
  ]) {
    const sample = setup({}, overrides)
    assert.equal((await sample.request()).status, 503)
    assert.equal(sample.users.size, 0)
  }
  for (const behavior of [{ lookupFailure: true }, { packageFailure: true }, { authFailure: true }]) {
    const sample = setup(behavior)
    const response = await sample.request()
    assert.equal(response.status, 502)
    assert.ok(!/private|test-server-key/.test(await response.text()))
    assert.equal(sample.users.size, 0)
  }
})

test('CORS, preflight and server requests preserve admin authorization', async () => {
  const sample = setup()
  const evil = await sample.request(undefined, { Origin: 'https://evil.example' })
  assert.equal(evil.status, 403)
  assert.equal(evil.headers.get('Access-Control-Allow-Origin'), null)
  for (const allowed of ['https://www.greenroomid.com', origin, 'http://localhost:5173']) {
    const response = await sample.request(undefined, { Origin: allowed, Authorization: '' }, 'OPTIONS')
    assert.equal(response.status, 204)
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), allowed)
    assert.equal(response.headers.get('Vary'), 'Origin')
  }
  assert.equal(sample.calls.length, 0)
  assert.equal((await sample.request(undefined, { Origin: null, Authorization: '' })).status, 401)
  const ordinary = setup({ admin: false })
  assert.equal((await ordinary.request(undefined, { Origin: null })).status, 403)
  assert.equal((await sample.request(undefined, {}, 'GET')).status, 405)
})
