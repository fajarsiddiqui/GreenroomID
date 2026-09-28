import { getInvoiceStatusLabel } from '../../utils/invoice'

function InvoiceStatusBadge({ status }) {
  const className = String(status || 'DRAFT').toLowerCase().replace(/_/g, '-')

  return <span className={`gr-invoice-status gr-invoice-status-${className}`}>{getInvoiceStatusLabel(status)}</span>
}

export default InvoiceStatusBadge
