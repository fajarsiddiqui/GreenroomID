import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase'
import { createAuditLog } from '../utils/auditLog'
import { USER_ROLE_LABELS, USER_ROLE_OPTIONS } from '../utils/userProfile'

function AdminAccountsPage({ user }) {
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState(null)
  const [errorText, setErrorText] = useState('')
  const [keyword, setKeyword] = useState('')
  const [roleFilter, setRoleFilter] = useState('')

  const fetchAccounts = async () => {
    setLoading(true)
    setErrorText('')

    const { data, error } = await supabase.rpc('admin_list_accounts')

    if (error) {
      setAccounts([])
      setErrorText(
        'Gagal mengambil daftar akun. Pastikan file SQL supabase/account-management-update.sql sudah dijalankan di Supabase SQL Editor. Detail: ' +
          error.message
      )
    } else {
      setAccounts(data || [])
    }

    setLoading(false)
  }

  useEffect(() => {
    fetchAccounts()
  }, [])

  const formatDate = (value) => {
    if (!value) return '-'
    return new Date(value).toLocaleString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const filteredAccounts = useMemo(() => {
    const search = keyword.trim().toLowerCase()

    return accounts.filter((account) => {
      const haystack = [account.email, account.full_name, account.id]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      if (search && !haystack.includes(search)) return false
      if (roleFilter && account.role !== roleFilter) return false
      return true
    })
  }, [accounts, keyword, roleFilter])

  const roleBadgeClass = (role) => {
    if (role === 'admin') return 'bg-blue-50 text-blue-700'
    if (role === 'freelancer') return 'bg-purple-50 text-purple-700'
    return 'bg-gray-100 text-gray-600'
  }

  const changeRole = async (account, newRole) => {
    if (!newRole || newRole === account.role) return

    if (account.id === user.id && newRole !== 'admin') {
      alert('Akun admin yang sedang dipakai tidak bisa diturunkan rolenya dari halaman ini.')
      return
    }

    const confirmed = window.confirm(
      `Ubah role ${account.email} dari ${USER_ROLE_LABELS[account.role] || account.role} menjadi ${USER_ROLE_LABELS[newRole] || newRole}?`
    )
    if (!confirmed) return

    setSavingId(account.id)

    const { error } = await supabase.rpc('admin_update_user_role', {
      target_user_id: account.id,
      new_role: newRole
    })

    if (error) {
      alert('Gagal mengubah role akun: ' + error.message)
    } else {
      await createAuditLog({
        actorId: user.id,
        actorEmail: user.email,
        actorRole: 'admin',
        action: 'USER_ROLE_UPDATED',
        description: `Admin mengubah role akun ${account.email} dari ${account.role} ke ${newRole}`,
        metadata: {
          target_user_id: account.id,
          target_email: account.email,
          previous_role: account.role,
          new_role: newRole
        }
      })
      await fetchAccounts()
    }

    setSavingId(null)
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <p className="text-xs text-gray-400 mb-1">Admin / Manajemen Akun</p>
          <h2 className="text-2xl font-bold text-gray-900">Manajemen Akun</h2>
          <p className="text-sm text-gray-500 mt-1">
            Lihat akun yang pernah login dan ubah role jika dibutuhkan.
          </p>
        </div>
        <button
          onClick={fetchAccounts}
          className="bg-gray-900 text-white px-5 py-3 rounded-xl text-sm hover:bg-gray-800"
        >
          Refresh
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm p-5 mb-5">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-2">
            <label className="block text-xs text-gray-500 mb-1">Cari akun</label>
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="Cari nama, email, atau user ID..."
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Filter role</label>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm"
            >
              <option value="">Semua role</option>
              {USER_ROLE_OPTIONS.map((role) => (
                <option key={role} value={role}>{USER_ROLE_LABELS[role]}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {errorText && (
        <div className="border border-red-100 bg-red-50 text-red-700 rounded-2xl p-4 mb-5 text-sm">
          {errorText}
        </div>
      )}

      {loading && (
        <div className="bg-white rounded-2xl shadow-sm p-10 text-center text-gray-400">
          Memuat daftar akun...
        </div>
      )}

      {!loading && !errorText && filteredAccounts.length === 0 && (
        <div className="bg-white rounded-2xl shadow-sm p-10 text-center">
          <p className="text-4xl mb-3">👤</p>
          <p className="text-gray-500">Belum ada akun yang cocok dengan filter.</p>
        </div>
      )}

      {!loading && !errorText && filteredAccounts.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <p className="font-bold text-gray-800">Daftar Akun</p>
            <span className="text-xs text-gray-400">{filteredAccounts.length} akun</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-left text-xs text-gray-500">
                  <th className="px-5 py-3 font-medium">Akun</th>
                  <th className="px-5 py-3 font-medium">Role Saat Ini</th>
                  <th className="px-5 py-3 font-medium">Ubah Role</th>
                  <th className="px-5 py-3 font-medium">Dibuat</th>
                  <th className="px-5 py-3 font-medium">Login Terakhir</th>
                </tr>
              </thead>
              <tbody>
                {filteredAccounts.map((account) => (
                  <tr key={account.id} className="border-b border-gray-50 align-top">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        {account.avatar_url ? (
                          <img src={account.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover" />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 font-bold">
                            {(account.email || '?').slice(0, 1).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <p className="font-medium text-gray-900">{account.full_name || '-'}</p>
                          <p className="text-xs text-gray-500">{account.email}</p>
                          <p className="text-[11px] text-gray-300 mt-1">{account.id}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <span className={'inline-flex px-2 py-1 rounded-full text-[11px] ' + roleBadgeClass(account.role)}>
                        {USER_ROLE_LABELS[account.role] || account.role}
                      </span>
                      {account.id === user.id && (
                        <p className="text-[11px] text-gray-400 mt-2">Akun sedang dipakai</p>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <select
                        value={account.role || 'client'}
                        onChange={(e) => changeRole(account, e.target.value)}
                        disabled={savingId === account.id}
                        className="border border-gray-300 rounded-xl px-3 py-2 text-sm disabled:opacity-50"
                      >
                        {USER_ROLE_OPTIONS.map((role) => (
                          <option key={role} value={role}>{USER_ROLE_LABELS[role]}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-5 py-4 text-gray-600 whitespace-nowrap">{formatDate(account.created_at)}</td>
                    <td className="px-5 py-4 text-gray-600 whitespace-nowrap">
                      {formatDate(account.last_sign_in_at || account.last_seen_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

export default AdminAccountsPage
