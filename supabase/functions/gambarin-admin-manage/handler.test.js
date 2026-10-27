import assert from 'node:assert/strict'
import test from 'node:test'
import { createClient } from '@supabase/supabase-js'
import { createHandler } from './handler.js'

const actor = '00000000-0000-4000-8000-000000000001'
const accountId = '00000000-0000-4000-8000-000000000002'
const otherId = '00000000-0000-4000-8000-000000000003'
const origin = 'https://greenroomid.com'
const endpoint = 'https://main.example.invalid/functions/v1/gambarin-admin-manage/'
const now = '2026-10-27T04:00:00.000Z'
const day = 86400000
const initialAccount = {
  id: accountId, username: 'customer', package_id: 'old-package', status: 'active',
  activated_at: '2026-10-20T04:00:00.000Z', expires_at: '2026-11-03T04:00:00.000Z',
  quota_granted: 20, quota_used: 7, quota_reserved: 2,
}

function setup(behavior = {}, overrides = {}) {
  const config = {
    SUPABASE_URL: 'https://main.example.invalid', SUPABASE_ANON_KEY: 'test-main-key',
    GAMBARIN_SUPABASE_URL: 'https://gambarin.example.invalid',
    GAMBARIN_SUPABASE_SERVICE_ROLE_KEY: 'test-server-key',
    GAMBARIN_ADMIN_ALLOWED_ORIGIN: ` https://www.greenroomid.com, ${origin}, ,http://localhost:5173 `,
    ...overrides,
  }
  const calls = []
  const accounts = new Map([
    [accountId, { ...initialAccount, ...behavior.account }],
    [otherId, { ...initialAccount, id: otherId, username: 'other' }],
  ])
  const events = []
  const failure = (code, message) => Response.json({ code, message }, { status: 400 })
  const handle = createHandler({
    env: (name) => config[name],
    createClient: (url, key, options) => createClient(url, key, {
      ...options, global: { ...options.global, fetch: async (input, init) => {
        const request = new Request(input, init)
        const url = new URL(request.url)
        const body = request.method === 'GET' ? null : JSON.parse(await request.text() || '{}')
        calls.push({ url, body, method: request.method, headers: request.headers })
        if (url.host === 'main.example.invalid') {
          if (url.pathname === '/auth/v1/user') return behavior.invalidToken
            ? new Response('{}', { status: 401 }) : Response.json({ id: actor })
          if (url.pathname === '/rest/v1/rpc/is_admin') return behavior.adminError
            ? failure('XX000', 'private admin detail') : Response.json(behavior.admin ?? true)
        }
        assert.equal(url.host, 'gambarin.example.invalid')
        assert.ok(['/rest/v1/rpc/gambarin_admin_manage_account', '/rest/v1/rpc/gambarin_admin_disable_account'].includes(url.pathname))
        assert.equal(request.headers.get('Authorization'), 'Bearer test-server-key')
        if (behavior.databaseFailure) return failure('XX000', 'private database detail')
        const before = accounts.get(body.p_account_id)
        if (!before) return failure('P0002', 'account_not_found')
        const after = { ...before }
        let action
        let metadata
        if (url.pathname.endsWith('gambarin_admin_disable_account')) {
          if (before.status !== 'active') return failure('P0001', 'invalid_status')
          after.status = 'disabled'
          action = 'disabled'
          metadata = { status_before: before.status, status_after: after.status }
        } else if (body.p_operation === 'add_quota') {
          if (after.quota_granted + body.p_amount > 2147483647) return failure('23514', 'quota_conflict')
          after.quota_granted += body.p_amount
          action = 'quota_adjusted'
          metadata = { additional_images: body.p_amount, quota_granted_before: before.quota_granted, quota_granted_after: after.quota_granted }
        } else if (body.p_operation === 'extend') {
          if (!before.activated_at || !before.expires_at) return failure('P0001', 'account_not_activated')
          after.expires_at = new Date(Math.max(Date.parse(before.expires_at), Date.parse(now)) + body.p_amount * day).toISOString()
          action = 'extended'
          metadata = { additional_days: body.p_amount, expires_at_before: before.expires_at, expires_at_after: after.expires_at }
        } else {
          if (before.status !== 'disabled') return failure('P0001', 'invalid_status')
          if (behavior.inactivePackage) return failure('22023', 'invalid_package')
          after.status = 'active'
          after.package_id = `package-${body.p_amount}`
          after.activated_at = now
          after.expires_at = new Date(Date.parse(now) + body.p_amount * day).toISOString()
          action = 'reactivated'
          metadata = { duration_days: body.p_amount, status_before: before.status, status_after: after.status }
        }
        // Mock transaction boundary: audit failure commits neither change nor event.
        if (behavior.auditFailure) return failure('XX000', 'private audit detail')
        accounts.set(body.p_account_id, after)
        events.push({ account_id: body.p_account_id, action, main_admin_user_id: body.p_main_admin_user_id, metadata })
        if (behavior.lostCommitResponse) throw new TypeError('private lost response detail')
        return Response.json({ ...after, auth_user_id: 'private-id', password: 'private-password', service_role: 'test-server-key' })
      } },
    }),
  })
  const request = (route = 'add-quota', body = { account_id: accountId, additional_images: 5 }, headers = {}, method = 'POST') => {
    const requestHeaders = new Headers({ Origin: origin, Authorization: 'Bearer main-admin-token', 'Content-Type': 'application/json' })
    for (const [name, value] of Object.entries(headers)) {
      if (value === null) requestHeaders.delete(name)
      else requestHeaders.set(name, value)
    }
    return handle(new Request(endpoint + route, {
      method, headers: requestHeaders,
      ...(['GET', 'OPTIONS'].includes(method) ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
    }))
  }
  return { request, calls, accounts, events }
}

test('admin adds quota with verified actor and an audit, preserving usage/reservations and other accounts', async () => {
  const sample = setup()
  const other = structuredClone(sample.accounts.get(otherId))
  const response = await sample.request()
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('Cache-Control'), 'no-store')
  const { account } = await response.json()
  assert.deepEqual(account, { ...initialAccount, quota_granted: 25 })
  assert.deepEqual(sample.accounts.get(otherId), other)
  assert.equal(sample.events.length, 1)
  assert.deepEqual(sample.events[0], {
    account_id: accountId, action: 'quota_adjusted', main_admin_user_id: actor,
    metadata: { additional_images: 5, quota_granted_before: 20, quota_granted_after: 25 },
  })
  assert.equal(sample.calls[0].headers.get('Authorization'), 'Bearer main-admin-token')
  assert.equal(sample.calls[1].headers.get('Authorization'), 'Bearer main-admin-token')
  assert.deepEqual(sample.calls[1].body, {})
  assert.deepEqual(sample.calls[2].body, { p_account_id: accountId, p_operation: 'add_quota', p_amount: 5, p_main_admin_user_id: actor })
  assert.equal(sample.calls.length, 3)
})

