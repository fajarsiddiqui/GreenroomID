import { normalizeAssetResolution } from './provider.js'

const authOptions = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
const maxProviderWaitMs = 45_000 // Below the 60-second database lease; pricing and balance add two guarded waits.
const maxBackgroundSubmitMs = 90_000 // Bounded by the dedicated 120-second submit lease.
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function sameSecret(candidate, expected) {
  const bytes = new TextEncoder()
  const [a, b] = await Promise.all([candidate, expected].map(async (value) =>
    new Uint8Array(await crypto.subtle.digest('SHA-256', bytes.encode(value)))))
  let difference = 0
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i]
  return difference === 0
}

function validId(value) {
  return typeof value === 'string' && value.trim().length >= 1 && value.length <= 200
}

function isServiceRoleJwt(token) {
  const parts = token.split('.')
  if (parts.length !== 3 || !/^[A-Za-z0-9_-]+$/.test(parts[1])) return false
  try {
    const encoded = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const claims = JSON.parse(atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '=')))
    return claims?.role === 'service_role'
  } catch { return false }
}

// A non-cooperative adapter times out with its DB request LEFT OPEN. A later
// tick cannot send another provider request until explicit operator recovery.
async function providerCall(invoke, timeoutMs) {
  const controller = new AbortController()
  let timer
  const operation = Promise.resolve().then(() => invoke(controller.signal))
    .then(value => ({ kind: 'result', value }), () => ({ kind: 'error' }))
  const deadline = new Promise(resolve => {
    timer = setTimeout(() => { controller.abort(); resolve({ kind: 'timeout' }) }, timeoutMs)
  })
  try { return await Promise.race([operation, deadline]) }
  finally { clearTimeout(timer) }
}

