import assert from 'node:assert/strict'
import test from 'node:test'
import React, { act } from 'react'
import { renderToString } from 'react-dom/server'
import { createServer } from 'vite'
import { JSDOM } from 'jsdom'
import { resolveGambarinOriginal } from './lib/originalAsset.js'

test('Studio renders an authenticated account with no active job or saved prompt', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
  try {
    const { Studio } = await vite.ssrLoadModule('/src/features/gambarin/GambarinPage.jsx')
    const html = renderToString(React.createElement(Studio, {
      account: {
        id: '00000000-0000-4000-8000-000000000001', username: 'smoke', status: 'active',
        expires_at: '2099-01-01T00:00:00Z', quota_granted: 5, quota_used: 0, quota_reserved: 0,
      },
      onInvalidSession: () => {},
    }))
    assert.match(html, /Halo, (?:<!-- -->)?smoke/)
    assert.match(html, /Belum ada hasil gambar/)
  } finally {
    await vite.close()
  }
})

test('global queue figures reflect total, own position, overflow and no own job', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
  try {
    const { QueueVisual } = await vite.ssrLoadModule('/src/features/gambarin/GambarinPage.jsx')
    const render = snapshot => renderToString(React.createElement(QueueVisual, { snapshot }))
    const empty = render({ total: 0, own_position: null })
    assert.match(empty, /Antrean kosong/)
    assert.doesNotMatch(empty, /gb-person-current/)
    const three = render({ total: 3, own_position: 2 })
    assert.match(three, /Antrean server 3 pekerjaan, posisi kamu 2/)
    assert.equal((three.match(/<circle cx="11"/g) || []).length, 3)
    assert.equal((three.match(/gb-person-current/g) || []).length, 1)
    const other = render({ total: 3, own_position: null })
    assert.doesNotMatch(other, /gb-person-current/)
    const crowded = render({ total: 15, own_position: 12 })
    assert.match(crowded, /gb-queue-hidden">\+<!-- -->3<!-- --> pekerjaan/)
    assert.equal((crowded.match(/gb-person-current/g) || []).length, 1)
  } finally { await vite.close() }
})

test('temporary global queue refresh failure preserves last server total', async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost/' })
  const previous = { window: globalThis.window, document: globalThis.document,
    HTMLElement: globalThis.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT }
  Object.assign(globalThis, { window: dom.window, document: dom.window.document,
    HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })
  const ticks = []
  dom.window.setInterval = callback => { ticks.push(callback); return ticks.length }
  dom.window.clearInterval = () => {}
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
  const { createRoot } = await import('react-dom/client')
  const root = createRoot(document.getElementById('root'))
  const account = { id: '00000000-0000-4000-8000-000000000001', username: 'smoke',
    status: 'active', expires_at: '2099-01-01T00:00:00Z', quota_granted: 7,
    quota_used: 0, quota_reserved: 0 }
  let calls = 0
  try {
    const { Studio } = await vite.ssrLoadModule('/src/features/gambarin/GambarinPage.jsx')
    await act(async () => {
      root.render(React.createElement(Studio, { account, onInvalidSession: () => {},
        loadAccount: async () => ({ state: 'authenticated', account }),
        loadJobs: async () => ({ items: [], hasMore: false }),
        loadQueue: async () => {
          calls++
          if (calls > 1) throw new Error('temporary connection failure')
          return { total: 3, active_count: 0, waiting_count: 3,
            reconciliation_count: 0, own_position: null, own_status: null,
            snapshot_at: new Date().toISOString() }
        }, loadJobStatus: async () => null }))
      await new Promise(resolve => setTimeout(resolve, 10))
    })
    assert.match(document.querySelector('.gb-queue-overview').textContent, /Total pekerjaan/)
    assert.match(document.querySelector('.gb-queue-estimate').textContent, /3/)
    await act(async () => { ticks[0](); await new Promise(resolve => setTimeout(resolve, 10)) })
    assert.match(document.querySelector('.gb-queue-estimate').textContent, /3/)
    assert.match(document.querySelector('.gb-queue-message').textContent, /belum dapat diperbarui/)
  } finally {
    await act(async () => root.unmount())
    await vite.close()
    dom.window.close()
    Object.assign(globalThis, previous)
  }
})

