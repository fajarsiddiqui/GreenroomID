import assert from 'node:assert/strict'
import test from 'node:test'
import { jennabotProvider } from './jennabot-provider.js'

const projectId = '11111111-1111-4111-8111-111111111111'
const id = '22222222-2222-4222-8222-222222222222'
const pricing = cost => ({ image: [{ model: 'nano-banana-pro', priced: true,
  unit: 'output', creditsForOneOutput: cost }], unpricedModels: [] })
const response = (data, status = 200) => ({ ok: status >= 200 && status < 300, status,
  json: async () => data })

function fixture({ cost = 2, balance = 100, submit = response({ id: 'provider-job-1' }, 201) } = {}) {
  const calls = []
  const fetchImpl = async (url, options) => {
    calls.push({ url, options })
    if (url.endsWith('/api/generation/pricing')) return response(pricing(cost))
    if (url.endsWith('/api/credits/balance')) return response({ balance })
    if (url.includes('/api/jobs?')) return response({ items: [{ id: 'previous-job', projectId,
      createdAt: '2026-10-26T00:00:00Z' }], page: 1, limit: 100, total: 1, totalPages: 1 })
    if (url.endsWith(`/api/projects/${projectId}`)) return response({ id: projectId })
    if (url.endsWith(`/api/projects/${projectId}/images`)) return submit
    if (url.endsWith('/api/jobs/provider-job-1')) return response({ id: 'provider-job-1',
      status: 'completed', result: { media: [{ mediaId: 'media-1', url: 'https://asset.example/a' }] } })
    if (url.endsWith('/api/jobs/provider-job-1/sync')) return response({ id: 'provider-job-1', status: 'processing' })
    if (url.includes('/api/assets/resolve?')) return response({ mediaGenerationId: 'media-1', url: 'https://asset.example/a' })
    throw new Error('unexpected endpoint')
  }
  const delays = []
  const provider = jennabotProvider({ apiKey: 'fixture-key', projectId, fetchImpl,
    sleep: async ms => { delays.push(ms) } })
  return { provider, calls, delays }
}

test('REST submit checks current price/balance then sends one count=1 credit request', async () => {
  const { provider, calls, delays } = fixture()
  assert.equal(provider.ready, true)
  assert.deepEqual(await provider.submitImage({ prompt: 'Pohon', count: 1 }),
    { kind: 'accepted', providerJobId: 'provider-job-1' })
  assert.deepEqual(delays, [5000, 5000, 5000])
  assert.equal(calls.length, 4)
  assert.deepEqual(JSON.parse(calls[3].options.body),
    { prompt: 'Pohon', model: 'nano-banana-pro', count: 1, useUnlimited: false, aspectRatio: '1:1' })
  assert.equal(calls[3].options.headers['x-api-key'], 'fixture-key')
})

test('price above cap or insufficient balance never sends generate', async () => {
  for (const options of [{ cost: 3 }, { balance: 1 }]) {
    const { provider, calls } = fixture(options)
    assert.deepEqual(await provider.submitImage({ prompt: 'Pohon', count: 1 }),
      { kind: 'rejected', definitive: true, retryable: true, retryAfterSeconds: 3600 })
    assert.equal(calls.some(call => call.options.method === 'POST'), false)
  }
})

test('documented busy response waits; unknown submit response freezes', async () => {
  const busy = fixture({ submit: response({ code: 'GENERATION_SLOT_BUSY' }, 409) })
  assert.deepEqual(await busy.provider.submitImage({ prompt: 'Pohon', count: 1 }),
    { kind: 'rejected', definitive: true, retryable: true, retryAfterSeconds: 60 })
  const unknown = fixture({ submit: response({ code: 'INTERNAL_ERROR' }, 500) })
  assert.deepEqual(await unknown.provider.submitImage({ prompt: 'Pohon', count: 1 }), { kind: 'unknown' })
})

