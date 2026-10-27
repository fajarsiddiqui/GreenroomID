import { jobOrderFilter } from './jobPagination.js'

const extensions = { 'image/jpeg': 'jpg', 'image/png': 'png',
  'image/webp': 'webp', 'image/svg+xml': 'svg' }

export async function getGambarinImageNumber(client, jobId) {
  const { data: job, error: jobError } = await client.from('gambarin_jobs')
    .select('id,status,created_at').eq('id', jobId).maybeSingle()
  if (jobError || !job || job.status !== 'succeeded') {
    throw new Error('Urutan gambar belum tersedia.')
  }
  const { count, error } = await client.from('gambarin_jobs')
    .select('id', { count: 'exact', head: true }).eq('status', 'succeeded')
    .or(jobOrderFilter(job, true))
  if (error || !Number.isSafeInteger(count) || count < 1) {
    throw new Error('Urutan gambar belum tersedia.')
  }
  return count
}

export function gambarinDownloadFilename(username, number, contentType) {
  const user = String(username || '').replace(/[^a-zA-Z0-9_-]/g, '_')
  const extension = extensions[contentType]
  if (!user || !Number.isSafeInteger(number) || number < 1 || !extension) {
    throw new Error('Nama berkas gambar tidak valid.')
  }
  return `Gambarin_${user}_${String(number).padStart(2, '0')}.${extension}`
}
