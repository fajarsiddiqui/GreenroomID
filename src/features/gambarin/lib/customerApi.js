import { getGambarinSupabaseClient } from './supabaseClient'
import { clearGambarinThumbnailCache, loadCachedThumbnail } from './thumbnailCache'
import { fetchJobPage } from './jobPagination'
import { getGambarinImageNumber } from './downloadNaming'

function clientOrNull() {
  return getGambarinSupabaseClient()
}

export function gambarinAuthClient() {
  return clientOrNull()
}

const customerErrors = {
  invalid_credentials: 'Username atau password salah.',
  account_inactive: 'Akun Gambarin tidak aktif.',
  account_expired: 'Masa aktif akun Gambarin berakhir.',
  too_many_attempts: 'Terlalu banyak percobaan. Coba lagi dalam 15 menit.',
  quota_unavailable: 'Sisa kuota gambar tidak mencukupi.',
  queue_full: 'Antrean penuh. Coba lagi nanti.',
  idempotency_conflict: 'Permintaan berubah saat pengiriman ulang.',
  unauthorized: 'Sesi berakhir. Silakan masuk kembali.',
  server_configuration_error: 'Layanan Gambarin belum dikonfigurasi.',
  login_unavailable: 'Login belum tersedia. Coba lagi nanti.',
  enqueue_unavailable: 'Pengiriman belum dapat dipastikan. Coba ulang dengan prompt yang sama.',
}

async function callCustomerFunction(name, payload, token) {
  const url = String(import.meta.env.VITE_GAMBARIN_SUPABASE_URL || '').trim()
  const key = String(import.meta.env.VITE_GAMBARIN_SUPABASE_PUBLISHABLE_KEY || '').trim()
  if (!clientOrNull() || !url || !key) throw new Error(customerErrors.server_configuration_error)
  let response
  try {
    response = await fetch(new URL(`/functions/v1/${name}`, url), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json', apikey: key,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
    })
  } catch {
    throw new Error(name === 'gambarin-customer-login'
      ? 'Jaringan terputus. Coba login kembali.'
      : 'Jaringan terputus. Coba lagi dengan prompt yang sama.')
  }
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(customerErrors[body.error] || 'Layanan Gambarin belum tersedia.')
  return body
}

export async function loginGambarin(username, password) {
  const result = await callCustomerFunction('gambarin-customer-login', { username, password })
  if (!result.session?.access_token || !result.session?.refresh_token) {
    throw new Error(customerErrors.login_unavailable)
  }
  const client = clientOrNull()
  const { error } = await client.auth.setSession(result.session)
  if (error) throw new Error('Sesi login tidak dapat disimpan. Coba lagi.')
}

export async function enqueueGambarinPrompt(prompt, idempotencyKey) {
  const client = clientOrNull()
  if (!client) throw new Error(customerErrors.server_configuration_error)
  const { data, error } = await client.auth.getSession()
  if (error || !data?.session?.access_token) throw new Error(customerErrors.unauthorized)
  const result = await callCustomerFunction('gambarin-customer-enqueue', {
    prompt, idempotency_key: idempotencyKey,
  }, data.session.access_token)
  if (!result.job_id) throw new Error(customerErrors.enqueue_unavailable)
  return result
}

export async function loadGambarinAccount(client = clientOrNull()) {
  if (!client) return { state: 'unconfigured' }

  // getUser verifies the persisted session against the Gambarin Auth server.
  let authResult
  try { authResult = await client.auth.getUser() }
  catch (cause) {
    throw new Error('Koneksi data akun terputus.', { cause })
  }
  const { data: auth, error: authError } = authResult || {}
  if (authError) {
    if (authError.name === 'AuthSessionMissingError' || authError.code === 'session_not_found'
      || authError.status === 401 || authError.status === 403) return { state: 'signed-out' }
    throw new Error('Data akun belum dapat dimuat.')
  }
  if (!auth?.user) return { state: 'signed-out' }

  let accountResult
  try {
    accountResult = await client.from('gambarin_accounts')
      .select('id,username,status,expires_at,quota_granted,quota_used,quota_reserved')
      .eq('auth_user_id', auth.user.id).maybeSingle()
  } catch (cause) {
    throw new Error('Koneksi data akun terputus.', { cause })
  }
  const { data: account, error } = accountResult || {}

  if (error) throw new Error('Data akun belum dapat dimuat.')
  if (!account) return { state: 'signed-out' }
  return { state: 'authenticated', account }
}

