import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import { webcrypto } from 'node:crypto'
import { stripTypeScriptTypes } from 'node:module'

const source = (await readFile(new URL('../functions/shop-admin-otp-codes/index.ts', import.meta.url), 'utf8'))
  .replace("import { createClient } from 'npm:@supabase/supabase-js@2'", 'const createClient = globalThis.__createClient')
const code = stripTypeScriptTypes(source)
const keyBytes = new Uint8Array(32).fill(7)
const aesKey = await webcrypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt'])
const iv = new Uint8Array(12).fill(3)
const ciphertext = await webcrypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey,
  new TextEncoder().encode('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'))
const encoded = Buffer.concat([Buffer.from(iv), Buffer.from(ciphertext)]).toString('base64')
let isAdmin = true
let auditFails = false
let audited = []
let handler
const accounts = [
  { id: '00000000-0000-0000-0000-000000000001', email: 'one@example.com', totp_secret_enc: encoded },
  { id: '00000000-0000-0000-0000-000000000002', email: 'two@example.com', totp_secret_enc: encoded }
]
const accountQuery = {
  eq() { return this }, not() { return this }, neq() { return this }, order() { return this },
  async range() { return { data: accounts, count: accounts.length, error: null } }
}
const caller = { auth: { async getUser() { return { data: { user: { id: 'admin-id' } }, error: null } } },
  async rpc() { return { data: isAdmin, error: null } } }
const service = { from(table) { return table === 'shop_accounts'
  ? { select() { return accountQuery } }
  : { async insert(rows) { audited = rows; return { error: auditFails ? { message: 'audit_failed' } : null } } } } }
class FixedDate extends Date { static now() { return 59000 } }
runInNewContext(code, {
  __createClient: (_url, key) => key === 'service' ? service : caller,
  Deno: { env: { get(name) { return {
    SHOP_ALLOWED_ORIGIN: 'https://example.com', SUPABASE_URL: 'https://supabase.example',
    SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service',
    ACCOUNT_ENC_KEY: Buffer.from(keyBytes).toString('hex')
  }[name] } }, serve(callback) { handler = callback } },
  crypto: webcrypto, Date: FixedDate, Request, Response, TextDecoder, Uint8Array,
  atob, BigInt, TextEncoder, console
})
const request = () => new Request('https://example.com/otp', {
  method: 'POST', headers: { Origin: 'https://example.com', Authorization: 'Bearer admin-jwt' },
  body: JSON.stringify({ page: 0 })
})

let response = await handler(request())
assert.equal(response.status, 200)
let body = await response.json()
assert.equal(body.accounts.length, 2)
assert.equal(body.accounts[0].code, '287082') // RFC 6238 vector at 59 seconds, six digits
assert.equal(body.accounts[1].code, '287082')
assert.equal(body.window_end_ms, 60000)
assert.equal(audited.length, 2)
assert.equal(audited[0].detail.account_id, accounts[0].id)
assert.equal(audited[0].detail.admin_id, 'admin-id')

isAdmin = false
audited = []
response = await handler(request())
assert.equal(response.status, 403)
assert.equal(audited.length, 0)

isAdmin = true
auditFails = true
response = await handler(request())
assert.equal(response.status, 500)
body = await response.json()
assert.equal('accounts' in body, false)
console.log('PASS: admin OTP codes, admin authorization, and audit failure')
