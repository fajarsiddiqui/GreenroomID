import assert from 'node:assert/strict'
import test from 'node:test'
import React, { act } from 'react'
import { renderToString } from 'react-dom/server'
import { createServer } from 'vite'
import { JSDOM } from 'jsdom'

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
  try {
    const { Studio } = await vite.ssrLoadModule('/src/features/gambarin/GambarinPage.jsx')
    const props = { account, onInvalidSession: () => {}, loadAccount, loadJobs, loadJobStatus }
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
