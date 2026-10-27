import assert from 'node:assert/strict'
import test from 'node:test'
import { createHandler } from './handler.js'

const id = '11111111-1111-4111-8111-111111111111'
const config = {
  SUPABASE_URL: 'https://gambarin.example.invalid',
  SUPABASE_ANON_KEY: 'publishable-test',
  SUPABASE_SERVICE_ROLE_KEY: 'backend-test',
  GAMBARIN_CUSTOMER_ALLOWED_ORIGIN: 'https://www.greenroomid.com,http://localhost:5173',
}

function setup({ own = true, validJwt = true, status = 'succeeded', asset = `mock-asset-${id}` } = {}) {
  let serviceReads = 0
  const createClient = (_url, key) => key === config.SUPABASE_ANON_KEY
    ? { auth: { getUser: async () => validJwt
      ? { data: { user: { id } }, error: null } : { data: null, error: { message: 'invalid' } } },
      rpc: async () => ({ data: own ? { status } : null, error: null }) }
    : { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => {
      serviceReads += 1
      return { data: { provider_asset_id: asset }, error: null }
    } }) }) }) }
  const handle = createHandler({ createClient, env: name => config[name] })
  const request = (headers = {}) => handle(new Request('https://gambarin.example.invalid/functions/v1/gambarin-customer-mock-asset', {
    method: 'POST', headers: { Origin: 'https://www.greenroomid.com', Authorization: 'Bearer user-jwt', ...headers },
    body: JSON.stringify({ job_id: id }),
  }))
  return { request, getServiceReads: () => serviceReads }
}

test('owner alone receives a clearly labelled simulated SVG', async () => {
  const { request } = setup()
  const response = await request()
  assert.equal(response.status, 200)
  assert.match(response.headers.get('Content-Type'), /image\/svg\+xml/)
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), 'https://www.greenroomid.com')
  assert.match(await response.text(), /SIMULASI/)
})

test('anonymous, invalid JWT, other owner and unfinished job cannot read asset', async () => {
  for (const options of [{ validJwt: false }, { own: false }, { status: 'queued' }]) {
    const fixture = setup(options)
    const response = await fixture.request()
    assert.equal(response.status, options.validJwt === false ? 401 : 404)
    assert.equal(fixture.getServiceReads(), 0)
  }
  assert.equal((await setup().request({ Authorization: '' })).status, 401)
})

test('only mock asset IDs render; unknown origin gets no CORS access', async () => {
  assert.equal((await setup({ asset: 'real-provider-asset' }).request()).status, 404)
  const response = await setup().request({ Origin: 'https://evil.example' })
  assert.equal(response.status, 403)
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), null)
})
