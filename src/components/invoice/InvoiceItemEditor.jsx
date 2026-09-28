import { formatInvoiceRupiah, roundInvoiceMoney } from '../../utils/invoice'

function InvoiceItemEditor({ item, editable, onChange, onRemove }) {
  const subtotal = roundInvoiceMoney(Number(item.qty || 0) * Number(item.unit_price || 0))

  return (
    <article className="gr-invoice-item-editor">
      <div className="gr-invoice-item-editor-heading">
        <strong>{item.catalog_item_id ? item.sku : 'Item manual'}</strong>
        {editable && <button type="button" className="gr-invoice-remove-item" onClick={() => onRemove(item.local_id)}>Hapus</button>}
      </div>
      <div className="gr-invoice-item-editor-grid">
        <label>SKU<input disabled={!editable} value={item.sku} onChange={(event) => onChange(item.local_id, 'sku', event.target.value)} /></label>
        <label>Jumlah<input disabled={!editable} type="number" min="0.001" step="0.001" value={item.qty} onChange={(event) => onChange(item.local_id, 'qty', event.target.value)} /></label>
        <label className="gr-invoice-field-wide">Nama pekerjaan<input disabled={!editable} value={item.name} onChange={(event) => onChange(item.local_id, 'name', event.target.value)} /></label>
        <label className="gr-invoice-field-wide">Deskripsi<textarea disabled={!editable} rows="2" value={item.description} onChange={(event) => onChange(item.local_id, 'description', event.target.value)} /></label>
        <label>Harga satuan<input disabled={!editable} type="number" min="0" step="0.01" value={item.unit_price} onChange={(event) => onChange(item.local_id, 'unit_price', event.target.value)} /></label>
        <div className="gr-invoice-item-subtotal"><span>Subtotal</span><strong>{formatInvoiceRupiah(subtotal)}</strong></div>
      </div>
    </article>
  )
}

export default InvoiceItemEditor
