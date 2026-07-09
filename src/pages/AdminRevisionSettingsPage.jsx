import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase'
import { badgeClass, statusLabel, statusOutlineClass } from '../utils/status'

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
  if (!row.revision_started_at) return { key: 'inactive', label: 'Belum aktif', className: 'bg-gray-100 text-gray-700 border-gray-200' }
  const deadline = row.revision_deadline_at ? new Date(row.revision_deadline_at) : null
  const limit = Number(row.revision_limit || 0)
  const used = Number(row.revision_used_count || 0)

  if (deadline && deadline < new Date()) return { key: 'ended', label: 'Berakhir', className: 'bg-red-100 text-red-700 border-red-200' }
  if (limit > 0 && used >= limit) return { key: 'ended', label: 'Kuota habis', className: 'bg-amber-100 text-amber-700 border-amber-200' }
  return { key: 'active', label: 'Aktif', className: 'bg-green-100 text-green-700 border-green-200' }
}

function daysRemaining(row) {
  if (!row.revision_deadline_at) return 0
  return Math.max(0, Math.ceil((new Date(row.revision_deadline_at).getTime() - Date.now()) / 86400000))
}

function ViewGridIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor">
      <path d="M1.5 1.5h5v5h-5v-5Zm8 0h5v5h-5v-5Zm-8 8h5v5h-5v-5Zm8 0h5v5h-5v-5Z" />
    </svg>
  )
}

function ViewListIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor">
      <path d="M2 3h2v2H2V3Zm4 .25h8v1.5H6v-1.5ZM2 7h2v2H2V7Zm4 .25h8v1.5H6v-1.5ZM2 11h2v2H2v-2Zm4 .25h8v1.5H6v-1.5Z" />
    </svg>
  )
}

