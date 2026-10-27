import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabase'
import '../features/gambarin/gambarin.css'

const pageSize = 25
const errorMessages = {
  unauthorized: 'Sesi admin berakhir. Silakan masuk kembali.',
  forbidden: 'Akun ini tidak memiliki izin admin.',
  username_taken: 'Username sudah digunakan.',
  invalid_username: 'Username hanya boleh berisi huruf kecil, angka, titik, garis bawah, atau tanda hubung.',
  invalid_package: 'Pilih durasi paket yang aktif.',
  invalid_status: 'Status akun sudah berubah. Muat ulang daftar.',
  account_not_found: 'Akun tidak ditemukan. Muat ulang daftar.',
  not_found: 'Tindakan ini belum tersedia pada backend yang sedang aktif.',
  origin_not_allowed: 'Alamat halaman lokal belum diizinkan pada konfigurasi admin.',
  account_creation_needs_review: 'Pembuatan akun perlu diperiksa sebelum mencoba lagi.',
  account_activation_needs_review: 'Akun dibuat, tetapi aktivasi perlu diperiksa sebelum mencoba lagi.',
}

async function adminRequest(functionName, path = '', { method = 'GET', body } = {}) {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession()
  if (sessionError || !session?.access_token) throw new Error(errorMessages.unauthorized)
  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${functionName}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(errorMessages[result.error] || 'Permintaan gagal. Periksa daftar sebelum mencoba lagi.')
  return result
}

function formatDate(value) {
  return value ? new Date(value).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '—'
}

function accountStatus(account) {
  if (account.status === 'disabled') return 'Nonaktif'
  if (account.status === 'pending') return 'Menunggu'
  return Date.parse(account.expires_at) <= Date.now() ? 'Kedaluwarsa' : 'Aktif'
}

