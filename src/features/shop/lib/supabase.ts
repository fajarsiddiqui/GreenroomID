import { createClient } from '@supabase/supabase-js'

let shopSupabase: ReturnType<typeof createClient> | undefined

export function getShopSupabase() {
  if (shopSupabase) return shopSupabase
  const shopSupabaseUrl = import.meta.env.VITE_SUPABASE_URL
  const shopSupabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

  if (!shopSupabaseUrl) {
    throw new Error('Missing required environment variable: VITE_SUPABASE_URL')
  }
  if (!shopSupabaseAnonKey) {
    throw new Error('Missing required environment variable: VITE_SUPABASE_ANON_KEY')
  }

  shopSupabase = createClient(shopSupabaseUrl, shopSupabaseAnonKey)
  return shopSupabase
}
