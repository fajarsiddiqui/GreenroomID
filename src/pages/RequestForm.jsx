import { useState } from 'react'
import { supabase } from '../supabase'

function RequestForm({ user, onBack }) {
  const [judul, setJudul] = useState('')
  const [deskripsi, setDeskripsi] = useState('')
  const [kategori, setKategori] = useState('')
  const [file, setFile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [sukses, setSukses] = useState(false)

  const handleSubmit = async () => {
    if (!judul || !deskripsi || !kategori) {
      alert('Mohon isi semua kolom!')
      return
    }

    setLoading(true)

    let file_url = null

    // Upload file kalau ada
    if (file) {
      const fileName = `${user.id}-${Date.now()}-${file.name}`
      const { error: uploadError } = await supabase.storage
        .from('request-files')
        .upload(fileName, file)

      if (uploadError) {
        alert('Gagal upload file: ' + uploadError.message)
        setLoading(false)
        return
      }

      const { data: urlData } = supabase.storage
        .from('request-files')
        .getPublicUrl(fileName)

      file_url = urlData.publicUrl
    }

    // Simpan request ke database
    const { error } = await supabase.from('requests').insert({
      client_id: user.id,
      client_email: user.email,
      judul,
      deskripsi,
      kategori,
      file_url,
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
          <label className="block text-sm font-medium text-gray-700 mb-1">Upload File (opsional)</label>
          <input
            type="file"
            onChange={(e) => setFile(e.target.files[0])}
            className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm"
          />
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