test('gallery card keeps original access while thumbnail and model metadata are absent', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
  try {
    const { ResultCard } = await vite.ssrLoadModule('/src/features/gambarin/GambarinPage.jsx')
    const base = { id: 'job-1', status: 'succeeded', created_at: '2026-10-28T00:00:00Z' }
    const render = (job) => renderToString(React.createElement(ResultCard, {
      job, accountId: 'account-1', onOpenOriginal: () => {},
    }))
    const pending = render({ ...base, thumbnail_status: 'pending' })
    assert.match(pending, /Pratinjau sedang disiapkan/)
    assert.match(pending, /aria-label="Buka gambar asli"/)
    assert.match(pending, /aria-label="Buka gambar ukuran penuh"/)
    assert.match(pending, /Selesai/)
    assert.doesNotMatch(pending, /Model tidak tersedia|gb-model-label/)

    const failed = render({ ...base, thumbnail_status: 'failed', model: '  nano-banana-pro  ' })
    assert.match(failed, /Pratinjau tidak tersedia/)
    assert.match(failed, /<span class="gb-model-label" title="nano-banana-pro">nano-banana-pro<\/span>/)
    assert.doesNotMatch(failed, /Thumbnail gagal dibuat|original_unavailable/)
  } finally {
    await vite.close()
  }
})

test('thumbnail lifecycle labels do not treat pending or retryable failure as terminal', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
  try {
    const { ResultCard } = await vite.ssrLoadModule('/src/features/gambarin/GambarinPage.jsx')
    const base = { id: 'job-1', created_at: '2026-10-28T00:00:00Z' }
    const cases = [
      [{ ...base, status: 'processing' }, 'Sedang membuat gambar'],
      [{ ...base, status: 'succeeded', thumbnail_status: null }, 'Menunggu pratinjau'],
      [{ ...base, status: 'succeeded', thumbnail_status: 'pending' }, 'Pratinjau sedang disiapkan'],
      [{ ...base, status: 'succeeded', thumbnail_status: 'processing' }, 'Membuat pratinjau'],
      [{ ...base, status: 'succeeded', thumbnail_status: 'failed',
        thumbnail_retryable: true }, 'Mencoba menyiapkan pratinjau'],
      [{ ...base, status: 'succeeded', thumbnail_status: 'failed',
        thumbnail_retryable: false }, 'Pratinjau tidak tersedia'],
      [{ ...base, status: 'succeeded', thumbnail_status: 'ready' }, 'Pratinjau sedang dimuat'],
    ]
    for (const [job, label] of cases) {
      const html = renderToString(React.createElement(ResultCard, {
        job, accountId: 'account-1', onOpenOriginal: () => {},
      }))
      assert.match(html, new RegExp(label))
      if (job.status === 'succeeded') assert.match(html, /aria-label="Buka gambar asli"/)
    }
  } finally { await vite.close() }
})