function AdminGambarinPage() {
  const [packages, setPackages] = useState([])
  const [accounts, setAccounts] = useState([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [username, setUsername] = useState('')
  const [duration, setDuration] = useState('')
  const [quota, setQuota] = useState('')
  const [created, setCreated] = useState(null)
  const [selected, setSelected] = useState(null)
  const [amount, setAmount] = useState('')
  const [actionDuration, setActionDuration] = useState('')

  const load = useCallback(async (targetPage) => {
    setLoading(true)
    try {
      const [packageResult, accountResult] = await Promise.all([
        adminRequest('gambarin-admin-read', '/packages'),
        adminRequest('gambarin-admin-read', `/accounts?page=${targetPage}&page_size=${pageSize}`),
      ])
      setPackages(packageResult.packages || [])
      setAccounts(accountResult.accounts || [])
      setTotal(accountResult.total || 0)
    } catch (cause) {
      setError(cause.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load(page) }, [load, page])

  const chosenPackage = packages.find((item) => item.duration_days === Number(duration))
  const availablePackages = packages.filter((item) => item.is_active)
  const remainingPages = Math.max(1, Math.ceil(total / pageSize))

  async function createAccount(event) {
    event.preventDefault()
    if (busy || !chosenPackage) return
    const desiredQuota = Number(quota)
    const baseQuota = chosenPackage.default_image_quota
    if (!Number.isSafeInteger(desiredQuota) || desiredQuota < baseQuota || desiredQuota > 2147483647) {
      setError(`Kuota awal harus minimal ${baseQuota} sesuai paket.`)
      return
    }
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const result = await adminRequest('gambarin-admin-create', '', {
        method: 'POST', body: { username: username.trim().toLowerCase(), duration_days: Number(duration) },
      })
      // Keep the one-time password visible even if the subsequent quota adjustment fails.
      setCreated({ username: result.account.username, password: result.initial_password })
      setUsername('')
      setQuota(String(baseQuota))
      if (desiredQuota > baseQuota) {
        try {
          await adminRequest('gambarin-admin-manage', '/add-quota', {
            method: 'POST', body: { account_id: result.account.id, additional_images: desiredQuota - baseQuota },
          })
          setNotice('Akun dan kuota berhasil dibuat.')
        } catch {
          setError('Akun sudah dibuat. Penambahan kuota belum terkonfirmasi; periksa daftar sebelum mengulangnya.')
        }
      } else {
        setNotice('Akun berhasil dibuat.')
      }
      setPage(1)
      await load(1)
    } catch (cause) {
      setError(cause.message)
    } finally {
      setBusy(false)
    }
  }

  async function manageAccount(operation, value) {
    if (!selected || busy) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const field = operation === 'add-quota' ? 'additional_images' : operation === 'extend' ? 'additional_days' : operation === 'reactivate' ? 'duration_days' : null
      await adminRequest('gambarin-admin-manage', `/${operation}`, {
        method: 'POST', body: { account_id: selected.id, ...(field ? { [field]: value } : {}) },
      })
      setSelected(null)
      setAmount('')
      setNotice('Perubahan akun tersimpan.')
      await load(page)
    } catch (cause) {
      setError(cause.message)
    } finally {
      setBusy(false)
    }
  }

  function openAction(account, operation) {
    setError('')
    setSelected({ ...account, operation })
    setAmount('')
    setActionDuration(String(availablePackages[0]?.duration_days || ''))
  }

  const inputClass = 'gb-admin-input w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-600'
  const buttonClass = 'gb-admin-primary rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50'

  return (
    <div className="gb-admin space-y-5 text-slate-800">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Gambarin AI</h1>
        <p className="mt-1 text-sm text-slate-500">Akun pelanggan dan kuota gambar</p>
      </div>

      {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
      {notice && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</div>}

      {created && <section aria-label="Password awal" className="gb-admin-secret rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
        <h2 className="font-semibold text-amber-950">Password awal: {created.username}</h2>
        <p className="mt-1 text-sm text-amber-800">Simpan sekarang. Password ini hanya ditampilkan sekali.</p>
        <code className="mt-3 block break-all rounded-lg bg-white p-3 text-sm text-slate-900">{created.password}</code>
        <button type="button" onClick={() => setCreated(null)} className="mt-3 rounded-lg bg-amber-900 px-3 py-2 text-sm font-semibold text-white">Saya sudah menyimpan</button>
      </section>}

      <section className="gb-admin-card rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold">Tambah akun</h2>
        <form onSubmit={createAccount} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <label className="text-sm font-medium">Username
            <input className={`${inputClass} mt-1`} value={username} onChange={(event) => setUsername(event.target.value)} maxLength={64} pattern="[A-Za-z0-9][A-Za-z0-9_.-]*" required autoComplete="off" />
          </label>
          <label className="text-sm font-medium">Durasi
            <select className={`${inputClass} mt-1`} value={duration} onChange={(event) => {
              setDuration(event.target.value)
              const pack = packages.find((item) => item.duration_days === Number(event.target.value))
              setQuota(pack ? String(pack.default_image_quota) : '')
            }} required><option value="">Pilih paket</option>{availablePackages.map((pack) => <option key={pack.id} value={pack.duration_days}>{pack.name}</option>)}</select>
          </label>
          <label className="text-sm font-medium">Kuota awal
            <input className={`${inputClass} mt-1`} type="number" min={chosenPackage?.default_image_quota ?? 0} max="2147483647" value={quota} onChange={(event) => setQuota(event.target.value)} required disabled={!chosenPackage} />
          </label>
          <div className="flex items-end"><button className={`${buttonClass} w-full`} disabled={busy || loading || !chosenPackage || Boolean(created)}>Buat akun</button></div>
        </form>
        {chosenPackage && <p className="mt-2 text-xs text-slate-500">Kuota paket {chosenPackage.default_image_quota}; nilai lebih besar ditambahkan setelah akun dibuat.</p>}
      </section>

      <section className="gb-admin-card rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">Akun pelanggan <span className="text-sm font-normal text-slate-500">({total})</span></h2><button type="button" onClick={() => { setError(''); void load(page) }} className="rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50">Muat ulang</button></div>
        {loading ? <p className="text-sm text-slate-500">Memuat akun...</p> : accounts.length === 0 ? <p className="text-sm text-slate-500">Belum ada akun pada halaman ini.</p> : <div className="overflow-x-auto">
          <table className="w-full min-w-[780px] text-left text-sm">
            <thead className="border-b border-slate-200 text-xs text-slate-500"><tr><th className="pb-3">Username</th><th className="pb-3">Status</th><th className="pb-3">Masa aktif</th><th className="pb-3">Sisa kuota</th><th className="pb-3">Terpakai</th><th className="pb-3">Tindakan</th></tr></thead>
            <tbody>{accounts.map((account) => <tr key={account.id} className="border-b border-slate-100 last:border-0">
              <td data-label="Username" className="py-3 font-semibold">{account.username}</td>
              <td data-label="Status" className="py-3">{accountStatus(account)}</td>
              <td data-label="Masa aktif" className="py-3">{formatDate(account.expires_at)}</td>
              <td data-label="Sisa kuota" className="py-3 font-semibold">{account.quota_granted - account.quota_used - account.quota_reserved}<span className="ml-1 text-xs font-normal text-slate-500">({account.quota_reserved} tertahan)</span></td>
              <td data-label="Terpakai" className="py-3">{account.quota_used}</td>
              <td data-label="Tindakan" className="py-3"><div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => openAction(account, 'add-quota')} className="text-emerald-700 hover:underline">+ Kuota</button>
                <button type="button" onClick={() => openAction(account, 'extend')} className="text-emerald-700 hover:underline">Perpanjang</button>
                {account.status === 'disabled' ? <button type="button" onClick={() => openAction(account, 'reactivate')} className="hover:underline">Aktifkan</button> : account.status === 'active' ? <button type="button" onClick={() => openAction(account, 'disable')} className="gb-admin-danger hover:underline">Nonaktifkan</button> : null}
              </div></td>
            </tr>)}</tbody>
          </table>
        </div>}
        <div className="mt-4 flex items-center justify-end gap-3 text-sm"><button type="button" disabled={page <= 1 || loading} onClick={() => setPage(page - 1)} className="disabled:opacity-40">Sebelumnya</button><span>{page} / {remainingPages}</span><button type="button" disabled={page >= remainingPages || loading} onClick={() => setPage(page + 1)} className="disabled:opacity-40">Berikutnya</button></div>
      </section>

      {selected && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setSelected(null) }}>
        <section role="dialog" aria-modal="true" aria-label="Kelola akun Gambarin" className="gb-admin-dialog w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
          <h2 className="text-lg font-semibold">{selected.operation === 'add-quota' ? 'Tambah kuota' : selected.operation === 'extend' ? 'Perpanjang masa aktif' : selected.operation === 'reactivate' ? 'Aktifkan kembali' : 'Nonaktifkan akun'}</h2>
          <p className="mt-1 text-sm text-slate-500">{selected.username}</p>
          {selected.operation === 'reactivate' ? <label className="mt-4 block text-sm">Durasi baru<select className={`${inputClass} mt-1`} value={actionDuration} onChange={(event) => setActionDuration(event.target.value)}>{availablePackages.map((pack) => <option key={pack.id} value={pack.duration_days}>{pack.name}</option>)}</select></label> : selected.operation !== 'disable' ? <label className="mt-4 block text-sm">{selected.operation === 'extend' ? 'Tambahan hari' : 'Tambahan gambar'}<input className={`${inputClass} mt-1`} type="number" min="1" max={selected.operation === 'extend' ? 365 : 2147483647} value={amount} onChange={(event) => setAmount(event.target.value)} /></label> : <p className="mt-4 text-sm text-rose-700">Akun ini tidak dapat mengirim permintaan gambar baru.</p>}
          <div className="mt-5 flex justify-end gap-2"><button type="button" disabled={busy} onClick={() => setSelected(null)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm">Batal</button><button type="button" disabled={busy || (selected.operation !== 'disable' && !(selected.operation === 'reactivate' ? Number(actionDuration) > 0 : Number.isSafeInteger(Number(amount)) && Number(amount) > 0))} onClick={() => void manageAccount(selected.operation, selected.operation === 'reactivate' ? Number(actionDuration) : selected.operation === 'disable' ? null : Number(amount))} className={buttonClass}>{busy ? 'Menyimpan...' : 'Simpan'}</button></div>
        </section>
      </div>}
    </div>
  )
}

export default AdminGambarinPage
