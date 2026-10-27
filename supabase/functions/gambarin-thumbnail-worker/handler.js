const authOptions = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
const bucket = 'gambarin-thumbnails'
const maxOriginalBytes = 8 * 1024 * 1024

async function sameSecret(a, b) {
  const encoder = new TextEncoder()
  const [left, right] = await Promise.all([a, b].map(async value =>
    new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)))))
  let mismatch = 0
  for (let i = 0; i < left.length; i++) mismatch |= left[i] ^ right[i]
  return mismatch === 0
}

function serviceJwt(value) {
  try {
    const part = value.split('.')[1]
    if (!part || !/^[A-Za-z0-9_-]+$/.test(part)) return false
    const claims = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')
      .padEnd(Math.ceil(part.length / 4) * 4, '=')))
    return claims.role === 'service_role'
  } catch { return false }
}

async function boundedImage(response) {
  if (response.status === 404 || response.status === 410) throw new Error('source_not_found')
  if (!response.ok) throw new Error('source_http_error')
  if (!/^image\/(jpeg|png|webp)(;|$)/i.test(response.headers.get('Content-Type') || '')) {
    throw new Error('source_format_unavailable')
  }
  if (Number(response.headers.get('Content-Length')) > maxOriginalBytes) throw new Error('original_too_large')
  const reader = response.body?.getReader()
  if (!reader) throw new Error('source_empty')
  const chunks = []
  let length = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > maxOriginalBytes) throw new Error('original_too_large')
      chunks.push(value)
    }
  } finally { await reader.cancel().catch(() => {}) }
  const bytes = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
  return bytes
}

