import { createClient } from '@supabase/supabase-js'

export const GAMBARIN_AUTH_STORAGE_KEY = 'greenroomid_gambarin_auth_v1'

let gambarinClient = null

function readGambarinConfig() {
  const env = import.meta.env || {}
  const url = String(env.VITE_GAMBARIN_SUPABASE_URL || '').trim()
  const publishableKey = String(env.VITE_GAMBARIN_SUPABASE_PUBLISHABLE_KEY || '').trim()

  if (!url || !publishableKey) {
    return { configured: false, reason: 'missing-environment' }
  }

  try {
    const parsedUrl = new URL(url)
    if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
      return { configured: false, reason: 'invalid-url' }
    }
  } catch {
    return { configured: false, reason: 'invalid-url' }
  }

  return { configured: true, url, publishableKey }
}

export function getGambarinSupabaseStatus() {
  const config = readGambarinConfig()
  return config.configured
    ? { status: 'configured' }
    : { status: 'not-configured', reason: config.reason }
}

export function getGambarinSupabaseClient() {
  if (gambarinClient) return gambarinClient

  const config = readGambarinConfig()
  if (!config.configured) return null

  gambarinClient = createClient(config.url, config.publishableKey, {
    auth: {
      storageKey: GAMBARIN_AUTH_STORAGE_KEY,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false
    }
  })

  return gambarinClient
}
