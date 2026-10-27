import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { ImageMagick, initializeImageMagick, MagickColor, MagickFormat } from '@imagemagick/magick-wasm'
import { makeWebpThumbnail } from './convert.js'

test('WASM conversion produces a bounded 480px WebP without changing ratio', async () => {
  const wasm = await readFile(new URL(import.meta.resolve('@imagemagick/magick-wasm/magick.wasm')))
  await initializeImageMagick(wasm)
  const input = ImageMagick.read(new MagickColor('red'), 960, 480,
    image => image.write(MagickFormat.Png, data => Uint8Array.from(data)))
  const result = makeWebpThumbnail(ImageMagick, MagickFormat, input)
  assert.equal(result.width, 480)
  assert.equal(result.height, 240)
  assert.equal(new TextDecoder().decode(result.bytes.slice(0, 4)), 'RIFF')
  assert.equal(new TextDecoder().decode(result.bytes.slice(8, 12)), 'WEBP')
  assert.ok(result.bytes.length < 60 * 1024)
})
