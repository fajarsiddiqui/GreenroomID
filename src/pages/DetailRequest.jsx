import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import {
  validateFile,
  allowedPaymentFileTypes,
  MAX_PAYMENT_FILE_SIZE_MB
} from '../utils/fileValidation'
import { createAuditLog } from '../utils/auditLog'

function DetailRequest({ user, requestId, onBack }) {
  const [request, setRequest] = useState(null)
  const [diskusi, setDiskusi] = useState([])
  const [pesan, setPesan] = useState('')
  const [paymentFile, setPaymentFile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [kirimLoading, setKirimLoading] = useState(false)
  const [uploadPaymentLoading, setUploadPaymentLoading] = useState(false)

  const fetchDetail = async () => {
    const { data, error } = await supabase
      .from('requests')
      .select('*')
      .eq('id', requestId)
      .single()

    if (!error) setRequest(data)
    setLoading(false)
  }

  const fetchDiskusi = async () => {
    const { data } = await supabase
      .from('diskusi')
      .select('*')
      .eq('request_id', requestId)
      .order('created_at', { ascending: true })

    if (data) setDiskusi(data)
  }

  useEffect(() => {
    fetchDetail()
    fetchDiskusi()
  }, [requestId])

  const kirimPesan = async () => {
    if (!pesan.trim()) return

    setKirimLoading(true)

    const { error } = await supabase.from('diskusi').insert({
      request_id: requestId,
      pengirim_email: user.email,
      pesan,
      role: 'client'
    })

    if (error) {
      alert('Gagal mengirim pesan: ' + error.message)
    } else {
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
    const fileName = `payment-proofs/${user.id}-${requestId}-${Date.now()}-${safeName}`

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
      .eq('id', requestId)

    if (updateError) {
      alert('Bukti bayar terupload, tapi gagal update status: ' + updateError.message)
      } else {
        await createAuditLog({
          requestId,
          actorId: user.id,
          actorEmail: user.email,
          actorRole: 'client',
          action: 'PAYMENT_UPLOADED',
          description: `Client mengupload bukti pembayaran untuk request: ${request?.judul || requestId}`,
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

  const clientFiles =
    Array.isArray(request.file_urls) && request.file_urls.length > 0
      ? request.file_urls
      : request.file_url
        ? [{ name: 'File Client', url: request.file_url }]
        : []

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="bg-white shadow-sm px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-800">GreenroomID</h1>
          <p className="text-xs text-gray-400">{user.email}</p>
        </div>
        <button
          onClick={onBack}
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

          {clientFiles.length > 0 && (
            <div className="border border-gray-200 rounded-xl p-4">
              <p className="text-gray-400 text-sm mb-2">File yang diupload</p>

              <div className="space-y-2">
                {clientFiles.map((file, index) => (
                  <a
                    key={index}
                    href={file.url}
                    target="_blank"
                    rel="noreferrer"
                    className="block text-blue-500 text-sm hover:underline"
                  >
                    {index + 1}. {file.name || 'Download File Client'}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>

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
                  {request.payment_status === 'VERIFIED'
                    ? 'Pembayaran sudah diverifikasi admin.'
                    : 'Menunggu verifikasi admin.'}
                </p>
              </div>
            )}
          </div>
        )}

        {request.hasil_url && (
          <div className="bg-white rounded-2xl shadow-sm p-6">
            <h3 className="font-bold text-gray-800 mb-4">File Hasil</h3>
            <div className="border border-green-200 bg-green-50 rounded-xl p-4">
              <p className="text-green-700 text-sm mb-2 font-medium">File hasil sudah tersedia</p>
              <a
                href={request.hasil_url}
                target="_blank"
                rel="noreferrer"
                className="text-green-600 text-sm hover:underline font-medium"
              >
                Download File Hasil
              </a>
            </div>
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