import { createClient } from 'npm:@supabase/supabase-js@2'
import { ImageMagick, initializeImageMagick, MagickFormat } from 'npm:@imagemagick/magick-wasm@0.0.43'
import { createHandler } from './handler.js'
import { makeWebpThumbnail } from './convert.js'

// Supabase documents magick-wasm for Edge Functions; Sharp requires native
// libraries unavailable in this runtime.
const wasm = await Deno.readFile(new URL(
  import.meta.resolve('npm:@imagemagick/magick-wasm@0.0.43/magick.wasm')))
await initializeImageMagick(wasm)

const convert = (bytes: Uint8Array) => makeWebpThumbnail(ImageMagick, MagickFormat, bytes)

Deno.serve(createHandler({ createClient, env: name => Deno.env.get(name), fetchImpl: fetch,
  convert, diagnostic: event => console.info(JSON.stringify({ component: 'gambarin-thumbnail-worker', ...event })) }))
