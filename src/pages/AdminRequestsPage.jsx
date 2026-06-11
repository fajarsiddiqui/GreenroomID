import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import {
  validateFile,
  allowedResultFileTypes,
  allowedPreviewFileTypes,
  MAX_RESULT_FILE_SIZE_MB,
  MAX_PREVIEW_FILE_SIZE_MB
} from '../utils/fileValidation'
import { createAuditLog } from '../utils/auditLog'

const STATUS_OPTIONS = [
  'PENDING',
  'OPEN',
  'ON PROGRESS',
  'REVIEW',
  'WAITING PAYMENT',
  'PAYMENT UPLOADED',
  'DELIVERED',
  'DONE',
  'DISPUTE'
]

const INVOICE_STATUS_OPTIONS = ['NOT_CREATED', 'WAITING_PAYMENT', 'PAID', 'EXPIRED']
const PAYMENT_STATUS_OPTIONS = ['UNPAID', 'UPLOADED', 'VERIFIED', 'REJECTED']

function AdminRequestsPage({ user }) {
  const [requests, setRequests] = useState([])
  const [selected, setSelected] = useState(null)
  const [requestFiles, setRequestFiles] = useState([])
  const [fileSummary, setFileSummary] = useState({})
  const [diskusi, setDiskusi] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [pesan, setPesan] = useState('')
  const [previewFile, setPreviewFile] = useState(null)
  const [resultFile, setResultFile] = useState(null)
  const [resultKind, setResultKind] = useState('final_result')
  const [uploadPreviewLoading, setUploadPreviewLoading] = useState(false)
  const [uploadResultLoading, setUploadResultLoading] = useState(false)
  const [auditLogs, setAuditLogs] = useState([])

  const [filters, setFilters] = useState({
    keyword: '',
    status: '',
    payment_status: '',
    invoice_status: '',
    kategori: '',
    deadline: '',
    file_condition: '',
    sort: 'newest'
  })

  const [form, setForm] = useState({
    harga: '',
    deadline_at: '',
    status: '',
    invoice_status: '',
    payment_status: '',
    hasil_url: '',
    admin_note: ''
  })

  const buildFileSummary = (files = []) => {
    return files.reduce((acc, file) => {
      const key = String(file.request_id)

      if (!acc[key]) {
        acc[key] = {
          total: 0,
          initial: 0,
          additional: 0,
          preview: 0,
          result: 0
        }
      }

      acc[key].total += 1

      if (file.file_kind === 'initial_client_file') acc[key].initial += 1
      if (file.file_kind === 'additional_client_file') acc[key].additional += 1
      if (file.file_kind === 'preview_file') acc[key].preview += 1
      if (['final_result', 'revision_result', 'additional_result', 'result_file'].includes(file.file_kind)) {
        acc[key].result += 1
      }

      return acc
    }, {})
  }

  const fetchRequests = async () => {
    setLoading(true)

    const { data, error } = await supabase
      .from('requests')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      alert('Gagal mengambil data request: ' + error.message)
      setLoading(false)
      return
    }

    setRequests(data || [])

    const { data: filesData, error: filesError } = await supabase
      .from('request_files')
      .select('request_id, file_kind')

    if (!filesError) {
      setFileSummary(buildFileSummary(filesData || []))
    }

    setLoading(false)
  }

  const fetchRequestFiles = async (requestId) => {
    const { data, error } = await supabase
      .from('request_files')
      .select('*')
      .eq('request_id', String(requestId))
      .order('created_at', { ascending: true })

    if (!error) setRequestFiles(data || [])
  }

  const fetchDiskusi = async (requestId) => {
    const { data, error } = await supabase
      .from('diskusi')
      .select('*')
      .eq('request_id', requestId)
      .order('created_at', { ascending: true })

    if (!error) setDiskusi(data || [])
  }

  const fetchAuditLogs = async (requestId) => {
    const { data, error } = await supabase
      .from('audit_logs')
      .select('*')
      .eq('request_id', requestId)
      .order('created_at', { ascending: false })
      .limit(10)

    if (!error) setAuditLogs(data || [])
  }

  useEffect(() => {
    fetchRequests()
  }, [])

  const hydrateForm = (req) => {
    setForm({
      harga: req.harga || '',
      deadline_at: req.deadline_at ? req.deadline_at.slice(0, 16) : '',
      status: req.status || 'PENDING',
      invoice_status: req.invoice_status || 'NOT_CREATED',
      payment_status: req.payment_status || 'UNPAID',
      hasil_url: req.hasil_url || '',
      admin_note: req.admin_note || ''
    })
  }

  const openDetail = (req) => {
    setSelected(req)
    hydrateForm(req)
    setPreviewFile(null)
    setResultFile(null)
    setResultKind('final_result')
    fetchRequestFiles(req.id)
    fetchDiskusi(req.id)
    fetchAuditLogs(req.id)
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
      hydrateForm(data)
      fetchRequestFiles(data.id)
      fetchAuditLogs(data.id)
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
      if (selected.status !== payload.status) {
        await createAuditLog({
          requestId: selected.id,
          actorId: user.id,
          actorEmail: user.email,
          actorRole: 'admin',
          action: 'STATUS_CHANGED',
          description: `Admin mengubah status request dari ${selected.status || '-'} ke ${payload.status || '-'}`,
          metadata: {
            previous_status: selected.status,
            new_status: payload.status
          }
        })
      }

      if (selected.payment_status !== payload.payment_status) {
        await createAuditLog({
          requestId: selected.id,
          actorId: user.id,
          actorEmail: user.email,
          actorRole: 'admin',
          action: 'PAYMENT_STATUS_CHANGED',
          description: `Admin mengubah status pembayaran dari ${selected.payment_status || '-'} ke ${payload.payment_status || '-'}`,
          metadata: {
            previous_payment_status: selected.payment_status,
            new_payment_status: payload.payment_status
          }
        })
      }

      await createAuditLog({
        requestId: selected.id,
        actorId: user.id,
        actorEmail: user.email,
        actorRole: 'admin',
        action: 'REQUEST_UPDATED',
        description: `Admin memperbarui request: ${selected.judul}`,
        metadata: {
          previous: {
            harga: selected.harga,
            deadline_at: selected.deadline_at,
            status: selected.status,
            invoice_status: selected.invoice_status,
            payment_status: selected.payment_status,
            hasil_url: selected.hasil_url,
            admin_note: selected.admin_note
          },
          updated: payload
        }
      })

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
      await createAuditLog({
        requestId: selected.id,
        actorId: user.id,
        actorEmail: user.email,
        actorRole: 'admin',
        action: 'INVOICE_CREATED',
        description: `Admin membuat invoice untuk request: ${selected.judul}`,
        metadata: {
          harga: Number(form.harga),
          deadline_at: form.deadline_at || null,
          previous_status: selected.status,
          new_status: 'WAITING PAYMENT'
        }
      })

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
      await createAuditLog({
        requestId: selected.id,
        actorId: user.id,
        actorEmail: user.email,
        actorRole: 'admin',
        action: 'PAYMENT_VERIFIED',
        description: `Admin memverifikasi pembayaran untuk request: ${selected.judul}`,
        metadata: {
          previous_payment_status: selected.payment_status,
          new_payment_status: 'VERIFIED',
          previous_invoice_status: selected.invoice_status,
          new_invoice_status: 'PAID'
        }
      })

      alert('Pembayaran berhasil diverifikasi.')
      refreshSelected()
    }

    setSaving(false)
  }

  const tolakPembayaran = async () => {
    if (!selected) return

    setSaving(true)

    const rejectedNote = form.admin_note || 'Bukti pembayaran belum valid. Mohon upload ulang bukti pembayaran yang benar.'

    const { error } = await supabase
      .from('requests')
      .update({
        payment_status: 'REJECTED',
        status: 'WAITING PAYMENT',
        admin_note: rejectedNote
      })
      .eq('id', selected.id)

    if (error) {
      alert('Gagal menolak pembayaran: ' + error.message)
    } else {
      await createAuditLog({
        requestId: selected.id,
        actorId: user.id,
        actorEmail: user.email,
        actorRole: 'admin',
        action: 'PAYMENT_REJECTED',
        description: `Admin menolak bukti pembayaran untuk request: ${selected.judul}`,
        metadata: {
          previous_payment_status: selected.payment_status,
          new_payment_status: 'REJECTED',
          previous_status: selected.status,
          new_status: 'WAITING PAYMENT',
          admin_note: rejectedNote
        }
      })

      alert('Pembayaran ditolak. Client perlu upload ulang bukti bayar.')
      refreshSelected()
    }

    setSaving(false)
  }

  const uploadRequestFile = async ({ file, fileKind, folder, maxSizeMb, allowedTypes, action, description }) => {
    if (!selected) return null

    if (!file) {
      alert('Pilih file dulu.')
      return null
    }

    const validation = validateFile(file, allowedTypes, maxSizeMb)

    if (!validation.valid) {
      alert(validation.message)
      return null
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const fileName = `${folder}/${selected.id}-${Date.now()}-${crypto.randomUUID()}-${safeName}`

    const { error: uploadError } = await supabase.storage
      .from('request-files')
      .upload(fileName, file)

    if (uploadError) {
      alert('Gagal upload file: ' + uploadError.message)
      return null
    }

    const { data: urlData } = supabase.storage
      .from('request-files')
      .getPublicUrl(fileName)

    const fileUrl = urlData.publicUrl

    const row = {
      request_id: String(selected.id),
      uploaded_by: user.id,
      uploader_email: user.email,
      uploader_role: 'admin',
      file_kind: fileKind,
      file_name: file.name,
      file_url: fileUrl,
      file_size: file.size,
      file_type: file.type
    }

    const { error: insertError } = await supabase
      .from('request_files')
      .insert(row)

    if (insertError) {
      alert('File terupload, tapi gagal menyimpan metadata file: ' + insertError.message)
      return null
    }

    await createAuditLog({
      requestId: selected.id,
      actorId: user.id,
      actorEmail: user.email,
      actorRole: 'admin',
      action,
      description,
      metadata: {
        file_kind: fileKind,
        file_name: file.name,
        file_url: fileUrl,
        file_size: file.size,
        file_type: file.type
      }
    })

    return fileUrl
  }

  const uploadFilePreview = async () => {
    setUploadPreviewLoading(true)

    const previewUrl = await uploadRequestFile({
      file: previewFile,
      fileKind: 'preview_file',
      folder: 'preview-files',
      maxSizeMb: MAX_PREVIEW_FILE_SIZE_MB,
      allowedTypes: allowedPreviewFileTypes,
      action: 'PREVIEW_FILE_UPLOADED',
      description: `Admin mengupload file preview untuk request: ${selected?.judul || selected?.id}`
    })

    if (previewUrl) {
      alert('File preview berhasil diupload. Client bisa melihat preview ini.')
      setPreviewFile(null)
      refreshSelected()
    }

    setUploadPreviewLoading(false)
  }

  const uploadFileHasil = async () => {
    setUploadResultLoading(true)

    const resultUrl = await uploadRequestFile({
      file: resultFile,
      fileKind: resultKind,
      folder: 'result-files',
      maxSizeMb: MAX_RESULT_FILE_SIZE_MB,
      allowedTypes: allowedResultFileTypes,
      action: resultKind === 'revision_result' ? 'REVISION_RESULT_UPLOADED' : 'RESULT_UPLOADED',
      description: `Admin mengupload file hasil untuk request: ${selected?.judul || selected?.id}`
    })

    if (resultUrl) {
      const payload = {
        status: 'DELIVERED'
      }

      if (selected.payment_status === 'VERIFIED' || selected.invoice_status === 'PAID') {
        payload.hasil_url = resultUrl
      }

      const { error: updateError } = await supabase
        .from('requests')
        .update(payload)
        .eq('id', selected.id)

      if (updateError) {
        alert('File hasil berhasil diupload, tapi gagal update status request: ' + updateError.message)
      } else {
        await createAuditLog({
          requestId: selected.id,
          actorId: user.id,
          actorEmail: user.email,
          actorRole: 'admin',
          action: 'STATUS_CHANGED',
          description: `Admin mengubah status request menjadi DELIVERED setelah upload file hasil`,
          metadata: {
            previous_status: selected.status,
            new_status: 'DELIVERED',
            file_kind: resultKind,
            result_url_visible_in_legacy_column: Boolean(payload.hasil_url)
          }
        })
      }

      alert('File hasil berhasil diupload. Upload ini tidak membuat invoice baru.')
      setResultFile(null)
      setResultKind('final_result')
      refreshSelected()
    }

    setUploadResultLoading(false)
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
      await createAuditLog({
        requestId: selected.id,
        actorId: user.id,
        actorEmail: user.email,
        actorRole: 'admin',
        action: 'ADMIN_MESSAGE_SENT',
        description: `Admin mengirim pesan untuk request: ${selected.judul}`,
        metadata: { message_length: pesan.trim().length }
      })

      setPesan('')
      fetchDiskusi(selected.id)
      fetchAuditLogs(selected.id)
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

  const formatTanggalJam = (tanggal) => {
    if (!tanggal) return '-'

    return new Date(tanggal).toLocaleString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const formatFileSize = (size) => {
    if (!size) return '-'
    return `${(Number(size) / 1024 / 1024).toFixed(2)} MB`
  }

  const getActionLabel = (action) => {
    const labels = {
      REQUEST_CREATED: 'Request dibuat',
      STATUS_CHANGED: 'Status diubah',
      PAYMENT_STATUS_CHANGED: 'Status pembayaran diubah',
      REQUEST_UPDATED: 'Request diperbarui',
      INVOICE_CREATED: 'Invoice dibuat',
      PAYMENT_UPLOADED: 'Bukti bayar diupload',
      PAYMENT_VERIFIED: 'Pembayaran diverifikasi',
      PAYMENT_REJECTED: 'Pembayaran ditolak',
      PREVIEW_FILE_UPLOADED: 'File preview diupload',
      RESULT_UPLOADED: 'File hasil diupload',
      REVISION_RESULT_UPLOADED: 'File revisi diupload',
      CLIENT_ADDITIONAL_FILE_UPLOADED: 'File tambahan client diupload',
      ADMIN_MESSAGE_SENT: 'Pesan admin dikirim',
      CLIENT_MESSAGE_SENT: 'Pesan client dikirim'
    }

    return labels[action] || action
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

  const getFileSummary = (requestId) => fileSummary[String(requestId)] || {
    total: 0,
    initial: 0,
    additional: 0,
    preview: 0,
    result: 0
  }

  const getDeadlineMatch = (req, deadlineFilter) => {
    if (!deadlineFilter) return true
    if (!req.deadline_at) return false

    const now = new Date()
    const deadline = new Date(req.deadline_at)
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const tomorrowStart = new Date(todayStart)
    tomorrowStart.setDate(todayStart.getDate() + 1)
    const dayAfterTomorrowStart = new Date(todayStart)
    dayAfterTomorrowStart.setDate(todayStart.getDate() + 2)
    const weekEnd = new Date(todayStart)
    weekEnd.setDate(todayStart.getDate() + 7)

    if (deadlineFilter === 'overdue') return deadline < now && !['DONE'].includes(req.status)
    if (deadlineFilter === 'today') return deadline >= todayStart && deadline < tomorrowStart
    if (deadlineFilter === 'tomorrow') return deadline >= tomorrowStart && deadline < dayAfterTomorrowStart
    if (deadlineFilter === 'week') return deadline >= todayStart && deadline <= weekEnd

    return true
  }

  const sortedFilteredRequests = [...requests]
    .filter((req) => {
      const keyword = filters.keyword.trim().toLowerCase()
      const serviceName = req.service_snapshot?.service_name || ''
      const searchableText = [req.judul, req.deskripsi, req.client_email, req.kategori, serviceName]
        .join(' ')
        .toLowerCase()

      if (keyword && !searchableText.includes(keyword)) return false
      if (filters.status && req.status !== filters.status) return false
      if (filters.payment_status && (req.payment_status || 'UNPAID') !== filters.payment_status) return false
      if (filters.invoice_status && (req.invoice_status || 'NOT_CREATED') !== filters.invoice_status) return false
      if (filters.kategori && req.kategori !== filters.kategori) return false
      if (!getDeadlineMatch(req, filters.deadline)) return false

      const summary = getFileSummary(req.id)
      const legacyClientFiles = Array.isArray(req.file_urls) ? req.file_urls.length : req.file_url ? 1 : 0
      const hasClientFile = summary.initial > 0 || legacyClientFiles > 0
      const hasAdditionalFile = summary.additional > 0
      const hasPreviewFile = summary.preview > 0
      const hasResultFile = summary.result > 0 || Boolean(req.hasil_url)

      if (filters.file_condition === 'has_client_file' && !hasClientFile) return false
      if (filters.file_condition === 'no_client_file' && hasClientFile) return false
      if (filters.file_condition === 'has_additional_file' && !hasAdditionalFile) return false
      if (filters.file_condition === 'has_preview_file' && !hasPreviewFile) return false
      if (filters.file_condition === 'has_result_file' && !hasResultFile) return false
      if (filters.file_condition === 'has_payment_proof' && !req.payment_proof_url) return false

      return true
    })
    .sort((a, b) => {
      if (filters.sort === 'oldest') return new Date(a.created_at) - new Date(b.created_at)
      if (filters.sort === 'deadline_nearest') {
        const aTime = a.deadline_at ? new Date(a.deadline_at).getTime() : Number.MAX_SAFE_INTEGER
        const bTime = b.deadline_at ? new Date(b.deadline_at).getTime() : Number.MAX_SAFE_INTEGER
        return aTime - bTime
      }
      if (filters.sort === 'price_high') return (Number(b.harga) || 0) - (Number(a.harga) || 0)
      if (filters.sort === 'price_low') return (Number(a.harga) || 0) - (Number(b.harga) || 0)
      return new Date(b.created_at) - new Date(a.created_at)
    })

  const kategoriOptions = Array.from(new Set(requests.map((req) => req.kategori).filter(Boolean)))

  const legacyClientFiles = selected
    ? Array.isArray(selected.file_urls) && selected.file_urls.length > 0
      ? selected.file_urls.map((file) => ({
          file_name: file.name,
          file_url: file.url,
          file_size: file.size,
          file_type: file.type
        }))
      : selected.file_url
        ? [{ file_name: 'File Client', file_url: selected.file_url }]
        : []
    : []

  const initialFiles = requestFiles.filter((file) => file.file_kind === 'initial_client_file')
  const additionalClientFiles = requestFiles.filter((file) => file.file_kind === 'additional_client_file')
  const previewFiles = requestFiles.filter((file) => file.file_kind === 'preview_file')
  const resultFiles = requestFiles.filter((file) =>
    ['final_result', 'revision_result', 'additional_result', 'result_file'].includes(file.file_kind)
  )
  const visibleInitialFiles = initialFiles.length > 0 ? initialFiles : legacyClientFiles

  const renderAdminFileList = (files, emptyText = 'Belum ada file.') => {
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
            className="block text-blue-600 text-sm hover:underline"
          >
            {index + 1}. {file.file_name || file.name || 'Download File'}
            {file.file_size ? ` — ${formatFileSize(file.file_size)}` : ''}
            {file.file_kind ? ` · ${file.file_kind}` : ''}
          </a>
        ))}
      </div>
    )
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
              setRequestFiles([])
              setAuditLogs([])
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

            {selected.payment_proof_url && (
              <a
                href={selected.payment_proof_url}
                target="_blank"
                rel="noreferrer"
                className="inline-block bg-indigo-50 text-indigo-600 px-4 py-2 rounded-xl text-sm hover:bg-indigo-100 mb-4"
              >
                Lihat Bukti Bayar
              </a>
            )}
          </div>

          <div className="bg-white rounded-2xl shadow-sm p-6">
            <h3 className="font-bold text-gray-800 mb-4">File Request</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="border border-gray-200 rounded-xl p-4">
                <p className="text-gray-700 text-sm font-medium mb-2">File Awal Client</p>
                {renderAdminFileList(visibleInitialFiles, 'Tidak ada file awal.')}
              </div>

              <div className="border border-blue-100 bg-blue-50 rounded-xl p-4">
                <p className="text-blue-700 text-sm font-medium mb-2">File Tambahan Client</p>
                {renderAdminFileList(additionalClientFiles, 'Belum ada file tambahan.')}
              </div>

              <div className="border border-orange-100 bg-orange-50 rounded-xl p-4">
                <p className="text-orange-700 text-sm font-medium mb-2">File Preview</p>
                {renderAdminFileList(previewFiles, 'Belum ada file preview.')}
              </div>

              <div className="border border-green-100 bg-green-50 rounded-xl p-4">
                <p className="text-green-700 text-sm font-medium mb-2">File Hasil / Revisi</p>
                {renderAdminFileList(resultFiles, selected.hasil_url ? '' : 'Belum ada file hasil.')}
                {resultFiles.length === 0 && selected.hasil_url && (
                  <a
                    href={selected.hasil_url}
                    target="_blank"
                    rel="noreferrer"
                    className="block text-green-600 text-sm hover:underline"
                  >
                    1. File Hasil Lama
                  </a>
                )}
              </div>
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
                  {STATUS_OPTIONS.map((status) => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm text-gray-600 mb-1">Status Invoice</label>
                <select
                  value={form.invoice_status}
                  onChange={(e) => setForm({ ...form, invoice_status: e.target.value })}
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm"
                >
                  {INVOICE_STATUS_OPTIONS.map((status) => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm text-gray-600 mb-1">Status Pembayaran</label>
                <select
                  value={form.payment_status}
                  onChange={(e) => setForm({ ...form, payment_status: e.target.value })}
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm"
                >
                  {PAYMENT_STATUS_OPTIONS.map((status) => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm text-gray-600 mb-1">Link File Hasil Legacy</label>
                <input
                  type="text"
                  value={form.hasil_url}
                  onChange={(e) => setForm({ ...form, hasil_url: e.target.value })}
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm"
                  placeholder="Opsional. Biasanya otomatis setelah payment verified."
                />
              </div>

              <div className="md:col-span-2 border border-orange-200 bg-orange-50 rounded-xl p-4">
                <label className="block text-sm text-orange-700 font-medium mb-2">
                  Upload File Preview
                </label>
                <p className="text-xs text-orange-700 mb-3">
                  Upload PDF preview yang sudah kamu beri watermark/penutup halaman secara manual. File ini bisa dilihat client sebelum pembayaran verified.
                </p>

                <input
                  type="file"
                  accept=".pdf"
                  onChange={(e) => setPreviewFile(e.target.files[0])}
                  className="w-full border border-orange-200 bg-white rounded-xl px-4 py-3 text-sm mb-3"
                />

                <button
                  onClick={uploadFilePreview}
                  disabled={uploadPreviewLoading}
                  className="w-full bg-orange-600 text-white px-5 py-3 rounded-xl text-sm hover:bg-orange-700 disabled:opacity-50"
                >
                  {uploadPreviewLoading ? 'Mengupload...' : 'Upload File Preview'}
                </button>

                <p className="text-xs text-orange-700 mt-2">
                  Maksimal {MAX_PREVIEW_FILE_SIZE_MB} MB. Sementara hanya PDF.
                </p>
              </div>

              <div className="md:col-span-2 border border-green-200 bg-green-50 rounded-xl p-4">
                <label className="block text-sm text-green-700 font-medium mb-2">
                  Upload File Hasil
                </label>
                <p className="text-xs text-green-700 mb-3">
                  Upload hasil final, revisi, atau tambahan. Upload ini tidak otomatis membuat invoice baru.
                </p>

                <select
                  value={resultKind}
                  onChange={(e) => setResultKind(e.target.value)}
                  className="w-full border border-green-200 bg-white rounded-xl px-4 py-3 text-sm mb-3"
                >
                  <option value="final_result">Final</option>
                  <option value="revision_result">Revisi</option>
                  <option value="additional_result">Tambahan</option>
                </select>

                <input
                  type="file"
                  accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.zip,.jpg,.jpeg,.png,.webp,.mp4"
                  onChange={(e) => setResultFile(e.target.files[0])}
                  className="w-full border border-green-200 bg-white rounded-xl px-4 py-3 text-sm mb-3"
                />

                <button
                  onClick={uploadFileHasil}
                  disabled={uploadResultLoading}
                  className="w-full bg-green-600 text-white px-5 py-3 rounded-xl text-sm hover:bg-green-700 disabled:opacity-50"
                >
                  {uploadResultLoading ? 'Mengupload...' : 'Upload File Hasil'}
                </button>

                <p className="text-xs text-green-700 mt-2">
                  Maksimal {MAX_RESULT_FILE_SIZE_MB} MB. Client hanya mendapat akses file hasil penuh setelah pembayaran verified.
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
            <h3 className="font-bold text-gray-800 mb-4">Riwayat Aktivitas</h3>

            {auditLogs.length === 0 && (
              <p className="text-gray-400 text-sm text-center py-4">
                Belum ada riwayat aktivitas.
              </p>
            )}

            {auditLogs.length > 0 && (
              <div className="space-y-3">
                {auditLogs.map((log) => (
                  <div key={log.id} className="border border-gray-100 rounded-xl p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-gray-800 text-sm">
                          {getActionLabel(log.action)}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          {log.description || '-'}
                        </p>
                        <p className="text-[11px] text-gray-400 mt-2">
                          Oleh: {log.actor_email || '-'} · {log.actor_role || '-'}
                        </p>
                      </div>

                      <p className="text-[11px] text-gray-400 whitespace-nowrap">
                        {formatTanggalJam(log.created_at)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
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

      <div className="max-w-6xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-gray-700">Semua Request</h2>
          <button
            onClick={fetchRequests}
            className="bg-gray-800 text-white text-sm px-5 py-2 rounded-xl hover:bg-gray-900"
          >
            Refresh
          </button>
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-5 mb-6">
          <h3 className="font-bold text-gray-800 mb-4">Filter Request</h3>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="md:col-span-2">
              <label className="block text-xs text-gray-500 mb-1">Keyword</label>
              <input
                type="text"
                value={filters.keyword}
                onChange={(e) => setFilters({ ...filters, keyword: e.target.value })}
                className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm"
                placeholder="Cari judul, email, kategori, layanan..."
              />
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">Status Request</label>
              <select
                value={filters.status}
                onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm"
              >
                <option value="">Semua status</option>
                {STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">Kategori</label>
              <select
                value={filters.kategori}
                onChange={(e) => setFilters({ ...filters, kategori: e.target.value })}
                className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm"
              >
                <option value="">Semua kategori</option>
                {kategoriOptions.map((kategori) => (
                  <option key={kategori} value={kategori}>{kategori}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">Payment</label>
              <select
                value={filters.payment_status}
                onChange={(e) => setFilters({ ...filters, payment_status: e.target.value })}
                className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm"
              >
                <option value="">Semua payment</option>
                {PAYMENT_STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">Invoice</label>
              <select
                value={filters.invoice_status}
                onChange={(e) => setFilters({ ...filters, invoice_status: e.target.value })}
                className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm"
              >
                <option value="">Semua invoice</option>
                {INVOICE_STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">Deadline</label>
              <select
                value={filters.deadline}
                onChange={(e) => setFilters({ ...filters, deadline: e.target.value })}
                className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm"
              >
                <option value="">Semua deadline</option>
                <option value="overdue">Lewat deadline</option>
                <option value="today">Hari ini</option>
                <option value="tomorrow">Besok</option>
                <option value="week">7 hari ke depan</option>
              </select>
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">Kondisi File</label>
              <select
                value={filters.file_condition}
                onChange={(e) => setFilters({ ...filters, file_condition: e.target.value })}
                className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm"
              >
                <option value="">Semua kondisi</option>
                <option value="has_client_file">Ada file client</option>
                <option value="no_client_file">Belum ada file client</option>
                <option value="has_additional_file">Ada file tambahan</option>
                <option value="has_preview_file">Ada file preview</option>
                <option value="has_result_file">Ada file hasil</option>
                <option value="has_payment_proof">Ada bukti bayar</option>
              </select>
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">Urutkan</label>
              <select
                value={filters.sort}
                onChange={(e) => setFilters({ ...filters, sort: e.target.value })}
                className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm"
              >
                <option value="newest">Terbaru</option>
                <option value="oldest">Terlama</option>
                <option value="deadline_nearest">Deadline terdekat</option>
                <option value="price_high">Harga tertinggi</option>
                <option value="price_low">Harga terendah</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-between mt-4">
            <p className="text-xs text-gray-400">
              Menampilkan {sortedFilteredRequests.length} dari {requests.length} request.
            </p>
            <button
              onClick={() => setFilters({
                keyword: '',
                status: '',
                payment_status: '',
                invoice_status: '',
                kategori: '',
                deadline: '',
                file_condition: '',
                sort: 'newest'
              })}
              className="text-xs text-gray-500 hover:text-gray-800"
            >
              Reset filter
            </button>
          </div>
        </div>

        {loading && <p className="text-center text-gray-400 py-10">Memuat...</p>}

        {!loading && sortedFilteredRequests.length === 0 && (
          <div className="bg-white rounded-2xl shadow-sm p-10 text-center">
            <p className="text-gray-500">Belum ada request sesuai filter.</p>
          </div>
        )}

        {!loading && sortedFilteredRequests.length > 0 && (
          <div className="space-y-4">
            {sortedFilteredRequests.map((req) => {
              const serviceName = req.service_snapshot?.service_name
              const summary = getFileSummary(req.id)

              return (
                <div
                  key={req.id}
                  onClick={() => openDetail(req)}
                  className="bg-white rounded-2xl shadow-sm p-6 cursor-pointer hover:shadow-md transition"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h3 className="font-bold text-gray-800">{req.judul}</h3>
                      <p className="text-xs text-gray-400">{req.client_email}</p>
                      {serviceName && (
                        <p className="text-xs text-blue-500 mt-1">Layanan: {serviceName}</p>
                      )}
                    </div>
                    <span className={'text-xs font-medium px-3 py-1 rounded-full ' + getStatusColor(req.status)}>
                      {req.status}
                    </span>
                  </div>

                  <p className="text-sm text-gray-500 mb-3 line-clamp-2">{req.deskripsi}</p>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs text-gray-500 mb-3">
                    <span>Kategori: {req.kategori}</span>
                    <span>Harga: {formatRupiah(req.harga)}</span>
                    <span>Invoice: {req.invoice_status || 'NOT_CREATED'}</span>
                    <span>Payment: {req.payment_status || 'UNPAID'}</span>
                  </div>

                  <div className="flex flex-wrap gap-2 text-[11px] text-gray-500">
                    <span className="bg-gray-100 px-3 py-1 rounded-full">File: {summary.total}</span>
                    <span className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full">Tambahan: {summary.additional}</span>
                    <span className="bg-orange-50 text-orange-700 px-3 py-1 rounded-full">Preview: {summary.preview}</span>
                    <span className="bg-green-50 text-green-700 px-3 py-1 rounded-full">Hasil: {summary.result || (req.hasil_url ? 1 : 0)}</span>
                    {req.deadline_at && (
                      <span className="bg-purple-50 text-purple-700 px-3 py-1 rounded-full">
                        Deadline: {formatTanggal(req.deadline_at)}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export default AdminRequestsPage