test('extension starts at future expiry and preserves status, activation and all quota', async () => {
  const sample = setup()
  const response = await sample.request('extend', { account_id: accountId, additional_days: 5 })
  assert.equal(response.status, 200)
  const account = (await response.json()).account
  assert.deepEqual(account, { ...initialAccount, expires_at: new Date(Date.parse(initialAccount.expires_at) + 5 * day).toISOString() })
  assert.equal(sample.events[0].action, 'extended')
  assert.equal(sample.events[0].metadata.expires_at_before, initialAccount.expires_at)
  assert.equal(sample.events[0].metadata.expires_at_after, account.expires_at)
})

test('expired extension starts at database time and a disabled account stays disabled', async () => {
  for (const status of ['active', 'disabled']) {
    const sample = setup({ account: { status, expires_at: '2026-10-21T04:00:00.000Z' } })
    const response = await sample.request('extend', { account_id: accountId, additional_days: 365 })
    assert.equal(response.status, 200)
    const account = (await response.json()).account
    assert.equal(account.expires_at, new Date(Date.parse(now) + 365 * day).toISOString())
    assert.equal(account.status, status)
    assert.equal(account.activated_at, initialAccount.activated_at)
    assert.equal(account.quota_granted, initialAccount.quota_granted)
  }
})