export async function loadGambarinJobs(cursor = null) {
  const client = clientOrNull()
  if (!client) throw new Error('Konfigurasi Gambarin belum tersedia.')
  const page = await fetchJobPage(client, cursor)
  const { items } = page
  if (items.length) {
    let thumbnailResult
    try {
      thumbnailResult = await client.from('gambarin_thumbnails')
        .select('job_id,status,attempts').in('job_id', items.map(item => item.id))
    } catch { throw new Error('Status pratinjau belum dapat dimuat.') }
    const { data: thumbs, error: thumbnailError } = thumbnailResult || {}
    if (thumbnailError) throw new Error('Status pratinjau belum dapat dimuat.')
    const byJob = new Map((thumbs || []).map(row => [row.job_id, row]))
    for (const item of items) {
      const thumbnail = byJob.get(item.id)
      if (thumbnail?.status === 'failed' && !Number.isInteger(thumbnail.attempts)) {
        throw new Error('Status pratinjau belum dapat dimuat.')
      }
      item.thumbnail_status = thumbnail?.status || null
      item.thumbnail_retryable = thumbnail?.status === 'failed'
        ? Number.isInteger(thumbnail.attempts) && thumbnail.attempts < 5 : false
    }
  }
  return page
}

export async function loadGambarinGlobalQueue() {
  const client = clientOrNull()
  if (!client) throw new Error('Konfigurasi Gambarin belum tersedia.')
  let result
  try { result = await client.rpc('gambarin_global_queue_snapshot') }
  catch { throw new Error('Koneksi antrean server terputus.') }
  const { data, error } = result || {}
  if (error?.status === 401 || error?.code === 'PGRST301') {
    throw new Error(customerErrors.unauthorized)
  }
  if (error) throw new Error('Antrean server belum dapat dimuat.')
  if (!data || !Number.isSafeInteger(data.total) || data.total < 0
    || !Number.isSafeInteger(data.active_count) || !Number.isSafeInteger(data.waiting_count)
    || !Number.isSafeInteger(data.reconciliation_count)
    || data.active_count + data.waiting_count + data.reconciliation_count !== data.total
    || (data.own_position !== null && (!Number.isSafeInteger(data.own_position)
      || data.own_position < 1 || data.own_position > data.total))
    || (data.own_position === null ? data.own_status !== null
      : !['queued', 'claimed', 'submitting', 'processing', 'submission_unknown']
        .includes(data.own_status)) || !Number.isFinite(Date.parse(data.snapshot_at))) {
    throw new Error('Respons antrean server tidak valid.')
  }
  return data
}

export async function loadGambarinThumbnail(accountId, jobId) {
  const client = clientOrNull()
  if (!client) throw new Error(customerErrors.server_configuration_error)
  return loadCachedThumbnail(accountId, jobId, async () => {
    const state = await loadGambarinAccount()
    return state.state === 'authenticated' && state.account.id === accountId
  }, async () => {
    const { data, error } = await client.auth.getSession()
    if (error || !data?.session?.access_token) throw new Error(customerErrors.unauthorized)
    const url = String(import.meta.env.VITE_GAMBARIN_SUPABASE_URL || '').trim()
    const key = String(import.meta.env.VITE_GAMBARIN_SUPABASE_PUBLISHABLE_KEY || '').trim()
    const response = await fetch(new URL('/functions/v1/gambarin-customer-thumbnail', url), {
      method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json', apikey: key,
        Authorization: `Bearer ${data.session.access_token}` }, body: JSON.stringify({ job_id: jobId }),
    })
    if (!response.ok) throw new Error('Thumbnail belum tersedia.')
    return response.blob()
  })
}

export async function loadGambarinJobStatus(jobId) {
  const client = clientOrNull()
  if (!client) throw new Error('Konfigurasi Gambarin belum tersedia.')
  let result
  try { result = await client.rpc('gambarin_my_job_status', { p_job_id: jobId }) }
  catch { throw new Error('Koneksi status pekerjaan terputus.') }
  const { data, error } = result || {}
  if (error?.status === 401 || error?.code === 'PGRST301') {
    throw new Error(customerErrors.unauthorized)
  }
  if (error?.code === '42501' || error?.status === 403) {
    throw new Error('Akses status pekerjaan ditolak.')
  }
  if (error) throw new Error('Status pekerjaan belum dapat dimuat.')
  return data
}

