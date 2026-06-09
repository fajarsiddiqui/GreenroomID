import { useState } from 'react'
import { supabase } from '../supabase'
import {
  validateFiles,
  allowedRequestFileTypes,
  MAX_REQUEST_FILE_SIZE_MB
} from '../utils/fileValidation'

function RequestForm({ user, onBack }) {
  const [judul, setJudul] = useState('')
  const [deskripsi, setDeskripsi] = useState('')
  const [kategori, setKategori] = useState('')
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(false)
  const [sukses, setSukses] = useState(false)

  const handleSubmit = async () => {
    if (!judul || !deskripsi || !kategori) {
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
          type: selectedFile.type
        })
      }
    }

    const file_url = uploadedFiles.length > 0 ? uploadedFiles[0].url : null

    const { error } = await supabase.from('requests').insert({
      client_id: user.id,
      client_email: user.email,
      judul,
      deskripsi,
      kategori,
      file_url,
      file_urls: uploadedFiles,
      status: 'PENDING'
    })

    if (error) {
      alert('Gagal kirim request: ' + error.message)
    } else {
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
          onClick={onBack}
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
          onClick={onBack}
          className="text-gray-400 hover:text-gray-600 mb-6 flex items-center gap-2 text-sm"
        >
          ← Kembali
        </button>

        <h1 className="text-2xl font-bold text-gray-800 mb-6">Buat Request Baru</h1>

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
            <option value="Desain">Desain</option>
            <option value="Video">Video</option>
            <option value="Penulisan">Penulisan</option>
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
            rows={4}
            className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
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