test('retryable thumbnail failure can advance to ready without browser refresh', async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost/' })
  const previous = { window: globalThis.window, document: globalThis.document,
    HTMLElement: globalThis.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT }
  Object.assign(globalThis, { window: dom.window, document: dom.window.document,
    HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
  const { createRoot } = await import('react-dom/client')
  const root = createRoot(document.getElementById('root'))
  let downloads = 0
  const base = { id: 'job-1', status: 'succeeded', created_at: '2026-10-28T00:00:00Z' }
  try {
    const { ResultCard } = await vite.ssrLoadModule('/src/features/gambarin/GambarinPage.jsx')
    const render = thumbnail_status => root.render(React.createElement(ResultCard, {
      job: { ...base, thumbnail_status, thumbnail_retryable: true }, accountId: 'account-1',
      onOpenOriginal: () => {}, loadThumbnail: async () => { downloads++; return 'blob:thumbnail' },
    }))
    await act(async () => render('pending'))
    assert.match(document.querySelector('.gb-image-placeholder').textContent, /sedang disiapkan/)
    await act(async () => render('processing'))
    assert.match(document.querySelector('.gb-image-placeholder').textContent, /Membuat pratinjau/)
    await act(async () => render('failed'))
    assert.match(document.querySelector('.gb-image-placeholder').textContent, /Mencoba menyiapkan/)
    assert.equal(downloads, 0)
    await act(async () => { render('ready'); await new Promise(resolve => setTimeout(resolve, 10)) })
    assert.equal(downloads, 1)
    assert.equal(document.querySelectorAll('.gb-image-frame img').length, 1)
  } finally {
    await act(async () => root.unmount())
    await vite.close()
    dom.window.close()
    Object.assign(globalThis, previous)
  }
})

test('Studio polls once per tick without restarting when jobs or selected status change', async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost/' })
  const previous = { window: globalThis.window, document: globalThis.document,
    HTMLElement: globalThis.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT }
  Object.assign(globalThis, { window: dom.window, document: dom.window.document,
    HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })
  const ticks = []
  dom.window.setInterval = (callback) => { ticks.push(callback); return ticks.length }
  dom.window.clearInterval = () => {}
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
  const { createRoot } = await import('react-dom/client')
  const root = createRoot(document.getElementById('root'))
  const account = { id: '00000000-0000-4000-8000-000000000001', username: 'smoke',
    status: 'active', expires_at: '2099-01-01T00:00:00Z', quota_granted: 5,
    quota_used: 0, quota_reserved: 0 }
  let accountCalls = 0
  let jobCalls = 0
  let statusCalls = 0
  const loadAccount = async () => { accountCalls++; return { state: 'authenticated', account } }
  const firstPage = Array.from({ length: 12 }, (_, index) => ({ id: `job-${index + 1}`,
    status: 'queued', created_at: '2026-10-28T00:00:00Z' }))
  const loadJobs = async (cursor) => { jobCalls++; return cursor
    ? { items: [{ id: 'job-13', status: 'queued', created_at: '2026-10-27T00:00:00Z' }],
      hasMore: false }
    : { items: firstPage, hasMore: true } }
  const loadJobStatus = async () => { statusCalls++; return { job_id: 'job-1',
    status: statusCalls === 1 ? 'queued' : 'processing' } }
  let queueCalls = 0
  const loadQueue = async () => { queueCalls++; return { total: 1,
    active_count: queueCalls > 1 ? 1 : 0, waiting_count: queueCalls > 1 ? 0 : 1,
    reconciliation_count: 0, own_position: 1,
    own_status: queueCalls > 1 ? 'processing' : 'queued',
    snapshot_at: new Date().toISOString() } }
  try {
    const { Studio } = await vite.ssrLoadModule('/src/features/gambarin/GambarinPage.jsx')
    const props = { account, onInvalidSession: () => {}, loadAccount, loadJobs,
      loadQueue, loadJobStatus }
    await act(async () => {
      root.render(React.createElement(Studio, props))
      await new Promise(resolve => setTimeout(resolve, 10))
    })
    assert.deepEqual([accountCalls, jobCalls, statusCalls, ticks.length], [1, 1, 1, 1])
    await act(async () => {
      [...document.querySelectorAll('.gb-view-tabs button')]
        .find(button => button.textContent === 'Galeri').click()
    })
    assert.deepEqual([accountCalls, jobCalls, statusCalls, ticks.length], [1, 1, 1, 1])
    await act(async () => {
      ticks[0]()
      ticks[0]()
      await new Promise(resolve => setTimeout(resolve, 10))
    })
    assert.deepEqual([accountCalls, jobCalls, statusCalls, ticks.length], [2, 2, 2, 1])
    assert.match(document.querySelector('.gb-queue-overview').textContent, /Diproses/)
    await act(async () => {
      document.querySelector('.gb-gallery-more').click()
      await new Promise(resolve => setTimeout(resolve, 10))
    })
    assert.equal(document.querySelectorAll('.gb-gallery .gb-image-card').length, 13)
    assert.equal(jobCalls, 3)
    await act(async () => {
      ticks[0]()
      await new Promise(resolve => setTimeout(resolve, 10))
    })
    assert.equal(document.querySelectorAll('.gb-gallery .gb-image-card').length, 13)
    assert.deepEqual([accountCalls, jobCalls, statusCalls, ticks.length], [3, 4, 3, 1])
  } finally {
    await act(async () => root.unmount())
    await vite.close()
    dom.window.close()
    Object.assign(globalThis, previous)
  }
})

