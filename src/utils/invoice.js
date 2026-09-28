export const INVOICE_STATUS_LABELS = {
  DRAFT: 'Draft',
  WAITING_PAYMENT: 'Menunggu Pembayaran',
  PARTIALLY_PAID: 'DP Dibayar',
  PAID: 'Lunas',
  EXPIRED: 'Jatuh Tempo',
  VOID: 'Dibatalkan'
}

export function getInvoiceStatusLabel(status) {
  return INVOICE_STATUS_LABELS[status] || status || '-'
}

export function formatInvoiceRupiah(value) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(Number(value || 0))
}

export function roundInvoiceMoney(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100
}

export function calculateInvoiceTotals(items, discountPercent) {
  const subtotal = roundInvoiceMoney(items.reduce((sum, item) => (
    sum + roundInvoiceMoney(Number(item.qty || 0) * Number(item.unit_price || 0))
  ), 0))
  const discountAmount = roundInvoiceMoney(subtotal * Number(discountPercent || 0) / 100)

  return { subtotal, discountAmount, total: roundInvoiceMoney(subtotal - discountAmount) }
}