export function createHandler({ createClient, env, provider, providerTimeoutMs = maxProviderWaitMs,
  background, diagnostic = () => {}, submitTimeoutMs = maxBackgroundSubmitMs }) {
  return async function handle(request) {
    const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
    const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers })
    const path = new URL(request.url).pathname
    const resolveAsset = path === '/gambarin-worker/resolve' || path === '/functions/v1/gambarin-worker/resolve'
    const preflight = path === '/gambarin-worker/preflight' || path === '/functions/v1/gambarin-worker/preflight'
    const galleryProbe = path === '/gambarin-worker/gallery-probe' || path === '/functions/v1/gambarin-worker/gallery-probe'
    const jobsProbe = path === '/gambarin-worker/jobs-probe' || path === '/functions/v1/gambarin-worker/jobs-probe'
    if (!resolveAsset && !preflight && !galleryProbe && !jobsProbe && path !== '/gambarin-worker' && path !== '/functions/v1/gambarin-worker') return reply({ error: 'not_found' }, 404)
    if (request.method !== 'POST') return reply({ error: 'method_not_allowed' }, 405)
    if (request.headers.has('Origin')) return reply({ error: 'forbidden' }, 403)
    const bearer = request.headers.get('Authorization')?.match(/^Bearer (\S+)$/i)?.[1]
    if (!bearer) return reply({ error: 'unauthorized' }, 401)
    const key = env('SUPABASE_SERVICE_ROLE_KEY')?.trim()
    const triggerKey = env('GAMBARIN_WORKER_TRIGGER_KEY')?.trim()
    const url = env('SUPABASE_URL')?.trim()
    if (!key || !triggerKey || !url) return reply({ error: 'server_configuration_error' }, 503)
    // Platform verify_jwt validates the signature; this exact-match check
    // additionally limits manual triggers to one configured backend JWT.
    if (!isServiceRoleJwt(bearer) || !await sameSecret(bearer, triggerKey)) {
      return reply({ error: 'forbidden' }, 403)
    }

    let requestedJobId
    let expectedUserId
    let galleryItemId
    let jobsPage = 1
    if (resolveAsset) {
      let input
      try { input = await request.json() } catch { return reply({ error: 'invalid_json' }, 400) }
      if (!input || typeof input !== 'object' || Array.isArray(input)
        || Object.keys(input).length !== 1 || !uuidPattern.test(input.job_id)) {
        return reply({ error: 'invalid_job_id' }, 400)
      }
      requestedJobId = input.job_id
    } else if (preflight) {
      let input
      try { input = await request.json() } catch { return reply({ error: 'invalid_json' }, 400) }
      if (!input || typeof input !== 'object' || Array.isArray(input)
        || Object.keys(input).length !== 1 || !uuidPattern.test(input.expected_user_id)) {
        return reply({ error: 'invalid_user_id' }, 400)
      }
      expectedUserId = input.expected_user_id
    } else if (galleryProbe) {
      let input
      try { input = await request.json() } catch { return reply({ error: 'invalid_json' }, 400) }
      if (!input || typeof input !== 'object' || Array.isArray(input)
        || Object.keys(input).length !== 2 || !uuidPattern.test(input.job_id)
        || !uuidPattern.test(input.gallery_item_id)) return reply({ error: 'invalid_input' }, 400)
      requestedJobId = input.job_id
      galleryItemId = input.gallery_item_id
    } else if (jobsProbe) {
      let input
      try { input = await request.json() } catch { return reply({ error: 'invalid_json' }, 400) }
      if (!input || typeof input !== 'object' || Array.isArray(input)
        || Object.keys(input).some(key => !['job_id', 'page'].includes(key))
        || !uuidPattern.test(input.job_id)
        || (input.page !== undefined && (!Number.isInteger(input.page) || input.page < 1 || input.page > 5))) {
        return reply({ error: 'invalid_input' }, 400)
      }
      requestedJobId = input.job_id
      jobsPage = input.page ?? 1
    }

    let db
    try { db = createClient(url, key, { auth: authOptions }) }
    catch { return reply({ error: 'server_configuration_error' }, 503) }
    const rpc = async (name, args) => {
      const { data, error } = await db.rpc(name, args)
      if (error) throw new Error(error.message || 'rpc_failed')
      return data
    }
    if (galleryProbe) {
      // Internal, read-only diagnosis. It cannot claim a job or clear an
      // ambiguous request, and never returns prompt, credential or asset URL.
      if (provider?.ready !== true || typeof provider.getGalleryItem !== 'function') {
        return reply({ error: 'provider_not_configured' }, 503)
      }
      const { data: job, error } = await db.from('gambarin_jobs')
        .select('id,status,prompt,submission_started_at').eq('id', requestedJobId).maybeSingle()
      if (error || !job || job.status !== 'submission_unknown') return reply({ error: 'job_not_eligible' }, 409)
      const observed = await providerCall(signal => provider.getGalleryItem({ galleryItemId, signal }), providerTimeoutMs)
      if (observed.kind !== 'result') return reply({ error: 'gallery_unavailable' }, 503)
      const result = observed.value
      if (result.kind !== 'found') return reply({ error: 'gallery_unavailable',
        http_status: result.status, code: result.code }, 502)
      const item = result.item
      return reply({ job_id: job.id, gallery_item_id: item.id,
        media_generation_id: typeof item.mediaGenerationId === 'string' ? item.mediaGenerationId : null,
        prompt_matches: item.prompt === job.prompt,
        created_at: item.createdAt ?? null,
        submission_started_at: job.submission_started_at,
        model: item.model ?? null, aspect_ratio: item.aspectRatio ?? null,
        expires_at: item.expiresAt ?? null, has_url: typeof item.gcsUrl === 'string' })
    }
    if (jobsProbe) {
      if (provider?.ready !== true || typeof provider.listJobs !== 'function') {
        return reply({ error: 'provider_not_configured' }, 503)
      }
      const { data: job, error } = await db.from('gambarin_jobs')
        .select('id,status,prompt,submission_started_at').eq('id', requestedJobId).maybeSingle()
      if (error || !job || job.status !== 'submission_unknown') return reply({ error: 'job_not_eligible' }, 409)
      const observed = await providerCall(signal => provider.listJobs({ page: jobsPage, limit: 100, signal }), providerTimeoutMs)
      if (observed.kind !== 'result') return reply({ error: 'jobs_unavailable' }, 503)
      const result = observed.value
      if (result.kind !== 'listed') return reply({ error: 'jobs_unavailable',
        http_status: result.status, code: result.code }, 502)
      return reply({ job_id: job.id, page: result.page, total_pages: result.totalPages,
        total: result.total, items: result.items.map(item => ({
          id: item.id, project_id: item.projectId, status: item.status,
          created_at: item.createdAt, model: item.model,
          prompt_matches: item.prompt === job.prompt,
          credits_deducted: item.creditsDeducted,
          server_job_id_present: typeof item.serverJobId === 'string',
          media_ids: Array.isArray(item.result?.media) ? item.result.media.map(media =>
            media?.mediaGenerationId ?? media?.mediaId ?? null).filter(Boolean) : [],
        })) })
    }
    const workerId = crypto.randomUUID() // One unique identity per tick, never shared in memory.
    let leaseId
    let requestOpen = false
    try {
      const acquired = await rpc(resolveAsset ? 'gambarin_acquire_asset_dispatcher' : 'gambarin_acquire_dispatcher', { p_worker_id: workerId })
      if (acquired?.state !== 'acquired') return reply({ state: acquired?.state || 'unavailable' })
      leaseId = acquired.lease_id
      if (!leaseId) return reply({ error: 'worker_unavailable' }, 503)
      if (provider?.ready !== true) return reply({ state: 'provider_not_configured' }, 503)

      if (preflight) {
        if (typeof provider.preflight !== 'function') return reply({ state: 'preflight_unavailable' }, 503)
        const gate = await rpc('gambarin_begin_provider_request', {
          p_worker_id: workerId, p_lease_id: leaseId, p_purpose: 'metadata', p_job_id: null,
        })
        requestOpen = true
        const observed = await providerCall(signal => provider.preflight({ expectedUserId, signal }), providerTimeoutMs)
        if (observed.kind === 'timeout') return reply({ state: 'recovery_required' }, 503)
        await rpc('gambarin_finish_provider_request', {
          p_worker_id: workerId, p_lease_id: leaseId, p_request_id: gate.request_id,
          p_outcome: observed.kind === 'result' ? 'observed' : 'transport_error',
          p_provider_job_id: null, p_retry_after_seconds: 10,
        })
        requestOpen = false
        return observed.kind === 'result' ? reply({ state: 'checked', ...observed.value })
          : reply({ error: 'preflight_unavailable' }, 503)
      }

      if (resolveAsset) {
        const { data: assetJob, error: assetError } = await db.from('gambarin_jobs')
          .select('id,status,provider_job_id,provider_asset_id,gallery_item_id').eq('id', requestedJobId).maybeSingle()
        if (assetError || !assetJob || assetJob.status !== 'succeeded' || !validId(assetJob.provider_asset_id)) {
          return reply({ error: 'asset_not_ready' }, 409)
        }
        let gate
        try {
          gate = await rpc('gambarin_begin_asset_request', {
            p_worker_id: workerId, p_lease_id: leaseId, p_purpose: 'resolve', p_job_id: assetJob.id,
          })
        } catch (error) {
          if (['global_cooldown', 'dispatch_paused', 'stale_lease', 'request_not_finished'].includes(error.message)) {
            return reply({ state: 'waiting' })
          }
          throw error
        }
        requestOpen = true
        const observed = await providerCall(signal => provider.resolveAsset({
          mediaGenerationId: assetJob.provider_asset_id,
          providerJobId: assetJob.provider_job_id, galleryItemId: assetJob.gallery_item_id, signal,
        }), providerTimeoutMs)
        if (observed.kind === 'timeout') return reply({ state: 'recovery_required' }, 503)
        const asset = observed.kind === 'result'
          ? normalizeAssetResolution(observed.value, assetJob.provider_asset_id) : null
        // This endpoint requires the exact backend JWT. The customer endpoint
        // forwards only `asset`, never these sanitized provider diagnostics.
        const resolveDiagnostic = observed.kind === 'result'
          ? observed.value?.resolveDiagnostic ?? null : null
        await rpc('gambarin_finish_provider_request', {
          p_worker_id: workerId, p_lease_id: leaseId, p_request_id: gate.request_id,
          p_outcome: observed.kind === 'error' ? 'transport_error' : 'observed',
          p_provider_job_id: null, p_retry_after_seconds: 30,
        })
        requestOpen = false
        return asset ? reply({ job_id: assetJob.id, asset, resolve_diagnostic: resolveDiagnostic })
          : reply({ error: 'asset_unresolved', resolve_diagnostic: resolveDiagnostic }, 409)
      }

      let job
      if (acquired.active_job_id) {
        const { data, error } = await db.from('gambarin_jobs')
          .select('id,status,prompt,provider_job_id,next_poll_at')
          .eq('id', acquired.active_job_id).maybeSingle()
        if (error || !data) throw new Error('active_job_unavailable')
        job = data
      } else {
        job = await rpc('gambarin_claim_next_job', { p_worker_id: workerId, p_lease_id: leaseId })
      }
      if (!job) return reply({ state: 'idle' })
      if (['succeeded', 'failed', 'cancelled'].includes(job.status)) return reply({ state: 'idle' })
      if (job.status === 'submission_unknown') return reply({ state: 'reconciliation_required', job_id: job.id })

      let purpose
      if (job.status === 'claimed') purpose = 'submit'
      else if (job.status === 'processing' && validId(job.provider_job_id)) purpose = 'status'
      else return reply({ state: 'waiting', job_id: job.id })

      let gate
      try {
        gate = await rpc('gambarin_begin_provider_request', {
          p_worker_id: workerId, p_lease_id: leaseId, p_purpose: purpose, p_job_id: job.id,
        })
      } catch (error) {
        if (['global_cooldown', 'poll_backoff', 'dispatch_paused', 'stale_lease', 'request_not_finished'].includes(error.message)) {
          return reply({ state: 'waiting', job_id: job.id })
        }
        throw error
      }
      requestOpen = true
      const emit = (stage, details = {}) => {
        try { diagnostic({ attempt_id: gate.request_id, stage, ...details }) }
        catch { /* Diagnostics must never affect durable request handling. */ }
      }
      const finishSubmit = async observed => {
        if (observed.kind === 'timeout') {
          emit('submit_timeout', { timeout_ms: background ? submitTimeoutMs : providerTimeoutMs })
          // The provider may have accepted the attempt. Leave the gate open.
          return reply({ state: 'recovery_required', job_id: job.id }, 503)
        }
        const result = observed.value
        let outcome = 'unknown'
        let providerJobId = null
        if (observed.kind === 'result' && result?.kind === 'accepted' && validId(result.providerJobId)) {
          outcome = 'accepted'; providerJobId = result.providerJobId
        } else if (observed.kind === 'result' && result?.kind === 'rejected'
          && result.definitive === true && result.retryable === true) {
          outcome = 'rejected'
        }
        emit('submit_result', { outcome, provider_job_id: providerJobId })
        await rpc('gambarin_finish_provider_request', {
          p_worker_id: workerId, p_lease_id: leaseId, p_request_id: gate.request_id,
          p_outcome: outcome, p_provider_job_id: providerJobId,
          p_retry_after_seconds: result?.retryAfterSeconds || 30,
        })
        requestOpen = false
        emit('submit_persisted', { outcome, provider_job_id: providerJobId })
        return reply({ state: outcome === 'accepted' ? 'processing' : outcome === 'rejected' ? 'queued' : 'reconciliation_required', job_id: job.id })
      }
      if (purpose === 'submit' && background) {
        // Respond before pg_net times out, while a single bounded task persists
        // the provider JobResponse. The open DB gate blocks every other send.
        await rpc('gambarin_extend_submit_lease', {
          p_worker_id: workerId, p_lease_id: leaseId, p_request_id: gate.request_id,
        })
        const task = (async () => {
          try {
            const observed = await providerCall(signal => provider.submitImage({
              prompt: job.prompt, count: 1, signal, diagnostic: event => emit(event.stage, event),
            }), submitTimeoutMs)
            await finishSubmit(observed)
          } catch {
            emit('submit_background_error')
            // Unknown DB/transport result stays open for operator recovery.
          } finally {
            if (!requestOpen) {
              try { await rpc('gambarin_release_dispatcher', { p_worker_id: workerId, p_lease_id: leaseId }) }
              catch { emit('submit_release_failed') }
            }
          }
        })()
        background(task)
        return reply({ state: 'submitting', job_id: job.id }, 202)
      }
      const observed = purpose === 'submit'
        ? await providerCall(signal => provider.submitImage({ prompt: job.prompt, count: 1, signal }), providerTimeoutMs)
        : await providerCall(signal => provider.getJobStatus({ providerJobId: job.provider_job_id, signal }), providerTimeoutMs)
      if (observed.kind === 'timeout') {
        // Transport may still be running. Do not finish or release the DB request.
        return reply({ state: 'recovery_required', job_id: job.id }, 503)
      }

      if (purpose === 'submit') {
        return await finishSubmit(observed)
      }

      const result = observed.value
      const terminal = observed.kind === 'result' && result?.definitive === true
        && (result.kind === 'failed' || (result.kind === 'succeeded' && validId(result.assetId)))
      await rpc('gambarin_finish_provider_request', {
        p_worker_id: workerId, p_lease_id: leaseId, p_request_id: gate.request_id,
        p_outcome: observed.kind === 'error' ? 'transport_error' : 'observed',
        p_provider_job_id: null, p_retry_after_seconds: 30,
      })
      requestOpen = false
      if (observed.kind === 'result' && result?.kind === 'succeeded'
        && result.definitive === true && !validId(result.assetId)) {
        await rpc('gambarin_mark_asset_unresolved', {
          p_job_id: job.id, p_provider_job_id: job.provider_job_id,
        })
      }
      if (terminal) {
        const success = result.kind === 'succeeded'
        await rpc('gambarin_finalize_job', {
          p_job_id: job.id, p_provider_job_id: job.provider_job_id,
          p_status: result.kind,
          p_error_code: success ? null : result.cancelled === true ? 'provider_cancelled' : 'provider_failed',
          p_provider_asset_id: success ? result.assetId : null,
        })
        return reply({ state: result.kind, job_id: job.id })
      }
      return reply({ state: 'processing', job_id: job.id })
    } catch {
      // An unknown DB commit/result must never trigger a second provider send.
      return reply({ error: 'worker_unavailable' }, 503)
    } finally {
      if (leaseId && !requestOpen) {
        try { await rpc(resolveAsset ? 'gambarin_release_asset_dispatcher' : 'gambarin_release_dispatcher', { p_worker_id: workerId, p_lease_id: leaseId }) }
        catch { /* Expired/paused leases are recovered through the database. */ }
      }
    }
  }
}
