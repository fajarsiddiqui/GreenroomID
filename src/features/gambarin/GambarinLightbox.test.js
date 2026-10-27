import assert from 'node:assert/strict'
import test from 'node:test'
import React, { act } from 'react'
import { JSDOM } from 'jsdom'
import { createServer } from 'vite'

test('lightbox stays in a portal and closes only through explicit controls', async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost/' })
  const previous = { window: globalThis.window, document: globalThis.document,
    HTMLElement: globalThis.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT }
  Object.assign(globalThis, { window: dom.window, document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true })
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
  const { createRoot } = await import('react-dom/client')
  const { GalleryLightbox } = await vite.ssrLoadModule('/src/features/gambarin/GambarinPage.jsx')
  const root = createRoot(document.getElementById('root'))
  let closes = 0
  let downloads = 0
  const onClose = () => { closes++ }
  const props = { onClose, onImageError: () => {}, onDownload: () => { downloads++ } }
  try {
    await act(async () => root.render(React.createElement(GalleryLightbox, {
      ...props, item: { jobId: 'job-1', phase: 'loading' },
    })))
    const dialog = document.querySelector('[role="dialog"]')
    const content = dialog.querySelector('.gb-lightbox-content')
    assert.equal(dialog.parentElement, document.body)
    assert.match(content.textContent, /Memuat gambar asli/)
    await act(async () => root.render(React.createElement(GalleryLightbox, {
      ...props, item: { jobId: 'job-1', phase: 'ready', url: 'https://cdn.example.invalid/image', mock: false },
    })))
    assert.equal(document.querySelector('.gb-lightbox-content'), content)
    assert.equal(document.querySelector('.gb-lightbox-media img')?.getAttribute('src'),
      'https://cdn.example.invalid/image')
    const downloadButton = [...document.querySelectorAll('.gb-lightbox-content button')]
      .find(button => button.textContent === 'Unduh gambar')
    assert.ok(downloadButton)
    downloadButton.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
    assert.equal(downloads, 1)
    assert.equal(closes, 0)
    await act(async () => root.render(React.createElement(GalleryLightbox, {
      ...props, item: { jobId: 'job-1', phase: 'ready', url: 'https://cdn.example.invalid/image',
        mock: false, downloading: true },
    })))
    assert.equal(document.querySelector('.gb-lightbox-footer button').disabled, true)
    assert.match(document.querySelector('.gb-lightbox-footer').textContent, /Mengunduh/)
    content.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
    assert.equal(closes, 0)
    dialog.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
    assert.equal(closes, 1)
    dom.window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape' }))
    assert.equal(closes, 2)
    document.querySelector('[aria-label="Tutup gambar"]').dispatchEvent(
      new dom.window.MouseEvent('click', { bubbles: true }))
    assert.equal(closes, 3)
  } finally {
    await act(async () => root.unmount())
    await vite.close()
    dom.window.close()
    Object.assign(globalThis, previous)
  }
})
