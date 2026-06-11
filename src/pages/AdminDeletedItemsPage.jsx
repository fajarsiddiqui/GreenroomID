import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase'
import { createAuditLog } from '../utils/auditLog'
import Pagination from '../components/Pagination'
import { fileKindLabel } from '../utils/status'

function AdminDeletedItemsPage({ user }) {
  const [activeTab, setActiveTab] = useState('requests')
  const [requests, setRequests] = useState([])
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const fetchDeleted = async () => {
    setLoading(true)

    const [{ data: reqData, error: reqError }, { data: fileData, error: fileError }] = await Promise.all([
      supabase.from('requests').select('*').not('deleted_at', 'is', null).order('deleted_at', { ascending: false }),
      supabase.from('request_files').select('*').not('deleted_at', 'is', null).order('deleted_at', { ascending: false })
    ])

    if (reqError) alert('Gagal mengambil deleted request: ' + reqError.message)
    if (fileError) alert('Gagal mengambil deleted file: ' + fileError.message)

    setRequests(reqData || [])
    setFiles(fileData || [])
    setLoading(false)
  }

  useEffect(() => { fetchDeleted() }, [])
  useEffect(() => { setPage(1) }, [activeTab, pageSize])

  const formatTanggal = (tanggal) => tanggal ? new Date(tanggal).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'
  const formatFileSize = (size) => size ? `${(Number(size) / 1024 / 1024).toFixed(2)} MB` : '-'

  const restoreRequest = async (request) => {
    const { error } = await supabase
      .from('requests')
      .update({ deleted_at: null, deleted_by: null, delete_reason: null })
      .eq('id', request.id)

    if (error) {
      alert('Gagal restore request: ' + error.message)
      return
    }

    await createAuditLog({
      requestId: request.id,
      actorId: user.id,
      actorEmail: user.email,
      actorRole: 'admin',
      action: 'REQUEST_RESTORED',
      description: `Admin restore request: ${request.judul}`,
      metadata: { restored_from_deleted_items: true }
    })

    fetchDeleted()
  }

  const permanentDeleteRequest = async (request) => {
    if (!window.confirm('Hapus permanen request ini? Data, file metadata, diskusi, dan riwayat terkait tidak bisa dikembalikan.')) return

    const { data: relatedFiles } = await supabase
      .from('request_files')
      .select('storage_path')
      .eq('request_id', String(request.id))

    const storagePaths = (relatedFiles || []).map((file) => file.storage_path).filter(Boolean)
    if (storagePaths.length > 0) {
      await supabase.storage.from('request-files').remove(storagePaths)
    }

    const { error } = await supabase.rpc('admin_permanent_delete_request', {
      target_request_id: String(request.id)
    })

    if (error) {
      alert('Gagal hapus permanen request. Pastikan SQL supabase/h4-minor-fix-v2.sql sudah dijalankan.\n\nDetail: ' + error.message)
      return
    }

    await createAuditLog({
      requestId: null,
      actorId: user.id,
      actorEmail: user.email,
      actorRole: 'admin',
      action: 'REQUEST_PERMANENT_DELETED',
      description: `Admin menghapus permanen request: ${request.judul}`,
      metadata: { request_id: request.id, removed_storage_files: storagePaths.length }
    })

    fetchDeleted()
  }

  const restoreFile = async (file) => {
    const { error } = await supabase
      .from('request_files')
      .update({ deleted_at: null, deleted_by: null, delete_reason: null })
      .eq('id', file.id)

    if (error) {
      alert('Gagal restore file: ' + error.message)
      return
    }

    await createAuditLog({
      requestId: file.request_id,
      actorId: user.id,
      actorEmail: user.email,
      actorRole: 'admin',
      action: 'FILE_RESTORED',
      description: `Admin restore file: ${file.file_name}`,
      metadata: { file_id: file.id, file_kind: file.file_kind }
    })

    fetchDeleted()
  }

  const permanentDeleteFile = async (file) => {
    if (!window.confirm('Hapus permanen file ini dari storage dan database? File tidak bisa dikembalikan.')) return

    if (file.storage_path) {
      await supabase.storage.from('request-files').remove([file.storage_path])
    }

    const { error } = await supabase.rpc('admin_permanent_delete_request_file', {
      target_file_id: String(file.id)
    })

    if (error) {
      alert('Gagal hapus permanen file. Pastikan SQL supabase/h4-minor-fix-v2.sql sudah dijalankan.\n\nDetail: ' + error.message)
      return
    }

    await createAuditLog({
      requestId: file.request_id,
      actorId: user.id,
      actorEmail: user.email,
      actorRole: 'admin',
      action: 'FILE_PERMANENT_DELETED',
      description: `Admin menghapus permanen file: ${file.file_name}`,
      metadata: { file_id: file.id, storage_path: file.storage_path || null }
    })

    fetchDeleted()
  }

  const activeRows = activeTab === 'requests' ? requests : files
  const totalPages = Math.max(1, Math.ceil(activeRows.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const pagedRows = activeRows.slice((safePage - 1) * pageSize, safePage * pageSize)

  return (
    <div className="p-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-6">
        <div>
          <p className="text-xs text-gray-400 mb-1">Admin / Deleted Items</p>
          <h2 className="text-2xl font-bold text-gray-900">Deleted Items</h2>
          <p className="text-sm text-gray-500 mt-1">Request dan file yang dihapus sementara. Restore atau hapus permanen dari sini.</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm p-2 inline-flex gap-2 mb-6">
        <button onClick={() => setActiveTab('requests')} className={'px-5 py-3 rounded-xl text-sm ' + (activeTab === 'requests' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50')}>Deleted Requests ({requests.length})</button>
        <button onClick={() => setActiveTab('files')} className={'px-5 py-3 rounded-xl text-sm ' + (activeTab === 'files' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50')}>Deleted Files ({files.length})</button>
      </div>

      {loading && <div className="bg-white rounded-2xl shadow-sm p-10 text-center text-gray-400">Memuat deleted items...</div>}

      {!loading && activeRows.length === 0 && (
        <div className="bg-white rounded-2xl shadow-sm p-10 text-center">
          <p className="text-4xl mb-3">🗑️</p>
          <p className="text-gray-500">Belum ada item yang dihapus.</p>
        </div>
      )}

      {!loading && activeRows.length > 0 && activeTab === 'requests' && (
        <div className="space-y-4">
          {pagedRows.map((request) => (
            <div key={request.id} className="bg-white rounded-2xl shadow-sm p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <p className="font-bold text-gray-800">{request.judul}</p>
                <p className="text-xs text-gray-400 mt-1">{request.client_email} · Dihapus: {formatTanggal(request.deleted_at)}</p>
                <p className="text-xs text-gray-500 mt-2">Alasan: {request.delete_reason || '-'}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => restoreRequest(request)} className="bg-green-50 text-green-700 px-4 py-2 rounded-xl text-xs hover:bg-green-100">Restore</button>
                <button onClick={() => permanentDeleteRequest(request)} className="bg-red-600 text-white px-4 py-2 rounded-xl text-xs hover:bg-red-700">Delete Permanen</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && activeRows.length > 0 && activeTab === 'files' && (
        <div className="space-y-4">
          {pagedRows.map((file) => (
            <div key={file.id} className="bg-white rounded-2xl shadow-sm p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <a href={file.file_url} target="_blank" rel="noreferrer" className="font-bold text-blue-600 hover:underline">{file.file_name}</a>
                <p className="text-xs text-gray-400 mt-1">{fileKindLabel(file.file_kind)} · {formatFileSize(file.file_size)} · Dihapus: {formatTanggal(file.deleted_at)}</p>
                <p className="text-xs text-gray-500 mt-2">Alasan: {file.delete_reason || '-'}</p>
                {file.request_id && <Link to={`/admin/requests/${file.request_id}`} className="text-xs text-blue-500 hover:underline mt-2 inline-block">Buka request terkait</Link>}
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => restoreFile(file)} className="bg-green-50 text-green-700 px-4 py-2 rounded-xl text-xs hover:bg-green-100">Restore</button>
                <button onClick={() => permanentDeleteFile(file)} className="bg-red-600 text-white px-4 py-2 rounded-xl text-xs hover:bg-red-700">Delete Permanen</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Pagination page={safePage} pageSize={pageSize} totalItems={activeRows.length} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1) }} />
    </div>
  )
}

export default AdminDeletedItemsPage
