const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const timestampPattern = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/

export function jobOrderFilter(cursor, inclusive = false) {
  if (!timestampPattern.test(cursor?.created_at) || !uuidPattern.test(cursor?.id)) {
    throw new Error('Cursor galeri tidak valid.')
  }
  const timestamp = `"${cursor.created_at}"`
  return `created_at.lt.${timestamp},and(created_at.eq.${timestamp},id.${inclusive ? 'lte' : 'lt'}.${cursor.id})`
}

export async function fetchJobPage(client, cursor = null) {
  let query = client.from('gambarin_jobs')
    .select('id,status,created_at,finished_at,error_code')
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(13)
  if (cursor) query = query.or(jobOrderFilter(cursor))
  const { data, error } = await query
  if (error) throw new Error('Riwayat pekerjaan belum dapat dimuat.')
  return { items: (data || []).slice(0, 12), hasMore: (data || []).length > 12 }
}
