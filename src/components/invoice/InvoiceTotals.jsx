import { formatInvoiceRupiah } from '../../utils/invoice'

function InvoiceTotals({ totals, discountPercent, editable, onDiscountPercentChange, compact = false }) {
  return (
    <section className={`gr-invoice-totals ${compact ? 'is-compact' : ''}`}>
      <div><span>Subtotal</span><strong>{formatInvoiceRupiah(totals.subtotal)}</strong></div>
      <div>
        <span>Diskon</span>
        {editable ? (
          <label className="gr-invoice-discount-input"><input type="number" min="0" max="100" step="0.01" value={discountPercent} onChange={(event) => onDiscountPercentChange(event.target.value)} />%</label>
        ) : <strong>{Number(discountPercent || 0)}%</strong>}
      </div>
      <div><span>Potongan</span><strong>-{formatInvoiceRupiah(totals.discountAmount)}</strong></div>
      <div className="gr-invoice-total-grand"><span>Total</span><strong>{formatInvoiceRupiah(totals.total)}</strong></div>
    </section>
  )
}

export default InvoiceTotals
