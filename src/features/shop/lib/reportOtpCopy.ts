type CopyAccess = { source: 'order'; id: string; token: string; access?: string }
  | { source: 'reissue'; id: string; token: string; access: string }

export async function reportOtpCopy(access: CopyAccess, windowEndMs: number) {
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/shop-notify-otp-copy`
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY
  try {
    const request: RequestInit = {
      method: 'POST', cache: 'no-store', keepalive: true,
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...access, window_start_ms: windowEndMs - 30_000, event_id: crypto.randomUUID() }),
    }
    await fetch(url, request).catch(() => fetch(url, request))
  } catch { /* A notification failure must not change the clipboard result. */ }
}
