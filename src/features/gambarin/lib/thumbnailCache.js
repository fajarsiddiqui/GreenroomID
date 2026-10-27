const dbName = 'gambarin-private-thumbnails-v1'
const storeName = 'images'
const maxItems = 100
const maxBytes = 10 * 1024 * 1024
const memory = new Map()
const inFlight = new Map()
let activeAccount = null
let generation = 0
let validation = null

function openDb() {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null)
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(storeName, { keyPath: 'key' })
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function transaction(mode, operation) {
  const db = await openDb()
  if (!db) return null
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, mode)
      const value = operation(tx.objectStore(storeName))
      tx.oncomplete = () => resolve(value?.result ?? null)
      tx.onerror = () => reject(tx.error)
    })
  } finally { db.close() }
}

async function records() {
  return transaction('readonly', store => store.getAll())
}

function forgetMemory() {
  for (const entry of memory.values()) URL.revokeObjectURL(entry.url)
  memory.clear()
  inFlight.clear()
  validation = null
}

export async function clearGambarinThumbnailCache() {
  generation++
  activeAccount = null
  forgetMemory()
  try { await transaction('readwrite', store => store.clear()) } catch { /* Cache is optional. */ }
}

async function validated(accountId, validate) {
  if (!validation || validation.accountId !== accountId) {
    const current = { accountId, promise: Promise.resolve().then(validate) }
    validation = current
    void current.promise.finally(() => { if (validation === current) validation = null }).catch(() => {})
  }
  try {
    if (!await validation.promise) throw new Error('Sesi Gambarin berakhir.')
  } catch (error) {
    validation = null
    throw error
  }
}

async function evict(accountId) {
  const all = (await records() || []).filter(row => row.accountId === accountId)
    .sort((a, b) => b.lastUsed - a.lastUsed)
  let bytes = 0
  for (let index = 0; index < all.length; index++) {
    const row = all[index]
    bytes += row.blob.size
    if (index >= maxItems || bytes > maxBytes) {
      await transaction('readwrite', store => store.delete(row.key))
      const cached = memory.get(row.key)
      if (cached) { URL.revokeObjectURL(cached.url); memory.delete(row.key) }
    }
  }
}

export async function loadCachedThumbnail(accountId, jobId, validate, download) {
  if (!activeAccount) {
    try {
      if ((await records() || []).some(row => row.accountId !== accountId)) {
        await clearGambarinThumbnailCache()
      }
    } catch { /* Optional cache. */ }
  }
  if (activeAccount && activeAccount !== accountId) await clearGambarinThumbnailCache()
  activeAccount = accountId
  const epoch = generation
  await validated(accountId, validate)
  if (generation !== epoch || activeAccount !== accountId) throw new Error('Sesi Gambarin berubah.')
  const key = `${accountId}:${jobId}`
  const remembered = memory.get(key)
  if (remembered) { remembered.lastUsed = Date.now(); return remembered.url }
  if (inFlight.has(key)) return inFlight.get(key)
  const pending = (async () => {
    let row
    try { row = await transaction('readonly', store => store.get(key)) } catch { /* Optional cache. */ }
    let blob = row?.blob
    if (!blob || blob.type !== 'image/webp' || blob.size > 1048576) blob = await download()
    if (generation !== epoch || activeAccount !== accountId) throw new Error('Sesi Gambarin berubah.')
    if (blob.type !== 'image/webp' || blob.size > 1048576) throw new Error('Thumbnail tidak valid.')
    if (!row || row.blob !== blob) {
      try {
        await transaction('readwrite', store => store.put({ key, accountId, jobId,
          blob, lastUsed: Date.now() }))
        await evict(accountId)
      } catch { /* Memory cache still works. */ }
    } else {
      try { await transaction('readwrite', store => store.put({ ...row, lastUsed: Date.now() })) }
      catch { /* Optional cache. */ }
    }
    const url = URL.createObjectURL(blob)
    memory.set(key, { url, bytes: blob.size, lastUsed: Date.now() })
    while (memory.size > maxItems || [...memory.values()].reduce((sum, item) => sum + item.bytes, 0) > maxBytes) {
      const oldest = [...memory].sort((a, b) => a[1].lastUsed - b[1].lastUsed)[0]
      if (!oldest) break
      URL.revokeObjectURL(oldest[1].url)
      memory.delete(oldest[0])
    }
    return url
  })().finally(() => inFlight.delete(key))
  inFlight.set(key, pending)
  return pending
}