test('reactivating disabled accounts accepts all active package durations without changing any quota', async () => {
  for (const duration of [1, 3, 7, 14, 30]) {
    const sample = setup({ account: { status: 'disabled' } })
    const response = await sample.request('reactivate', { account_id: accountId, duration_days: duration })
    assert.equal(response.status, 200)
    const account = (await response.json()).account
    assert.equal(account.status, 'active')
    assert.equal(account.package_id, `package-${duration}`)
    assert.equal(account.activated_at, now)
    assert.equal(account.expires_at, new Date(Date.parse(now) + duration * day).toISOString())
    for (const field of ['quota_granted', 'quota_used', 'quota_reserved']) assert.equal(account[field], initialAccount[field])
    assert.equal(sample.events[0].action, 'reactivated')
    assert.equal(sample.events[0].main_admin_user_id, actor)
    assert.equal(sample.accounts.get(otherId).status, 'active')
  }
})

test('reactivation rejects active/pending and inactive packages, with no changes or events', async () => {
  for (const behavior of [{}, { account: { status: 'pending' } }, { account: { status: 'disabled' }, inactivePackage: true }]) {
    const sample = setup(behavior)
    const before = structuredClone([...sample.accounts])
    const response = await sample.request('reactivate', { account_id: accountId, duration_days: 7 })
    assert.equal(response.status, behavior.inactivePackage ? 400 : 409)
    assert.deepEqual([...sample.accounts], before)
    assert.equal(sample.events.length, 0)
  }
})

test('admin disables one account with audit; repeated disable and non-admin are rejected', async () => {
  const sample = setup()
  const other = structuredClone(sample.accounts.get(otherId))
  const response = await sample.request('disable', { account_id: accountId })
  assert.equal(response.status, 200)
  assert.equal((await response.json()).account.status, 'disabled')
  assert.equal(sample.accounts.get(accountId).quota_reserved, initialAccount.quota_reserved)
  assert.deepEqual(sample.accounts.get(otherId), other)
  assert.deepEqual(sample.events[0], { account_id: accountId, action: 'disabled', main_admin_user_id: actor,
    metadata: { status_before: 'active', status_after: 'disabled' } })
  assert.equal(sample.calls[2].url.pathname, '/rest/v1/rpc/gambarin_admin_disable_account')
  assert.equal((await sample.request('disable', { account_id: accountId })).status, 409)
  assert.equal(sample.events.length, 1)
  const pending = setup({ account: { status: 'pending' } })
  assert.equal((await pending.request('disable', { account_id: accountId })).status, 409)
  assert.equal(pending.events.length, 0)
  const nonAdmin = setup({ admin: false })
  assert.equal((await nonAdmin.request('disable', { account_id: accountId })).status, 403)
  assert.equal(nonAdmin.events.length, 0)
})

test('disable rejects spoofed fields and rolls back if audit fails', async () => {
  const invalid = setup()
  assert.equal((await invalid.request('disable', { account_id: accountId, main_admin_user_id: otherId })).status, 400)
  assert.equal(invalid.calls.length, 2)
  const audit = setup({ auditFailure: true })
  assert.equal((await audit.request('disable', { account_id: accountId })).status, 502)
  assert.equal(audit.accounts.get(accountId).status, 'active')
  assert.equal(audit.events.length, 0)
})

