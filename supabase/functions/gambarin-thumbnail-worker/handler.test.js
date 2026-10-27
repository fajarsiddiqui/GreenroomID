import assert from 'node:assert/strict'
import test from 'node:test'
import { createHandler } from './handler.js'

const jobId = '11111111-1111-4111-8111-111111111111'
const accountId = '22222222-2222-4222-8222-222222222222'
const token = `x.${btoa(JSON.stringify({ role: 'service_role' })).replace(/=+$/, '')}.fixture`
const env = name => ({ SUPABASE_URL: 'https://gambarin.example.invalid',
  SUPABASE_SERVICE_ROLE_KEY: 'test-service-key', GAMBARIN_WORKER_TRIGGER_KEY: token })[name]

function setup({ brokenConvert = false, resolveStatus = 200,
  resolveBody = { asset: { url: 'https://cdn.example.invalid/image.png' } },
  finishMode = 'ok', sourceStatus = 200, resolveThrows = false } = {}) {
  const calls = { claims: 0, finish: [], uploads: 0, resolves: 0, originals: 0, diagnostics: [] }
  const db = {
    rpc: (name, args) => {
      if (name === 'gambarin_thumbnail_claim') return Promise.resolve({ data: ++calls.claims === 1
        ? { job_id: jobId, account_id: accountId, storage_path: `${accountId}/${jobId}.webp`, attempt: 1 }
        : null, error: null })
      if (name === 'gambarin_thumbnail_budget') return Promise.resolve({ data: true, error: null })
      if (name === 'gambarin_thumbnail_finish') {
        calls.finish.push(args)
        // Supabase's PostgrestBuilder is awaitable but has no .catch method.
        return { then(resolve, reject) {
          if (finishMode === 'throw') reject(new Error('transport'))
          else resolve(finishMode === 'empty' ? undefined
            : { error: finishMode === 'error' ? { message: 'rpc failed' } : null })
        } }
      }
      throw new Error(`Unexpected RPC ${name}`)
    },
    storage: { from: bucket => {
      assert.equal(bucket, 'gambarin-thumbnails')
      return { download: async () => ({ data: null, error: { message: 'missing' } }),
        upload: async () => { calls.uploads++; return { error: null } } }
    } },
  }
  const handler = createHandler({ createClient: () => db, env,
    fetchImpl: async url => {
      if (String(url).includes('/gambarin-worker/resolve')) {
        calls.resolves++
        if (resolveThrows) throw new DOMException('timed out', 'TimeoutError')
        return Response.json(resolveBody, { status: resolveStatus })
      }
      calls.originals++
      return new Response(new Uint8Array([1, 2, 3]), { status: sourceStatus,
        headers: { 'Content-Type': 'image/png' } })
    },
    convert: () => {
      if (brokenConvert) throw new Error('conversion_failed')
      return { bytes: new Uint8Array([1, 2, 3, 4]), width: 480, height: 240 }
    },
    diagnostic: event => calls.diagnostics.push(event),
  })
  const call = (authorization = `Bearer ${token}`) => handler(new Request(
    'https://gambarin.example.invalid/functions/v1/gambarin-thumbnail-worker',
    { method: 'POST', headers: { Authorization: authorization } }))
  return { call, calls }
}

test('one claimed job creates one thumbnail; second wake is idle, never submits generate', async () => {
  const { call, calls } = setup()
  assert.equal((await call()).status, 200)
  assert.equal((await call()).status, 200)
  assert.equal(calls.resolves, 1)
  assert.equal(calls.originals, 1)
  assert.equal(calls.uploads, 1)
  assert.equal(calls.finish.length, 1)
  assert.equal(calls.finish[0].p_ready, true)
})

test('conversion failure records failed thumbnail without touching job or quota', async () => {
  const { call, calls } = setup({ brokenConvert: true })
  assert.equal((await call()).status, 503)
  assert.equal(calls.uploads, 0)
  assert.equal(calls.finish[0].p_ready, false)
  assert.equal(calls.finish[0].p_error_code, 'conversion_failed')
})

test('waiting, unavailable and timeout are distinguished and finalized with awaitable RPC', async () => {
  for (const [options, code] of [
    [{ resolveBody: { state: 'waiting' } }, 'resolve_waiting'],
    [{ resolveStatus: 409, resolveBody: { error: 'asset_unresolved',
      resolve_diagnostic: { status: 403, code: 'FORBIDDEN_ACTION' } } }, 'resolve_unavailable'],
    [{ resolveStatus: 409, resolveBody: { error: 'asset_not_ready' } }, 'resolve_not_ready'],
    [{ resolveThrows: true }, 'resolve_timeout'],
    [{ sourceStatus: 404 }, 'source_not_found'],
  ]) {
    const { call, calls } = setup(options)
    const response = await call()
    assert.equal(response.status, 503)
    assert.equal((await response.json()).state, 'failed')
    assert.equal(calls.finish.length, 1)
    assert.equal(calls.finish[0].p_ready, false)
    assert.equal(calls.finish[0].p_error_code, code)
  }
})

test('failure-finalization RPC error is reported; lease remains for expiry recovery', async () => {
  for (const finishMode of ['error', 'throw', 'empty']) {
    const { call, calls } = setup({ resolveBody: { state: 'waiting' }, finishMode })
    const response = await call()
    assert.equal(response.status, 503)
    assert.equal((await response.json()).error, 'finish_unavailable')
    assert.equal(calls.finish.length, 1)
    assert.equal(calls.diagnostics.at(-1).stage, 'finish_failed')
  }
})

test('public and incorrect backend JWT cannot claim thumbnail work', async () => {
  const { call, calls } = setup()
  assert.equal((await call('')).status, 401)
  assert.equal((await call('Bearer wrong')).status, 403)
  assert.equal(calls.claims, 0)
})
