import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../supabase'
import {
  validateFile,
  validateFiles,
  allowedPaymentFileTypes,
  allowedAdditionalFileTypes,
  MAX_PAYMENT_FILE_SIZE_MB,
  MAX_ADDITIONAL_FILE_SIZE_MB
} from '../utils/fileValidation'
import { createAuditLog } from '../utils/auditLog'

function DetailRequest({ user, requestId, onBack }) {
  const navigate = useNavigate()
  const params = useParams()
  const activeRequestId = requestId || params.requestId
  const goBack = onBack || (() => navigate('/dashboard'))
  const [request, setRequest] = useState(null)
  const [requestFiles, setRequestFiles] = useState([])
  const [diskusi, setDiskusi] = useState([])
  const [pesan, setPesan] = useState('')
  const [paymentFile, setPaymentFile] = useState(null)
  const [additionalFiles, setAdditionalFiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [kirimLoading, setKirimLoading] = useState(false)
  const [uploadPaymentLoading, setUploadPaymentLoading] = useState(false)
  const [uploadAdditionalLoading, setUploadAdditionalLoading] = useState(false)
  const [deadlineInput, setDeadlineInput] = useState('')
  const [deadlineLoading, setDeadlineLoading] = useState(false)

  const fetchDetail = async () => {
    const { data, error } = await supabase
      .from('requests')
      .select('*')
      .eq('id', activeRequestId)
      .single()

    if (!error && data) {
      setRequest(data)
      setDeadlineInput(data.deadline_at ? data.deadline_at.slice(0, 16) : '')
    }
    setLoading(false)
  }

  const fetchRequestFiles = async () => {
    const { data, error } = await supabase
      .from('request_files')
      .select('*')
      .eq('request_id', String(activeRequestId))
      .order('created_at', { ascending: true })

    if (!error) setRequestFiles(data || [])
  }

  const fetchDiskusi = async () => {
    const { data } = await supabase
      .from('diskusi')
      .select('*')
      .eq('request_id', activeRequestId)
      .order('created_at', { ascending: true })

    if (data) setDiskusi(data)
  }

  useEffect(() => {
    fetchDetail()
    fetchRequestFiles()
    fetchDiskusi()
  }, [activeRequestId])

  const kirimPesan = async () => {
    if (!pesan.trim()) return

    setKirimLoading(true)

    const { error } = await supabase.from('diskusi').insert({
      request_id: activeRequestId,
      pengirim_email: user.email,
      pesan,
      role: 'client'
    })

    if (error) {
      alert('Gagal mengirim pesan: ' + error.message)
    } else {
      await createAuditLog({
        activeRequestId,
        actorId: user.id,
        actorEmail: user.email,
        actorRole: 'client',
        action: 'CLIENT_MESSAGE_SENT',
        description: `Client mengirim pesan untuk request: ${request?.judul || activeRequestId}`,
        metadata: { message_length: pesan.trim().length }
      })

      setPesan('')
      fetchDiskusi()
    }

    setKirimLoading(false)
  }

  const uploadBuktiBayar = async () => {
    if (!paymentFile) {
      alert('Pilih file bukti bayar dulu.')
      return
    }

    const validation = validateFile(
      paymentFile,
      allowedPaymentFileTypes,
      MAX_PAYMENT_FILE_SIZE_MB
    )

    if (!validation.valid) {
      alert(validation.message)
      return
    }

    setUploadPaymentLoading(true)

    const safeName = paymentFile.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const fileName = `payment-proofs/${user.id}-${activeRequestId}-${Date.now()}-${safeName}`

    const { error: uploadError } = await supabase.storage
      .from('request-files')
      .upload(fileName, paymentFile)

    if (uploadError) {
      alert('Gagal upload bukti bayar: ' + uploadError.message)
      setUploadPaymentLoading(false)
      return
    }

    const { data: urlData } = supabase.storage
      .from('request-files')
      .getPublicUrl(fileName)

    const paymentProofUrl = urlData.publicUrl

    const { error: updateError } = await supabase
      .from('requests')
      .update({
        payment_proof_url: paymentProofUrl,
        payment_status: 'UPLOADED',
        status: 'PAYMENT UPLOADED'
      })
      .eq('id', activeRequestId)

    if (updateError) {
      alert('Bukti bayar terupload, tapi gagal update status: ' + updateError.message)
    } else {
      await createAuditLog({
        activeRequestId,
        actorId: user.id,
        actorEmail: user.email,
        actorRole: 'client',
        action: 'PAYMENT_UPLOADED',
        description: `Client mengupload bukti pembayaran untuk request: ${request?.judul || activeRequestId}`,
        metadata: {
          payment_proof_url: paymentProofUrl,
          previous_payment_status: request?.payment_status || null,
          new_payment_status: 'UPLOADED',
          previous_status: request?.status || null,
          new_status: 'PAYMENT UPLOADED'
        }
      })

      alert('Bukti bayar berhasil diupload. Menunggu verifikasi admin.')
      setPaymentFile(null)
      fetchDetail()
    }

    setUploadPaymentLoading(false)
  }

  const uploadFileTambahan = async () => {
    if (additionalFiles.length === 0) {
      alert('Pilih file tambahan dulu.')
      return
    }

    const validation = validateFiles(
      additionalFiles,
      allowedAdditionalFileTypes,
      MAX_ADDITIONAL_FILE_SIZE_MB
    )

    if (!validation.valid) {
      alert(validation.message)
      return
    }

    setUploadAdditionalLoading(true)

    const uploadedRows = []

    for (const selectedFile of additionalFiles) {
      const safeName = selectedFile.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const fileName = `additional-files/${user.id}-${activeRequestId}-${Date.now()}-${crypto.randomUUID()}-${safeName}`

      const { error: uploadError } = await supabase.storage
        .from('request-files')
        .upload(fileName, selectedFile)

      if (uploadError) {
        alert('Gagal upload file tambahan: ' + uploadError.message)
        setUploadAdditionalLoading(false)
        return
      }

      const { data: urlData } = supabase.storage
        .from('request-files')
        .getPublicUrl(fileName)

      uploadedRows.push({
        request_id: String(activeRequestId),
        uploaded_by: user.id,
        uploader_email: user.email,
        uploader_role: 'client',
        file_kind: 'additional_client_file',
        file_name: selectedFile.name,
        file_url: urlData.publicUrl,
        file_size: selectedFile.size,
        file_type: selectedFile.type,
        storage_path: fileName
      })
    }

    const { error: insertError } = await supabase
      .from('request_files')
      .insert(uploadedRows)

    if (insertError) {
      alert('File terupload, tapi gagal menyimpan data file tambahan: ' + insertError.message)
    } else {
      await createAuditLog({
        activeRequestId,
        actorId: user.id,
        actorEmail: user.email,
        actorRole: 'client',
        action: 'CLIENT_ADDITIONAL_FILE_UPLOADED',
        description: `Client mengupload ${uploadedRows.length} file tambahan untuk request: ${request?.judul || activeRequestId}`,
        metadata: {
          total_files: uploadedRows.length,
          files: uploadedRows.map((file) => ({
            file_name: file.file_name,
            file_size: file.file_size,
            file_type: file.file_type
          }))
        }
      })

      alert('File tambahan berhasil diupload.')
      setAdditionalFiles([])
      fetchRequestFiles()
    }

    setUploadAdditionalLoading(false)
  }

  const updateDeadline = async () => {
    if (!deadlineInput) {
      alert('Isi deadline baru dulu.')
      return
    }

    setDeadlineLoading(true)

    const newDeadline = new Date(deadlineInput).toISOString()
    const { error } = await supabase
      .from('requests')
      .update({ deadline_at: newDeadline })
      .eq('id', activeRequestId)

    if (error) {
      alert('Gagal mengubah deadline: ' + error.message)
    } else {
      await createAuditLog({
        requestId: activeRequestId,
        actorId: user.id,
        actorEmail: user.email,
        actorRole: 'client',
        action: 'CLIENT_DEADLINE_UPDATED',
        description: `Client mengubah deadline untuk request: ${request?.judul || activeRequestId}`,
        metadata: {
          previous_deadline_at: request?.deadline_at || null,
          new_deadline_at: newDeadline
        }
      })

      alert('Deadline berhasil diperbarui. Admin akan melihat perubahan ini.')
      fetchDetail()
    }

    setDeadlineLoading(false)
  }

  const getStatusColor = (status) => {
    if (status === 'PENDING') return 'bg-yellow-100 text-yellow-700'
    if (status === 'OPEN') return 'bg-blue-100 text-blue-700'
    if (status === 'ON PROGRESS') return 'bg-purple-100 text-purple-700'
    if (status === 'REVIEW') return 'bg-orange-100 text-orange-700'
    if (status === 'WAITING PAYMENT') return 'bg-red-100 text-red-700'
    if (status === 'PAYMENT UPLOADED') return 'bg-indigo-100 text-indigo-700'
    if (status === 'DELIVERED') return 'bg-green-100 text-green-700'
    if (status === 'DONE') return 'bg-gray-100 text-gray-700'
    if (status === 'DISPUTE') return 'bg-red-200 text-red-800'
    return 'bg-gray-100 text-gray-600'
  }

  const formatRupiah = (angka) => {
    if (!angka) return '-'
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(angka)
  }

  const formatTanggal = (tanggal) => {
    if (!tanggal) return '-'
    return new Date(tanggal).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    })
  }

  const formatFileSize = (size) => {
    if (!size) return '-'
    return `${(Number(size) / 1024 / 1024).toFixed(2)} MB`
  }

  const renderFileList = (files, emptyText = 'Belum ada file.') => {
    if (!files || files.length === 0) {
      return <p className="text-gray-400 text-sm">{emptyText}</p>
    }

    return (
      <div className="space-y-2">
        {files.map((file, index) => (
          <a
            key={file.id || index}
            href={file.file_url || file.url}
            target="_blank"
            rel="noreferrer"
            className="block text-blue-500 text-sm hover:underline"
          >
            {index + 1}. {file.file_name || file.name || 'Download File'}
            {file.file_size ? ` — ${formatFileSize(file.file_size)}` : ''}
          </a>
        ))}
      </div>
    )
  }

  if (loading) return (
    <div className="flex items-center justify-center h-screen bg-gray-100">
      <p className="text-gray-400">Memuat...</p>
    </div>
  )

  if (!request) return (
    <div className="flex items-center justify-center h-screen bg-gray-100">
      <p className="text-gray-400">Request tidak ditemukan.</p>
    </div>
  )

  const invoiceMuncul =
    request?.harga ||
    request?.status === 'WAITING PAYMENT' ||
    request?.status === 'PAYMENT UPLOADED' ||
    request?.payment_status === 'UPLOADED' ||
    request?.payment_status === 'VERIFIED'

  const legacyClientFiles =
    Array.isArray(request.file_urls) && request.file_urls.length > 0
      ? request.file_urls.map((file) => ({
          file_name: file.name,
          file_url: file.url,
          file_size: file.size,
          file_type: file.type
        }))
      : request.file_url
        ? [{ file_name: 'File Client', file_url: request.file_url }]
        : []

  const initialFiles = requestFiles.filter((file) => file.file_kind === 'initial_client_file')
  const additionalClientFiles = requestFiles.filter((file) => file.file_kind === 'additional_client_file')
  const previewFiles = requestFiles.filter((file) => file.file_kind === 'preview_file')
  const resultFilesFromTable = requestFiles.filter((file) =>
    ['final_result', 'revision_result', 'additional_result', 'result_file'].includes(file.file_kind)
  )

  const visibleInitialFiles = initialFiles.length > 0 ? initialFiles : legacyClientFiles
  const legacyResultFiles = request.hasil_url
    ? [{ file_name: 'File Hasil', file_url: request.hasil_url }]
    : []
  const resultFiles = resultFilesFromTable.length > 0 ? resultFilesFromTable : legacyResultFiles
  const paymentVerified = request.payment_status === 'VERIFIED' || request.invoice_status === 'PAID'

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="bg-white shadow-sm px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-800">GreenroomID</h1>
          <p className="text-xs text-gray-400">{user.email}</p>
        </div>
        <button
          onClick={goBack}
          className="text-sm text-blue-400 hover:text-blue-600 transition"
        >
          Kembali
        </button>
      </div>

      <div className="max-w-3xl mx-auto p-6 space-y-6">
        <div className="bg-white rounded-2xl shadow-sm p-6">
          <div className="flex items-start justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-800">{request.judul}</h2>
            <span className={'text-xs font-medium px-3 py-1 rounded-full ' + getStatusColor(request.status)}>
              {request.status}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
            <div>
              <p className="text-gray-400">Kategori</p>
              <p className="font-medium text-gray-700">{request.kategori}</p>
            </div>
            <div>
              <p className="text-gray-400">Tanggal Request</p>
              <p className="font-medium text-gray-700">{formatTanggal(request.created_at)}</p>
            </div>
          </div>

          <div className="border border-amber-100 bg-amber-50 rounded-xl p-4 mb-4">
            <div className="flex flex-col md:flex-row md:items-end gap-3">
              <div className="flex-1">
                <p className="text-amber-700 text-sm font-medium mb-1">Deadline Tugas</p>
                <input
                  type="datetime-local"
                  value={deadlineInput}
                  onChange={(e) => setDeadlineInput(e.target.value)}
                  className="w-full border border-amber-200 rounded-xl px-4 py-3 text-sm bg-white"
                />
                <p className="text-xs text-amber-700 mt-2">
                  Client bisa mengubah deadline. Perubahan ini tercatat di riwayat aktivitas.
                </p>
              </div>
              <button
                onClick={updateDeadline}
                disabled={deadlineLoading}
                className="bg-amber-600 text-white px-5 py-3 rounded-xl text-sm hover:bg-amber-700 disabled:opacity-50"
              >
                {deadlineLoading ? 'Menyimpan...' : 'Ubah Deadline'}
              </button>
            </div>
          </div>

          <div className="mb-4">
            <p className="text-gray-400 text-sm mb-1">Deskripsi</p>
            <p className="text-gray-700 text-sm whitespace-pre-wrap">{request.deskripsi}</p>
          </div>

          {request.admin_note && (
            <div className="border border-blue-200 bg-blue-50 rounded-xl p-4 mb-4">
              <p className="text-blue-700 text-sm font-medium mb-1">Catatan Admin</p>
              <p className="text-blue-700 text-sm whitespace-pre-wrap">{request.admin_note}</p>
            </div>
          )}

          <div className="border border-gray-200 rounded-xl p-4 mb-4">
            <p className="text-gray-700 text-sm font-medium mb-2">File Awal Request</p>
            {renderFileList(visibleInitialFiles, 'Tidak ada file awal.')}
          </div>

          <div className="border border-blue-100 bg-blue-50 rounded-xl p-4">
            <p className="text-blue-700 text-sm font-medium mb-2">File Tambahan Client</p>
            {renderFileList(additionalClientFiles, 'Belum ada file tambahan.')}
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-6">
          <h3 className="font-bold text-gray-800 mb-4">Upload File Tambahan</h3>
          <p className="text-sm text-gray-500 mb-4">
            Gunakan ini jika admin/freelancer meminta bahan tambahan, seperti data Excel, template, contoh desain, atau revisi dosen.
          </p>

          <input
            type="file"
            multiple
            accept=".pdf,.doc,.docx,.xls,.xlsx,.zip,.jpg,.jpeg,.png,.webp"
            onChange={(e) => setAdditionalFiles(Array.from(e.target.files || []))}
            className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm mb-3"
          />

          {additionalFiles.length > 0 && (
            <div className="mb-3 space-y-1">
              {additionalFiles.map((file, index) => (
                <p key={index} className="text-xs text-gray-500">
                  {index + 1}. {file.name} — {(file.size / 1024 / 1024).toFixed(2)} MB
                </p>
              ))}
            </div>
          )}

          <button
            onClick={uploadFileTambahan}
            disabled={uploadAdditionalLoading}
            className="w-full bg-gray-900 text-white py-3 rounded-xl text-sm hover:bg-gray-800 transition disabled:opacity-50"
          >
            {uploadAdditionalLoading ? 'Mengupload...' : 'Upload File Tambahan'}
          </button>

          <p className="text-xs text-gray-400 mt-2">
            Maksimal {MAX_ADDITIONAL_FILE_SIZE_MB} MB per file.
          </p>
        </div>

        {previewFiles.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm p-6">
            <h3 className="font-bold text-gray-800 mb-4">File Preview</h3>
            <div className="border border-orange-200 bg-orange-50 rounded-xl p-4">
              <p className="text-orange-700 text-sm mb-2 font-medium">Preview hasil tersedia</p>
              <p className="text-orange-700 text-xs mb-3">
                File preview hanya untuk pengecekan awal. File final penuh akan tersedia setelah pembayaran diverifikasi admin.
              </p>
              {renderFileList(previewFiles)}
            </div>
          </div>
        )}

        {invoiceMuncul && (
          <div className="bg-white rounded-2xl shadow-sm p-6">
            <h3 className="font-bold text-gray-800 mb-4">Invoice & Pembayaran</h3>

            <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
              <div>
                <p className="text-gray-400">Nominal Invoice</p>
                <p className="font-bold text-gray-800 text-lg">{formatRupiah(request.harga)}</p>
              </div>
              <div>
                <p className="text-gray-400">Deadline Pengerjaan</p>
                <p className="font-medium text-gray-700">{formatTanggal(request.deadline_at)}</p>
              </div>
              <div>
                <p className="text-gray-400">Status Invoice</p>
                <p className="font-medium text-gray-700">{request.invoice_status || 'NOT_CREATED'}</p>
              </div>
              <div>
                <p className="text-gray-400">Status Pembayaran</p>
                <p className="font-medium text-gray-700">{request.payment_status || 'UNPAID'}</p>
              </div>
            </div>

            {!request.payment_proof_url && (
              <div className="border border-gray-200 rounded-xl p-4">
                <p className="text-gray-600 text-sm font-medium mb-2">Upload Bukti Bayar</p>
                <input
                  type="file"
                  accept="image/*,.pdf"
                  onChange={(e) => setPaymentFile(e.target.files[0])}
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm mb-3"
                />
                <button
                  onClick={uploadBuktiBayar}
                  disabled={uploadPaymentLoading}
                  className="w-full bg-blue-600 text-white py-3 rounded-xl text-sm hover:bg-blue-700 transition disabled:opacity-50"
                >
                  {uploadPaymentLoading ? 'Mengupload...' : 'Upload Bukti Bayar'}
                </button>
              </div>
            )}

            {request.payment_proof_url && (
              <div className="border border-indigo-200 bg-indigo-50 rounded-xl p-4">
                <p className="text-indigo-700 text-sm font-medium mb-2">Bukti bayar sudah diupload</p>
                <a
                  href={request.payment_proof_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-indigo-600 text-sm hover:underline"
                >
                  Lihat Bukti Bayar
                </a>
                <p className="text-indigo-600 text-xs mt-2">
                  {paymentVerified
                    ? 'Pembayaran sudah diverifikasi admin.'
                    : 'Menunggu verifikasi admin.'}
                </p>
              </div>
            )}
          </div>
        )}

        {resultFiles.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm p-6">
            <h3 className="font-bold text-gray-800 mb-4">File Hasil</h3>
            {paymentVerified ? (
              <div className="border border-green-200 bg-green-50 rounded-xl p-4">
                <p className="text-green-700 text-sm mb-2 font-medium">File hasil sudah tersedia</p>
                {renderFileList(resultFiles)}
              </div>
            ) : (
              <div className="border border-gray-200 bg-gray-50 rounded-xl p-4">
                <p className="text-gray-700 text-sm font-medium mb-1">File hasil sudah disiapkan</p>
                <p className="text-gray-500 text-xs">
                  File final akan terbuka setelah pembayaran diverifikasi admin. Silakan cek file preview bila tersedia.
                </p>
              </div>
            )}
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-sm p-6">
          <h3 className="font-bold text-gray-800 mb-4">Diskusi</h3>

          <div className="space-y-3 mb-4 max-h-64 overflow-y-auto">
            {diskusi.length === 0 && (
              <p className="text-gray-400 text-sm text-center py-4">Belum ada diskusi.</p>
            )}

            {diskusi.map((d) => (
              <div
                key={d.id}
                className={
                  'p-3 rounded-xl text-sm ' +
                  (d.role === 'admin'
                    ? 'bg-blue-50 text-blue-800'
                    : 'bg-gray-50 text-gray-700')
                }
              >
                <p className="font-medium text-xs mb-1">
                  {d.role === 'admin' ? 'Admin' : d.pengirim_email}
                </p>
                <p>{d.pesan}</p>
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Tulis pesan..."
              value={pesan}
              onChange={(e) => setPesan(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && kirimPesan()}
              className="flex-1 border border-gray-300 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            <button
              onClick={kirimPesan}
              disabled={kirimLoading}
              className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm hover:bg-blue-700 transition disabled:opacity-50"
            >
              Kirim
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default DetailRequest
