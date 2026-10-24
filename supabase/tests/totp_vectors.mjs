import assert from 'node:assert/strict'
import { webcrypto as crypto } from 'node:crypto'

// Keep these helpers identical in shop-issue-totp/index.ts and tests/totp_vectors.mjs.
function decodeBase32(secret = '') {
  const normalized = secret.replace(/\s/g, '').toUpperCase().replace(/=+$/, '')
  if (!normalized || !/^[A-Z2-7]+$/.test(normalized)) throw new Error('invalid_totp_secret')
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  const output = []
  let buffer = 0
  let bits = 0
  for (const character of normalized) {
    buffer = (buffer << 5) | alphabet.indexOf(character)
    bits += 5
    if (bits >= 8) {
      bits -= 8
      output.push((buffer >>> bits) & 255)
      buffer &= (1 << bits) - 1
    }
  }
  return Uint8Array.from(output)
}
async function hotp(secretBytes = new Uint8Array(), counter = 0) {
  const message = new Uint8Array(8)
  let value = BigInt(counter)
  for (let index = 7; index >= 0; index -= 1) {
    message[index] = Number(value & 255n)
    value >>= 8n
  }
  const key = await crypto.subtle.importKey('raw', secretBytes, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign'])
  const digest = new Uint8Array(await crypto.subtle.sign('HMAC', key, message))
  const offset = digest[digest.length - 1] & 15
  const binary = ((digest[offset] & 127) << 24) | (digest[offset + 1] << 16)
    | (digest[offset + 2] << 8) | digest[offset + 3]
  return String(binary % 1000000).padStart(6, '0')
}
async function totp(secret = '', windowStartMs = 0) {
  return hotp(decodeBase32(secret), Math.floor(windowStartMs / 30000))
}

const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'
for (const [seconds, expected] of [[59, '287082'], [1111111109, '081804'], [1111111111, '050471'], [1234567890, '005924'], [2000000000, '279037']]) {
  assert.equal(await totp(secret, seconds * 1000), expected, `T=${seconds}`)
}
console.log('PASS: RFC 6238 SHA-1, all 5 six-digit vectors')

