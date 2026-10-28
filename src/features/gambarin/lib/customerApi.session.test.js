import assert from 'node:assert/strict'
import test from 'node:test'
import { createServer } from 'vite'

test('session check distinguishes valid, expired, account failure, and connection failure', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
  try {
    const { loadGambarinAccount } = await vite.ssrLoadModule('/src/features/gambarin/lib/customerApi.js')
    const account = { id: 'own-account', status: 'active' }
    const client = {
      auth: { getUser: async () => ({ data: { user: { id: 'own-user' } }, error: null }) },
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: account, error: null }) }) }) }),
    }
    assert.deepEqual(await loadGambarinAccount(client), { state: 'authenticated', account })
    client.auth.getUser = async () => ({ error: { name: 'AuthSessionMissingError', status: 400 } })
    assert.deepEqual(await loadGambarinAccount(client), { state: 'signed-out' })
    client.auth.getUser = async () => ({ error: { status: 401, code: 'session_expired' } })
    assert.deepEqual(await loadGambarinAccount(client), { state: 'signed-out' })
    client.auth.getUser = async () => ({ data: { user: { id: 'own-user' } } })
    client.from = () => ({ select: () => ({ eq: () => ({
      maybeSingle: async () => ({ error: { status: 403, code: '42501', message: 'private response' } }),
    }) }) })
    await assert.rejects(loadGambarinAccount(client), /Data akun belum dapat dimuat/)
    client.auth.getUser = async () => { throw new Error('private token') }
    await assert.rejects(loadGambarinAccount(client), /Koneksi data akun terputus/)
  } finally {
    await vite.close()
  }
})
