import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

const DEPLOY_COOLDOWN_MS = 300_000
const DEPLOY_HOOK_TIMEOUT_MS = 15_000
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const VALID_ACTIONS = new Set(['publish', 'update_published', 'archive', 'retry'])

type DeployAction = 'publish' | 'update_published' | 'archive' | 'retry'
type ToolStatus = 'draft' | 'published' | 'archived'

type PromptTool = {
  id: string
  title: string | null
  slug: string | null
  status: ToolStatus | string | null
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
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .slice(0, 240)

const isValidAction = (value: unknown): value is DeployAction =>
  typeof value === 'string' && VALID_ACTIONS.has(value)

const actionMatchesStatus = (
  action: DeployAction,
  status: string | null | undefined
) => {
  if (action === 'publish' || action === 'update_published') {
    return status === 'published'
  }

  if (action === 'archive') {
    return status === 'archived'
  }

  if (action === 'retry') {
    return status === 'published' || status === 'archived'
  }

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
  toolId: string,
  payload: Record<string, unknown>
) => serviceClient
  .from('prompt_tools')
  .update(payload)
  .eq('id', toolId)

const markDeployFailed = async (
  serviceClient: ReturnType<typeof createClient>,
  toolId: string,
  action: DeployAction
) => {
  const { error: failedStatusError } = await updateDeployStatus(
    serviceClient,
    toolId,
    { last_deploy_status: 'failed_to_trigger' }
  )

  if (failedStatusError) {
    console.error('Tool deploy failed status update failed', {
      toolId,
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
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'Method not allowed' }, 405)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')

  if (!supabaseUrl || !anonKey) {
    return jsonResponse({
      ok: false,
      error: 'Konfigurasi server belum lengkap.'
    }, 500)
  }

  const authHeader = req.headers.get('Authorization') || ''
  const accessToken = authHeader.replace(/^Bearer\s+/i, '').trim()

  if (!accessToken || !/^Bearer\s+\S+$/i.test(authHeader)) {
    return jsonResponse({
      ok: false,
      error: 'Autentikasi diperlukan.'
    }, 401)
  }

  let body: Record<string, unknown>

  try {
    const parsedBody: unknown = await req.json()

    if (
      !parsedBody
      || typeof parsedBody !== 'object'
      || Array.isArray(parsedBody)
    ) {
      return jsonResponse({
        ok: false,
        error: 'Body JSON tidak valid.'
      }, 400)
    }

    body = parsedBody as Record<string, unknown>
  } catch {
    return jsonResponse({
      ok: false,
      error: 'Body JSON tidak valid.'
    }, 400)
  }

  const toolId = String(body.toolId || '').trim()
  const action = body.action

  if (!UUID_PATTERN.test(toolId)) {
    return jsonResponse({
      ok: false,
      error: 'Tool ID tidak valid.'
    }, 400)
  }

  if (!isValidAction(action)) {
    return jsonResponse({
      ok: false,
      error: 'Action tidak valid.'
    }, 400)
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false }
  })

  const { data: authData, error: authError } = await userClient.auth.getUser(
    accessToken
  )

  if (authError || !authData?.user) {
    console.error('Tool deploy user authentication failed', {
      toolId,
      action,
      error: sanitizeLogMessage(authError)
    })

    return jsonResponse({
      ok: false,
      error: 'Autentikasi tidak valid.'
    }, 401)
  }

  const { data: isAdmin, error: adminError } = await userClient.rpc('is_admin')

  if (adminError) {
    console.error('Tool deploy admin verification failed', {
      toolId,
      action,
      error: sanitizeLogMessage(adminError)
    })

    return jsonResponse({
      ok: false,
      error: 'Verifikasi admin belum dapat dilakukan.'
    }, 500)
  }

  if (isAdmin !== true) {
    return jsonResponse({ ok: false, error: 'Forbidden' }, 403)
  }

  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!serviceRoleKey) {
    return jsonResponse({
      ok: false,
      error: 'Konfigurasi server belum lengkap.'
    }, 500)
  }

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false }
  })

  const { data: tool, error: readError } = await serviceClient
    .from('prompt_tools')
    .select('id, title, slug, status, last_deploy_triggered_at, last_deploy_status')
    .eq('id', toolId)
    .maybeSingle<PromptTool>()

  if (readError) {
    console.error('Tool deploy read failed', {
      toolId,
      action,
      error: sanitizeLogMessage(readError)
    })

    return jsonResponse({
      ok: false,
      error: 'Tool belum dapat diperiksa.'
    }, 500)
  }

  if (!tool) {
    return jsonResponse({
      ok: false,
      error: 'Tool tidak ditemukan.'
    }, 404)
  }

  if (!actionMatchesStatus(action, tool.status)) {
    return jsonResponse({
      ok: false,
      error: 'Status tool tidak sesuai dengan tindakan deployment.'
    }, 409)
  }

  if (isInCooldown(tool.last_deploy_triggered_at)) {
    return jsonResponse({
      ok: false,
      error: 'Deployment baru saja diminta. Tunggu sekitar 5 menit sebelum mencoba lagi.'
    }, 429)
  }

  const deployHookUrl = Deno.env.get('VERCEL_DEPLOY_HOOK_URL')

  if (!deployHookUrl) {
    return jsonResponse({
      ok: false,
      error: 'Konfigurasi deployment belum tersedia.'
    }, 500)
  }

  const requestedAt = new Date().toISOString()
  const { error: pendingError } = await updateDeployStatus(
    serviceClient,
    toolId,
    {
      last_deploy_status: 'pending',
      last_deploy_triggered_at: requestedAt
    }
  )

  if (pendingError) {
    console.error('Tool deploy pending update failed', {
      toolId,
      action,
      error: sanitizeLogMessage(pendingError)
    })

    return jsonResponse({
      ok: false,
      error: 'Status deployment belum dapat diperbarui.'
    }, 500)
  }

  let hookResponse: Response
  const controller = new AbortController()
  const timeoutId = setTimeout(
    () => controller.abort(),
    DEPLOY_HOOK_TIMEOUT_MS
  )

  try {
    hookResponse = await fetch(deployHookUrl, {
      method: 'POST',
      signal: controller.signal
    })
  } catch (error) {
    console.error('Tool deploy hook fetch failed', {
      toolId,
      action,
      error: sanitizeLogMessage(error)
    })

    return await markDeployFailed(serviceClient, toolId, action)
  } finally {
    clearTimeout(timeoutId)
  }

  if (!hookResponse.ok) {
    console.error('Tool deploy hook returned non-2xx', {
      toolId,
      action,
      status: hookResponse.status
    })

    return await markDeployFailed(serviceClient, toolId, action)
  }

  const { error: triggeredError } = await updateDeployStatus(
    serviceClient,
    toolId,
    { last_deploy_status: 'triggered' }
  )

  if (triggeredError) {
    console.error('Tool deploy triggered update failed after hook success', {
      toolId,
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

  console.log('Tool deploy triggered', {
    toolId,
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