test('status, sync and asset resolution use documented IDs without substituting job ID', async () => {
  const { provider, calls } = fixture()
  assert.deepEqual(await provider.getJobStatus({ providerJobId: 'provider-job-1' }),
    { kind: 'succeeded', definitive: true, assetId: 'media-1' })
  assert.deepEqual(await provider.syncJob({ providerJobId: 'provider-job-1' }), { kind: 'running' })
  assert.deepEqual(await provider.resolveAsset({ mediaGenerationId: 'media-1' }),
    { mediaGenerationId: 'media-1', url: 'https://asset.example/a',
      resolveDiagnostic: { status: 200, code: null, source: 'rest' } })
  assert.equal(calls[1].options.method, 'POST')
  assert.match(calls[2].url, /mediaGenerationId=media-1$/)
})

test('read-only gated preflight checks the REST key account, project and live price', async () => {
  const calls = []
  const delays = []
  const provider = jennabotProvider({ apiKey: 'fixture-key', projectId,
    fetchImpl: async (url, options) => {
      calls.push({ url, options })
      if (url.endsWith('/pricing')) return response(pricing(2))
      if (url.endsWith('/balance')) return response({ userId: id, balance: 100 })
      return response({ id: projectId })
    },
    sleep: async ms => { delays.push(ms) },
  })
  assert.deepEqual(await provider.preflight({ expectedUserId: id }),
    { account_matches: true, project_matches: true, price: 2, balance: 100 })
  assert.equal(calls.every(call => call.options.method === 'GET'), true)
  assert.deepEqual(delays, [5000, 5000])
})

test('Job-first returns only the matching media URL without Asset Resolve', async () => {
  const calls = []
  const delays = []
  const provider = jennabotProvider({ apiKey: 'fixture-key', projectId,
    fetchImpl: async (url, options) => {
      calls.push({ url, options })
      if (url.includes('/api/assets/resolve?')) return response({ code: 'FORBIDDEN_ACTION' }, 403)
      return response({ id: 'provider-job-1', status: 'completed', result: { media: [
        { mediaId: 'other-media', url: 'https://asset.example/other' },
        { mediaId: 'media-1', url: 'https://asset.example/current' },
      ] } })
    },
    sleep: async ms => { delays.push(ms) },
  })
  assert.deepEqual(await provider.resolveAsset({ mediaGenerationId: 'media-1',
    providerJobId: 'provider-job-1' }),
  { url: 'https://asset.example/current', mediaGenerationId: 'media-1',
    resolveDiagnostic: { status: 200, code: null, source: 'job' } })
  assert.deepEqual(delays, [])
  assert.equal(calls.length, 1)
  assert.match(calls[0].url, /\/api\/jobs\/provider-job-1$/)
  assert.equal(calls.every(call => call.options.method === 'GET'), true)
})

test('Job-first invalid or unavailable results fall back once after cooldown', async () => {
  const expired = new Date(Date.now() - 60_000).toISOString()
  const cases = [
    { name: 'different media', job: response({ id: 'provider-job-1', status: 'completed',
      result: { media: [{ mediaId: 'other', url: 'https://asset.example/other' }] } }) },
    { name: 'no URL', job: response({ id: 'provider-job-1', status: 'completed',
      result: { media: [{ mediaId: 'media-1' }] } }) },
    { name: 'processing', job: response({ id: 'provider-job-1', status: 'processing' }) },
    { name: 'expired', job: response({ id: 'provider-job-1', status: 'completed',
      result: { media: [{ mediaId: 'media-1', url: 'https://asset.example/old', expiresAt: expired }] } }) },
    { name: 'unsafe URL', job: response({ id: 'provider-job-1', status: 'completed',
      result: { media: [{ mediaId: 'media-1', url: 'http://asset.example/unsafe' }] } }) },
    { name: '403', job: response({ code: 'FORBIDDEN_ACTION' }, 403) },
    { name: '404', job: response({ code: 'ENTITY_NOT_FOUND' }, 404) },
  ]
  for (const sample of cases) {
    const calls = []
    const delays = []
    const provider = jennabotProvider({ apiKey: 'fixture-key', projectId,
      fetchImpl: async (url, options) => { calls.push({ url, options })
        return url.includes('/api/jobs/') ? sample.job
          : response({ mediaGenerationId: 'media-1', url: 'https://asset.example/resolved' }) },
      sleep: async ms => { delays.push(ms) } })
    assert.deepEqual(await provider.resolveAsset({ mediaGenerationId: 'media-1',
      providerJobId: 'provider-job-1' }),
    { mediaGenerationId: 'media-1', url: 'https://asset.example/resolved',
      resolveDiagnostic: { status: 200, code: null, source: 'rest' } }, sample.name)
    assert.deepEqual(delays, [5000], sample.name)
    assert.equal(calls.length, 2, sample.name)
    assert.match(calls[1].url, /\/api\/assets\/resolve\?/)
  }
})

