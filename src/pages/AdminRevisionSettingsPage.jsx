import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase'
import { badgeClass, statusLabel } from '../utils/status'

const DEFAULT_SETTINGS = {
  id: 'default',
  free_revision_count: 2,
  revision_window_days: 14,
  policy_text: 'Free revisi setelah file diterima adalah 2 kali dalam waktu 2 minggu. Jika tidak ada revisi selama waktu tersebut, file dianggap selesai dikerjakan dan diterima dengan baik oleh client.'
}

function toDatetimeLocal(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const offset = date.getTimezoneOffset()
  const localDate = new Date(date.getTime() - offset * 60000)
  return localDate.toISOString().slice(0, 16)
}

function fromDatetimeLocal(value) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString()
}

function formatTanggalJam(value) {
  if (!value) return '-'
  return new Date(value).toLocaleString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function getRevisionState(row) {
  if (!row.revision_started_at) return { label: 'Belum aktif', className: 'bg-gray-100 text-gray-700 border-gray-200' }
  const deadline = row.revision_deadline_at ? new Date(row.revision_deadline_at) : null
  const limit = Number(row.revision_limit || 0)
  const used = Number(row.revision_used_count || 0)

  if (deadline && deadline < new Date()) return { label: 'Berakhir', className: 'bg-red-100 text-red-700 border-red-200' }
  if (limit > 0 && used >= limit) return { label: 'Kuota habis', className: 'bg-amber-100 text-amber-700 border-amber-200' }
  return { label: 'Aktif', className: 'bg-green-100 text-green-700 border-green-200' }
}

function AdminRevisionSettingsPage({ user }) {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [requests, setRequests] = useState([])
  const [rowEdits, setRowEdits] = useState({})
  const [loading, setLoading] = useState(true)
  const [savingSettings, setSavingSettings] = useState(false)
  const [savingRowId, setSavingRowId] = useState(null)
  const [errorMessage, setErrorMessage] = useState('')

  const activeCount = useMemo(() => requests.filter((row) => getRevisionState(row).label === 'Aktif').length, [requests])

  const fetchSettings = async () => {
    const { data, error } = await supabase
      .from('revision_settings')
      .select('*')
      .eq('id', 'default')
      .maybeSingle()

    if (error) throw error
    setSettings({ ...DEFAULT_SETTINGS, ...(data || {}) })
  }

  const fetchRevisionRequests = async () => {
    const { data, error } = await supabase
      .from('requests')
      .select('id, judul, client_email, status, payment_status, invoice_status, revision_started_at, revision_deadline_at, revision_limit, revision_used_count, revision_window_days, revision_policy_note')
      .not('revision_started_at', 'is', null)
      .is('deleted_at', null)
      .order('revision_deadline_at', { ascending: true })

    if (error) throw error
    const rows = data || []
    setRequests(rows)
    setRowEdits(rows.reduce((acc, row) => {
      acc[row.id] = {
        revision_deadline_at: toDatetimeLocal(row.revision_deadline_at),
        revision_limit: row.revision_limit ?? DEFAULT_SETTINGS.free_revision_count,
        revision_used_count: row.revision_used_count ?? 0,
        revision_policy_note: row.revision_policy_note || DEFAULT_SETTINGS.policy_text
      }
      return acc
    }, {}))
  }

  const fetchData = async () => {
    setLoading(true)
    setErrorMessage('')
    try {
      await fetchSettings()
      await fetchRevisionRequests()
    } catch (error) {
      setErrorMessage('Gagal mengambil pengaturan waktu revisi. Pastikan SQL supabase/h6-admin-landing-revision-update.sql sudah dijalankan. Detail: ' + error.message)
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchData()
  }, [])

  const updateSetting = (field, value) => {
    setSettings((current) => ({ ...current, [field]: value }))
  }

  const saveSettings = async () => {
    const freeRevisionCount = Math.max(0, Number(settings.free_revision_count) || 0)
    const revisionWindowDays = Math.max(1, Number(settings.revision_window_days) || 1)

    setSavingSettings(true)
    setErrorMessage('')

    const { error } = await supabase
      .from('revision_settings')
      .upsert({
        id: 'default',
        free_revision_count: freeRevisionCount,
        revision_window_days: revisionWindowDays,
        policy_text: settings.policy_text || DEFAULT_SETTINGS.policy_text,
        updated_by: user.id,
        updated_at: new Date().toISOString()
      }, { onConflict: 'id' })

    if (error) {
      setErrorMessage('Gagal menyimpan pengaturan revisi. Detail: ' + error.message)
    } else {
      alert('Pengaturan waktu revisi berhasil disimpan.')
      fetchData()
    }

    setSavingSettings(false)
  }

  const updateRowEdit = (id, field, value) => {
    setRowEdits((current) => ({
      ...current,
      [id]: {
        ...(current[id] || {}),
        [field]: value
      }
    }))
  }

  const saveRequestRevision = async (request) => {
    const edit = rowEdits[request.id] || {}
    const limit = Math.max(0, Number(edit.revision_limit) || 0)
    const used = Math.max(0, Number(edit.revision_used_count) || 0)
    const deadline = fromDatetimeLocal(edit.revision_deadline_at)

    if (!deadline) {
      alert('Isi batas waktu revisi yang valid.')
      return
    }

    if (used > limit) {
      alert('Jumlah revisi terpakai tidak boleh lebih besar dari kuota revisi.')
      return
    }

    setSavingRowId(request.id)
    setErrorMessage('')

    const { error } = await supabase
      .from('requests')
      .update({
        revision_deadline_at: deadline,
        revision_limit: limit,
        revision_used_count: used,
        revision_policy_note: edit.revision_policy_note || settings.policy_text,
        revision_window_days: Math.max(1, Math.ceil((new Date(deadline).getTime() - new Date(request.revision_started_at).getTime()) / 86400000))
      })
      .eq('id', request.id)

    if (error) {
      setErrorMessage('Gagal memperbarui waktu revisi request. Detail: ' + error.message)
    } else {
      alert('Waktu revisi request berhasil diperbarui.')
      fetchRevisionRequests()
    }

    setSavingRowId(null)
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <p className="text-xs text-gray-400 mb-1">Admin / Waktu Revisi</p>
        <h2 className="text-2xl font-bold text-gray-900">Laci Waktu Revisi</h2>
        <p className="text-sm text-gray-500 mt-1">Atur kuota dan durasi free revisi setelah file hasil diterima client.</p>
      </div>

      {errorMessage && (
        <div className="border border-red-200 bg-red-50 rounded-2xl p-4 text-sm text-red-700">
          {errorMessage}
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm p-5">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-5">
          <div>
            <h3 className="font-bold text-gray-900">Pengaturan Default</h3>
            <p className="text-sm text-gray-500 mt-1">Dipakai otomatis setiap kali admin mengupload file hasil final.</p>
          </div>
          <button onClick={saveSettings} disabled={savingSettings || loading} className="bg-gray-900 text-white px-5 py-3 rounded-xl text-sm hover:bg-gray-800 disabled:opacity-50">
            {savingSettings ? 'Menyimpan...' : 'Simpan Default'}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-600 mb-1">Jumlah Free Revisi</label>
            <input type="number" min="0" value={settings.free_revision_count} onChange={(event) => updateSetting('free_revision_count', event.target.value)} className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm" />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">Durasi Waktu Revisi (hari)</label>
            <input type="number" min="1" value={settings.revision_window_days} onChange={(event) => updateSetting('revision_window_days', event.target.value)} className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm" />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm text-gray-600 mb-1">Keterangan Kebijakan</label>
            <textarea value={settings.policy_text} onChange={(event) => updateSetting('policy_text', event.target.value)} rows={4} className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm" />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm p-5">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-5">
          <div>
            <h3 className="font-bold text-gray-900">Request dengan Masa Revisi</h3>
            <p className="text-sm text-gray-500 mt-1">{activeCount} request masih dalam masa revisi aktif.</p>
          </div>
          <button onClick={fetchData} disabled={loading} className="bg-white border border-gray-200 text-gray-700 px-4 py-3 rounded-xl text-sm hover:bg-gray-50 disabled:opacity-50">
            Refresh
          </button>
        </div>

        {loading ? (
          <p className="text-center text-gray-400 py-10">Memuat request...</p>
        ) : requests.length === 0 ? (
          <div className="border border-gray-100 rounded-2xl p-8 text-center text-gray-400">Belum ada request yang masuk masa revisi.</div>
        ) : (
          <div className="space-y-4">
            {requests.map((request) => {
              const state = getRevisionState(request)
              const edit = rowEdits[request.id] || {}
              const remaining = Math.max(0, Number(edit.revision_limit || 0) - Number(edit.revision_used_count || 0))

              return (
                <div key={request.id} className="border border-gray-100 rounded-2xl p-4">
                  <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3 mb-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="font-bold text-gray-800">{request.judul}</h4>
                        <span className={'inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ' + state.className}>{state.label}</span>
                        <span className={badgeClass(request.status)}>{statusLabel(request.status)}</span>
                      </div>
                      <p className="text-xs text-gray-400 mt-1">{request.client_email}</p>
                      <p className="text-xs text-gray-500 mt-2">Mulai: {formatTanggalJam(request.revision_started_at)} · Deadline: {formatTanggalJam(request.revision_deadline_at)} · Sisa: {remaining}x</p>
                    </div>
                    <button onClick={() => saveRequestRevision(request)} disabled={savingRowId === request.id} className="bg-blue-600 text-white px-4 py-3 rounded-xl text-sm hover:bg-blue-700 disabled:opacity-50">
                      {savingRowId === request.id ? 'Menyimpan...' : 'Simpan Request'}
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Batas Waktu Revisi</label>
                      <input type="datetime-local" value={edit.revision_deadline_at || ''} onChange={(event) => updateRowEdit(request.id, 'revision_deadline_at', event.target.value)} className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Kuota Revisi</label>
                      <input type="number" min="0" value={edit.revision_limit ?? 0} onChange={(event) => updateRowEdit(request.id, 'revision_limit', event.target.value)} className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Revisi Terpakai</label>
                      <input type="number" min="0" value={edit.revision_used_count ?? 0} onChange={(event) => updateRowEdit(request.id, 'revision_used_count', event.target.value)} className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm" />
                    </div>
                    <div className="md:col-span-3">
                      <label className="block text-xs text-gray-500 mb-1">Keterangan Khusus Request</label>
                      <textarea value={edit.revision_policy_note || ''} onChange={(event) => updateRowEdit(request.id, 'revision_policy_note', event.target.value)} rows={3} className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm" />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export default AdminRevisionSettingsPage
