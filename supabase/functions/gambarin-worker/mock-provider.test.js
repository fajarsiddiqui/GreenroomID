import assert from 'node:assert/strict'
import test from 'node:test'
import { mockProvider } from './mock-provider.js'

test('mock provider returns consistent simulated job and asset identities', async () => {
  const provider = mockProvider()
  const submitted = await provider.submitImage({ prompt: 'test' })
  assert.equal(provider.ready, true)
  assert.match(submitted.providerJobId, /^mock-job-/)
  const result = await provider.getJobStatus({ providerJobId: submitted.providerJobId })
  assert.deepEqual(result, {
    kind: 'succeeded', definitive: true,
    assetId: submitted.providerJobId.replace(/^mock-job-/, 'mock-asset-'),
  })
  assert.deepEqual(await provider.getJobStatus({ providerJobId: 'other-provider-id' }), { kind: 'unresolved' })
})