test('Job-first 429 and transport timeout stop before Asset Resolve', async () => {
  for (const job of [response({ code: 'RATE_LIMIT_EXCEEDED' }, 429),
    new DOMException('timed out', 'TimeoutError')]) {
    const calls = []
    const provider = jennabotProvider({ apiKey: 'fixture-key', projectId,
      fetchImpl: async url => { calls.push(url)
        if (job instanceof Error) throw job
        return job }, sleep: async () => {} })
    if (job instanceof Error) {
      await assert.rejects(provider.resolveAsset({ mediaGenerationId: 'media-1',
        providerJobId: 'provider-job-1' }), { name: 'TimeoutError' })
    } else {
      assert.deepEqual(await provider.resolveAsset({ mediaGenerationId: 'media-1',
        providerJobId: 'provider-job-1' }),
      { providerErrorStatus: 429, resolveDiagnostic: { status: 429,
        code: 'RATE_LIMIT_EXCEEDED', source: 'unavailable' } })
    }
    assert.equal(calls.length, 1)
  }
})

test('submit diagnostics expose stages and model mismatch without prompt or key', async () => {
  const events = []
  const calls = []
  const provider = jennabotProvider({ apiKey: 'fixture-key', projectId,
    fetchImpl: async (url, options) => {
      calls.push({ url, options })
      if (url.endsWith('/pricing')) return response(pricing(2))
      if (url.endsWith('/balance')) return response({ balance: 100 })
      if (url.includes('/api/jobs?')) return response({ items: [], page: 1,
        limit: 100, total: 0, totalPages: 0 })
      return response({ id: 'provider-job-1', model: 'nano-banana-2' }, 201)
    },
    sleep: async () => {},
  })
  assert.deepEqual(await provider.submitImage({ prompt: 'private prompt', count: 1,
    diagnostic: event => events.push(event) }),
  { kind: 'accepted', providerJobId: 'provider-job-1' })
  assert.equal(calls.length, 4)
  assert.equal(events.find(event => event.stage === 'submit_headers')?.http_status, 201)
  assert.equal(events.find(event => event.stage === 'submit_parsed')?.response_model, 'nano-banana-2')
  assert.equal(events.find(event => event.stage === 'submit_accepted')?.requested_model, 'nano-banana-pro')
  assert.equal(JSON.stringify(events).includes('private prompt'), false)
  assert.equal(JSON.stringify(events).includes('fixture-key'), false)
})

test('accepted HTTP status with unreadable JobResponse remains ambiguous', async () => {
  const events = []
  const { provider, calls } = fixture({ submit: new Response('not-json', { status: 201 }) })
  assert.deepEqual(await provider.submitImage({ prompt: 'Pohon', count: 1,
    diagnostic: event => events.push(event) }), { kind: 'unknown' })
  assert.equal(calls.filter(call => call.options.method === 'POST').length, 1)
  assert.equal(events.find(event => event.stage === 'submit_headers')?.http_status, 201)
  assert.equal(events.find(event => event.stage === 'submit_parsed')?.parsed, false)
})

