import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../supabase'
import {
  validateFile,
  allowedResultFileTypes,
  allowedPreviewFileTypes,
  MAX_RESULT_FILE_SIZE_MB,
  MAX_PREVIEW_FILE_SIZE_MB
} from '../utils/fileValidation'
import { createAuditLog } from '../utils/auditLog'
import Pagination from '../components/Pagination'
import AccordionSection from '../components/AccordionSection'
import {
  badgeClass,
  clientVisibilityLabel,
  fileKindLabel,
  isPaymentVerified,
  statusLabel,
  STATUS_OPTIONS,
  INVOICE_STATUS_OPTIONS,
  PAYMENT_STATUS_OPTIONS
} from '../utils/status'

const EMPTY_FILE_SUMMARY = { total: 0, initial: 0, additional: 0, preview: 0, result: 0 }

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
  if (deadlineFilter === 'overdue') return deadline < now && req.status !== 'DONE'
  if (deadlineFilter === 'today') return deadline >= todayStart && deadline < tomorrowStart
  if (deadlineFilter === 'tomorrow') return deadline >= tomorrowStart && deadline < dayAfterTomorrowStart
  if (deadlineFilter === 'week') return deadline >= todayStart && deadline <= weekEnd
  return true
}

function AdminRequestsPage({ user }) {
  const navigate = useNavigate()
  const { requestId } = useParams()

  const [requests, setRequests] = useState([])
  const [selected, setSelected] = useState(null)
  const [requestFiles, setRequestFiles] = useState([])
  const [fileSummary, setFileSummary] = useState({})
  const [unreadByRequest, setUnreadByRequest] = useState({})
  const [diskusi, setDiskusi] = useState([])
  const [auditLogs, setAuditLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [pesan, setPesan] = useState('')
  const [previewFile, setPreviewFile] = useState(null)
  const [resultFile, setResultFile] = useState(null)
  const [resultKind, setResultKind] = useState('final_result')
  const [uploadPreviewLoading, setUploadPreviewLoading] = useState(false)
  const [uploadResultLoading, setUploadResultLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [showFilterModal, setShowFilterModal] = useState(false)

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
    status: '',
    invoice_status: '',
    payment_status: '',
    admin_note: ''
  })
  const resetFilters = () => setFilters({
    keyword: '',
    status: '',
    payment_status: '',
    invoice_status: '',
    kategori: '',
    deadline: '',
    file_condition: '',
    sort: 'newest'
  })

  const activeFilterCount = Object.entries(filters).filter(([key, value]) => key !== 'sort' && String(value || '').trim()).length + (filters.sort !== 'newest' ? 1 : 0)


  const buildFileSummary = (files = []) => files.reduce((acc, file) => {
    if (file.deleted_at) return acc
    const key = String(file.request_id)
    if (!acc[key]) acc[key] = { total: 0, initial: 0, additional: 0, preview: 0, result: 0 }
    acc[key].total += 1
    if (file.file_kind === 'initial_client_file') acc[key].initial += 1
    if (file.file_kind === 'additional_client_file') acc[key].additional += 1
    if (file.file_kind === 'preview_file') acc[key].preview += 1
    if (['final_result', 'revision_result', 'additional_result', 'result_file'].includes(file.file_kind)) acc[key].result += 1
    return acc
  }, {})

  const fetchUnreadMessages = async (requestRows = []) => {
    const ids = requestRows.map((item) => String(item.id))
    if (ids.length === 0) {
      setUnreadByRequest({})
      return
    }

    const { data, error } = await supabase
      .from('diskusi')
      .select('id, request_id')
      .in('request_id', ids)
      .eq('role', 'client')
      .is('read_by_admin_at', null)

    if (error) {
      console.log('Gagal mengambil notifikasi pesan request:', error.message)
      setUnreadByRequest({})
      return
    }

    const counts = (data || []).reduce((acc, item) => {
      const key = String(item.request_id)
      acc[key] = (acc[key] || 0) + 1
      return acc
    }, {})
    setUnreadByRequest(counts)
  }

  const fetchRequests = async () => {
    setLoading(true)

    const { data, error } = await supabase
      .from('requests')
      .select('*')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })

    if (error) {
      alert('Gagal mengambil data request: ' + error.message)
      setRequests([])
      setLoading(false)
      return
    }

    const requestRows = data || []
    setRequests(requestRows)

    const { data: filesData } = await supabase
      .from('request_files')
      .select('request_id, file_kind, deleted_at')
      .is('deleted_at', null)

    setFileSummary(buildFileSummary(filesData || []))
    await fetchUnreadMessages(requestRows)
    setLoading(false)
  }

  const fetchRequestFiles = async (id) => {
    const { data, error } = await supabase
      .from('request_files')
      .select('*')
      .eq('request_id', String(id))
      .is('deleted_at', null)
      .order('created_at', { ascending: true })

    if (!error) setRequestFiles(data || [])
  }

  const fetchDiskusi = async (id) => {
    const { data, error } = await supabase
      .from('diskusi')
      .select('*')
      .eq('request_id', id)
      .order('created_at', { ascending: true })

    if (!error) setDiskusi(data || [])
  }

  const markClientMessagesAsRead = async (id) => {
    const { error } = await supabase
      .from('diskusi')
      .update({ read_by_admin_at: new Date().toISOString() })
      .eq('request_id', id)
      .eq('role', 'client')
      .is('read_by_admin_at', null)

    if (error) console.log('Gagal menandai pesan client sebagai dibaca:', error.message)
  }

  const fetchAuditLogs = async (id) => {
    const { data, error } = await supabase
      .from('audit_logs')
      .select('*')
      .eq('request_id', id)
      .order('created_at', { ascending: false })
      .limit(20)

    if (!error) setAuditLogs(data || [])
  }

  const hydrateForm = (req) => {
    setForm({
      harga: req.harga || '',
      status: req.status || 'PENDING',
      invoice_status: req.invoice_status || 'NOT_CREATED',
      payment_status: req.payment_status || 'UNPAID',
      admin_note: req.admin_note || ''
    })
  }

  const fetchSelectedByRoute = async () => {
    if (!requestId) return
    setLoading(true)

    const { data, error } = await supabase
      .from('requests')
      .select('*')
      .eq('id', requestId)
      .single()

    if (error || !data || data.deleted_at) {
      setSelected(null)
      setLoading(false)
      return
    }

    setSelected(data)
    hydrateForm(data)
    setPreviewFile(null)
    setResultFile(null)
    setResultKind('final_result')
    await Promise.all([fetchRequestFiles(data.id), fetchDiskusi(data.id), fetchAuditLogs(data.id)])
    await markClientMessagesAsRead(data.id)
    setLoading(false)
  }

  useEffect(() => {
    if (requestId) {
      fetchSelectedByRoute()
    } else {
      setSelected(null)
      setRequestFiles([])
      setDiskusi([])
      setAuditLogs([])
      fetchRequests()
    }
  }, [requestId])

  useEffect(() => {
    setPage(1)
  }, [filters, pageSize])

  const refreshSelected = async () => {
    if (selected) await fetchSelectedByRoute()
    if (!requestId) await fetchRequests()
  }

  const normalizeNullable = (value) => (value === '' || value === undefined ? null : value)

  const hasChanged = (previousValue, nextValue) => String(normalizeNullable(previousValue) ?? '') !== String(normalizeNullable(nextValue) ?? '')

  const simpanPerubahan = async () => {
    if (!selected) return

    const payload = {
      harga: form.harga ? Number(form.harga) : null,
      status: form.status,
      invoice_status: form.invoice_status,
      payment_status: form.payment_status,
      admin_note: form.admin_note || null
    }

    const changedFields = Object.entries(payload).reduce((acc, [field, nextValue]) => {
      if (hasChanged(selected[field], nextValue)) {
        acc[field] = { previous: selected[field] ?? null, next: nextValue ?? null }
      }
      return acc
    }, {})

    if (Object.keys(changedFields).length === 0) {
      alert('Tidak ada perubahan yang perlu disimpan.')
      return
    }

    setSaving(true)

    const changedPayload = Object.fromEntries(Object.entries(payload).filter(([field]) => changedFields[field]))
    const { error } = await supabase.from('requests').update(changedPayload).eq('id', selected.id)

    if (error) {
      alert('Gagal menyimpan perubahan: ' + error.message)
    } else {
      if (changedFields.status) {
        await createAuditLog({
          requestId: selected.id,
          actorId: user.id,
          actorEmail: user.email,
          actorRole: 'admin',
          action: 'STATUS_CHANGED',
          description: `Admin mengubah status request dari ${statusLabel(selected.status) || '-'} ke ${statusLabel(payload.status) || '-'}`,
          metadata: { previous_status: selected.status, new_status: payload.status }
        })
      }

      if (changedFields.payment_status) {
        await createAuditLog({
          requestId: selected.id,
          actorId: user.id,
          actorEmail: user.email,
          actorRole: 'admin',
          action: 'PAYMENT_STATUS_CHANGED',
          description: `Admin mengubah status pembayaran dari ${statusLabel(selected.payment_status) || '-'} ke ${statusLabel(payload.payment_status) || '-'}`,
          metadata: { previous_payment_status: selected.payment_status, new_payment_status: payload.payment_status }
        })
      }

      await createAuditLog({
        requestId: selected.id,
        actorId: user.id,
        actorEmail: user.email,
        actorRole: 'admin',
        action: 'REQUEST_UPDATED',
        description: `Admin memperbarui field request: ${Object.keys(changedFields).join(', ')}`,
        metadata: { changed_fields: changedFields }
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
        metadata: { harga: Number(form.harga), deadline_at: selected.deadline_at || null }
      })
      alert('Invoice berhasil dibuat.')
      refreshSelected()
    }

    setSaving(false)
  }

  const verifikasiPembayaran = async () => {
    if (!selected) return
    if (!selected.payment_proof_url) {
      alert('Verifikasi pembayaran baru tersedia setelah client upload bukti bayar.')
      return
    }
    setSaving(true)

    const { error } = await supabase
      .from('requests')
      .update({ payment_status: 'VERIFIED', invoice_status: 'PAID' })
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
        metadata: { previous_payment_status: selected.payment_status, new_payment_status: 'VERIFIED' }
      })
      alert('Pembayaran berhasil diverifikasi.')
      refreshSelected()
    }

    setSaving(false)
  }

  const tolakPembayaran = async () => {
    if (!selected) return
    if (!selected.payment_proof_url) {
      alert('Penolakan pembayaran baru tersedia setelah client upload bukti bayar.')
      return
    }
    setSaving(true)
    const rejectedNote = form.admin_note || 'Bukti pembayaran belum valid. Mohon upload ulang bukti pembayaran yang benar.'

    const { error } = await supabase
      .from('requests')
      .update({ payment_status: 'REJECTED', status: 'WAITING PAYMENT', admin_note: rejectedNote })
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
        metadata: { admin_note: rejectedNote }
      })
      alert('Pembayaran ditolak. Client perlu upload ulang bukti bayar.')
      refreshSelected()
    }

    setSaving(false)
  }

  const softDeleteRequest = async () => {
    if (!selected) return
    const reason = window.prompt('Alasan hapus request? Request akan masuk Deleted Items.')
    if (reason === null) return
    if (!window.confirm('Yakin hapus request ini dari tampilan utama?')) return

    setSaving(true)
    const { error } = await supabase
      .from('requests')
      .update({ deleted_at: new Date().toISOString(), deleted_by: user.id, delete_reason: reason || 'Dihapus admin' })
      .eq('id', selected.id)

    if (error) {
      alert('Gagal menghapus request: ' + error.message)
    } else {
      await createAuditLog({
        requestId: selected.id,
        actorId: user.id,
        actorEmail: user.email,
        actorRole: 'admin',
        action: 'REQUEST_SOFT_DELETED',
        description: `Admin menghapus sementara request: ${selected.judul}`,
        metadata: { delete_reason: reason || null }
      })
      alert('Request masuk Deleted Items.')
      navigate('/admin/requests')
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

    const { error: uploadError } = await supabase.storage.from('request-files').upload(fileName, file)
    if (uploadError) {
      alert('Gagal upload file: ' + uploadError.message)
      return null
    }

    const { data: urlData } = supabase.storage.from('request-files').getPublicUrl(fileName)
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
      file_type: file.type,
      storage_path: fileName
    }

    const { error: insertError } = await supabase.from('request_files').insert(row)
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
      metadata: { file_kind: fileKind, file_name: file.name, file_url: fileUrl, storage_path: fileName }
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
      const payload = { status: 'DELIVERED' }
      if (isPaymentVerified(selected)) payload.hasil_url = resultUrl

      const { error: updateError } = await supabase.from('requests').update(payload).eq('id', selected.id)
      if (updateError) alert('File hasil berhasil diupload, tapi gagal update status request: ' + updateError.message)

      await createAuditLog({
        requestId: selected.id,
        actorId: user.id,
        actorEmail: user.email,
        actorRole: 'admin',
        action: 'STATUS_CHANGED',
        description: 'Admin mengubah status request menjadi DELIVERED setelah upload file hasil',
        metadata: { previous_status: selected.status, new_status: 'DELIVERED', result_url_visible_in_legacy_column: Boolean(payload.hasil_url) }
      })

      alert('File hasil berhasil diupload. Upload ini tidak membuat invoice baru.')
      setResultFile(null)
      setResultKind('final_result')
      refreshSelected()
    }

    setUploadResultLoading(false)
  }

  const softDeleteFile = async (file) => {
    if (!file?.id) return
    const reason = window.prompt('Alasan hapus file? File akan masuk Deleted Items.')
    if (reason === null) return

    const { error } = await supabase
      .from('request_files')
      .update({ deleted_at: new Date().toISOString(), deleted_by: user.id, delete_reason: reason || 'Dihapus admin' })
      .eq('id', file.id)

    if (error) {
      alert('Gagal menghapus file: ' + error.message)
      return
    }

    await createAuditLog({
      requestId: selected.id,
      actorId: user.id,
      actorEmail: user.email,
      actorRole: 'admin',
      action: 'FILE_SOFT_DELETED',
      description: `Admin menghapus sementara file: ${file.file_name}`,
      metadata: { file_id: file.id, file_kind: file.file_kind, delete_reason: reason || null }
    })

    refreshSelected()
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
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(angka)
  }

  const formatTanggal = (tanggal) => {
    if (!tanggal) return '-'
    return new Date(tanggal).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
  }

  const formatTanggalJam = (tanggal) => {
    if (!tanggal) return '-'
    return new Date(tanggal).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  const formatFileSize = (size) => {
    if (!size) return '-'
    return `${(Number(size) / 1024 / 1024).toFixed(2)} MB`
  }

  const getFileSummary = (id) => fileSummary[String(id)] || EMPTY_FILE_SUMMARY

  const sortedFilteredRequests = useMemo(() => [...requests]
    .filter((req) => {
      const keyword = filters.keyword.trim().toLowerCase()
      const serviceName = req.service_snapshot?.service_name || ''
      const searchableText = [req.judul, req.deskripsi, req.client_email, req.kategori, serviceName].join(' ').toLowerCase()
      if (keyword && !searchableText.includes(keyword)) return false
      if (filters.status && req.status !== filters.status) return false
      if (filters.payment_status && (req.payment_status || 'UNPAID') !== filters.payment_status) return false
      if (filters.invoice_status && (req.invoice_status || 'NOT_CREATED') !== filters.invoice_status) return false
      if (filters.kategori && req.kategori !== filters.kategori) return false
      if (!getDeadlineMatch(req, filters.deadline)) return false
      const summary = fileSummary[String(req.id)] || EMPTY_FILE_SUMMARY
      const legacyClientFiles = Array.isArray(req.file_urls) ? req.file_urls.length : req.file_url ? 1 : 0
      const hasClientFile = summary.initial > 0 || legacyClientFiles > 0
      const hasResultFile = summary.result > 0 || Boolean(req.hasil_url)
      if (filters.file_condition === 'has_client_file' && !hasClientFile) return false
      if (filters.file_condition === 'no_client_file' && hasClientFile) return false
      if (filters.file_condition === 'has_additional_file' && summary.additional === 0) return false
      if (filters.file_condition === 'has_preview_file' && summary.preview === 0) return false
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
    }), [requests, filters, fileSummary])

  const totalPages = Math.max(1, Math.ceil(sortedFilteredRequests.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const pagedRequests = sortedFilteredRequests.slice((safePage - 1) * pageSize, safePage * pageSize)
  const kategoriOptions = Array.from(new Set(requests.map((req) => req.kategori).filter(Boolean)))
  const totalUnreadMessages = Object.values(unreadByRequest).reduce((total, count) => total + count, 0)

  const legacyClientFiles = selected && Array.isArray(selected.file_urls) && selected.file_urls.length > 0
    ? selected.file_urls.map((file) => ({ file_name: file.name, file_url: file.url, file_size: file.size, file_type: file.type }))
    : selected?.file_url
      ? [{ file_name: 'File Client', file_url: selected.file_url }]
      : []
  const initialFiles = requestFiles.filter((file) => file.file_kind === 'initial_client_file')
  const additionalClientFiles = requestFiles.filter((file) => file.file_kind === 'additional_client_file')
  const previewFiles = requestFiles.filter((file) => file.file_kind === 'preview_file')
  const resultFiles = requestFiles.filter((file) => ['final_result', 'revision_result', 'additional_result', 'result_file'].includes(file.file_kind))
  const visibleInitialFiles = initialFiles.length > 0 ? initialFiles : legacyClientFiles

  const renderAdminFileList = (files, emptyText = 'Belum ada file.') => {
    if (!files || files.length === 0) return <p className="text-gray-400 text-sm">{emptyText}</p>

    return (
      <div className="space-y-2">
        {files.map((file, index) => {
          const visibility = clientVisibilityLabel(file, selected)
          return (
            <div key={file.id || index} className="border border-gray-100 rounded-xl p-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div>
                <a href={file.file_url || file.url} target="_blank" rel="noreferrer" className="text-blue-600 text-sm hover:underline">
                  {index + 1}. {file.file_name || file.name || 'Download File'}
                </a>
                <div className="flex flex-wrap gap-2 text-[11px] text-gray-500 mt-2">
                  <span>{fileKindLabel(file.file_kind)}</span>
                  {file.file_size && <span>{formatFileSize(file.file_size)}</span>}
                  <span className={'px-2 py-1 rounded-full ' + visibility.className}>{visibility.label}</span>
                </div>
              </div>
              {file.id && (
                <button onClick={() => softDeleteFile(file)} className="text-xs text-red-600 hover:text-red-700 bg-red-50 px-3 py-2 rounded-xl">
                  Hapus
                </button>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  const renderDiscussion = () => (
    <div className="bg-white rounded-2xl shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-gray-800">Diskusi</h3>
        <span className="text-xs text-gray-400">{diskusi.length} pesan</span>
      </div>
      <div className="space-y-3 mb-4 max-h-64 overflow-y-auto">
        {diskusi.length === 0 && <p className="text-gray-400 text-sm text-center py-4">Belum ada diskusi.</p>}
        {diskusi.map((d) => (
          <div key={d.id} className={'p-3 rounded-xl text-sm ' + (d.role === 'admin' ? 'bg-blue-50 text-blue-800' : 'bg-gray-50 text-gray-700')}>
            <p className="font-medium text-xs mb-1">{d.role === 'admin' ? 'Admin' : d.pengirim_email}</p>
            <p>{d.pesan}</p>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <input type="text" placeholder="Tulis pesan sebagai admin..." value={pesan} onChange={(e) => setPesan(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && kirimPesanAdmin()} className="flex-1 border border-gray-300 rounded-xl px-4 py-2 text-sm" />
        <button onClick={kirimPesanAdmin} className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm hover:bg-blue-700">Kirim</button>
      </div>
    </div>
  )

  if (requestId && loading && !selected) {
    return <div className="p-6"><div className="bg-white rounded-2xl p-10 text-center text-gray-400">Memuat detail request...</div></div>
  }

  if (requestId && !loading && !selected) {
    return (
      <div className="p-6">
        <div className="bg-white rounded-2xl p-10 text-center">
          <p className="text-4xl mb-3">📭</p>
          <p className="text-gray-600 font-medium">Request tidak ditemukan atau sudah masuk Deleted Items.</p>
          <button onClick={() => navigate('/admin/requests')} className="mt-5 bg-gray-900 text-white px-5 py-3 rounded-xl text-sm">Kembali ke daftar</button>
        </div>
      </div>
    )
  }

  if (selected) {
    const riskyResult = resultFiles.length > 0 && !isPaymentVerified(selected)
    const paymentProofAvailable = Boolean(selected.payment_proof_url)
    return (
      <div className="p-6 space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs text-gray-400 mb-1">Admin / Request / Detail Request</p>
            <h2 className="text-2xl font-bold text-gray-900">{selected.judul}</h2>
            <p className="text-sm text-gray-500">{selected.client_email}</p>
          </div>
          <button onClick={() => navigate('/admin/requests')} className="bg-white border border-gray-200 px-4 py-2 rounded-xl text-sm hover:bg-gray-50">Kembali</button>
        </div>

        {riskyResult && (
          <div className="border border-amber-200 bg-amber-50 rounded-2xl p-4">
            <p className="font-bold text-amber-800 mb-1">Warning: file hasil sudah diupload, pembayaran belum verified.</p>
            <p className="text-sm text-amber-700">File hasil tetap terkunci dari sisi client. Client hanya dapat melihat file preview sampai pembayaran diverifikasi.</p>
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-sm p-4">
          <div className="flex flex-wrap gap-2 text-xs">
            <span className={badgeClass(selected.status)}>{statusLabel(selected.status)}</span>
            <span className={badgeClass(selected.payment_status || 'UNPAID')}>Payment: {statusLabel(selected.payment_status || 'UNPAID')}</span>
            <span className={badgeClass(selected.invoice_status || 'NOT_CREATED')}>Invoice: {statusLabel(selected.invoice_status || 'NOT_CREATED')}</span>
            <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-3 py-1 font-semibold text-gray-700">Harga: {formatRupiah(selected.harga)}</span>
            <span className="inline-flex items-center rounded-full border border-purple-200 bg-purple-50 px-3 py-1 font-semibold text-purple-700">Deadline: {formatTanggal(selected.deadline_at)}</span>
          </div>
        </div>

        {renderDiscussion()}

        <AccordionSection title="Detail Request" defaultOpen>
          <div className="pt-5 space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div><p className="text-gray-400">Kategori</p><p className="font-medium text-gray-700">{selected.kategori}</p></div>
              <div><p className="text-gray-400">Tanggal Request</p><p className="font-medium text-gray-700">{formatTanggal(selected.created_at)}</p></div>
            </div>
            <div><p className="text-gray-400 text-sm mb-1">Deskripsi Client</p><p className="text-gray-700 text-sm whitespace-pre-wrap">{selected.deskripsi}</p></div>

            <div className="border border-gray-100 rounded-2xl p-4 bg-gray-50">
              <h4 className="font-bold text-gray-800 mb-3">Invoice & Pembayaran</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div><label className="block text-sm text-gray-600 mb-1">Harga Invoice</label><input type="number" value={form.harga} onChange={(e) => setForm({ ...form, harga: e.target.value })} className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm bg-white" /></div>
                <div><label className="block text-sm text-gray-600 mb-1">Status Invoice</label><select value={form.invoice_status} onChange={(e) => setForm({ ...form, invoice_status: e.target.value })} className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm bg-white">{INVOICE_STATUS_OPTIONS.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}</select></div>
                <div><label className="block text-sm text-gray-600 mb-1">Status Pembayaran</label><select value={form.payment_status} onChange={(e) => setForm({ ...form, payment_status: e.target.value })} className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm bg-white">{PAYMENT_STATUS_OPTIONS.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}</select></div>
              </div>
              <div className="flex flex-wrap items-center gap-3 mt-4">
                <button onClick={buatInvoice} disabled={saving} className="bg-blue-600 text-white px-5 py-3 rounded-xl text-sm hover:bg-blue-700 disabled:opacity-50">Buat Invoice</button>
                <button onClick={verifikasiPembayaran} disabled={saving || !paymentProofAvailable} className="bg-green-600 text-white px-5 py-3 rounded-xl text-sm hover:bg-green-700 disabled:opacity-50">{paymentProofAvailable ? 'Verifikasi Pembayaran' : 'Menunggu Bukti Bayar'}</button>
                <button onClick={tolakPembayaran} disabled={saving || !paymentProofAvailable} className="bg-red-600 text-white px-5 py-3 rounded-xl text-sm hover:bg-red-700 disabled:opacity-50">Tolak Pembayaran</button>
                {selected.payment_proof_url ? <a href={selected.payment_proof_url} target="_blank" rel="noreferrer" className="bg-indigo-50 text-indigo-600 px-4 py-2 rounded-xl text-sm hover:bg-indigo-100">Lihat Bukti Bayar</a> : <span className="text-sm text-gray-400">Belum ada bukti bayar.</span>}
              </div>
            </div>
          </div>
        </AccordionSection>

        <AccordionSection title="File Client">
          <div className="pt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border border-gray-200 rounded-xl p-4"><p className="text-gray-700 text-sm font-medium mb-2">File Awal Client</p>{renderAdminFileList(visibleInitialFiles, 'Tidak ada file awal.')}</div>
            <div className="border border-blue-100 bg-blue-50 rounded-xl p-4"><p className="text-blue-700 text-sm font-medium mb-2">File Tambahan Client</p>{renderAdminFileList(additionalClientFiles, 'Belum ada file tambahan.')}</div>
          </div>
        </AccordionSection>

        <AccordionSection title="File Preview & File Hasil">
          <div className="pt-5 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="border border-orange-100 bg-orange-50 rounded-xl p-4"><p className="text-orange-700 text-sm font-medium mb-2">File Preview</p>{renderAdminFileList(previewFiles, 'Belum ada file preview.')}</div>
              <div className="border border-green-100 bg-green-50 rounded-xl p-4"><p className="text-green-700 text-sm font-medium mb-2">File Hasil</p>{renderAdminFileList(resultFiles, 'Belum ada file hasil.')}</div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="border border-orange-100 bg-orange-50 rounded-xl p-4">
                <p className="text-orange-700 text-sm font-medium mb-3">Upload File Preview</p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input type="file" accept=".pdf" onChange={(e) => setPreviewFile(e.target.files[0])} className="flex-[3] min-w-0 border border-orange-200 bg-white rounded-xl px-4 py-3 text-sm" />
                  <button onClick={uploadFilePreview} disabled={uploadPreviewLoading} className="flex-1 bg-orange-600 text-white px-4 py-3 rounded-xl text-sm hover:bg-orange-700 disabled:opacity-50">{uploadPreviewLoading ? 'Mengupload...' : 'Upload'}</button>
                </div>
                <p className="text-xs text-orange-700 mt-2">Maksimal {MAX_PREVIEW_FILE_SIZE_MB} MB. Watermark/penutup halaman dilakukan manual.</p>
              </div>

              <div className="border border-green-100 bg-green-50 rounded-xl p-4">
                <p className="text-green-700 text-sm font-medium mb-3">Upload File Hasil</p>
                <select value={resultKind} onChange={(e) => setResultKind(e.target.value)} className="w-full border border-green-200 bg-white rounded-xl px-4 py-3 text-sm mb-2"><option value="final_result">Final</option><option value="revision_result">Revisi</option><option value="additional_result">Tambahan</option></select>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.zip,.jpg,.jpeg,.png,.webp,.mp4" onChange={(e) => setResultFile(e.target.files[0])} className="flex-[3] min-w-0 border border-green-200 bg-white rounded-xl px-4 py-3 text-sm" />
                  <button onClick={uploadFileHasil} disabled={uploadResultLoading} className="flex-1 bg-green-600 text-white px-4 py-3 rounded-xl text-sm hover:bg-green-700 disabled:opacity-50">{uploadResultLoading ? 'Mengupload...' : 'Upload'}</button>
                </div>
                <p className="text-xs text-green-700 mt-2">Client hanya mendapat akses file hasil penuh setelah pembayaran verified.</p>
              </div>
            </div>
          </div>
        </AccordionSection>

        <AccordionSection title="Admin Note">
          <div className="pt-5 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-600 mb-1">Status Request</label>
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm">
                  {STATUS_OPTIONS.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}
                </select>
              </div>
              <div className="flex items-end gap-2">
                <button onClick={() => setForm({ ...form, status: 'DONE' })} className="flex-1 bg-emerald-50 text-emerald-700 px-4 py-3 rounded-xl text-sm hover:bg-emerald-100">Set Done</button>
                <button onClick={() => setForm({ ...form, status: 'DISPUTE' })} className="flex-1 bg-red-50 text-red-700 px-4 py-3 rounded-xl text-sm hover:bg-red-100">Set Dispute</button>
              </div>
            </div>
            <textarea value={form.admin_note} onChange={(e) => setForm({ ...form, admin_note: e.target.value })} className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm" rows={3} placeholder="Catatan admin" />
            <div className="flex flex-wrap gap-3">
              <button onClick={simpanPerubahan} disabled={saving} className="bg-gray-800 text-white px-5 py-3 rounded-xl text-sm hover:bg-gray-900 disabled:opacity-50">{saving ? 'Menyimpan...' : 'Simpan Perubahan'}</button>
              <button onClick={softDeleteRequest} disabled={saving} className="bg-red-600 text-white px-5 py-3 rounded-xl text-sm hover:bg-red-700 disabled:opacity-50">Hapus Request</button>
            </div>
          </div>
        </AccordionSection>

        <AccordionSection title="Riwayat Aktivitas">
          <div className="pt-5 space-y-2">
            {auditLogs.length === 0 && <p className="text-gray-400 text-sm text-center py-4">Belum ada riwayat aktivitas.</p>}
            {auditLogs.map((log) => (
              <div key={log.id} className="border border-gray-100 rounded-xl p-3">
                <div className="flex items-start justify-between gap-3">
                  <div><p className="font-medium text-gray-800 text-sm">{log.action}</p><p className="text-xs text-gray-500 mt-1">{log.description || '-'}</p><p className="text-[11px] text-gray-400 mt-2">Oleh: {log.actor_email || '-'} · {log.actor_role || '-'}</p></div>
                  <p className="text-[11px] text-gray-400 whitespace-nowrap">{formatTanggalJam(log.created_at)}</p>
                </div>
              </div>
            ))}
          </div>
        </AccordionSection>
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-6">
        <div>
          <p className="text-xs text-gray-400 mb-1">Admin / Request</p>
          <div className="flex flex-wrap items-center gap-2"><h2 className="text-2xl font-bold text-gray-900">Semua Request</h2>{totalUnreadMessages > 0 && <span className="inline-flex items-center rounded-full bg-red-500 px-2 py-0.5 text-[11px] font-bold text-white">{totalUnreadMessages > 99 ? '99+' : totalUnreadMessages} pesan baru</span>}</div>
          <p className="text-sm text-gray-500 mt-1">Daftar request aktif. Request terhapus masuk menu Deleted Items.</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm p-4 mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-gray-800">{sortedFilteredRequests.length} request ditampilkan</p>
          <p className="text-xs text-gray-400">Dari total {requests.length} request aktif. Filter disimpan di popup agar halaman tetap ringkas.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setShowFilterModal(true)} className="inline-flex items-center gap-2 bg-gray-900 text-white px-5 py-3 rounded-xl text-sm hover:bg-gray-800">
            <span>🔎</span>
            Filter
            {activeFilterCount > 0 && <span className="bg-white text-gray-900 text-[10px] px-2 py-0.5 rounded-full">{activeFilterCount}</span>}
          </button>
          {activeFilterCount > 0 && <button onClick={resetFilters} className="bg-gray-100 text-gray-700 px-4 py-3 rounded-xl text-sm hover:bg-gray-200">Reset</button>}
        </div>
      </div>

      {showFilterModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-3xl bg-white rounded-3xl shadow-xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <div>
                <h3 className="font-bold text-gray-900">Filter Request</h3>
                <p className="text-xs text-gray-400 mt-1">Pilih parameter request yang ingin ditampilkan.</p>
              </div>
              <button onClick={() => setShowFilterModal(false)} className="text-gray-400 hover:text-gray-700 text-xl">×</button>
            </div>
            <div className="p-6 max-h-[76vh] overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2"><label className="block text-xs text-gray-500 mb-1">Keyword</label><input type="text" value={filters.keyword} onChange={(e) => setFilters({ ...filters, keyword: e.target.value })} className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm" placeholder="Cari judul, email, kategori, layanan..." /></div>
                <div><label className="block text-xs text-gray-500 mb-1">Status Request</label><select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })} className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm"><option value="">Semua status</option>{STATUS_OPTIONS.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}</select></div>
                <div><label className="block text-xs text-gray-500 mb-1">Kategori</label><select value={filters.kategori} onChange={(e) => setFilters({ ...filters, kategori: e.target.value })} className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm"><option value="">Semua kategori</option>{kategoriOptions.map((kategori) => <option key={kategori} value={kategori}>{kategori}</option>)}</select></div>
                <div><label className="block text-xs text-gray-500 mb-1">Payment</label><select value={filters.payment_status} onChange={(e) => setFilters({ ...filters, payment_status: e.target.value })} className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm"><option value="">Semua payment</option>{PAYMENT_STATUS_OPTIONS.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}</select></div>
                <div><label className="block text-xs text-gray-500 mb-1">Invoice</label><select value={filters.invoice_status} onChange={(e) => setFilters({ ...filters, invoice_status: e.target.value })} className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm"><option value="">Semua invoice</option>{INVOICE_STATUS_OPTIONS.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}</select></div>
                <div><label className="block text-xs text-gray-500 mb-1">Deadline</label><select value={filters.deadline} onChange={(e) => setFilters({ ...filters, deadline: e.target.value })} className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm"><option value="">Semua deadline</option><option value="overdue">Lewat deadline</option><option value="today">Hari ini</option><option value="tomorrow">Besok</option><option value="week">7 hari ke depan</option></select></div>
                <div><label className="block text-xs text-gray-500 mb-1">Kondisi File</label><select value={filters.file_condition} onChange={(e) => setFilters({ ...filters, file_condition: e.target.value })} className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm"><option value="">Semua kondisi</option><option value="has_client_file">Ada file client</option><option value="no_client_file">Belum ada file client</option><option value="has_additional_file">Ada file tambahan</option><option value="has_preview_file">Ada file preview</option><option value="has_result_file">Ada file hasil</option><option value="has_payment_proof">Ada bukti bayar</option></select></div>
                <div><label className="block text-xs text-gray-500 mb-1">Urutkan</label><select value={filters.sort} onChange={(e) => setFilters({ ...filters, sort: e.target.value })} className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm"><option value="newest">Terbaru</option><option value="oldest">Terlama</option><option value="deadline_nearest">Deadline terdekat</option><option value="price_high">Harga tertinggi</option><option value="price_low">Harga terendah</option></select></div>
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <button onClick={resetFilters} className="bg-gray-100 text-gray-700 px-5 py-3 rounded-xl text-sm hover:bg-gray-200">Reset</button>
                <button onClick={() => setShowFilterModal(false)} className="bg-gray-900 text-white px-5 py-3 rounded-xl text-sm hover:bg-gray-800">Terapkan</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {loading && <p className="text-center text-gray-400 py-10">Memuat...</p>}
      {!loading && sortedFilteredRequests.length === 0 && <div className="bg-white rounded-2xl shadow-sm p-10 text-center"><p className="text-4xl mb-3">📭</p><p className="text-gray-500">Belum ada request sesuai filter.</p></div>}
      {!loading && sortedFilteredRequests.length > 0 && (
        <div className="space-y-4">
          {pagedRequests.map((req) => {
            const summary = getFileSummary(req.id)
            const serviceName = req.service_snapshot?.service_name
            const hasRiskyResult = (summary.result > 0 || Boolean(req.hasil_url)) && !isPaymentVerified(req)
            const unreadCount = unreadByRequest[String(req.id)] || 0
            const canVerifyPayment = req.payment_status === 'UPLOADED' && Boolean(req.payment_proof_url)

            return (
              <div key={req.id} className="bg-white rounded-2xl shadow-sm p-6 hover:shadow-md transition">
                <div className="flex items-start justify-between mb-2 gap-3">
                  <button onClick={() => navigate(`/admin/requests/${req.id}`)} className="text-left">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-bold text-gray-800 hover:text-blue-600">{req.judul}</h3>
                      {unreadCount > 0 && (
                        <span className="inline-flex items-center rounded-full bg-red-500 px-2 py-0.5 text-[11px] font-bold text-white">
                          {unreadCount > 99 ? '99+' : unreadCount} pesan baru
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400">{req.client_email}</p>
                    {serviceName && <p className="text-xs text-blue-500 mt-1">Layanan: {serviceName}</p>}
                  </button>
                  <span className={badgeClass(req.status)}>{statusLabel(req.status)}</span>
                </div>

                {hasRiskyResult && (
                  <div className="border border-amber-100 bg-amber-50 rounded-xl p-3 mb-3 text-xs text-amber-700">
                    File hasil sudah ada, tetapi client belum dapat melihat karena pembayaran belum terverifikasi.
                  </div>
                )}

                <p className="text-sm text-gray-500 mb-3 line-clamp-2">{req.deskripsi}</p>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs text-gray-500 mb-3">
                  <span>Kategori: {req.kategori}</span>
                  <span>Harga: {formatRupiah(req.harga)}</span>
                  <span>Invoice: {statusLabel(req.invoice_status || 'NOT_CREATED')}</span>
                  <span>Payment: {statusLabel(req.payment_status || 'UNPAID')}</span>
                </div>

                <div className="flex flex-wrap gap-2 text-[11px] text-gray-500 mb-4">
                  <span className="bg-gray-100 px-3 py-1 rounded-full">File: {summary.total}</span>
                  <span className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full">Tambahan: {summary.additional}</span>
                  <span className="bg-orange-50 text-orange-700 px-3 py-1 rounded-full">Preview: {summary.preview}</span>
                  <span className="bg-green-50 text-green-700 px-3 py-1 rounded-full">Hasil: {summary.result || (req.hasil_url ? 1 : 0)}</span>
                  {req.deadline_at && <span className="bg-purple-50 text-purple-700 px-3 py-1 rounded-full">Deadline: {formatTanggal(req.deadline_at)}</span>}
                </div>

                <div className="flex flex-wrap gap-2">
                  <button onClick={() => navigate(`/admin/requests/${req.id}`)} className="bg-gray-900 text-white text-xs px-4 py-2 rounded-xl hover:bg-gray-800">Detail</button>
                  <button onClick={() => { hydrateForm(req); navigate(`/admin/requests/${req.id}`) }} className="bg-blue-50 text-blue-700 text-xs px-4 py-2 rounded-xl hover:bg-blue-100">Buat Invoice</button>
                  {canVerifyPayment && <button onClick={() => navigate(`/admin/requests/${req.id}`)} className="bg-green-50 text-green-700 text-xs px-4 py-2 rounded-xl hover:bg-green-100">Verifikasi Payment</button>}
                  <button onClick={() => navigate(`/admin/requests/${req.id}`)} className="bg-orange-50 text-orange-700 text-xs px-4 py-2 rounded-xl hover:bg-orange-100">Upload Preview</button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Pagination page={safePage} pageSize={pageSize} totalItems={sortedFilteredRequests.length} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1) }} />
    </div>
  )
}

export default AdminRequestsPage
