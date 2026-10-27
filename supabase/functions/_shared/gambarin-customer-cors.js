export function customerCors(request, allowedOrigins) {
  const origins = (allowedOrigins || '').split(',').map((value) => value.trim())
    .filter((value) => value && value !== '*')
  const origin = request.headers.get('Origin')
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', Vary: 'Origin' }
  const json = (body, status = 200, extraHeaders = {}) => new Response(JSON.stringify(body), {
    status, headers: { ...headers, ...extraHeaders },
  })
  if (!origins.length) return { json, denial: json({ error: 'server_configuration_error' }, 503) }
  if (origin && !origins.includes(origin)) return { json, denial: json({ error: 'origin_not_allowed' }, 403) }
  if (origin) Object.assign(headers, {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  })
  return {
    json,
    preflight: request.method === 'OPTIONS' ? new Response(null, { status: 204, headers }) : null,
  }
}
