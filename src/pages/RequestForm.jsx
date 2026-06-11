import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import {
  validateFiles,
  allowedRequestFileTypes,
  MAX_REQUEST_FILE_SIZE_MB
} from '../utils/fileValidation'
import { createAuditLog } from '../utils/auditLog'

function RequestForm({ user, onBack, initialService = null }) {
  const navigate = useNavigate()
  const serviceFromStorage = useMemo(() => {
    if (initialService) return initialService
    try {
      const stored = localStorage.getItem('greenroomid_pending_service')
      return stored ? JSON.parse(stored) : null
    } catch {
      localStorage.removeItem('greenroomid_pending_service')
      return null
    }
  }, [initialService])
  const goBack = onBack || (() => navigate('/dashboard'))
  const initialJudul = serviceFromStorage?.service_name
    ? `Request ${serviceFromStorage.service_name}`
    : ''

  const initialKategori = serviceFromStorage?.category_name || ''

  const initialDeskripsi = serviceFromStorage?.service_name
    ? `Saya ingin menggunakan layanan ${serviceFromStorage.service_name}.\n\nDetail kebutuhan saya:\n`
    : ''

  const [judul, setJudul] = useState(initialJudul)
  const [deskripsi, setDeskripsi] = useState(initialDeskripsi)
  const [kategori, setKategori] = useState(initialKategori)
  const [files, setFiles] = useState([])
  const [deadlineAt, setDeadlineAt] = useState('')
  const [loading, setLoading] = useState(false)
  const [sukses, setSukses] = useState(false)

  const formatRupiah = (angka) => {
    if (!angka) return '-'
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(angka)
  }

  const handleSubmit = async () => {
    if (!judul || !deskripsi || !kategori || !deadlineAt) {
      alert('Mohon isi semua kolom!')
      return
    }

    if (files.length > 0) {
      const validation = validateFiles(
        files,
        allowedRequestFileTypes,
        MAX_REQUEST_FILE_SIZE_MB
      )

      if (!validation.valid) {
        alert(validation.message)
        return
      }
    }

    setLoading(true)

    const uploadedFiles = []

    if (files.length > 0) {
      for (const selectedFile of files) {
        const safeName = selectedFile.name.replace(/[^a-zA-Z0-9._-]/g, '_')
        const fileName = `${user.id}-${Date.now()}-${crypto.randomUUID()}-${safeName}`

        const { error: uploadError } = await supabase.storage
          .from('request-files')
          .upload(fileName, selectedFile)

        if (uploadError) {
          alert('Gagal upload file: ' + uploadError.message)
          setLoading(false)
          return
        }

        const { data: urlData } = supabase.storage
          .from('request-files')
          .getPublicUrl(fileName)

        uploadedFiles.push({
          name: selectedFile.name,
          url: urlData.publicUrl,
          size: selectedFile.size,
          type: selectedFile.type,
          storage_path: fileName
        })
      }
    }

    const file_url = uploadedFiles.length > 0 ? uploadedFiles[0].url : null

    const { data: insertedRequest, error } = await supabase
      .from('requests')
      .insert({
        client_id: user.id,
        client_email: user.email,
        judul,
        deskripsi,
        kategori,
        file_url,
        file_urls: uploadedFiles,
        deadline_at: new Date(deadlineAt).toISOString(),
        service_item_id: serviceFromStorage?.service_item_id || null,
        service_snapshot: serviceFromStorage || null,
        status: 'PENDING'
      })
      .select()
      .single()

    if (error) {
      alert('Gagal kirim request: ' + error.message)
    } else {
      if (uploadedFiles.length > 0 && insertedRequest?.id) {
        const initialFileRows = uploadedFiles.map((file) => ({
          request_id: String(insertedRequest.id),
          uploaded_by: user.id,
          uploader_email: user.email,
          uploader_role: 'client',
          file_kind: 'initial_client_file',
          file_name: file.name,
          file_url: file.url,
          file_size: file.size,
          file_type: file.type,
          storage_path: file.storage_path
        }))

        const { error: requestFilesError } = await supabase
          .from('request_files')
          .insert(initialFileRows)

        if (requestFilesError) {
          console.log('Gagal menyimpan metadata file awal:', requestFilesError.message)
        }
      }

      await createAuditLog({
        requestId: insertedRequest?.id || null,
        actorId: user.id,
        actorEmail: user.email,
        actorRole: 'client',
        action: 'REQUEST_CREATED',
        description: `Client membuat request: ${judul}`,
        metadata: {
          judul,
          kategori,
          service: serviceFromStorage,
          total_files: uploadedFiles.length,
          deadline_at: deadlineAt
        }
      })

      localStorage.removeItem('greenroomid_pending_service')
      setSukses(true)
    }

    setLoading(false)
  }

  if (sukses) return (
    <div className="flex items-center justify-center h-screen bg-gray-100">
      <div className="bg-white p-10 rounded-2xl shadow-lg text-center w-96">
        <h1 className="text-4xl mb-4">🎉</h1>
        <h2 className="text-xl font-bold text-gray-800 mb-2">Request Terkirim!</h2>
        <p className="text-gray-500 mb-6">Request kamu sudah kami terima dan sedang diproses.</p>
        <button
          onClick={goBack}
          className="w-full bg-blue-600 text-white py-3 rounded-xl hover:bg-blue-700 transition"
        >
          Kembali ke Dashboard
        </button>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-xl mx-auto bg-white rounded-2xl shadow-lg p-8">
        <button
          onClick={goBack}
          className="text-gray-400 hover:text-gray-600 mb-6 flex items-center gap-2 text-sm"
        >
          ← Kembali
        </button>

        <h1 className="text-2xl font-bold text-gray-800 mb-6">Buat Request Baru</h1>

        {serviceFromStorage && (
          <div className="border border-blue-100 bg-blue-50 rounded-2xl p-4 mb-6">
            <p className="text-xs text-blue-500 mb-1">Layanan dipilih</p>
            <h2 className="font-bold text-blue-900 mb-2">
              {serviceFromStorage.service_name}
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm mb-3">
              <div>
                <p className="text-blue-500 text-xs">Kategori</p>
                <p className="font-medium text-blue-800">{serviceFromStorage.category_name}</p>
              </div>

              <div>
                <p className="text-blue-500 text-xs">Estimasi Waktu</p>
                <p className="font-medium text-blue-800">{serviceFromStorage.estimated_time || '-'}</p>
              </div>

              <div className="sm:col-span-2">
                <p className="text-blue-500 text-xs">Estimasi Harga</p>
                <p className="font-medium text-blue-800">
                  {serviceFromStorage.price_start && serviceFromStorage.price_end
                    ? `${formatRupiah(serviceFromStorage.price_start)} - ${formatRupiah(serviceFromStorage.price_end)}`
                    : serviceFromStorage.price_start
                      ? `Mulai ${formatRupiah(serviceFromStorage.price_start)}`
                      : '-'}
                </p>
              </div>
            </div>

            {serviceFromStorage.price_note && (
              <p className="text-xs text-blue-700">
                {serviceFromStorage.price_note}
              </p>
            )}
          </div>
        )}

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Judul Request</label>
          <input
            type="text"
            placeholder="Contoh: Desain logo perusahaan"
            value={judul}
            onChange={(e) => setJudul(e.target.value)}
            className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Kategori</label>
          <select
            value={kategori}
            onChange={(e) => setKategori(e.target.value)}
            className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          >
            <option value="">Pilih kategori...</option>
            <option value="Penulisan">Penulisan</option>
            <option value="Desain">Desain</option>
            <option value="Video">Video</option>
            <option value="Programming">Programming</option>
            <option value="Lainnya">Lainnya</option>
          </select>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Deskripsi</label>
          <textarea
            placeholder="Jelaskan detail request kamu..."
            value={deskripsi}
            onChange={(e) => setDeskripsi(e.target.value)}
            rows={5}
            className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Deadline Tugas</label>
          <input
            type="datetime-local"
            value={deadlineAt}
            onChange={(e) => setDeadlineAt(e.target.value)}
            className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <p className="text-xs text-gray-400 mt-2">
            Deadline diisi oleh client dan akan terlihat oleh admin sebagai acuan pengerjaan.
          </p>
        </div>

        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Upload File Pendukung
          </label>
          <input
            type="file"
            multiple
            accept=".pdf,.doc,.docx,.xls,.xlsx,.zip,.jpg,.jpeg,.png,.webp"
            onChange={(e) => setFiles(Array.from(e.target.files || []))}
            className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm"
          />
          <p className="text-xs text-gray-400 mt-2">
            Opsional. Bisa lebih dari satu file. Maksimal 5 MB per file.
          </p>

          {files.length > 0 && (
            <div className="mt-3 space-y-1">
              {files.map((file, index) => (
                <p key={index} className="text-xs text-gray-500">
                  {index + 1}. {file.name} — {(file.size / 1024 / 1024).toFixed(2)} MB
                </p>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={handleSubmit}
          disabled={loading}
          className="w-full bg-blue-600 text-white font-medium py-3 rounded-xl hover:bg-blue-700 transition disabled:opacity-50"
        >
          {loading ? 'Mengirim...' : 'Kirim Request'}
        </button>
      </div>
    </div>
  )
}

export default RequestForm