export const STATUS_LABELS = {
  PENDING: 'Request diterima',
  OPEN: 'Siap diproses',
  'ON PROGRESS': 'Sedang dikerjakan',
  REVIEW: 'Sedang direview',
  'WAITING PAYMENT': 'Menunggu pembayaran',
  'PAYMENT UPLOADED': 'Bukti bayar terkirim',
  DELIVERED: 'File hasil tersedia',
  DONE: 'Selesai',
  DISPUTE: 'Perlu diskusi lanjut',
  UNPAID: 'Belum dibayar',
  UPLOADED: 'Bukti bayar terkirim',
  VERIFIED: 'Pembayaran terverifikasi',
  REJECTED: 'Bukti bayar perlu diupload ulang',
  NOT_CREATED: 'Invoice belum dibuat',
  WAITING_PAYMENT: 'Menunggu pembayaran',
  PAID: 'Sudah dibayar',
  EXPIRED: 'Invoice kedaluwarsa'
}

export const STATUS_OPTIONS = ['PENDING', 'OPEN', 'ON PROGRESS', 'REVIEW', 'WAITING PAYMENT', 'PAYMENT UPLOADED', 'DELIVERED', 'DONE', 'DISPUTE']
export const INVOICE_STATUS_OPTIONS = ['NOT_CREATED', 'WAITING_PAYMENT', 'PAID', 'EXPIRED']
export const PAYMENT_STATUS_OPTIONS = ['UNPAID', 'UPLOADED', 'VERIFIED', 'REJECTED']

export const STATUS_STYLES = {
  PENDING: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  OPEN: 'bg-blue-100 text-blue-800 border-blue-200',
  'ON PROGRESS': 'bg-purple-100 text-purple-800 border-purple-200',
  REVIEW: 'bg-orange-100 text-orange-800 border-orange-200',
  'WAITING PAYMENT': 'bg-amber-100 text-amber-800 border-amber-200',
  'PAYMENT UPLOADED': 'bg-indigo-100 text-indigo-800 border-indigo-200',
  DELIVERED: 'bg-green-100 text-green-800 border-green-200',
  DONE: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  DISPUTE: 'bg-red-100 text-red-800 border-red-200',
  UNPAID: 'bg-gray-100 text-gray-700 border-gray-200',
  UPLOADED: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  VERIFIED: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  REJECTED: 'bg-red-100 text-red-800 border-red-200',
  NOT_CREATED: 'bg-gray-100 text-gray-700 border-gray-200',
  WAITING_PAYMENT: 'bg-amber-100 text-amber-800 border-amber-200',
  PAID: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  EXPIRED: 'bg-red-100 text-red-800 border-red-200'
}

export const statusLabel = (status) => STATUS_LABELS[status] || status || '-'

export const badgeClass = (status) => {
  const key = status || 'UNKNOWN'
  return 'inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ' +
    (STATUS_STYLES[key] || 'bg-gray-100 text-gray-700 border-gray-200')
}

export const isPaymentVerified = (request) => {
  return request?.payment_status === 'VERIFIED' || request?.invoice_status === 'PAID'
}

export const isResultFileKind = (fileKind) => {
  return ['final_result', 'revision_result', 'additional_result', 'result_file'].includes(fileKind)
}

export const isClientVisibleFile = (file, request) => {
  if (!file) return false
  if (file.deleted_at) return false
  if (['initial_client_file', 'additional_client_file', 'preview_file'].includes(file.file_kind)) return true
  if (isResultFileKind(file.file_kind)) return isPaymentVerified(request)
  return false
}

export const clientVisibilityLabel = (file, request) => {
  if (file?.deleted_at) return { label: 'Masuk deleted items', className: 'bg-gray-100 text-gray-500' }
  if (file?.file_kind === 'preview_file') return { label: 'Client dapat melihat', className: 'bg-green-50 text-green-700' }
  if (['initial_client_file', 'additional_client_file'].includes(file?.file_kind)) {
    return { label: 'Client dapat melihat', className: 'bg-green-50 text-green-700' }
  }
  if (isResultFileKind(file?.file_kind)) {
    if (isPaymentVerified(request)) return { label: 'Client dapat melihat', className: 'bg-green-50 text-green-700' }
    return { label: 'Client belum dapat melihat', className: 'bg-amber-50 text-amber-700' }
  }
  return { label: 'Khusus admin', className: 'bg-gray-50 text-gray-600' }
}

export const fileKindLabel = (fileKind) => {
  const labels = {
    initial_client_file: 'File awal client',
    additional_client_file: 'File tambahan client',
    preview_file: 'File preview',
    final_result: 'File hasil final',
    revision_result: 'File hasil revisi',
    additional_result: 'File hasil tambahan',
    result_file: 'File hasil lama',
    payment_proof: 'Bukti pembayaran'
  }
  return labels[fileKind] || fileKind || '-'
}