test('Gallery REST lookup uses GET and preserves provider permission result', async () => {
  const calls = []
  const provider = jennabotProvider({ apiKey: 'fixture-key', projectId,
    fetchImpl: async (url, options) => { calls.push({ url, options })
      return response({ code: 'FORBIDDEN_ACTION' }, 403) }, sleep: async () => {} })
  assert.deepEqual(await provider.getGalleryItem({ galleryItemId: id }),
    { kind: 'unavailable', status: 403, code: 'FORBIDDEN_ACTION' })
  assert.match(calls[0].url, /\/api\/gallery\//)
  assert.equal(calls[0].options.method, 'GET')
  assert.equal(calls.length, 1)
})

test('REST job list uses project filter and no submit', async () => {
  const calls = []
  const provider = jennabotProvider({ apiKey: 'fixture-key', projectId,
    fetchImpl: async (url, options) => { calls.push({ url, options })
      return response({ items: [{ id: 'job-1', projectId }], page: 1,
        limit: 100, total: 1, totalPages: 1 }) }, sleep: async () => {} })
  const result = await provider.listJobs({ page: 1, limit: 100 })
  assert.equal(result.kind, 'listed')
  assert.match(calls[0].url, new RegExp(`projectId=${projectId}`))
  assert.equal(calls[0].options.method, 'GET')
  assert.equal(calls.length, 1)
})

test('asset 403 may use owned Gallery item only when media handle matches', async () => {
  const calls = []
  const provider = jennabotProvider({ apiKey: 'fixture-key', projectId,
    fetchImpl: async (url, options) => { calls.push({ url, options })
      if (url.includes('/api/assets/resolve?')) return response({ code: 'FORBIDDEN_ACTION' }, 403)
      return response({ id, type: 'image', mediaGenerationId: 'media-1',
        gcsUrl: 'https://asset.example/gallery', expiresAt: '2027-10-27T00:00:00Z' })
    }, sleep: async () => {} })
  assert.deepEqual(await provider.resolveAsset({ mediaGenerationId: 'media-1', galleryItemId: id }),
    { url: 'https://asset.example/gallery', mediaGenerationId: 'media-1',
      expiresAt: '2027-10-27T00:00:00Z',
      resolveDiagnostic: { status: 403, code: 'FORBIDDEN_ACTION', source: 'gallery_fallback' } })
  assert.equal(calls.every(call => call.options.method === 'GET'), true)
  assert.deepEqual(await provider.resolveAsset({ mediaGenerationId: 'other', galleryItemId: id }),
    { providerErrorStatus: 403,
      resolveDiagnostic: { status: 403, code: 'FORBIDDEN_ACTION', source: 'unavailable' } })
})

test('asset 403 finds exact media in Gallery even without stored Gallery item ID', async () => {
  const calls = []
  const provider = jennabotProvider({ apiKey: 'fixture-key', projectId,
    fetchImpl: async (url, options) => { calls.push({ url, options })
      if (url.includes('/api/assets/resolve?')) return response({ code: 'FORBIDDEN_ACTION' }, 403)
      return response({ items: [{ id: 'gallery-other', type: 'image', mediaGenerationId: 'other',
        gcsUrl: 'https://asset.example/other' },
      { id: 'gallery-match', type: 'image', mediaGenerationId: 'media-1',
        gcsUrl: 'https://asset.example/matched' }], total: 2, page: 1, totalPages: 1 })
    }, sleep: async () => {} })
  assert.deepEqual(await provider.resolveAsset({ mediaGenerationId: 'media-1' }),
    { url: 'https://asset.example/matched', mediaGenerationId: 'media-1',
      resolveDiagnostic: { status: 403, code: 'FORBIDDEN_ACTION', source: 'gallery_fallback' } })
  assert.equal(calls.length, 2)
  assert.match(calls[1].url, /\/api\/gallery\?page=1&limit=100$/)
})

function recoveryFixture({ after, submit, baselineStatus = 200, postTimeoutMs = 20 } = {}) {
  const calls = []
  let lists = 0
  const old = { id: 'previous-job', projectId, createdAt: '2026-10-26T00:00:00Z' }
  const provider = jennabotProvider({ apiKey: 'fixture-key', projectId, postTimeoutMs,
    fetchImpl: async (url, options) => {
      calls.push({ url, options })
      if (url.endsWith('/pricing')) return response(pricing(2))
      if (url.endsWith('/balance')) return response({ balance: 100 })
      if (url.includes('/api/jobs?')) {
        lists++
        if (lists === 1 && baselineStatus !== 200) return response({ code: 'FORBIDDEN_ACTION' }, baselineStatus)
        const items = lists === 1 ? [old] : [...(after?.() ?? []), old]
        return response({ items, page: 1, limit: 100, total: items.length, totalPages: 1 })
      }
      if (url.endsWith('/images')) return submit?.(options) ?? response({ id: 'provider-job-1' }, 201)
      throw new Error('unexpected endpoint')
    }, sleep: async () => {} })
  return { provider, calls }
}

const candidate = (overrides = {}) => ({ id: 'recovered-job', projectId,
  prompt: 'Pohon', model: 'nano-banana-pro', status: 'processing',
  creditsDeducted: 2, createdAt: new Date().toISOString(), ...overrides })

test('slow successful JobResponse stores its real provider ID without a second POST', async () => {
  const { provider, calls } = recoveryFixture({ postTimeoutMs: 100,
    submit: async () => { await new Promise(resolve => setTimeout(resolve, 10))
      return response({ id: 'late-job' }, 201) } })
  assert.deepEqual(await provider.submitImage({ prompt: 'Pohon', count: 1 }),
    { kind: 'accepted', providerJobId: 'late-job' })
  assert.equal(calls.filter(call => call.options.method === 'POST').length, 1)
})

test('timed-out POST recovers exactly one new REST job with matching metadata', async () => {
  const { provider, calls } = recoveryFixture({ after: () => [candidate()],
    submit: options => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
    }), postTimeoutMs: 5 })
  assert.deepEqual(await provider.submitImage({ prompt: 'Pohon', count: 1 }),
    { kind: 'accepted', providerJobId: 'recovered-job', recoveredFromList: true })
  assert.equal(calls.filter(call => call.options.method === 'POST').length, 1)
  assert.equal(calls.filter(call => call.url.includes('/api/jobs?')).length, 2)
})