export function createHandler({ createClient, env, fetchImpl, convert, diagnostic = () => {} }) {
  return async function handle(request) {
    const reply = (body, status = 200) => Response.json(body, { status,
      headers: { 'Cache-Control': 'no-store' } })
    const path = new URL(request.url).pathname
    if (!['/gambarin-thumbnail-worker', '/functions/v1/gambarin-thumbnail-worker'].includes(path)) {
      return reply({ error: 'not_found' }, 404)
    }
    if (request.method !== 'POST') return reply({ error: 'method_not_allowed' }, 405)
    if (request.headers.has('Origin')) return reply({ error: 'forbidden' }, 403)
    const token = request.headers.get('Authorization')?.match(/^Bearer (\S+)$/i)?.[1]
    if (!token) return reply({ error: 'unauthorized' }, 401)
    const url = env('SUPABASE_URL')?.trim()
    const key = env('SUPABASE_SERVICE_ROLE_KEY')?.trim()
    const trigger = env('GAMBARIN_WORKER_TRIGGER_KEY')?.trim()
    if (!url || !key || !trigger) return reply({ error: 'server_configuration_error' }, 503)
    if (!serviceJwt(token) || !await sameSecret(token, trigger)) return reply({ error: 'forbidden' }, 403)

    const db = createClient(url, key, { auth: authOptions })
    let claimed
    try { claimed = await db.rpc('gambarin_thumbnail_claim') }
    catch { return reply({ error: 'claim_unavailable' }, 503) }
    const { data: task, error: claimError } = claimed || {}
    if (!claimed || claimError) return reply({ error: 'claim_unavailable' }, 503)
    if (!task) return reply({ state: 'idle' })
    const started = Date.now()
    let errorCode = 'thumbnail_unavailable'
    try {
      // An already uploaded object can be finalized after a DB write failure
      // without calling Jennabot again.
      const existing = await db.storage.from(bucket).download(task.storage_path)
      let image
      if (!existing.error && existing.data) {
        image = await convert(new Uint8Array(await existing.data.arrayBuffer()))
      } else {
        let resolved
        try {
          resolved = await fetchImpl(new URL('/functions/v1/gambarin-worker/resolve', url), {
            method: 'POST', headers: { 'Content-Type': 'application/json', apikey: key,
              Authorization: `Bearer ${trigger}` }, body: JSON.stringify({ job_id: task.job_id }),
            signal: AbortSignal.timeout(45000),
          })
        } catch (error) {
          throw new Error(error?.name === 'TimeoutError' || error?.name === 'AbortError'
            ? 'resolve_timeout' : 'resolve_transport_error', { cause: error })
        }
        const body = await resolved.json().catch(() => ({}))
        if (!resolved.ok || !body.asset?.url) {
          const state = typeof body.state === 'string' && /^[a-z_]{1,40}$/.test(body.state)
            ? body.state : null
          const provider = body.resolve_diagnostic
          diagnostic({ stage: 'resolve_failed', job_id: task.job_id, http_status: resolved.status,
            worker_state: state,
            provider_status: Number.isInteger(provider?.status) ? provider.status : null,
            provider_code: typeof provider?.code === 'string' && /^[A-Z_]{1,40}$/.test(provider.code)
              ? provider.code : null,
            provider_source: ['rest', 'gallery_fallback', 'job_fallback', 'unavailable']
              .includes(provider?.source) ? provider.source : null })
          if (['waiting', 'busy', 'request_in_flight'].includes(state)) throw new Error('resolve_waiting')
          if (state === 'recovery_required') throw new Error('resolve_recovery_required')
          if (resolved.status === 409 && body.error === 'asset_unresolved') {
            throw new Error('resolve_unavailable')
          }
          if (resolved.status === 409 && body.error === 'asset_not_ready') {
            throw new Error('resolve_not_ready')
          }
          throw new Error('resolve_http_error')
        }
        let assetUrl
        try { assetUrl = new URL(body.asset.url) }
        catch { throw new Error('invalid_original_url') }
        if (assetUrl.protocol !== 'https:' || assetUrl.username || assetUrl.password) {
          throw new Error('invalid_original_url')
        }
        let source
        try {
          source = await fetchImpl(assetUrl, { redirect: 'error',
            signal: AbortSignal.timeout(45000) })
        } catch (error) {
          throw new Error(error?.name === 'TimeoutError' || error?.name === 'AbortError'
            ? 'source_timeout' : 'source_transport_error', { cause: error })
        }
        if (!source.ok) diagnostic({ stage: 'source_failed', job_id: task.job_id,
          http_status: source.status })
        image = await convert(await boundedImage(source))
      }
      if (!image || !(image.bytes instanceof Uint8Array) || image.bytes.length > 1048576
        || !Number.isInteger(image.width) || !Number.isInteger(image.height)
        || image.width > 480 || image.height > 480) throw new Error('invalid_thumbnail')
      const { data: withinBudget, error: budgetError } = await db.rpc('gambarin_thumbnail_budget', {
        p_new_bytes: image.bytes.length,
      })
      if (budgetError) throw new Error('budget_unavailable')
      if (!withinBudget) throw new Error('budget_limit')
      if (existing.error || !existing.data) {
        const upload = await db.storage.from(bucket).upload(task.storage_path, image.bytes, {
          contentType: 'image/webp', cacheControl: '3600', upsert: false,
        })
        if (upload.error) throw new Error('storage_unavailable')
      }
      const elapsed = Date.now() - started
      const { error: finishError } = await db.rpc('gambarin_thumbnail_finish', {
        p_job_id: task.job_id, p_attempt: task.attempt, p_ready: true,
        p_bytes: image.bytes.length, p_width: image.width, p_height: image.height,
        p_processed_ms: elapsed,
      })
      if (finishError) throw new Error('finish_unavailable')
      diagnostic({ stage: 'ready', job_id: task.job_id, bytes: image.bytes.length,
        width: image.width, height: image.height, duration_ms: elapsed })
      return reply({ state: 'ready', job_id: task.job_id })
    } catch (error) {
      errorCode = /^[a-z][a-z0-9_]{0,59}$/.test(error?.message || '') ? error.message : errorCode
      const elapsed = Date.now() - started
      diagnostic({ stage: 'failed', job_id: task.job_id, code: errorCode, duration_ms: elapsed })
      let finished
      try {
        finished = await db.rpc('gambarin_thumbnail_finish', { p_job_id: task.job_id,
          p_attempt: task.attempt, p_ready: false, p_error_code: errorCode,
          p_processed_ms: elapsed,
          p_permanent: ['budget_limit', 'original_too_large', 'invalid_original_url'].includes(errorCode),
        })
      } catch {
        diagnostic({ stage: 'finish_failed', job_id: task.job_id, code: 'finish_transport_error' })
        return reply({ error: 'finish_unavailable', job_id: task.job_id }, 503)
      }
      if (!finished || finished.error) {
        diagnostic({ stage: 'finish_failed', job_id: task.job_id, code: 'finish_rpc_error' })
        return reply({ error: 'finish_unavailable', job_id: task.job_id }, 503)
      }
      return reply({ state: 'failed', job_id: task.job_id }, 503)
    }
  }
}
