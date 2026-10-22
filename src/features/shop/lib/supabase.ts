import { createClient } from '@supabase/supabase-js'

const shopSupabaseUrl = import.meta.env.VITE_SHOP_SUPABASE_URL
const shopSupabaseAnonKey = import.meta.env.VITE_SHOP_SUPABASE_ANON_KEY

if (!shopSupabaseUrl) {
  throw new Error('Missing required environment variable: VITE_SHOP_SUPABASE_URL')
}

if (!shopSupabaseAnonKey) {
  throw new Error('Missing required environment variable: VITE_SHOP_SUPABASE_ANON_KEY')
}

export const shopSupabase = createClient(shopSupabaseUrl, shopSupabaseAnonKey)
