import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

const DEPLOY_COOLDOWN_MS = 60_000
const DEPLOY_HOOK_TIMEOUT_MS = 15_000
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const VALID_ACTIONS = new Set(['publish', 'update_published', 'archive', 'retry'])

type DeployAction = 'publish' | 'update_published' | 'archive' | 'retry'
type MaterialStatus = 'draft' | 'published' | 'archived'

type LearningMaterial = {
  id: string
  title: string | null
  slug: string | null
  status: MaterialStatus | string | null
  last_deploy_triggered_at: string | null
  last_deploy_status: string | null
}

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })

const sanitizeLogMessage = (value: unknown) =>
  String(value instanceof Error ? value.message : value || 'Unknown error')
    .replace(/https?:\/\/\S+/gi, '[redacted-url]')
    .slice(0, 240)

const isValidAction = (value: unknown): value is DeployAction =>
  typeof value === 'string' && VALID_ACTIONS.has(value)

const actionMatchesStatus = (action: DeployAction, status: string | null | undefined) => {
  if (action === 'publish' || action === 'update_published') return status === 'published'
  if (action === 'archive') return status === 'archived'
  if (action === 'retry') return status === 'published' || status === 'archived'
  return false
}

const isInCooldown = (value: string | null | undefined) => {
  if (!value) return false

  const triggeredAt = new Date(value).getTime()
  if (Number.isNaN(triggeredAt)) return false

  return Date.now() - triggeredAt < DEPLOY_COOLDOWN_MS
}

const updateDeployStatus = async (
  serviceClient: ReturnType<typeof createClient>,
  materialId: string,
  payload: Record<string, unknown>
) => serviceClient
  .from('learning_materials')
  .update(payload)
  .eq('id', materialId)

const markDeployFailed = async (
  serviceClient: ReturnType<typeof createClient>,
  materialId: string,
  action: DeployAction
) => {
  const { error: failedStatusError } = await updateDeployStatus(serviceClient, materialId, {
    last_deploy_status: 'failed_to_trigger'
  })

  if (failedStatusError) {
    console.error('Deploy failed status update failed', {
      materialId,
      action,
      error: sanitizeLogMessage(failedStatusError)
    })

    return jsonResponse({
      ok: false,
      deployTriggered: false,
      status: 'pending',
      error: 'Deployment gagal diminta dan status internal belum dapat diperbarui.'
    }, 502)
  }

  return jsonResponse({
    ok: false,
    deployTriggered: false,
    status: 'failed_to_trigger',
    error: 'Deployment belum dapat diminta. Silakan coba lagi.'
  }, 502)
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'Method not allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const deployHookUrl = Deno.env.get('VERCEL_DEPLOY_HOOK_URL')

  if (!deployHookUrl) {
    return jsonResponse({ ok: false, error: 'Konfigurasi deployment belum tersedia.' }, 500)
  }

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse({ ok: false, error: 'Konfigurasi server belum lengkap.' }, 500)
  }

  const authHeader = req.headers.get('Authorization') || ''
  if (!/^Bearer\s+\S+$/i.test(authHeader)) {
    return jsonResponse({ ok: false, error: 'Autentikasi diperlukan.' }, 401)
  }
  const accessToken = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!accessToken) {
    return jsonResponse({ ok: false, error: 'Autentikasi diperlukan.' }, 401)
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ ok: false, error: 'Body JSON tidak valid.' }, 400)
  }

  const materialId = String(body.materialId || '').trim()
  const action = body.action

  if (!UUID_PATTERN.test(materialId)) {
    return jsonResponse({ ok: false, error: 'Material ID tidak valid.' }, 400)
  }

  if (!isValidAction(action)) {
    return jsonResponse({ ok: false, error: 'Action tidak valid.' }, 400)
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false }
  })

  const { data: authData, error: authError } = await userClient.auth.getUser(accessToken)
  if (authError || !authData?.user) {
    console.error('User authentication failed', {
      materialId,
      action,
      error: sanitizeLogMessage(authError)
    })
    return jsonResponse({ ok: false, error: 'Autentikasi tidak valid.' }, 401)
  }

  const { data: isAdmin, error: adminError } = await userClient.rpc('is_admin')
  if (adminError) {
    console.error('Admin verification failed', {
      materialId,
      action,
      error: sanitizeLogMessage(adminError)
    })
    return jsonResponse({ ok: false, error: 'Verifikasi admin belum dapat dilakukan.' }, 500)
  }

  if (isAdmin !== true) {
    return jsonResponse({ ok: false, error: 'Forbidden' }, 403)
  }

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false }
  })

  const { data: material, error: readError } = await serviceClient
    .from('learning_materials')
    .select('id, title, slug, status, last_deploy_triggered_at, last_deploy_status')
    .eq('id', materialId)
    .maybeSingle<LearningMaterial>()

  if (readError) {
    console.error('Deploy material read failed', {
      materialId,
      action,
      error: sanitizeLogMessage(readError)
    })
    return jsonResponse({ ok: false, error: 'Materi belum dapat diperiksa.' }, 500)
  }

  if (!material) {
    return jsonResponse({ ok: false, error: 'Materi tidak ditemukan.' }, 404)
  }

  if (!actionMatchesStatus(action, material.status)) {
    return jsonResponse({ ok: false, error: 'Status materi tidak sesuai dengan tindakan deployment.' }, 409)
  }

  if (isInCooldown(material.last_deploy_triggered_at)) {
    return jsonResponse({
      ok: false,
      error: 'Deployment baru saja diminta. Tunggu sebentar sebelum mencoba lagi.'
    }, 429)
  }

  const requestedAt = new Date().toISOString()
  const { error: pendingError } = await updateDeployStatus(serviceClient, materialId, {
    last_deploy_status: 'pending',
    last_deploy_triggered_at: requestedAt
  })

  if (pendingError) {
    console.error('Deploy pending update failed', {
      materialId,
      action,
      error: sanitizeLogMessage(pendingError)
    })
    return jsonResponse({ ok: false, error: 'Status deployment belum dapat diperbarui.' }, 500)
  }

  let hookResponse: Response
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), DEPLOY_HOOK_TIMEOUT_MS)
  try {
    hookResponse = await fetch(deployHookUrl, {
      method: 'POST',
      signal: controller.signal
    })
  } catch (error) {
    console.error('Deploy hook fetch failed', {
      materialId,
      action,
      error: sanitizeLogMessage(error)
    })

    return await markDeployFailed(serviceClient, materialId, action)
  } finally {
    clearTimeout(timeoutId)
  }

  if (!hookResponse.ok) {
    console.error('Deploy hook returned non-2xx', {
      materialId,
      action,
      status: hookResponse.status
    })

    return await markDeployFailed(serviceClient, materialId, action)
  }

  const { error: triggeredError } = await updateDeployStatus(serviceClient, materialId, {
    last_deploy_status: 'triggered'
  })

  if (triggeredError) {
    console.error('Deploy triggered update failed after hook success', {
      materialId,
      action,
      error: sanitizeLogMessage(triggeredError)
    })

    return jsonResponse({
      ok: false,
      deployTriggered: true,
      status: 'pending',
      error: 'Deployment sudah diminta, tetapi status internal belum dapat diperbarui.'
    }, 202)
  }

  console.log('Content deploy triggered', {
    materialId,
    action,
    status: 'triggered'
  })

  return jsonResponse({
    ok: true,
    deployTriggered: true,
    status: 'triggered',
    message: 'Deployment berhasil diminta.'
  }, 202)
})
