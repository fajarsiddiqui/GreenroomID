import { getGambarinSupabaseClient } from './supabaseClient'

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

export async function loadGambarinAccount() {
  const client = clientOrNull()
  if (!client) return { state: 'unconfigured' }

  // getUser verifies the persisted session against the Gambarin Auth server.
  const { data: auth, error: authError } = await client.auth.getUser()
  if (authError || !auth?.user) return { state: 'signed-out' }

  const { data: account, error } = await client
    .from('gambarin_accounts')
    .select('id,username,status,expires_at,quota_granted,quota_used,quota_reserved')
    .eq('auth_user_id', auth.user.id)
    .maybeSingle()

  if (error) throw new Error('Data akun belum dapat dimuat.')
  if (!account) return { state: 'signed-out' }
  return { state: 'authenticated', account }
}

export async function loadGambarinJobs() {
  const client = clientOrNull()
  if (!client) throw new Error('Konfigurasi Gambarin belum tersedia.')
  const { data, error } = await client
    .from('gambarin_jobs')
    .select('id,status,created_at,finished_at,error_code')
    .order('created_at', { ascending: false })
    .limit(8)
  if (error) throw new Error('Riwayat pekerjaan belum dapat dimuat.')
  return data || []
}

export async function loadGambarinJobStatus(jobId) {
  const client = clientOrNull()
  if (!client) throw new Error('Konfigurasi Gambarin belum tersedia.')
  const { data, error } = await client.rpc('gambarin_my_job_status', { p_job_id: jobId })
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

export async function signOutGambarin() {
  const client = clientOrNull()
  if (client) await client.auth.signOut()
}

export const gambarinCapabilities = Object.freeze({ login: true, generate: true, asset: false })