export async function loadGambarinMockAsset(jobId, signal) {
  const client = clientOrNull()
  if (!client) throw new Error(customerErrors.server_configuration_error)
  const { data, error } = await client.auth.getSession()
  if (error || !data?.session?.access_token) throw new Error(customerErrors.unauthorized)
  const url = String(import.meta.env.VITE_GAMBARIN_SUPABASE_URL || '').trim()
  const key = String(import.meta.env.VITE_GAMBARIN_SUPABASE_PUBLISHABLE_KEY || '').trim()
  const response = await fetch(new URL('/functions/v1/gambarin-customer-mock-asset', url), {
    method: 'POST', signal, cache: 'no-store',
    headers: { 'Content-Type': 'application/json', apikey: key,
      Authorization: `Bearer ${data.session.access_token}` },
    body: JSON.stringify({ job_id: jobId }),
  })
  if (!response.ok) throw new Error('Hasil simulasi belum dapat dimuat.')
  const blob = await response.blob()
  if (blob.type.split(';')[0] !== 'image/svg+xml') throw new Error('Format hasil simulasi tidak valid.')
  return URL.createObjectURL(blob)
}

export async function loadGambarinRealAsset(jobId, signal) {
  const client = clientOrNull()
  if (!client) throw new Error(customerErrors.server_configuration_error)
  const { data, error } = await client.auth.getSession()
  if (error || !data?.session?.access_token) throw new Error(customerErrors.unauthorized)
  const url = String(import.meta.env.VITE_GAMBARIN_SUPABASE_URL || '').trim()
  const key = String(import.meta.env.VITE_GAMBARIN_SUPABASE_PUBLISHABLE_KEY || '').trim()
  const response = await fetch(new URL('/functions/v1/gambarin-customer-asset', url), {
    method: 'POST', signal, cache: 'no-store',
    headers: { 'Content-Type': 'application/json', apikey: key,
      Authorization: `Bearer ${data.session.access_token}` },
    body: JSON.stringify({ job_id: jobId }),
  })
  if (!response.ok) throw new Error('Hasil belum tersedia.')
  const result = await response.json()
  const asset = new URL(result.asset?.url)
  if (asset.protocol !== 'https:' || asset.username || asset.password) throw new Error('URL hasil tidak valid.')
  return asset.toString()
}

export async function downloadGambarinOriginal(jobId, displayedUrl) {
  const client = clientOrNull()
  if (!client) throw new Error(customerErrors.server_configuration_error)
  const { data, error } = await client.auth.getSession()
  if (error || !data?.session?.access_token) throw new Error(customerErrors.unauthorized)
  // Prefer the exact image already shown when the provider CDN permits CORS.
  // The authenticated backend remains the reliable fallback.
  if (displayedUrl) {
    try {
      const asset = new URL(displayedUrl)
      if (asset.protocol === 'https:' && !asset.username && !asset.password) {
        const direct = await fetch(asset, { cache: 'no-store' })
        const length = Number(direct.headers.get('Content-Length'))
        if (direct.ok && length <= 25 * 1024 * 1024) {
          const blob = await direct.blob()
          if (['image/jpeg', 'image/png', 'image/webp'].includes(blob.type)
            && blob.size > 0 && blob.size <= 25 * 1024 * 1024) return blob
        }
      }
    } catch { /* CDN may not allow browser CORS; use the owner-only endpoint. */ }
  }
  const url = String(import.meta.env.VITE_GAMBARIN_SUPABASE_URL || '').trim()
  const key = String(import.meta.env.VITE_GAMBARIN_SUPABASE_PUBLISHABLE_KEY || '').trim()
  const response = await fetch(new URL('/functions/v1/gambarin-customer-asset', url), {
    method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json', apikey: key,
      Authorization: `Bearer ${data.session.access_token}` },
    body: JSON.stringify({ job_id: jobId, download: true }),
  })
  if (!response.ok) throw new Error('Gambar asli tidak dapat diunduh.')
  const blob = await response.blob()
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(blob.type) || !blob.size) {
    throw new Error('Format gambar asli tidak valid.')
  }
  return blob
}

export async function loadGambarinImageNumber(jobId) {
  const client = clientOrNull()
  if (!client) throw new Error(customerErrors.server_configuration_error)
  return getGambarinImageNumber(client, jobId)
}

export async function signOutGambarin() {
  const client = clientOrNull()
  await clearGambarinThumbnailCache()
  if (client) await client.auth.signOut()
}

export const gambarinCapabilities = Object.freeze({ login: true, generate: true, asset: false })