test('anonymous, invalid-token and non-admin requests never reach Gambarin', async () => {
  const anonymous = setup()
  assert.equal((await anonymous.request(undefined, undefined, { Authorization: '' })).status, 401)
  assert.equal(anonymous.calls.length, 0)
  for (const behavior of [{ invalidToken: true }, { admin: false }, { admin: 'true' }, { adminError: true }]) {
    const sample = setup(behavior)
    assert.equal((await sample.request()).status, behavior.invalidToken ? 401 : 403)
    assert.ok(sample.calls.every((call) => call.url.host === 'main.example.invalid'))
    assert.equal(sample.events.length, 0)
  }
})

test('missing accounts return 404 for each operation without changing another account', async () => {
  for (const [route, field] of [['add-quota', 'additional_images'], ['extend', 'additional_days'], ['reactivate', 'duration_days']]) {
    const sample = setup()
    const before = structuredClone([...sample.accounts])
    const response = await sample.request(route, { account_id: '00000000-0000-4000-8000-000000000099', [field]: 7 })
    assert.equal(response.status, 404)
    assert.deepEqual(await response.json(), { error: 'account_not_found' })
    assert.deepEqual([...sample.accounts], before)
    assert.equal(sample.events.length, 0)
  }
})

test('invalid numbers, package durations, IDs and spoofed admin input are rejected before mutation', async () => {
  const sample = setup()
  for (const [route, field] of [['add-quota', 'additional_images'], ['extend', 'additional_days'], ['reactivate', 'duration_days']]) {
    for (const value of [0, -1, 1.5, '7', null, true, 2147483648]) {
      assert.equal((await sample.request(route, { account_id: accountId, [field]: value })).status, 400)
    }
  }
  for (const [route, body] of [
    ['extend', { account_id: accountId, additional_days: 366 }],
    ['reactivate', { account_id: accountId, duration_days: 2 }],
    ['add-quota', { account_id: 'invalid', additional_images: 5 }],
    ['add-quota', { account_id: '00000000-0000-0000-0000-000000000000', additional_images: 5 }],
    ['add-quota', { account_id: accountId, additional_images: 5, main_admin_user_id: 'spoofed' }],
    ['add-quota', { account_id: accountId, additional_images: 5, quota_used: 0 }],
    ['add-quota', []], ['add-quota', 'null'], ['add-quota', '{'],
  ]) assert.equal((await sample.request(route, body)).status, 400)
  assert.equal(sample.events.length, 0)
  assert.ok(sample.calls.every((call) => call.url.host === 'main.example.invalid'))
})

test('quota overflow and extension of never-activated accounts return clear conflicts', async () => {
  const overflow = setup({ account: { quota_granted: 2147483646 } })
  const quotaResponse = await overflow.request()
  assert.equal(quotaResponse.status, 409)
  assert.deepEqual(await quotaResponse.json(), { error: 'quota_conflict' })
  assert.equal(overflow.accounts.get(accountId).quota_granted, 2147483646)
  assert.equal(overflow.events.length, 0)
  const pending = setup({ account: { status: 'pending', activated_at: null, expires_at: null } })
  const periodResponse = await pending.request('extend', { account_id: accountId, additional_days: 7 })
  assert.equal(periodResponse.status, 409)
  assert.deepEqual(await periodResponse.json(), { error: 'account_not_activated' })
  assert.equal(pending.events.length, 0)
})

test('database and audit failures leave no partial mutation for all operations', async () => {
  for (const failure of ['databaseFailure', 'auditFailure']) {
    for (const [route, field] of [['add-quota', 'additional_images'], ['extend', 'additional_days'], ['reactivate', 'duration_days']]) {
      const sample = setup({ [failure]: true, account: { status: 'disabled' } })
      const before = structuredClone([...sample.accounts])
      const response = await sample.request(route, { account_id: accountId, [field]: 7 })
      assert.equal(response.status, 502)
      assert.deepEqual(await response.json(), { error: 'account_management_failed' })
      assert.deepEqual([...sample.accounts], before)
      assert.equal(sample.events.length, 0)
      assert.equal(sample.calls.length, 3)
    }
  }
})

