import assert from 'node:assert/strict'
import test from 'node:test'
import { createHandler } from './handler.js'

const id = '11111111-1111-4111-8111-111111111111'
const config = { SUPABASE_URL: 'https://gambarin.example.invalid', SUPABASE_ANON_KEY: 'public-test',
  GAMBARIN_WORKER_TRIGGER_KEY: 'backend-trigger-test',
  GAMBARIN_CUSTOMER_ALLOWED_ORIGIN: 'https://www.greenroomid.com' }

function setup({ own = true, validJwt = true } = {}) {
  const calls = []
  const createClient = () => ({
    auth: { getUser: async () => validJwt
      ? { data: { user: { id } }, error: null } : { data: null, error: { message: 'invalid' } } },
    rpc: async () => ({ data: own ? { status: 'succeeded', asset: { state: 'resolvable' } } : null, error: null }),
  })
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), options })
    if (String(url) === 'https://assets.example/signed') {
      return new Response(new Uint8Array([1, 2, 3]), { headers: { 'Content-Type': 'image/png' } })
    }
    return { ok: true, json: async () => ({
      asset: { url: 'https://assets.example/signed', temporary: true },
      resolve_diagnostic: { status: 403, code: 'FORBIDDEN_ACTION', source: 'job_fallback' },
    }) }
  }
  const handler = createHandler({ createClient, env: name => config[name], fetchImpl })
  const request = (headers = {}, body = { job_id: id }) => handler(new Request('https://gambarin.example.invalid/functions/v1/gambarin-customer-asset', {
    method: 'POST', headers: { Origin: 'https://www.greenroomid.com', Authorization: 'Bearer customer-jwt', ...headers },
    body: JSON.stringify(body),
  }))
  return { request, calls }
}

test('owner receives resolved temporary URL through backend worker', async () => {
  const { request, calls } = setup()
  const response = await request()
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { asset: { url: 'https://assets.example/signed', temporary: true } })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].options.headers.Authorization, 'Bearer backend-trigger-test')
})

test('anonymous, invalid JWT and other account never reach worker', async () => {
  for (const options of [{ validJwt: false }, { own: false }]) {
    const { request, calls } = setup(options)
    assert.equal((await request()).status, options.validJwt === false ? 401 : 404)
    assert.equal(calls.length, 0)
  }
  assert.equal((await setup().request({ Authorization: '' })).status, 401)
})

test('owner can download original bytes without exposing the signed URL', async () => {
  const { request, calls } = setup()
  const response = await request({}, { job_id: id, download: true })
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('Content-Type'), 'image/png')
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store')
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), new Uint8Array([1, 2, 3]))
  assert.equal(calls.length, 2)
  const other = setup({ own: false })
  assert.equal((await other.request({}, { job_id: id, download: true })).status, 404)
  assert.equal(other.calls.length, 0)
})
