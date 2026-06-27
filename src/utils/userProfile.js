import { supabase } from '../supabase'

export const ADMIN_EMAIL = 'fajarsiddiqui00@gmail.com'

export const USER_ROLE_OPTIONS = ['client', 'admin', 'freelancer']

export const USER_ROLE_LABELS = {
  client: 'Client',
  admin: 'Admin',
  freelancer: 'Freelancer'
}

export const getUserDisplayName = (user) => {
  if (!user) return null
  return (
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    user.email ||
    null
  )
}

export const upsertCurrentUserProfile = async (user) => {
  if (!user?.id) return null

  const basePayload = {
    id: user.id,
    email: user.email,
    full_name: getUserDisplayName(user),
    avatar_url: user.user_metadata?.avatar_url || user.user_metadata?.picture || null,
    last_seen_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }

  const { data: existingProfile, error: readError } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle()

  if (readError) {
    console.log('Gagal membaca profil user:', readError.message)
  }

  if (existingProfile) {
    const { data, error } = await supabase
      .from('user_profiles')
      .update({
        email: user.email,
        avatar_url: existingProfile.avatar_url || basePayload.avatar_url,
        last_seen_at: basePayload.last_seen_at,
        updated_at: basePayload.updated_at
      })
      .eq('id', user.id)
      .select('*')
      .single()

    if (error) {
      console.log('Gagal sinkron profil user:', error.message)
      return existingProfile
    }

    return data
  }

  const insertPayload = {
    ...basePayload,
    role: 'client',
    is_active: true
  }

  const { data, error } = await supabase
    .from('user_profiles')
    .insert(insertPayload)
    .select('*')
    .single()

  if (error) {
    console.log('Gagal membuat profil user:', error.message)

    // Fallback agar admin lama tetap bisa masuk sebelum SQL migrasi akun dijalankan.
    if (String(user.email || '').toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
      return {
        ...basePayload,
        role: 'admin',
        is_active: true
      }
    }

    return null
  }

  return data
}