test('sequential quota operations accumulate; a second reactivation is rejected', async () => {
  const sample = setup({ account: { status: 'disabled' } })
  assert.equal((await sample.request()).status, 200)
  assert.equal((await sample.request()).status, 200)
  assert.equal(sample.accounts.get(accountId).quota_granted, 30)
  assert.equal((await sample.request('reactivate', { account_id: accountId, duration_days: 3 })).status, 200)
  assert.equal((await sample.request('reactivate', { account_id: accountId, duration_days: 3 })).status, 409)
  assert.equal(sample.events.length, 3)
  assert.equal(sample.accounts.get(accountId).quota_used, 7)
  assert.equal(sample.accounts.get(accountId).quota_reserved, 2)
})

test('a lost commit response is redacted and never automatically repeats the additive RPC', async () => {
  const sample = setup({ lostCommitResponse: true })
  const response = await sample.request()
  assert.equal(response.status, 502)
  assert.deepEqual(await response.json(), { error: 'account_management_failed' })
  assert.equal(sample.accounts.get(accountId).quota_granted, 25)
  assert.equal(sample.events.length, 1)
  assert.equal(sample.calls.length, 3)
})

test('credentials and unexpected RPC fields never enter response, audit or logs', async (t) => {
  const logs = []
  for (const method of ['log', 'error', 'warn', 'info']) t.mock.method(console, method, (...args) => logs.push(args))
  const sample = setup()
  const response = await sample.request()
  const output = await response.text()
  assert.ok(!/test-server-key|main-admin-token|auth_user_id|password|service_role/.test(output))
  assert.ok(!/test-server-key|main-admin-token|password|token/.test(JSON.stringify(sample.events)))
  assert.deepEqual(logs, [])
})

test('missing/invalid configuration returns safe errors and does not mutate accounts', async () => {
  for (const override of [
    { GAMBARIN_ADMIN_ALLOWED_ORIGIN: '' }, { SUPABASE_URL: '' }, { SUPABASE_ANON_KEY: '' },
    { SUPABASE_URL: 'invalid' }, { GAMBARIN_SUPABASE_SERVICE_ROLE_KEY: '' },
    { GAMBARIN_SUPABASE_URL: 'invalid' }, { GAMBARIN_SUPABASE_URL: 'https://main.example.invalid' },
  ]) {
    const sample = setup({}, override)
    assert.equal((await sample.request()).status, 503)
    assert.equal(sample.events.length, 0)
  }
})

test('CORS, preflight, route/method checks and server-to-server authorization remain enforced', async () => {
  const sample = setup()
  const evil = await sample.request(undefined, undefined, { Origin: 'https://evil.example' })
  assert.equal(evil.status, 403)
  assert.equal(evil.headers.get('Access-Control-Allow-Origin'), null)
  for (const allowed of ['https://www.greenroomid.com', origin, 'http://localhost:5173']) {
    const response = await sample.request(undefined, undefined, { Origin: allowed, Authorization: '' }, 'OPTIONS')
    assert.equal(response.status, 204)
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), allowed)
  }
  assert.equal(sample.calls.length, 0)
  assert.equal((await sample.request(undefined, undefined, { Origin: null, Authorization: '' })).status, 401)
  const ordinary = setup({ admin: false })
  assert.equal((await ordinary.request(undefined, undefined, { Origin: null })).status, 403)
  assert.equal((await sample.request(undefined, undefined, {}, 'GET')).status, 405)
  assert.equal((await sample.request('delete')).status, 404)
  assert.equal((await sample.request('toString')).status, 404)
  const serverResponse = await sample.request(undefined, undefined, { Origin: null })
  assert.equal(serverResponse.status, 200)
  assert.equal(serverResponse.headers.get('Access-Control-Allow-Origin'), null)
})
