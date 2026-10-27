import assert from 'node:assert/strict'
import test from 'node:test'
import { createHandler } from './handler.js'

const jobId = '11111111-1111-4111-8111-111111111111'
const accountId = '22222222-2222-4222-8222-222222222222'
const env = name => ({ SUPABASE_URL: 'https://gambarin.example.invalid',
  SUPABASE_ANON_KEY: 'public-key', SUPABASE_SERVICE_ROLE_KEY: 'service-key',
  GAMBARIN_CUSTOMER_ALLOWED_ORIGIN: 'https://www.greenroomid.com' })[name]

function setup({ owns = true, status = 'ready' } = {}) {
  let downloads = 0
  const createClient = (_url, key) => key === 'service-key' ? {
    storage: { from: () => ({ download: async path => {
      assert.equal(path, `${accountId}/${jobId}.webp`)
      downloads++
      return { data: new Blob([new Uint8Array([1, 2])], { type: 'image/webp' }), error: null }
    } }) },
  } : {
    auth: { getUser: async () => ({ data: { user: { id: 'auth-user' } }, error: null }) },
    rpc: async () => ({ data: owns ? { status: 'succeeded' } : null, error: null }),
    from: name => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: name === 'gambarin_thumbnails'
      ? { job_id: jobId, status } : { id: accountId }, error: null }) }) }) }),
  }
  const handler = createHandler({ createClient, env })
  const call = () => handler(new Request(
    'https://gambarin.example.invalid/functions/v1/gambarin-customer-thumbnail', {
      method: 'POST', headers: { Authorization: 'Bearer customer-jwt',
        Origin: 'https://www.greenroomid.com' }, body: JSON.stringify({ job_id: jobId }),
    }))
  return { call, downloads: () => downloads }
}

test('owner receives private WebP without a signed URL', async () => {
  const { call, downloads } = setup()
  const response = await call()
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('Content-Type'), 'image/webp')
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store')
  assert.equal((await response.arrayBuffer()).byteLength, 2)
  assert.equal(downloads(), 1)
})

test('other account and pending thumbnail never reach private Storage', async () => {
  const other = setup({ owns: false })
  assert.equal((await other.call()).status, 404)
  assert.equal(other.downloads(), 0)
  const pending = setup({ status: 'pending' })
  assert.equal((await pending.call()).status, 409)
  assert.equal(pending.downloads(), 0)
})
