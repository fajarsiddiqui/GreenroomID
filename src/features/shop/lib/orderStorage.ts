export type StoredOrder = { order_id: string; order_code: string; token: string; expires_at: string; has_totp?: boolean }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const token = /^[0-9a-f]{64}$/i

export function readStoredOrder(code: string | undefined): StoredOrder | null {
  if (typeof window === 'undefined' || !code) return null
  for (const read of [() => localStorage.getItem(`gr_order:${code}`), () => sessionStorage.getItem('gr_order')]) {
    try {
      const value = JSON.parse(read() || 'null') as StoredOrder | null
      if (value && uuid.test(value.order_id) && token.test(value.token)
        && value.order_code === code && Number.isFinite(Date.parse(value.expires_at))) return value
    } catch { /* Try the other storage if this one is unavailable or invalid. */ }
  }
  return null
}

export function saveStoredOrder(order: StoredOrder) {
  // Whitelist metadata: credentials and authenticator codes must never be persisted.
  const value = JSON.stringify({ order_id: order.order_id, order_code: order.order_code,
    token: order.token, expires_at: order.expires_at,
    ...(typeof order.has_totp === 'boolean' ? { has_totp: order.has_totp } : {}) })
  localStorage.setItem(`gr_order:${order.order_code}`, value)
  sessionStorage.setItem('gr_order', value)
}

export function forgetStoredOrder(code: string) {
  try { localStorage.removeItem(`gr_order:${code}`) } catch { /* Storage may be disabled. */ }
  try {
    if (JSON.parse(sessionStorage.getItem('gr_order') || 'null')?.order_code === code) sessionStorage.removeItem('gr_order')
  } catch { /* Storage may be disabled. */ }
}

export async function hashOrderToken(rawToken: string) {
  const bytes = new Uint8Array(32)
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(rawToken.slice(index * 2, index * 2 + 2), 16)
  }
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('')
}
