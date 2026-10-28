import { normalizeJobStatus, usableAssetUrl } from './provider.js'

const baseUrl = 'https://fire.jennabot.pro'
const maxCredits = 2
const allowedModel = 'nano-banana-pro' // Only image model verified at <= 2 credits on 2026-10-27.
const submitHttpTimeoutMs = 45_000 // Leaves time inside the 90-second worker task for read-only reconciliation.
const wait = (ms, signal) => new Promise((resolve, reject) => {
  if (signal?.aborted) { reject(new Error('aborted')); return }
  const timer = setTimeout(resolve, ms)
  signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new Error('aborted')) }, { once: true })
})

export function jennabotProvider({ apiKey, projectId, fetchImpl = fetch, sleep = wait,
  postTimeoutMs = submitHttpTimeoutMs }) {
  const ready = Boolean(apiKey && /^[0-9a-f-]{36}$/i.test(projectId || ''))
  async function request(path, { method = 'GET', body, signal, diagnostic, stage } = {}) {
    const started = Date.now()
    const emit = (suffix, details = {}) => {
      try { diagnostic?.({ stage: `${stage}_${suffix}`, elapsed_ms: Date.now() - started, ...details }) }
      catch { /* Observability must not affect the provider request. */ }
    }
    if (stage) emit('start')
    let response
    try {
      response = await fetchImpl(`${baseUrl}${path}`, {
        method, signal,
        headers: { 'x-api-key': apiKey, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      })
    } catch (error) {
      if (stage) emit('transport_error', { error_type: error?.name === 'AbortError' ? 'AbortError' : 'TransportError' })
      throw error
    }
    if (stage) emit('headers', { http_status: response.status })
    let data = null
    let parsed = true
    try { data = await response.json() } catch { parsed = false }
    if (stage) {
      const code = typeof data?.code === 'string' && /^[A-Z_]{1,80}$/.test(data.code) ? data.code : null
      const model = typeof data?.model === 'string' && /^[a-z0-9-]{1,40}$/.test(data.model) ? data.model : null
      emit('parsed', { http_status: response.status, code, parsed, response_model: model })
    }
    return { status: response.status, ok: response.ok, data }
  }
  async function listProjectJobs(page, limit, signal) {
    const response = await request(`/api/jobs?projectId=${encodeURIComponent(projectId)}&page=${page}&limit=${limit}`, { signal })
    const code = typeof response.data?.code === 'string' && /^[A-Z_]{1,80}$/.test(response.data.code)
      ? response.data.code : null
    return response.ok && Array.isArray(response.data?.items)
      && Number.isInteger(response.data.page) && Number.isInteger(response.data.totalPages)
      ? { kind: 'listed', ...response.data }
      : { kind: 'unavailable', status: response.status, code }
  }
  return {
    ready,
    async preflight({ expectedUserId, signal }) {
      if (!ready) return { account_matches: false, project_matches: false, price: null, balance: null }
      const price = await request('/api/generation/pricing', { signal })
      await sleep(5000, signal)
      const credits = await request('/api/credits/balance', { signal })
      await sleep(5000, signal)
      const project = await request(`/api/projects/${projectId}`, { signal })
      const model = price.ok && Array.isArray(price.data?.image)
        ? price.data.image.find(item => item.model === allowedModel) : null
      return {
        account_matches: credits.ok && credits.data?.userId === expectedUserId,
        project_matches: project.ok && project.data?.id === projectId,
        price: model?.priced === true && model.unit === 'output'
          && Number.isInteger(model.creditsForOneOutput) ? model.creditsForOneOutput : null,
        balance: credits.ok && Number.isFinite(credits.data?.balance) ? credits.data.balance : null,
      }
    },
    async submitImage({ prompt, count, signal, diagnostic }) {
      if (!ready || count !== 1) return { kind: 'rejected', definitive: true, retryable: false }
      // All provider calls remain inside the worker's persistent DB request
      // gate. Keep >= 5 seconds between provider calls within that gate.
      let pricing
      try { pricing = await request('/api/generation/pricing', { signal, diagnostic, stage: 'pricing' }) }
      catch { return { kind: 'rejected', definitive: true, retryable: true, retryAfterSeconds: 3600 } }
      const model = pricing.ok && Array.isArray(pricing.data?.image)
        ? pricing.data.image.find(item => item.model === allowedModel) : null
      const cost = model?.creditsForOneOutput
      if (!model || model.priced !== true || model.unit !== 'output'
        || !Number.isInteger(cost) || cost < 1 || cost > maxCredits
        || (Array.isArray(pricing.data?.unpricedModels)
          && pricing.data.unpricedModels.some(item => item === allowedModel || item?.model === allowedModel))) {
        return { kind: 'rejected', definitive: true, retryable: true, retryAfterSeconds: 3600 }
      }
      await sleep(5000, signal)
      let balance
      try { balance = await request('/api/credits/balance', { signal, diagnostic, stage: 'balance' }) }
      catch { return { kind: 'rejected', definitive: true, retryable: true, retryAfterSeconds: 3600 } }
      if (!balance.ok || !Number.isFinite(balance.data?.balance)
        || balance.data.balance < cost) {
        return { kind: 'rejected', definitive: true, retryable: true, retryAfterSeconds: 3600 }
      }
      await sleep(5000, signal)
      // Snapshot the newest provider job before the paid POST. If the read-only
      // baseline is unavailable, defer the send instead of losing the ability
      // to identify an ambiguous acceptance safely.
      let baseline
      try { baseline = await listProjectJobs(1, 100, signal) }
      catch { baseline = null }
      if (baseline?.kind !== 'listed' || baseline.page !== 1
        || baseline.items.length > 100 || !Number.isInteger(baseline.total)
        || baseline.total < baseline.items.length
        || baseline.items.some((item, index) => item?.projectId !== projectId
          || typeof item?.id !== 'string' || !item.id
          || !Number.isFinite(Date.parse(item.createdAt))
          || (index > 0 && Date.parse(item.createdAt) > Date.parse(baseline.items[index - 1].createdAt)))) {
        return { kind: 'rejected', definitive: true, retryable: true, retryAfterSeconds: 60 }
      }
      const previousJobId = baseline.items[0]?.id ?? null
      await sleep(5000, signal)
      // useUnlimited=false explicitly selects credit mode; no subscription fallback.
      let submitted
      const postStartedAt = Date.now()
      const postController = new AbortController()
      const abortPost = () => postController.abort()
      if (signal?.aborted) abortPost()
      signal?.addEventListener('abort', abortPost, { once: true })
      const postDeadline = setTimeout(abortPost, postTimeoutMs)
      try { submitted = await request(`/api/projects/${projectId}/images`, {
        method: 'POST', body: { prompt, model: allowedModel, count: 1, useUnlimited: false, aspectRatio: '1:1' },
        signal: postController.signal, diagnostic, stage: 'submit',
      }) } catch { submitted = null }
      finally { clearTimeout(postDeadline); signal?.removeEventListener('abort', abortPost) }
      if (submitted?.ok && typeof submitted.data?.id === 'string' && submitted.data.id.length <= 200) {
        try { diagnostic?.({ stage: 'submit_accepted', provider_job_id: submitted.data.id,
          requested_model: allowedModel, requested_aspect_ratio: '1:1' }) } catch { /* no-op */ }
        return { kind: 'accepted', providerJobId: submitted.data.id }
      }
      const code = submitted?.data?.code
      if ((submitted?.status === 409 && code === 'GENERATION_SLOT_BUSY')
        || (submitted?.status === 429 && ['GENERATION_QUEUE_FULL', 'RATE_LIMIT_EXCEEDED'].includes(code))
        || (submitted?.status === 402 && code === 'INSUFFICIENT_CREDITS')) {
        return { kind: 'rejected', definitive: true, retryable: true,
          retryAfterSeconds: submitted.status === 402 ? 3600 : 60 }
      }
      // No second POST. Compare with the pre-POST marker, not with the latest
      // Gallery image. Incomplete pages, concurrent jobs or metadata mismatch
      // all remain unknown for operator recovery.
      try { await sleep(5000, signal) } catch { return { kind: 'unknown' } }
      const newlySeen = []
      let markerFound = false
      let previousCreatedAt = Infinity
      for (let page = 1; page <= 5 && !markerFound; page++) {
        let listed
        try { listed = await listProjectJobs(page, 100, signal) }
        catch { return { kind: 'unknown' } }
        if (listed.kind !== 'listed' || listed.page !== page
          || !Number.isInteger(listed.total) || listed.totalPages < 1
          || listed.items.length > 100 || listed.items.some(item => item?.projectId !== projectId
            || typeof item?.id !== 'string' || !item.id
            || !Number.isFinite(Date.parse(item.createdAt)))) return { kind: 'unknown' }
        for (const item of listed.items) {
          const createdAt = Date.parse(item.createdAt)
          if (createdAt > previousCreatedAt) return { kind: 'unknown' }
          previousCreatedAt = createdAt
          if (item.id === previousJobId) { markerFound = true; break }
          newlySeen.push(item)
        }
        if (page === listed.totalPages) {
          if (previousJobId === null) markerFound = true
          break
        }
        if (!markerFound) await sleep(5000, signal)
      }
      if (!markerFound || newlySeen.length !== 1) return { kind: 'unknown' }
      const candidate = newlySeen[0]
      const createdAt = Date.parse(candidate.createdAt)
      if (candidate.prompt !== prompt || candidate.model !== allowedModel
        || candidate.creditsDeducted !== cost || createdAt < postStartedAt - 30_000
        || createdAt > Date.now() + 30_000 || typeof candidate.id !== 'string'
        || candidate.id.length > 200
        || (Array.isArray(candidate.result?.media) && candidate.result.media.length > 1)) {
        return { kind: 'unknown' }
      }
      try { diagnostic?.({ stage: 'submit_recovered_from_jobs', provider_job_id: candidate.id,
        project_id: projectId, requested_model: allowedModel }) } catch { /* no-op */ }
      return { kind: 'accepted', providerJobId: candidate.id, recoveredFromList: true }
    },
    async getJobStatus({ providerJobId, signal }) {
      const response = await request(`/api/jobs/${encodeURIComponent(providerJobId)}`, { signal })
      return response.ok ? normalizeJobStatus(response.data, providerJobId) : { kind: 'unresolved' }
    },
    async listJobs({ page = 1, limit = 100, signal }) {
      return listProjectJobs(page, limit, signal)
    },
    async getGalleryItem({ galleryItemId, signal }) {
      const response = await request(`/api/gallery/${encodeURIComponent(galleryItemId)}`, { signal })
      const code = typeof response.data?.code === 'string' && /^[A-Z_]{1,80}$/.test(response.data.code)
        ? response.data.code : null
      return response.ok && response.data?.id === galleryItemId
        ? { kind: 'found', item: response.data, status: response.status }
        : { kind: 'unavailable', status: response.status, code }
    },
    async listGallery({ page = 1, limit = 100, signal }) {
      const response = await request(`/api/gallery?page=${page}&limit=${limit}`, { signal })
      return response.ok && Array.isArray(response.data?.items)
        ? { kind: 'listed', ...response.data }
        : { kind: 'unavailable', status: response.status }
    },
    async syncJob({ providerJobId, signal }) {
      const response = await request(`/api/jobs/${encodeURIComponent(providerJobId)}/sync`, { method: 'POST', signal })
      return response.ok ? normalizeJobStatus(response.data, providerJobId) : { kind: 'unresolved' }
    },
    async resolveAsset({ mediaGenerationId, providerJobId, galleryItemId, signal }) {
      if (providerJobId) {
        const job = await request(`/api/jobs/${encodeURIComponent(providerJobId)}`, { signal })
        const media = job.ok && job.data?.id === providerJobId && job.data?.status === 'completed'
          && Array.isArray(job.data?.result?.media)
          ? job.data.result.media.find(item => item?.mediaId === mediaGenerationId
            || item?.mediaGenerationId === mediaGenerationId) : null
        if (media && usableAssetUrl(media.url, media.expiresAt)) {
          return { url: media.url, mediaGenerationId,
            ...(media.expiresAt ? { expiresAt: media.expiresAt } : {}),
            resolveDiagnostic: { status: job.status, code: null, source: 'job' } }
        }
        if (job.status === 429) return { providerErrorStatus: 429,
          resolveDiagnostic: { status: 429, code: typeof job.data?.code === 'string'
            && /^[A-Z_]{1,80}$/.test(job.data.code) ? job.data.code : null,
          source: 'unavailable' } }
        await sleep(5000, signal)
      }
      const response = await request(`/api/assets/resolve?mediaGenerationId=${encodeURIComponent(mediaGenerationId)}`, { signal })
      const code = typeof response.data?.code === 'string' && /^[A-Z_]{1,80}$/.test(response.data.code)
        ? response.data.code : null
      const diagnostic = { status: response.status, code }
      if (response.ok && response.data?.mediaGenerationId === mediaGenerationId
        && usableAssetUrl(response.data?.url, response.data?.expiresAt)) {
        return { ...response.data, resolveDiagnostic: { ...diagnostic, source: 'rest' } }
      }
      if (response.status === 403) {
        await sleep(5000, signal)
        const gallery = galleryItemId
          ? await this.getGalleryItem({ galleryItemId, signal })
          : await this.listGallery({ page: 1, limit: 100, signal })
        const item = gallery.kind === 'found' ? gallery.item
          : gallery.kind === 'listed' ? gallery.items.find(entry => entry?.mediaGenerationId === mediaGenerationId)
            : null
        if (item?.mediaGenerationId === mediaGenerationId && item?.type === 'image'
          && usableAssetUrl(item.gcsUrl, item.expiresAt)) {
          return { url: item.gcsUrl, mediaGenerationId,
            ...(item.expiresAt ? { expiresAt: item.expiresAt } : {}),
            resolveDiagnostic: { ...diagnostic, source: 'gallery_fallback' } }
        }
      }
      return { providerErrorStatus: response.status,
        resolveDiagnostic: { ...diagnostic, source: 'unavailable' } }
    },
  }
}
