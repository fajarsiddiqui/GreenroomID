import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { createAuditLog } from '../utils/auditLog'
import { validateFile, allowedPaymentFileTypes, MAX_PAYMENT_FILE_SIZE_MB } from '../utils/fileValidation'
import { createAdminQrisSignedUrl, getAdminQrisStoragePath } from '../utils/paymentAssetAccess'
import { REQUEST_FILES_BUCKET } from '../utils/requestFileAccess'

const DEFAULT_SETTINGS_ID = 'default'

function AdminProfilePage({ user }) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [qrisFile, setQrisFile] = useState(null)
  const [qrisPreviewUrl, setQrisPreviewUrl] = useState('')
  const [qrisPreviewError, setQrisPreviewError] = useState('')
  const [form, setForm] = useState({
    admin_name: '',
    admin_phone: '',
    bank_name: '',
    account_type: '',
    account_number: '',
    account_holder: '',
    payment_instruction: '',
    qris_url: '',
    qris_storage_path: ''
  })

  const fetchSettings = async () => {
    setLoading(true)

    const { data, error } = await supabase
      .from('admin_payment_settings')
      .select('*')
      .eq('id', DEFAULT_SETTINGS_ID)
      .maybeSingle()

    if (error) {
      alert('Gagal mengambil profile pembayaran. Pastikan SQL update H5 sudah dijalankan. Detail: ' + error.message)
    }

    if (data) {
      setForm({
        admin_name: data.admin_name || '',
        admin_phone: data.admin_phone || '',
        bank_name: data.bank_name || '',
        account_type: data.account_type || '',
        account_number: data.account_number || '',
        account_holder: data.account_holder || '',
        payment_instruction: data.payment_instruction || '',
        qris_url: data.qris_url || '',
        qris_storage_path: data.qris_storage_path || ''
      })
    }

    setLoading(false)
  }

  useEffect(() => {
    fetchSettings()
  }, [])

  useEffect(() => {
    let active = true

    const loadPreview = async () => {
      setQrisPreviewUrl('')
      setQrisPreviewError('')

      if (form.qris_storage_path) {
        const { url, error } = await createAdminQrisSignedUrl(supabase, form.qris_storage_path)
        if (!active) return
        setQrisPreviewUrl(url)
        setQrisPreviewError(error)
        return
      }

      if (form.qris_url) {
        setQrisPreviewUrl(form.qris_url)
      }
    }

    loadPreview()

    return () => {
      active = false
    }
  }, [form.qris_storage_path, form.qris_url])

  const uploadQris = async () => {
    if (!qrisFile) {
      return {
        storagePath: getAdminQrisStoragePath(form.qris_storage_path),
        uploadedPath: ''
      }
    }

    const validation = validateFile(qrisFile, allowedPaymentFileTypes.filter((type) => type.startsWith('image/')), MAX_PAYMENT_FILE_SIZE_MB)
    if (!validation.valid) {
      alert(validation.message)
      return null
    }

    const safeName = qrisFile.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const fileName = `admin-qris/${user.id}-${Date.now()}-${crypto.randomUUID()}-${safeName}`

    const { error: uploadError } = await supabase.storage
      .from(REQUEST_FILES_BUCKET)
      .upload(fileName, qrisFile, { upsert: false })

    if (uploadError) {
      alert('Gagal upload QRIS: ' + uploadError.message)
      return null
    }

    return {
      storagePath: fileName,
      uploadedPath: fileName
    }
  }

  const saveProfile = async () => {
    setSaving(true)

    const qrisUpload = await uploadQris()
    if (!qrisUpload) {
      setSaving(false)
      return
    }

    const previousQrisPath = getAdminQrisStoragePath(form.qris_storage_path)

    const payload = {
      id: DEFAULT_SETTINGS_ID,
      admin_name: form.admin_name.trim() || null,
      admin_phone: form.admin_phone.trim() || null,
      bank_name: form.bank_name.trim() || null,
      account_type: form.account_type.trim() || null,
      account_number: form.account_number.trim() || null,
      account_holder: form.account_holder.trim() || null,
      payment_instruction: form.payment_instruction.trim() || null,
      qris_url: form.qris_url || null,
      qris_storage_path: qrisUpload.storagePath || null,
      updated_by: user.id,
      updated_at: new Date().toISOString()
    }

    const { error } = await supabase
      .from('admin_payment_settings')
      .upsert(payload, { onConflict: 'id' })

    if (error) {
      if (qrisUpload.uploadedPath) {
        await supabase.storage.from(REQUEST_FILES_BUCKET).remove([qrisUpload.uploadedPath])
      }
      alert('Gagal menyimpan profile pembayaran: ' + error.message)
    } else {
      if (qrisUpload.uploadedPath && previousQrisPath && previousQrisPath !== qrisUpload.uploadedPath) {
        await supabase.storage.from(REQUEST_FILES_BUCKET).remove([previousQrisPath])
      }

      await createAuditLog({
        actorId: user.id,
        actorEmail: user.email,
        actorRole: 'admin',
        action: 'ADMIN_PAYMENT_PROFILE_UPDATED',
        description: 'Admin memperbarui profile pembayaran dan instruksi invoice.',
        metadata: {
          has_qris: Boolean(payload.qris_storage_path || payload.qris_url),
          bank_name: payload.bank_name,
          account_type: payload.account_type,
          admin_phone: payload.admin_phone
        }
      })
      alert('Profile pembayaran berhasil disimpan.')
      setQrisFile(null)
      fetchSettings()
    }

    setSaving(false)
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <p className="text-xs text-gray-400 mb-1">Admin / Profile</p>
        <h2 className="text-2xl font-bold text-gray-900">Profile Pembayaran Admin</h2>
        <p className="text-sm text-gray-500 mt-1">
          Data ini dipakai di laci pembayaran client, termasuk rekening, nomor admin, instruksi, dan QRIS.
        </p>
      </div>

      {loading && <div className="bg-white rounded-2xl shadow-sm p-10 text-center text-gray-400">Memuat profile pembayaran...</div>}

      {!loading && (
        <div className="bg-white rounded-2xl shadow-sm p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Nama Admin / Brand</label>
              <input value={form.admin_name} onChange={(e) => setForm({ ...form, admin_name: e.target.value })} className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm" placeholder="GreenroomID" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Nomor Admin / WhatsApp</label>
              <input value={form.admin_phone} onChange={(e) => setForm({ ...form, admin_phone: e.target.value })} className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm" placeholder="62812xxxx" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Jenis Rekening / E-wallet</label>
              <input value={form.account_type} onChange={(e) => setForm({ ...form, account_type: e.target.value })} className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm" placeholder="Bank / DANA / OVO / GoPay" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Nama Bank / Provider</label>
              <input value={form.bank_name} onChange={(e) => setForm({ ...form, bank_name: e.target.value })} className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm" placeholder="BCA, BRI, Mandiri, DANA..." />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Nomor Rekening / Nomor Wallet</label>
              <input value={form.account_number} onChange={(e) => setForm({ ...form, account_number: e.target.value })} className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm" placeholder="Nomor rekening" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Atas Nama</label>
              <input value={form.account_holder} onChange={(e) => setForm({ ...form, account_holder: e.target.value })} className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm" placeholder="Nama pemilik rekening" />
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Instruksi Pembayaran</label>
            <textarea value={form.payment_instruction} onChange={(e) => setForm({ ...form, payment_instruction: e.target.value })} className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm" rows={5} placeholder="Contoh: Transfer sesuai nominal invoice, lalu upload bukti bayar. Admin akan memverifikasi pembayaran." />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border border-gray-200 rounded-2xl p-4">
              <p className="font-semibold text-gray-800 mb-2">Upload Foto QRIS</p>
              <input type="file" accept="image/*" onChange={(e) => setQrisFile(e.target.files[0])} className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm" />
              <p className="text-xs text-gray-400 mt-2">Format gambar JPG, PNG, atau WebP. Maksimal {MAX_PAYMENT_FILE_SIZE_MB} MB.</p>
            </div>
            <div className="border border-gray-200 rounded-2xl p-4 bg-gray-50">
              <p className="font-semibold text-gray-800 mb-2">Preview QRIS Aktif</p>
              {qrisPreviewUrl ? (
                <img src={qrisPreviewUrl} alt="QRIS Admin" className="max-h-56 rounded-xl border border-gray-200 bg-white object-contain" />
              ) : qrisPreviewError ? (
                <p className="text-sm text-red-500">{qrisPreviewError}</p>
              ) : (
                <p className="text-sm text-gray-400">Belum ada QRIS yang tersimpan.</p>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button onClick={fetchSettings} className="bg-gray-100 text-gray-700 px-5 py-3 rounded-xl text-sm hover:bg-gray-200">Reset</button>
            <button onClick={saveProfile} disabled={saving} className="bg-gray-900 text-white px-5 py-3 rounded-xl text-sm hover:bg-gray-800 disabled:opacity-50">
              {saving ? 'Menyimpan...' : 'Simpan Profile'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default AdminProfilePage
