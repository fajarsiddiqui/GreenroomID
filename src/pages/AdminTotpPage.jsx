import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabase'
import TotpToast from '../components/TotpToast'
import useTotpToast from '../hooks/useTotpToast'
import '../styles/totp.css'

const emptyForm = { name: '', secret: '', expiresAt: '' }
const toIso = (value) => value ? new Date(value).toISOString() : null
const formatDate = (value) => value ? new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'Tanpa kedaluwarsa'
const tokenStatus = (token) => token.revoked_at ? 'Dicabut' : token.used_at ? 'Sudah digunakan' : 'Belum digunakan'

async function call(method, body) {
  const { data } = await supabase.auth.getSession()
  const response = await fetch('/api/admin/totp', {
    method,
    headers: {
      'content-type': 'application/json',
      Authorization: `Bearer ${data.session?.access_token || ''}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (response.status === 204) return null
  const result = await response.json()
  if (!response.ok) throw new Error(result.error || 'Gagal memproses permintaan.')
  return result
}

export default function AdminTotpPage() {
  const { toast, showToast, closeToast } = useTotpToast()
  const [accounts, setAccounts] = useState([])
  const [form, setForm] = useState(emptyForm)
  const [editingId, setEditingId] = useState('')
  const [editForm, setEditForm] = useState({ name: '', secret: '' })
  const [tokenExpiry, setTokenExpiry] = useState({})
  const [notice, setNotice] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [copyingToken, setCopyingToken] = useState(false)

  const load = useCallback(async ({ notify = false } = {}) => {
    setLoading(true)
    try {
      const result = await call('GET')
      setAccounts(result.accounts || [])
      if (notify) showToast('Daftar TOTP berhasil diperbarui.')
      return true
    } catch (error) {
      const message = error.message || 'Gagal memuat daftar TOTP.'
      if (notify) showToast(message, 'error')
      else setNotice({ type: 'error', text: message })
      return false
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => { load() }, [load])

  const run = async (key, action, successText, failureText) => {
    if (busy) return false
    setBusy(key)
    setNotice(null)
    try {
      const result = await action()
      if (result?.token) setNotice({ type: 'token', text: 'Token baru dibuat. Salin sekarang karena token hanya ditampilkan sekali.', token: result.token })
      showToast(successText)
      await load()
      return true
    } catch (error) {
      showToast(error.message || failureText, 'error')
      return false
    } finally {
      setBusy('')
    }
  }

  const createAccount = async (event) => {
    event.preventDefault()
    const saved = await run('create', () => call('POST', { ...form, expiresAt: toIso(form.expiresAt) }), 'Akun TOTP berhasil dibuat.', 'Gagal membuat akun TOTP.')
    if (saved) setForm(emptyForm)
  }

  const startEdit = (account) => {
    setEditingId(account.id)
    setEditForm({ name: account.name, secret: '' })
  }

  const saveEdit = async (account) => {
    const payload = { id: account.id, name: editForm.name }
    if (editForm.secret.trim()) payload.secret = editForm.secret
    const saved = await run(`edit-${account.id}`, () => call('PATCH', payload), 'Perubahan akun disimpan.', 'Gagal menyimpan perubahan akun.')
    if (saved) setEditingId('')
  }

  const deleteAccount = async (account) => {
    if (!window.confirm(`Hapus akun TOTP “${account.name}” beserta seluruh tokennya?`)) return
    await run(`delete-${account.id}`, () => call('DELETE', { id: account.id }), 'Akun TOTP berhasil dihapus.', 'Gagal menghapus akun TOTP.')
  }

  const revokeToken = async (token) => {
    if (!window.confirm('Cabut token akses ini?')) return
    await run(`revoke-${token.id}`, () => call('DELETE', { tokenId: token.id }), 'Token berhasil dicabut.', 'Gagal mencabut token.')
  }

  const copyToken = async (token) => {
    if (copyingToken) return
    setCopyingToken(true)
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable')
      await navigator.clipboard.writeText(token)
      showToast('Token berhasil disalin.')
    } catch {
      showToast('Gagal menyalin. Silakan salin secara manual.', 'error')
    } finally {
      setCopyingToken(false)
    }
  }

  return (
    <div className="admin-totp-page">
      <header className="admin-totp-header">
        <div>
          <p className="admin-totp-eyebrow">KEAMANAN</p>
          <h1>Akun TOTP</h1>
          <p>Kelola secret autentikasi dan token akses GreenroomID.</p>
        </div>
        <button type="button" className="admin-totp-button secondary" onClick={() => load({ notify: true })} disabled={loading}>{loading ? 'Memuat...' : 'Muat ulang'}</button>
      </header>

      {notice && (
        <div className={`admin-totp-notice ${notice.type}`} role="status">
          <span>{notice.text}</span>
          {notice.token && <div className="admin-totp-token"><code>{notice.token}</code><button type="button" disabled={copyingToken} onClick={() => copyToken(notice.token)}>{copyingToken ? 'Menyalin...' : 'Salin token'}</button></div>}
        </div>
      )}

      <section className="admin-totp-panel">
        <div className="admin-totp-panel-heading"><div><h2>Tambah akun</h2><p>Secret dienkripsi di server. Token asli hanya tampil satu kali.</p></div></div>
        <form className="admin-totp-form" onSubmit={createAccount}>
          <label><span>Nama akun</span><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Contoh: Email Operasional" required /></label>
          <label><span>Secret Base32</span><input value={form.secret} onChange={(event) => setForm({ ...form, secret: event.target.value })} placeholder="Masukkan secret Base32" autoComplete="off" required /></label>
          <label><span>Kedaluwarsa token <small>(opsional)</small></span><input type="datetime-local" value={form.expiresAt} onChange={(event) => setForm({ ...form, expiresAt: event.target.value })} /></label>
          <button className="admin-totp-button primary" disabled={busy === 'create'}>{busy === 'create' ? 'Menyimpan...' : 'Simpan dan Buat Token'}</button>
        </form>
      </section>

      <section className="admin-totp-panel">
        <div className="admin-totp-panel-heading"><div><h2>Daftar akun</h2><p>{accounts.length} akun TOTP tersedia.</p></div></div>
        {loading ? <p className="admin-totp-empty">Memuat akun...</p> : accounts.length === 0 ? <p className="admin-totp-empty">Belum ada akun TOTP.</p> : (
          <div className="admin-totp-list">
            {accounts.map((account) => (
              <article className="admin-totp-account" key={account.id}>
                <div className="admin-totp-account-head">
                  <div><div className="admin-totp-title-row"><h3>{account.name}</h3><span className={`admin-totp-badge ${account.is_active ? 'active' : 'inactive'}`}>{account.is_active ? 'Aktif' : 'Nonaktif'}</span></div><p>{account.totp_access_tokens.length} token akses</p></div>
                  <div className="admin-totp-account-actions">
                    <button type="button" className="admin-totp-button secondary small" onClick={() => startEdit(account)}>Edit</button>
                    <button type="button" className="admin-totp-button secondary small" disabled={busy === `status-${account.id}`} onClick={() => run(`status-${account.id}`, () => call('PATCH', { id: account.id, isActive: !account.is_active }), `Akun ${account.is_active ? 'dinonaktifkan' : 'diaktifkan'}.`, 'Gagal mengubah status akun.')}>{account.is_active ? 'Nonaktifkan' : 'Aktifkan'}</button>
                    <button type="button" className="admin-totp-button danger small" disabled={busy === `delete-${account.id}`} onClick={() => deleteAccount(account)}>Hapus</button>
                  </div>
                </div>

                {editingId === account.id && <div className="admin-totp-edit"><label><span>Nama akun</span><input value={editForm.name} onChange={(event) => setEditForm({ ...editForm, name: event.target.value })} /></label><label><span>Secret baru <small>(kosongkan jika tidak diganti)</small></span><input value={editForm.secret} onChange={(event) => setEditForm({ ...editForm, secret: event.target.value })} autoComplete="off" /></label><div className="admin-totp-inline-actions"><button type="button" className="admin-totp-button primary small" disabled={busy === `edit-${account.id}`} onClick={() => saveEdit(account)}>{busy === `edit-${account.id}` ? 'Menyimpan...' : 'Simpan'}</button><button type="button" className="admin-totp-button secondary small" onClick={() => setEditingId('')}>Batal</button></div></div>}

                <div className="admin-totp-new-token"><label><span>Kedaluwarsa token baru <small>(opsional)</small></span><input type="datetime-local" value={tokenExpiry[account.id] || ''} onChange={(event) => setTokenExpiry({ ...tokenExpiry, [account.id]: event.target.value })} /></label><button type="button" className="admin-totp-button primary" disabled={busy === `token-${account.id}`} onClick={() => run(`token-${account.id}`, () => call('PUT', { accountId: account.id, expiresAt: toIso(tokenExpiry[account.id]) }), 'Token akses berhasil dibuat.', 'Gagal membuat token akses.')}>{busy === `token-${account.id}` ? 'Membuat...' : 'Buat Token Baru'}</button></div>

                <div className="admin-totp-tokens">
                  {account.totp_access_tokens.length === 0 ? <p className="admin-totp-empty compact">Belum ada token.</p> : account.totp_access_tokens.map((token) => <div className="admin-totp-token-row" key={token.id}><div><strong>{tokenStatus(token)}</strong><span>Dibuat {formatDate(token.created_at)} · {token.used_at ? `Digunakan ${formatDate(token.used_at)} · ` : ''}{token.expires_at ? `Berakhir ${formatDate(token.expires_at)}` : 'Tanpa kedaluwarsa'}</span></div>{!token.revoked_at && <button type="button" className="admin-totp-button danger small" disabled={busy === `revoke-${token.id}`} onClick={() => revokeToken(token)}>{busy === `revoke-${token.id}` ? 'Mencabut...' : 'Cabut Token'}</button>}</div>)}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
      <TotpToast toast={toast} onClose={closeToast} />
    </div>
  )
}
