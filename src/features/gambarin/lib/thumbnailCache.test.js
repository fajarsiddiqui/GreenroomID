import assert from 'node:assert/strict'
import test from 'node:test'
import 'fake-indexeddb/auto'
import { clearGambarinThumbnailCache, loadCachedThumbnail } from './thumbnailCache.js'

const thumb = () => new Blob([new Uint8Array([82, 73, 70, 70, 87, 69, 66, 80])], { type: 'image/webp' })

test('memory deduplicates in-flight downloads and IndexedDB survives module reload', async () => {
  await clearGambarinThumbnailCache()
  let downloads = 0
  const load = () => loadCachedThumbnail('account-1', 'job-1', async () => true,
    async () => { downloads++; return thumb() })
  const [first, second] = await Promise.all([load(), load()])
  assert.equal(first, second)
  assert.equal(downloads, 1)
  await load()
  assert.equal(downloads, 1)
  const restarted = await import('./thumbnailCache.js?restart=1')
  await restarted.loadCachedThumbnail('account-1', 'job-1', async () => true,
    async () => { downloads++; return thumb() })
  assert.equal(downloads, 1)
  await clearGambarinThumbnailCache()
  await restarted.clearGambarinThumbnailCache()
})

test('logout clears private blobs and a different account cannot reuse them', async () => {
  await clearGambarinThumbnailCache()
  let downloads = 0
  const download = async () => { downloads++; return thumb() }
  await loadCachedThumbnail('account-1', 'job-1', async () => true, download)
  await clearGambarinThumbnailCache()
  await loadCachedThumbnail('account-1', 'job-1', async () => true, download)
  assert.equal(downloads, 2)
  await loadCachedThumbnail('account-2', 'job-1', async () => true, download)
  assert.equal(downloads, 3)
  await clearGambarinThumbnailCache()
})

test('cache is inaccessible when session validation fails', async () => {
  await clearGambarinThumbnailCache()
  await assert.rejects(loadCachedThumbnail('account-1', 'job-1', async () => false,
    async () => thumb()), /Sesi Gambarin berakhir/)
})

test('least recently used private thumbnail is evicted after 10 MB', async () => {
  await clearGambarinThumbnailCache()
  let downloads = 0
  const download = async () => {
    downloads++
    return new Blob([new Uint8Array(1024 * 1024)], { type: 'image/webp' })
  }
  for (let index = 0; index < 11; index++) {
    await loadCachedThumbnail('account-1', `job-${index}`, async () => true, download)
  }
  assert.equal(downloads, 11)
  await loadCachedThumbnail('account-1', 'job-0', async () => true, download)
  assert.equal(downloads, 12)
  await clearGambarinThumbnailCache()
})

test('three accounts retry temporary 503 without sharing a thumbnail', async () => {
  await clearGambarinThumbnailCache()
  const attempts = new Map()
  for (const accountId of ['account-1', 'account-2', 'account-3']) {
    const download = async () => {
      const count = (attempts.get(accountId) || 0) + 1
      attempts.set(accountId, count)
      if (count === 1) throw new Error('HTTP 503')
      return thumb()
    }
    await assert.rejects(loadCachedThumbnail(accountId, 'same-job', async () => true, download), /503/)
    await loadCachedThumbnail(accountId, 'same-job', async () => true, download)
    await loadCachedThumbnail(accountId, 'same-job', async () => true, download)
    assert.equal(attempts.get(accountId), 2)
  }
  assert.deepEqual([...attempts.values()], [2, 2, 2])
  await clearGambarinThumbnailCache()
})

test('thumbnail downloads use at most three parallel network slots', async () => {
  await clearGambarinThumbnailCache()
  let active = 0
  let peak = 0
  const download = async () => {
    active++
    peak = Math.max(peak, active)
    await new Promise(resolve => setTimeout(resolve, 10))
    active--
    return thumb()
  }
  await Promise.all(Array.from({ length: 8 }, (_, index) =>
    loadCachedThumbnail('account-1', `parallel-${index}`, async () => true, download)))
  assert.equal(peak, 3)
  await clearGambarinThumbnailCache()
})
