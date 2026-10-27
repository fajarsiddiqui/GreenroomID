// Backend-only test adapter. Never calls Jennabot or any external provider.
const mockJob = /^mock-job-([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i

export function mockProvider() {
  return {
    ready: true,
    async submitImage() {
      return { kind: 'accepted', providerJobId: `mock-job-${crypto.randomUUID()}` }
    },
    async getJobStatus({ providerJobId }) {
      const match = typeof providerJobId === 'string' && providerJobId.match(mockJob)
      return match
        ? { kind: 'succeeded', definitive: true, assetId: `mock-asset-${match[1]}` }
        : { kind: 'unresolved' }
    },
    async syncJob() { return { kind: 'unresolved' } },
    async resolveAsset() { return null },
  }
}
