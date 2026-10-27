// Job 2.3 defines the adapter contract; provider dispatch remains disabled.
// A future adapter must emit rejected with definitive:true,retryable:true ONLY
// when non-acceptance and safe retry are both proven (for example a busy slot).
// Permanent/uncertain responses must freeze for manual reconciliation.
export function disabledProvider() {
  const unavailable = async () => { throw new Error('provider_not_configured') }
  return {
    ready: false,
    submitImage: unavailable,
    getJobStatus: unavailable,
    syncJob: unavailable,
    resolveAsset: unavailable,
  }
}

const usableHandle = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 200

// Live Jennabot JobResponse exposes result.media[].mediaId. The same value is
// Gallery mediaGenerationId, which /api/assets/resolve accepts. Never derive
// the media handle from the provider job ID.
export function normalizeJobStatus(raw, expectedJobId) {
  if (!raw || typeof raw !== 'object' || raw.id !== expectedJobId) return { kind: 'unresolved' }
  if (raw.status === 'pending' || raw.status === 'processing') return { kind: 'running' }
  if (raw.status === 'failed' || raw.status === 'cancelled') {
    return { kind: 'failed', definitive: true, cancelled: raw.status === 'cancelled' }
  }
  if (raw.status !== 'completed') return { kind: 'unresolved' }
  const media = Array.isArray(raw.result?.media) ? raw.result.media : []
  const withHandle = media.find(item => usableHandle(item?.mediaGenerationId) || usableHandle(item?.mediaId))
  return { kind: 'succeeded', definitive: true,
    assetId: withHandle?.mediaGenerationId ?? withHandle?.mediaId ?? null }
}

// A resolve response is useful only for the exact handle in our own job row.
// URLs are temporary capabilities. Do not persist them or infer a fixed TTL.
export function normalizeAssetResolution(raw, expectedHandle) {
  if (!usableHandle(expectedHandle) || raw?.mediaGenerationId !== expectedHandle
    || typeof raw.url !== 'string') return null
  let url
  try { url = new URL(raw.url) } catch { return null }
  if (url.protocol !== 'https:' || url.username || url.password) return null
  const expiry = typeof raw.expiresAt === 'string' && Number.isFinite(Date.parse(raw.expiresAt))
    && Date.parse(raw.expiresAt) > Date.now() ? raw.expiresAt : null
  return { url: url.toString(), expires_at: expiry, temporary: true }
}
