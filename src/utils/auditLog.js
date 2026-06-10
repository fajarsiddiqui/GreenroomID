import { supabase } from '../supabase'

export const createAuditLog = async ({
  requestId = null,
  actorId = null,
  actorEmail = null,
  actorRole = 'system',
  action,
  description,
  metadata = {}
}) => {
  if (!action) return

  const { error } = await supabase.from('audit_logs').insert({
    request_id: requestId,
    actor_id: actorId,
    actor_email: actorEmail,
    actor_role: actorRole,
    action,
    description,
    metadata
  })

  if (error) {
    console.log('Gagal membuat audit log:', error.message)
  }
}