test('history failure keeps active profile and previously loaded gallery', async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost/' })
  const previous = { window: globalThis.window, document: globalThis.document,
    HTMLElement: globalThis.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT }
  Object.assign(globalThis, { window: dom.window, document: dom.window.document,
    HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })
  const ticks = []
  dom.window.setInterval = callback => { ticks.push(callback); return ticks.length }
  dom.window.clearInterval = () => {}
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
  const { createRoot } = await import('react-dom/client')
  const root = createRoot(document.getElementById('root'))
  const account = { id: '00000000-0000-4000-8000-000000000001', username: 'smoke',
    status: 'active', expires_at: '2099-01-01T00:00:00Z', quota_granted: 7,
    quota_used: 0, quota_reserved: 0 }
  let jobsCall = 0
  let profileCall = 0
  let invalidSessions = 0
  const jobs = [{ id: 'job-1', status: 'succeeded',
    created_at: '2026-10-28T00:00:00Z', thumbnail_status: 'pending' }]
  const props = { account, onInvalidSession: () => { invalidSessions++ },
    loadQueue: async () => ({ total: 0, active_count: 0, waiting_count: 0,
      reconciliation_count: 0, own_position: null, own_status: null,
      snapshot_at: new Date().toISOString() }),
    loadAccount: async () => {
      profileCall++
      if (profileCall === 3) throw new Error('Data akun belum dapat dimuat.')
      return { state: 'authenticated', account }
    },
    loadJobs: async () => {
      jobsCall++
      if (jobsCall !== 2) throw new Error('Riwayat pekerjaan belum dapat dimuat.')
      return { items: jobs, hasMore: false }
    },
    loadJobStatus: async () => ({ job_id: 'job-1', status: 'succeeded' }) }
  try {
    const { Studio } = await vite.ssrLoadModule('/src/features/gambarin/GambarinPage.jsx')
    await act(async () => {
      root.render(React.createElement(Studio, props))
      await new Promise(resolve => setTimeout(resolve, 10))
    })
    assert.match(document.querySelector('.gb-fact:nth-child(2)').textContent, /Aktif/)
    assert.doesNotMatch(document.querySelector('.gb-fact:nth-child(2)').textContent, /Tidak aktif/)
    assert.match(document.querySelector('.gb-page-error').textContent, /Riwayat pekerjaan/)
    await act(async () => { ticks[0](); await new Promise(resolve => setTimeout(resolve, 10)) })
    await act(async () => {
      [...document.querySelectorAll('.gb-view-tabs button')]
        .find(button => button.textContent === 'Galeri').click()
    })
    assert.equal(document.querySelectorAll('.gb-gallery .gb-image-card').length, 1)
    await act(async () => { ticks[0](); await new Promise(resolve => setTimeout(resolve, 10)) })
    assert.equal(document.querySelectorAll('.gb-gallery .gb-image-card').length, 1)
    assert.match(document.querySelector('.gb-page-error').textContent, /Data akun/)
    assert.equal(invalidSessions, 0)
  } finally {
    await act(async () => root.unmount())
    await vite.close()
    dom.window.close()
    Object.assign(globalThis, previous)
  }
})

test('three gallery cards recover from pending and temporary 503 without reloading the page', async () => {
  const dom = new JSDOM('<!doctype html><div id="a1"></div><div id="a2"></div><div id="a3"></div>',
    { url: 'http://localhost/' })
  const previous = { window: globalThis.window, document: globalThis.document,
    HTMLElement: globalThis.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT }
  Object.assign(globalThis, { window: dom.window, document: dom.window.document,
    HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })
  const retries = new Map()
  dom.window.setTimeout = callback => {
    const id = retries.size + 1
    retries.set(id, callback)
    return id
  }
  dom.window.clearTimeout = id => retries.delete(id)
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
  const { createRoot } = await import('react-dom/client')
  const { ResultCard } = await vite.ssrLoadModule(
    '/src/features/gambarin/GambarinPage.jsx')
  const roots = ['a1', 'a2', 'a3'].map(id => createRoot(document.getElementById(id)))
  const calls = new Map()
  const loadThumbnail = async accountId => {
    const count = (calls.get(accountId) || 0) + 1
    calls.set(accountId, count)
    if (accountId === 'account-2' && count === 1) throw new Error('HTTP 503')
    return `blob:${accountId}`
  }
  const render = status => roots.forEach((root, index) => root.render(React.createElement(ResultCard, {
    job: { id: `job-${index + 1}`, status: 'succeeded', thumbnail_status: status,
      created_at: '2026-10-28T00:00:00Z' },
    accountId: `account-${index + 1}`, onOpenOriginal: () => {}, loadThumbnail,
  })))
  try {
    await act(async () => render('pending'))
    assert.equal(calls.size, 0)
    assert.equal(document.querySelectorAll('.gb-image-placeholder').length, 3)
    await act(async () => { render('ready'); await new Promise(resolve => setTimeout(resolve, 10)) })
    assert.deepEqual([...calls.values()], [1, 1, 1])
    assert.equal(document.querySelectorAll('.gb-image-frame img').length, 2)
    assert.match(document.querySelector('#a2 .gb-image-placeholder').textContent,
      /Pratinjau sedang dimuat/)
    await act(async () => {
      [...retries.values()][0]()
      await new Promise(resolve => setTimeout(resolve, 10))
    })
    assert.equal(calls.get('account-2'), 2)
    assert.equal(document.querySelectorAll('.gb-image-frame img').length, 3)

    let mockCalls = 0
    await assert.rejects(resolveGambarinOriginal('real-job', false,
      async () => { throw new Error('HTTP 503') }, async () => { mockCalls++; return 'mock' }), /503/)
    assert.equal(mockCalls, 0)
    assert.deepEqual(await resolveGambarinOriginal('mock-job', true,
      async () => { throw new Error('real should not be called') },
      async () => { mockCalls++; return 'blob:mock' }),
    { url: 'blob:mock', mock: true })
    assert.equal(mockCalls, 1)
  } finally {
    await act(async () => roots.forEach(root => root.unmount()))
    await vite.close()
    dom.window.close()
    Object.assign(globalThis, previous)
  }
})
