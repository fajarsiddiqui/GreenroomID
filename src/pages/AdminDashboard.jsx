import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

function AdminDashboard({ user }) {
  const [requests, setRequests] = useState([])
  const [selected, setSelected] = useState(null)
  const [diskusi, setDiskusi] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [pesan, setPesan] = useState('')
  const [resultFile, setResultFile] = useState(null)
  const [uploadResultLoading, setUploadResultLoading] = useState(false)

  const [form, setForm] = useState({
    harga: '',
    deadline_at: '',
    status: '',
    invoice_status: '',
    payment_status: '',
    hasil_url: '',
    admin_note: ''
  })

  const fetchRequests = async () => {
    setLoading(true)

    const { data, error } = await supabase
      .from('requests')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      alert('Gagal mengambil data request: ' + error.message)
    } else {
      setRequests(data || [])
    }

    setLoading(false)
  }

  const fetchDiskusi = async (requestId) => {
    const { data, error } = await supabase
      .from('diskusi')
      .select('*')
      .eq('request_id', requestId)
      .order('created_at', { ascending: true })

    if (!error) setDiskusi(data || [])
  }

  useEffect(() => {
    fetchRequests()
  }, [])

  const openDetail = (req) => {
    setSelected(req)
    setForm({
      harga: req.harga || '',
      deadline_at: req.deadline_at ? req.deadline_at.slice(0, 16) : '',
      status: req.status || 'PENDING',
      invoice_status: req.invoice_status || 'NOT_CREATED',
      payment_status: req.payment_status || 'UNPAID',
      hasil_url: req.hasil_url || '',
      admin_note: req.admin_note || ''
    })
    fetchDiskusi(req.id)
  }

  const refreshSelected = async () => {
    if (!selected) return

    const { data, error } = await supabase
      .from('requests')
      .select('*')
      .eq('id', selected.id)
      .single()

    if (!error && data) {
      setSelected(data)
      setForm({
        harga: data.harga || '',
        deadline_at: data.deadline_at ? data.deadline_at.slice(0, 16) : '',
        status: data.status || 'PENDING',
        invoice_status: data.invoice_status || 'NOT_CREATED',
        payment_status: data.payment_status || 'UNPAID',
        hasil_url: data.hasil_url || '',
        admin_note: data.admin_note || ''
      })
    }

    fetchRequests()
  }

  const simpanPerubahan = async () => {
    if (!selected) return

    setSaving(true)

    const payload = {
      harga: form.harga ? Number(form.harga) : null,
      deadline_at: form.deadline_at ? new Date(form.deadline_at).toISOString() : null,
      status: form.status,
      invoice_status: form.invoice_status,
      payment_status: form.payment_status,
      hasil_url: form.hasil_url || null,
      admin_note: form.admin_note || null
    }

    const { error } = await supabase
      .from('requests')
      .update(payload)
      .eq('id', selected.id)

    if (error) {
      alert('Gagal menyimpan perubahan: ' + error.message)
    } else {
      alert('Perubahan berhasil disimpan.')
      refreshSelected()
    }

    setSaving(false)
  }

  const buatInvoice = async () => {
    if (!selected) return

    if (!form.harga) {
      alert('Isi harga dulu sebelum membuat invoice.')
      return
    }

    setSaving(true)

    const { error } = await supabase
      .from('requests')
      .update({
        harga: Number(form.harga),
        deadline_at: form.deadline_at ? new Date(form.deadline_at).toISOString() : null,
        invoice_status: 'WAITING_PAYMENT',
        payment_status: 'UNPAID',
        status: 'WAITING PAYMENT',
        admin_note: form.admin_note || null
      })
      .eq('id', selected.id)

    if (error) {
      alert('Gagal membuat invoice: ' + error.message)
    } else {
      alert('Invoice berhasil dibuat.')
      refreshSelected()
    }

    setSaving(false)
  }

  const verifikasiPembayaran = async () => {
    if (!selected) return

    setSaving(true)

    const { error } = await supabase
      .from('requests')
      .update({
        payment_status: 'VERIFIED',
        invoice_status: 'PAID'
      })
      .eq('id', selected.id)

    if (error) {
      alert('Gagal verifikasi pembayaran: ' + error.message)
    } else {
      alert('Pembayaran berhasil diverifikasi.')
      refreshSelected()
    }

    setSaving(false)
  }

  const uploadFileHasil = async () => {
    if (!selected) return

    if (selected.payment_status !== 'VERIFIED') {
        alert('Pembayaran harus diverifikasi dulu sebelum file hasil dikirim ke client.')
        return
    }

    if (!resultFile) {
        alert('Pilih file hasil dulu.')
        return
        }

    setUploadResultLoading(true)

  const fileName = `result-files/${selected.id}-${Date.now()}-${resultFile.name}`

  const { error: uploadError } = await supabase.storage
    .from('request-files')
    .upload(fileName, resultFile)

    if (uploadError) {
        alert('Gagal upload file hasil: ' + uploadError.message)
        setUploadResultLoading(false)
        return
    }

  const { data: urlData } = supabase.storage
    .from('request-files')
    .getPublicUrl(fileName)

  const resultUrl = urlData.publicUrl

  const { error: updateError } = await supabase
    .from('requests')
    .update({
      hasil_url: resultUrl,
      status: 'DELIVERED'
    })
    .eq('id', selected.id)

  if (updateError) {
    alert('File terupload, tapi gagal update request: ' + updateError.message)
  } else {
    alert('File hasil berhasil diupload dan dikirim ke client.')
    setResultFile(null)
    setForm({
      ...form,
      hasil_url: resultUrl,
      status: 'DELIVERED'
    })
    refreshSelected()
  }

  setUploadResultLoading(false)
}
  const tolakPembayaran = async () => {
    if (!selected) return

    setSaving(true)

    const { error } = await supabase
      .from('requests')
      .update({
        payment_status: 'REJECTED',
        status: 'WAITING PAYMENT',
        admin_note: form.admin_note || 'Bukti pembayaran belum valid. Mohon upload ulang bukti pembayaran yang benar.'
      })
      .eq('id', selected.id)

    if (error) {
      alert('Gagal menolak pembayaran: ' + error.message)
    } else {
      alert('Pembayaran ditolak. Client perlu upload ulang bukti bayar.')
      refreshSelected()
    }

    setSaving(false)
  }

  const kirimPesanAdmin = async () => {
    if (!pesan.trim() || !selected) return

    const { error } = await supabase.from('diskusi').insert({
      request_id: selected.id,
      pengirim_email: user.email,
      pesan,
      role: 'admin'
    })

    if (error) {
      alert('Gagal mengirim pesan: ' + error.message)
    } else {
      setPesan('')
      fetchDiskusi(selected.id)
    }
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

  if (selected) {
    return (
      <div className="min-h-screen bg-gray-100">
        <div className="bg-white shadow-sm px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-800">GreenroomID Admin</h1>
            <p className="text-xs text-gray-400">{user.email}</p>
          </div>
          <button
            onClick={() => {
              setSelected(null)
              setDiskusi([])
              fetchRequests()
            }}
            className="text-sm text-blue-500 hover:text-blue-700"
          >
            Kembali ke daftar
          </button>
        </div>

        <div className="max-w-5xl mx-auto p-6 space-y-6">
          <div className="bg-white rounded-2xl shadow-sm p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-xl font-bold text-gray-800">{selected.judul}</h2>
                <p className="text-sm text-gray-400">{selected.client_email}</p>
              </div>
              <span className={'text-xs font-medium px-3 py-1 rounded-full ' + getStatusColor(selected.status)}>
                {selected.status}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
              <div>
                <p className="text-gray-400">Kategori</p>
                <p className="font-medium text-gray-700">{selected.kategori}</p>
              </div>
              <div>
                <p className="text-gray-400">Tanggal Request</p>
                <p className="font-medium text-gray-700">{formatTanggal(selected.created_at)}</p>
              </div>
              <div>
                <p className="text-gray-400">Harga Saat Ini</p>
                <p className="font-medium text-gray-700">{formatRupiah(selected.harga)}</p>
              </div>
              <div>
                <p className="text-gray-400">Deadline</p>
                <p className="font-medium text-gray-700">{formatTanggal(selected.deadline_at)}</p>
              </div>
            </div>

            <div className="mb-4">
              <p className="text-gray-400 text-sm mb-1">Deskripsi Client</p>
              <p className="text-gray-700 text-sm whitespace-pre-wrap">{selected.deskripsi}</p>
            </div>

            <div className="flex flex-wrap gap-3">
              {selected.file_url && (
                <a
                  href={selected.file_url}
                  target="_blank"
                  rel="noreferrer"
                  className="bg-blue-50 text-blue-600 px-4 py-2 rounded-xl text-sm hover:bg-blue-100"
                >
                  Lihat File Client
                </a>
              )}

              {selected.payment_proof_url && (
                <a
                  href={selected.payment_proof_url}
                  target="_blank"
                  rel="noreferrer"
                  className="bg-indigo-50 text-indigo-600 px-4 py-2 rounded-xl text-sm hover:bg-indigo-100"
                >
                  Lihat Bukti Bayar
                </a>
              )}

              {selected.hasil_url && (
                <a
                  href={selected.hasil_url}
                  target="_blank"
                  rel="noreferrer"
                  className="bg-green-50 text-green-600 px-4 py-2 rounded-xl text-sm hover:bg-green-100"
                >
                  Lihat File Hasil
                </a>
              )}
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm p-6">
            <h3 className="font-bold text-gray-800 mb-4">Kontrol Admin</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm text-gray-600 mb-1">Harga Invoice</label>
                <input
                  type="number"
                  value={form.harga}
                  onChange={(e) => setForm({ ...form, harga: e.target.value })}
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm"
                  placeholder="Contoh: 150000"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-600 mb-1">Deadline</label>
                <input
                  type="datetime-local"
                  value={form.deadline_at}
                  onChange={(e) => setForm({ ...form, deadline_at: e.target.value })}
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-600 mb-1">Status Request</label>
                <select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm"
                >
                  <option value="PENDING">PENDING</option>
                  <option value="OPEN">OPEN</option>
                  <option value="ON PROGRESS">ON PROGRESS</option>
                  <option value="REVIEW">REVIEW</option>
                  <option value="WAITING PAYMENT">WAITING PAYMENT</option>
                  <option value="PAYMENT UPLOADED">PAYMENT UPLOADED</option>
                  <option value="DELIVERED">DELIVERED</option>
                  <option value="DONE">DONE</option>
                  <option value="DISPUTE">DISPUTE</option>
                </select>
              </div>

              <div>
                <label className="block text-sm text-gray-600 mb-1">Status Invoice</label>
                <select
                  value={form.invoice_status}
                  onChange={(e) => setForm({ ...form, invoice_status: e.target.value })}
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm"
                >
                  <option value="NOT_CREATED">NOT_CREATED</option>
                  <option value="WAITING_PAYMENT">WAITING_PAYMENT</option>
                  <option value="PAID">PAID</option>
                  <option value="EXPIRED">EXPIRED</option>
                </select>
              </div>

              <div>
                <label className="block text-sm text-gray-600 mb-1">Status Pembayaran</label>
                <select
                  value={form.payment_status}
                  onChange={(e) => setForm({ ...form, payment_status: e.target.value })}
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm"
                >
                  <option value="UNPAID">UNPAID</option>
                  <option value="UPLOADED">UPLOADED</option>
                  <option value="VERIFIED">VERIFIED</option>
                  <option value="REJECTED">REJECTED</option>
                </select>
              </div>

              <div>
                <label className="block text-sm text-gray-600 mb-1">Link File Hasil</label>
                <input
                  type="text"
                  value={form.hasil_url}
                  onChange={(e) => setForm({ ...form, hasil_url: e.target.value })}
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm"
                  placeholder="Paste link hasil kerja"
                />
              </div>

              <div className="md:col-span-2 border border-green-200 bg-green-50 rounded-xl p-4">
                <label className="block text-sm text-green-700 font-medium mb-2">
                    Upload File Hasil
                </label>

                <input
                    type="file"
                    onChange={(e) => setResultFile(e.target.files[0])}
                    className="w-full border border-green-200 bg-white rounded-xl px-4 py-3 text-sm mb-3"
                />

                <button
                    onClick={uploadFileHasil}
                    disabled={uploadResultLoading}
                    className="w-full bg-green-600 text-white px-5 py-3 rounded-xl text-sm hover:bg-green-700 disabled:opacity-50"
                >
                    {uploadResultLoading ? 'Mengupload...' : 'Upload & Kirim File Hasil'}
                </button>

                <p className="text-xs text-green-700 mt-2">
                    File hasil hanya bisa dikirim setelah pembayaran berstatus VERIFIED.
                </p>
            </div>
            </div>

            <div className="mb-4">
              <label className="block text-sm text-gray-600 mb-1">Catatan Admin</label>
              <textarea
                value={form.admin_note}
                onChange={(e) => setForm({ ...form, admin_note: e.target.value })}
                className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm"
                rows={3}
                placeholder="Catatan untuk client"
              />
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                onClick={simpanPerubahan}
                disabled={saving}
                className="bg-gray-800 text-white px-5 py-3 rounded-xl text-sm hover:bg-gray-900 disabled:opacity-50"
              >
                {saving ? 'Menyimpan...' : 'Simpan Perubahan'}
              </button>

              <button
                onClick={buatInvoice}
                disabled={saving}
                className="bg-blue-600 text-white px-5 py-3 rounded-xl text-sm hover:bg-blue-700 disabled:opacity-50"
              >
                Buat Invoice
              </button>

              <button
                onClick={verifikasiPembayaran}
                disabled={saving}
                className="bg-green-600 text-white px-5 py-3 rounded-xl text-sm hover:bg-green-700 disabled:opacity-50"
              >
                Verifikasi Pembayaran
              </button>

              <button
                onClick={tolakPembayaran}
                disabled={saving}
                className="bg-red-600 text-white px-5 py-3 rounded-xl text-sm hover:bg-red-700 disabled:opacity-50"
              >
                Tolak Pembayaran
              </button>
            </div>
          </div>

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
                placeholder="Tulis pesan sebagai admin..."
                value={pesan}
                onChange={(e) => setPesan(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && kirimPesanAdmin()}
                className="flex-1 border border-gray-300 rounded-xl px-4 py-2 text-sm"
              />
              <button
                onClick={kirimPesanAdmin}
                className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm hover:bg-blue-700"
              >
                Kirim
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="bg-white shadow-sm px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-800">GreenroomID Admin</h1>
          <p className="text-xs text-gray-400">{user.email}</p>
        </div>
        <button
          onClick={() => supabase.auth.signOut()}
          className="text-sm text-red-400 hover:text-red-600 transition"
        >
          Keluar
        </button>
      </div>

      <div className="max-w-5xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-gray-700">Semua Request</h2>
          <button
            onClick={fetchRequests}
            className="bg-gray-800 text-white text-sm px-5 py-2 rounded-xl hover:bg-gray-900"
          >
            Refresh
          </button>
        </div>

        {loading && <p className="text-center text-gray-400 py-10">Memuat...</p>}

        {!loading && requests.length === 0 && (
          <div className="bg-white rounded-2xl shadow-sm p-10 text-center">
            <p className="text-gray-500">Belum ada request.</p>
          </div>
        )}

        {!loading && requests.length > 0 && (
          <div className="space-y-4">
            {requests.map((req) => (
              <div
                key={req.id}
                onClick={() => openDetail(req)}
                className="bg-white rounded-2xl shadow-sm p-6 cursor-pointer hover:shadow-md transition"
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h3 className="font-bold text-gray-800">{req.judul}</h3>
                    <p className="text-xs text-gray-400">{req.client_email}</p>
                  </div>
                  <span className={'text-xs font-medium px-3 py-1 rounded-full ' + getStatusColor(req.status)}>
                    {req.status}
                  </span>
                </div>

                <p className="text-sm text-gray-500 mb-3 line-clamp-2">{req.deskripsi}</p>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs text-gray-500">
                  <span>Kategori: {req.kategori}</span>
                  <span>Harga: {formatRupiah(req.harga)}</span>
                  <span>Invoice: {req.invoice_status || 'NOT_CREATED'}</span>
                  <span>Payment: {req.payment_status || 'UNPAID'}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default AdminDashboard