function AdminRevisionSettingsPage({ user }) {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [requests, setRequests] = useState([])
  const [rowEdits, setRowEdits] = useState({})
  const [loading, setLoading] = useState(true)
  const [savingSettings, setSavingSettings] = useState(false)
  const [savingRowId, setSavingRowId] = useState(null)
  const [errorMessage, setErrorMessage] = useState('')
  const [showEnded, setShowEnded] = useState(false)
  const [viewMode, setViewMode] = useState('grid')

  const activeCount = useMemo(() => requests.filter((row) => getRevisionState(row).key === 'active').length, [requests])
  const endedCount = useMemo(() => requests.filter((row) => getRevisionState(row).key === 'ended').length, [requests])

  const visibleRequests = useMemo(() => {
    return [...requests]
      .filter((row) => showEnded || getRevisionState(row).key === 'active')
      .sort((a, b) => {
        const stateA = getRevisionState(a).key === 'active' ? 0 : 1
        const stateB = getRevisionState(b).key === 'active' ? 0 : 1
        const startedA = a.revision_started_at ? new Date(a.revision_started_at).getTime() : Number.MAX_SAFE_INTEGER
        const startedB = b.revision_started_at ? new Date(b.revision_started_at).getTime() : Number.MAX_SAFE_INTEGER
        const deadlineA = a.revision_deadline_at ? new Date(a.revision_deadline_at).getTime() : Number.MAX_SAFE_INTEGER
        const deadlineB = b.revision_deadline_at ? new Date(b.revision_deadline_at).getTime() : Number.MAX_SAFE_INTEGER
        return stateA - stateB || startedA - startedB || deadlineA - deadlineB
      })
  }, [requests, showEnded])

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
      .order('revision_started_at', { ascending: true })

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
    // H37: efek initial load sengaja berjalan sekali saat halaman admin revisi dibuka.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      alert('Pengaturan waktu revisi berhasil disimpan. Request baru yang masuk masa revisi akan memakai durasi ini.')
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

  const renderRequestEditor = (request, compact = false) => {
    const state = getRevisionState(request)
    const edit = rowEdits[request.id] || {}
    const remaining = Math.max(0, Number(edit.revision_limit || 0) - Number(edit.revision_used_count || 0))

    return (
      <div key={request.id} className={(compact ? 'min-h-44 ' : '') + 'border-2 rounded-2xl bg-white p-4 shadow-sm transition hover:shadow-md hover:ring-4 ' + statusOutlineClass(request.status)}>
        <div className="flex flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="font-bold text-gray-800 truncate">{request.judul}</h4>
                <span className={'inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ' + state.className}>{state.label}</span>
              </div>
              <p className="text-xs text-gray-400 mt-1 truncate">{request.client_email}</p>
            </div>
            {!compact && <span className={badgeClass(request.status)}>{statusLabel(request.status)}</span>}
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs text-gray-500">
            <span>Mulai: {formatTanggalJam(request.revision_started_at)}</span>
            <span>Deadline: {formatTanggalJam(request.revision_deadline_at)}</span>
            <span>Sisa hari: {daysRemaining(request)}</span>
            <span>Sisa kuota: {remaining}x</span>
          </div>

          {!compact && (
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
          )}

          <button onClick={() => saveRequestRevision(request)} disabled={savingRowId === request.id} className="bg-blue-600 text-white px-4 py-3 rounded-xl text-sm transition hover:bg-blue-700 disabled:opacity-50">
            {savingRowId === request.id ? 'Menyimpan...' : compact ? 'Simpan' : 'Simpan Request'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 pt-20 space-y-6">
      <div>
        <p className="text-xs text-gray-400 mb-1">Admin / Waktu Revisi</p>
        <h2 className="text-2xl font-bold text-gray-900">Laci Waktu Revisi</h2>
        <p className="text-sm text-gray-500 mt-1">Request aktif ditampilkan otomatis. Request yang berakhir disembunyikan sampai tombol filter berakhir diaktifkan.</p>
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
            <p className="text-sm text-gray-500 mt-1">Dipakai otomatis saat admin mengupload file hasil final pertama kali. Request yang sudah aktif tetap memakai deadline yang sudah tersimpan.</p>
          </div>
          <button onClick={saveSettings} disabled={savingSettings || loading} className="bg-gray-900 text-white px-5 py-3 rounded-xl text-sm transition hover:bg-gray-800 disabled:opacity-50">
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
            <p className="text-sm text-gray-500 mt-1">{activeCount} request aktif. {endedCount} request berakhir disembunyikan.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-xl border border-gray-200 bg-gray-50 p-1" aria-label="Pilihan tampilan masa revisi">
              <button type="button" onClick={() => setViewMode('grid')} title="Tampilan kotak" aria-label="Tampilan kotak" className={'inline-flex h-10 w-10 items-center justify-center rounded-lg transition ' + (viewMode === 'grid' ? 'bg-gray-900 text-white shadow-sm' : 'text-gray-500 hover:bg-white hover:text-gray-900')}><ViewGridIcon /></button>
              <button type="button" onClick={() => setViewMode('list')} title="Tampilan detail" aria-label="Tampilan detail" className={'inline-flex h-10 w-10 items-center justify-center rounded-lg transition ' + (viewMode === 'list' ? 'bg-gray-900 text-white shadow-sm' : 'text-gray-500 hover:bg-white hover:text-gray-900')}><ViewListIcon /></button>
            </div>
            <button onClick={() => setShowEnded((current) => !current)} className={'px-4 py-3 rounded-xl text-sm transition ' + (showEnded ? 'bg-gray-900 text-white hover:bg-gray-800' : 'bg-gray-100 text-gray-700 hover:bg-gray-200')}>
              {showEnded ? 'Sembunyikan berakhir' : 'Tampilkan berakhir'}
            </button>
            <button onClick={fetchData} disabled={loading} className="bg-white border border-gray-200 text-gray-700 px-4 py-3 rounded-xl text-sm transition hover:bg-gray-50 disabled:opacity-50">
              Refresh
            </button>
          </div>
        </div>

        {loading ? (
          <p className="text-center text-gray-400 py-10">Memuat request...</p>
        ) : visibleRequests.length === 0 ? (
          <div className="border border-gray-100 rounded-2xl p-8 text-center text-gray-400">Belum ada request yang masuk filter masa revisi.</div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {visibleRequests.map((request) => renderRequestEditor(request, true))}
          </div>
        ) : (
          <div className="space-y-4">
            {visibleRequests.map((request) => renderRequestEditor(request, false))}
          </div>
        )}
      </div>
    </div>
  )
}

export default AdminRevisionSettingsPage