test('ambiguous POST stays unknown with no candidate or two new jobs', async () => {
  for (const after of [() => [], () => [candidate({ id: 'new-a' }), candidate({ id: 'new-b' })]]) {
    const { provider, calls } = recoveryFixture({ after,
      submit: () => response({ code: 'INTERNAL_ERROR' }, 500) })
    assert.deepEqual(await provider.submitImage({ prompt: 'Pohon', count: 1 }), { kind: 'unknown' })
    assert.equal(calls.filter(call => call.options.method === 'POST').length, 1)
  }
})

test('model mismatch and missing pre-submit baseline never auto-bind', async () => {
  const mismatch = recoveryFixture({ after: () => [candidate({ model: 'nano-banana-2' })],
    submit: () => new Response('unreadable', { status: 201 }) })
  assert.deepEqual(await mismatch.provider.submitImage({ prompt: 'Pohon', count: 1 }),
    { kind: 'unknown' })
  const unavailable = recoveryFixture({ baselineStatus: 403 })
  assert.deepEqual(await unavailable.provider.submitImage({ prompt: 'Pohon', count: 1 }),
    { kind: 'rejected', definitive: true, retryable: true, retryAfterSeconds: 60 })
  assert.equal(unavailable.calls.some(call => call.options.method === 'POST'), false)
})
