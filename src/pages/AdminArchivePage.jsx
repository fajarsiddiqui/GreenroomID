import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase'
import { createAuditLog } from '../utils/auditLog'
import Pagination from '../components/Pagination'
import { clientVisibilityLabel, fileKindLabel } from '../utils/status'

function AdminArchivePage({ user }) {
  const [files, setFiles] = useState([])
  const [requests, setRequests] = useState({})
  const [loading, setLoading] = useState(true)
  const [keyword, setKeyword] = useState('')
  const [fileKind, setFileKind] = useState('')
  const [uploaderRole, setUploaderRole] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [showFilterModal, setShowFilterModal] = useState(false)

  const fetchArchive = async () => {
    setLoading(true)

    const { data: fileData, error } = await supabase
      .from('request_files')
      .select('*')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })

    if (error) {
      alert('Gagal mengambil arsip file: ' + error.message)
      setLoading(false)
      return
    }

    setFiles(fileData || [])

    const requestIds = Array.from(new Set((fileData || []).map((file) => file.request_id).filter(Boolean)))
    if (requestIds.length > 0) {
      const { data: reqData } = await supabase
        .from('requests')
        .select('id, judul, client_email, status, payment_status, invoice_status')
        .in('id', requestIds)

      const map = {}
      ;(reqData || []).forEach((req) => { map[String(req.id)] = req })
      setRequests(map)
    } else {
      setRequests({})
    }

    setLoading(false)
  }

  useEffect(() => { fetchArchive() }, [])
  useEffect(() => { setPage(1) }, [keyword, fileKind, uploaderRole, pageSize])

  const formatTanggal = (tanggal) => tanggal ? new Date(tanggal).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'
  const formatFileSize = (size) => size ? `${(Number(size) / 1024 / 1024).toFixed(2)} MB` : '-'
  const activeFilterCount = [keyword, fileKind, uploaderRole].filter((value) => String(value || '').trim()).length

  const resetFilters = () => {
    setKeyword('')
    setFileKind('')
    setUploaderRole('')
  }

  const softDeleteFile = async (file) => {
    const reason = window.prompt('Alasan hapus file? File akan masuk Deleted Items.')
    if (reason === null) return
    if (!window.confirm('Yakin hapus file ini dari arsip utama?')) return

    const { error } = await supabase
      .from('request_files')
      .update({ deleted_at: new Date().toISOString(), deleted_by: user.id, delete_reason: reason || 'Dihapus admin' })
      .eq('id', file.id)

    if (error) {
      alert('Gagal menghapus file: ' + error.message)
      return
    }

    await createAuditLog({
      requestId: file.request_id,
      actorId: user.id,
      actorEmail: user.email,
      actorRole: 'admin',
      action: 'FILE_SOFT_DELETED',
      description: `Admin menghapus sementara file: ${file.file_name}`,
      metadata: { file_id: file.id, file_kind: file.file_kind, delete_reason: reason || null }
    })

    fetchArchive()
  }

  const filteredFiles = files.filter((file) => {
    const req = requests[String(file.request_id)]
    const searchable = [file.file_name, file.file_kind, file.uploader_email, file.uploader_role, req?.judul, req?.client_email].join(' ').toLowerCase()
    if (keyword.trim() && !searchable.includes(keyword.trim().toLowerCase())) return false
    if (fileKind && file.file_kind !== fileKind) return false
    if (uploaderRole && file.uploader_role !== uploaderRole) return false
    return true
  })

  const totalPages = Math.max(1, Math.ceil(filteredFiles.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const pagedFiles = filteredFiles.slice((safePage - 1) * pageSize, safePage * pageSize)
  const fileKindOptions = Array.from(new Set(files.map((file) => file.file_kind).filter(Boolean)))

  return (
    <div className="p-6 pt-20">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-6">
        <div>
          <p className="text-xs text-gray-400 mb-1">Admin / Arsip</p>
          <h2 className="text-2xl font-bold text-gray-900">Arsip File</h2>
          <p className="text-sm text-gray-500 mt-1">Semua file aktif yang diupload oleh client atau admin.</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm p-4 mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-gray-800">{filteredFiles.length} file ditampilkan</p>
          <p className="text-xs text-gray-400">Dari total {files.length} file aktif. Filter disimpan di popup agar halaman tidak penuh.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setShowFilterModal(true)} className="inline-flex items-center gap-2 bg-gray-900 text-white px-5 py-3 rounded-xl text-sm transition hover:bg-gray-800">
            <span>🔎</span>
            Filter
            {activeFilterCount > 0 && <span className="bg-white text-gray-900 text-[10px] px-2 py-0.5 rounded-full">{activeFilterCount}</span>}
          </button>
          {activeFilterCount > 0 && <button onClick={resetFilters} className="bg-gray-100 text-gray-700 px-4 py-3 rounded-xl text-sm transition hover:bg-gray-200">Reset</button>}
        </div>
      </div>

      {showFilterModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 admin-fade-in">
          <div className="w-full max-w-2xl bg-white rounded-3xl shadow-xl overflow-hidden admin-pop-panel">
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <div>
                <h3 className="font-bold text-gray-900">Filter Arsip</h3>
                <p className="text-xs text-gray-400 mt-1">Pilih file yang ingin ditampilkan.</p>
              </div>
              <button onClick={() => setShowFilterModal(false)} className="text-gray-400 hover:text-gray-700 text-xl">×</button>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-xs text-gray-500 mb-1">Keyword</label>
                  <input value={keyword} onChange={(e) => setKeyword(e.target.value)} className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm" placeholder="Cari nama file, request, uploader..." />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Jenis File</label>
                  <select value={fileKind} onChange={(e) => setFileKind(e.target.value)} className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm"><option value="">Semua jenis</option>{fileKindOptions.map((kind) => <option key={kind} value={kind}>{fileKindLabel(kind)}</option>)}</select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Uploader</label>
                  <select value={uploaderRole} onChange={(e) => setUploaderRole(e.target.value)} className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm"><option value="">Semua role</option><option value="client">Client</option><option value="admin">Admin</option><option value="freelancer">Freelancer</option></select>
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <button onClick={resetFilters} className="bg-gray-100 text-gray-700 px-5 py-3 rounded-xl text-sm hover:bg-gray-200">Reset</button>
                <button onClick={() => setShowFilterModal(false)} className="bg-gray-900 text-white px-5 py-3 rounded-xl text-sm hover:bg-gray-800">Terapkan</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {loading && <div className="bg-white rounded-2xl shadow-sm p-10 text-center text-gray-400">Memuat arsip file...</div>}

      {!loading && filteredFiles.length === 0 && (
        <div className="bg-white rounded-2xl shadow-sm p-10 text-center">
          <p className="text-4xl mb-3">🗂️</p>
          <p className="text-gray-500">Belum ada file di arsip sesuai filter.</p>
        </div>
      )}

      {!loading && filteredFiles.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                <tr>
                  <th className="px-5 py-3 text-left">File</th>
                  <th className="px-5 py-3 text-left">Request</th>
                  <th className="px-5 py-3 text-left">Uploader</th>
                  <th className="px-5 py-3 text-left">Akses Client</th>
                  <th className="px-5 py-3 text-left">Tanggal</th>
                  <th className="px-5 py-3 text-left">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {pagedFiles.map((file) => {
                  const req = requests[String(file.request_id)]
                  const visibility = clientVisibilityLabel(file, req)
                  return (
                    <tr key={file.id} className="hover:bg-gray-50">
                      <td className="px-5 py-4"><a href={file.file_url} target="_blank" rel="noreferrer" className="font-medium text-blue-600 hover:underline">{file.file_name}</a><p className="text-xs text-gray-400 mt-1">{fileKindLabel(file.file_kind)} · {formatFileSize(file.file_size)}</p></td>
                      <td className="px-5 py-4">{req ? <Link to={`/admin/requests/${req.id}`} className="text-gray-800 hover:text-blue-600 font-medium">{req.judul}</Link> : <span className="text-gray-400">Request {file.request_id}</span>}<p className="text-xs text-gray-400 mt-1">{req?.client_email || '-'}</p></td>
                      <td className="px-5 py-4"><p className="text-gray-700">{file.uploader_role}</p><p className="text-xs text-gray-400">{file.uploader_email || '-'}</p></td>
                      <td className="px-5 py-4"><span className={'text-xs px-3 py-1 rounded-full ' + visibility.className}>{visibility.label}</span></td>
                      <td className="px-5 py-4 text-gray-500 text-xs">{formatTanggal(file.created_at)}</td>
                      <td className="px-5 py-4"><button onClick={() => softDeleteFile(file)} className="bg-red-50 text-red-600 px-3 py-2 rounded-xl text-xs hover:bg-red-100">Hapus</button></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Pagination page={safePage} pageSize={pageSize} totalItems={filteredFiles.length} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1) }} />
    </div>
  )
}

export default AdminArchivePage
