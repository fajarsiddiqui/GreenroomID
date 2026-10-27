import assert from 'node:assert/strict'
import test from 'node:test'
import { createHandler } from './handler.js'
import { disabledProvider } from './provider.js'

const jwt = role => `eyJhbGciOiJub25lIn0.${btoa(JSON.stringify({ role })).replace(/=+$/, '')}.fixture`

function setup(triggerKey) {
  const dbKeys = []
  const handler = createHandler({
    createClient: (_url, key) => {
      dbKeys.push(key)
      return { rpc: async () => ({ data: { state: 'paused' }, error: null }) }
    },
    env: name => ({ SUPABASE_URL: 'https://gambarin.example.invalid',
      SUPABASE_SERVICE_ROLE_KEY: 'database-role-key',
      GAMBARIN_WORKER_TRIGGER_KEY: triggerKey,
    })[name],
    provider: disabledProvider(),
  })
  const call = token => handler(new Request('https://gambarin.example.invalid/functions/v1/gambarin-worker', {
    method: 'POST', headers: { Authorization: `Bearer ${token}` },
  }))
  return { call, dbKeys }
}

test('only exact configured service_role JWT reaches the database', async () => {
  const key = jwt('service_role')
  const { call, dbKeys } = setup(key)
  assert.equal((await call('database-role-key')).status, 403)
  assert.equal((await call(jwt('authenticated'))).status, 403)
  assert.equal((await call(`${key}wrong`)).status, 403)
  assert.deepEqual(dbKeys, [])
  const response = await call(key)
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { state: 'paused' })
  assert.deepEqual(dbKeys, ['database-role-key'])
})

test('missing trigger configuration fails closed', async () => {
  const response = await setup(undefined).call(jwt('service_role'))
  assert.equal(response.status, 503)
})

test('preflight uses metadata gate and performs no job claim or submit', async () => {
  const key = jwt('service_role')
  const calls = []
  const handler = createHandler({
    createClient: () => ({ rpc: async (name) => {
      calls.push(name)
      if (name === 'gambarin_acquire_dispatcher') return { data: { state: 'acquired', lease_id: 'lease-1' }, error: null }
      if (name === 'gambarin_begin_provider_request') return { data: { request_id: 'request-1' }, error: null }
      return { data: null, error: null }
    } }),
    env: name => ({ SUPABASE_URL: 'https://gambarin.example.invalid',
      SUPABASE_SERVICE_ROLE_KEY: 'database-key', GAMBARIN_WORKER_TRIGGER_KEY: key })[name],
    provider: { ready: true, preflight: async () => ({ account_matches: true,
      project_matches: true, price: 2, balance: 100 }) },
  })
  const response = await handler(new Request('https://gambarin.example.invalid/functions/v1/gambarin-worker/preflight', {
    method: 'POST', headers: { Authorization: `Bearer ${key}` },
    body: JSON.stringify({ expected_user_id: '22222222-2222-4222-8222-222222222222' }),
  }))
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { state: 'checked', account_matches: true,
    project_matches: true, price: 2, balance: 100 })
  assert.deepEqual(calls, ['gambarin_acquire_dispatcher', 'gambarin_begin_provider_request',
    'gambarin_finish_provider_request', 'gambarin_release_dispatcher'])
})

test('internal gallery probe reads only exact job metadata and never returns URL', async () => {
  const key = jwt('service_role')
  const calls = []
  const jobId = '22222222-2222-4222-8222-222222222222'
  const galleryId = '33333333-3333-4333-8333-333333333333'
  const handler = createHandler({
    createClient: () => ({
      rpc: async name => { calls.push(name); throw new Error('unexpected RPC') },
      from: name => {
        assert.equal(name, 'gambarin_jobs')
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({
          data: { id: jobId, status: 'submission_unknown', prompt: 'cat',
            submission_started_at: '2026-10-27T05:54:56Z' }, error: null,
        }) }) }) }
      },
    }),
    env: name => ({ SUPABASE_URL: 'https://gambarin.example.invalid',
      SUPABASE_SERVICE_ROLE_KEY: 'database-key', GAMBARIN_WORKER_TRIGGER_KEY: key })[name],
    provider: { ready: true, getGalleryItem: async () => ({ kind: 'found', item: {
      id: galleryId, prompt: 'cat', mediaGenerationId: 'media-1',
      gcsUrl: 'https://secret.example/signed', model: 'nano-banana-2',
      aspectRatio: 'IMAGE_ASPECT_RATIO_SQUARE', createdAt: '2026-10-27T05:55:46Z',
    } }) },
  })
  const url = 'https://gambarin.example.invalid/functions/v1/gambarin-worker/gallery-probe'
  const body = JSON.stringify({ job_id: jobId, gallery_item_id: galleryId })
  assert.equal((await handler(new Request(url, { method: 'POST', body }))).status, 401)
  const response = await handler(new Request(url, { method: 'POST', body,
    headers: { Authorization: `Bearer ${key}` } }))
  assert.equal(response.status, 200)
  const result = await response.json()
  assert.equal(result.prompt_matches, true)
  assert.equal(result.media_generation_id, 'media-1')
  assert.equal(result.has_url, true)
  assert.equal(JSON.stringify(result).includes('secret.example'), false)
  assert.deepEqual(calls, [])
})

test('internal jobs probe is read-only and removes prompts and provider URLs', async () => {
  const key = jwt('service_role')
  const jobId = '22222222-2222-4222-8222-222222222222'
  const handler = createHandler({
    createClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({
      data: { id: jobId, status: 'submission_unknown', prompt: 'secret prompt',
        submission_started_at: '2026-10-27T07:18:48Z' }, error: null,
    }) }) }) }), rpc: async () => { throw new Error('unexpected RPC') } }),
    env: name => ({ SUPABASE_URL: 'https://gambarin.example.invalid',
      SUPABASE_SERVICE_ROLE_KEY: 'database-key', GAMBARIN_WORKER_TRIGGER_KEY: key })[name],
    provider: { ready: true, listJobs: async () => ({ kind: 'listed', page: 1,
      totalPages: 1, total: 1, items: [{ id: 'provider-1', projectId: 'project-1',
        prompt: 'secret prompt', model: 'nano-banana-pro', status: 'completed',
        result: { media: [{ mediaId: 'media-1', url: 'https://secret.example/signed' }] } }] }) },
  })
  const response = await handler(new Request('https://gambarin.example.invalid/functions/v1/gambarin-worker/jobs-probe', {
    method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: JSON.stringify({ job_id: jobId }),
  }))
  assert.equal(response.status, 200)
  const result = await response.json()
  assert.equal(result.items[0].prompt_matches, true)
  assert.deepEqual(result.items[0].media_ids, ['media-1'])
  assert.equal(JSON.stringify(result).includes('secret prompt'), false)
  assert.equal(JSON.stringify(result).includes('secret.example'), false)
})
