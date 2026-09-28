import InvoiceStatusBadge from './InvoiceStatusBadge'
import { useState } from 'react'
import { formatInvoiceRupiah, roundInvoiceMoney } from '../../utils/invoice'

function formatDate(value) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(`${value}T00:00:00`))
}

function InvoicePreview({
  invoice, items, totals, paymentSettings, paymentLoading, paymentError,
  qrisImageUrl, qrisImageError, onQrisLoadError, branding
}) {
  const hasPaymentSettings = Boolean(paymentSettings)
  const hasQrisSource = Boolean(paymentSettings?.qris_storage_path || paymentSettings?.qris_url)
  const siteName = branding?.site_name || 'GreenroomID'
  const [logoUnavailable, setLogoUnavailable] = useState(false)
  const logoUrl = !logoUnavailable ? (branding?.site_logo_url || branding?.site_favicon_url || '') : ''

  return (
    <aside className="gr-invoice-preview" aria-label="Preview invoice">
      <div className="gr-invoice-paper">
        <header className="gr-invoice-paper-header">
          <div className="gr-invoice-brand-lockup">
            {logoUrl && <img className="gr-invoice-brand-logo" src={logoUrl} alt={`${siteName} logo`} onError={() => setLogoUnavailable(true)} />}
            <div><span className="gr-invoice-brand">{siteName}</span><p>Creative and academic support</p></div>
          </div>
          <div className="gr-invoice-paper-title"><span>INVOICE</span><strong>{invoice.invoice_no || 'Nomor dibuat saat draft disimpan'}</strong></div>
        </header>
        <div className="gr-invoice-paper-meta">
          <div><span>Tanggal Invoice</span><strong>{formatDate(invoice.invoice_date)}</strong></div>
          <div><span>Jatuh Tempo</span><strong>{formatDate(invoice.due_date)}</strong></div>
          <div><span>Status</span><InvoiceStatusBadge status={invoice.status || 'DRAFT'} /></div>
        </div>
        <div className="gr-invoice-paper-parties">
          <div><span>Ditagihkan kepada</span><strong>{invoice.client_name || 'Nama client belum diisi'}</strong><p>{invoice.client_meta?.institution || 'Institusi belum diisi'}</p></div>
          <div><span>Detail pekerjaan</span><strong>{invoice.work_title || 'Judul pekerjaan belum diisi'}</strong><p>{invoice.work_description || 'Deskripsi pekerjaan belum diisi'}</p></div>
        </div>
        <table className="gr-invoice-paper-table">
          <thead><tr><th>SKU</th><th>Pekerjaan</th><th>Qty</th><th>Harga</th><th>Subtotal</th></tr></thead>
          <tbody>
            {items.length === 0 ? <tr><td colSpan="5" className="gr-invoice-paper-empty">Belum ada item invoice.</td></tr> : items.map((item) => (
              <tr key={item.local_id}><td>{item.sku}</td><td><strong>{item.name}</strong>{item.description && <span>{item.description}</span>}</td><td>{item.qty}</td><td>{formatInvoiceRupiah(item.unit_price)}</td><td>{formatInvoiceRupiah(roundInvoiceMoney(Number(item.qty || 0) * Number(item.unit_price || 0)))}</td></tr>
            ))}
          </tbody>
        </table>
        <div className="gr-invoice-paper-totals">
          <div><span>Subtotal</span><strong>{formatInvoiceRupiah(totals.subtotal)}</strong></div>
          {Number(invoice.discount_percent || 0) > 0 && <div><span>Diskon ({Number(invoice.discount_percent || 0)}%)</span><strong>-{formatInvoiceRupiah(totals.discountAmount)}</strong></div>}
          <div className="gr-invoice-paper-grand-total"><span>TOTAL</span><strong>{formatInvoiceRupiah(totals.total)}</strong></div>
        </div>
        {invoice.note && <div className="gr-invoice-paper-note"><strong>Catatan</strong><p>{invoice.note}</p></div>}
        <section className="gr-invoice-payment" aria-label="Informasi pembayaran">
          <div className="gr-invoice-payment-copy">
            <span>PEMBAYARAN</span>
            <h2>QRIS Pembayaran GreenroomID</h2>
            {paymentLoading ? <p className="gr-invoice-payment-muted">Memuat pengaturan pembayaran...</p> : paymentError ? <p className="gr-invoice-payment-error">{paymentError}</p> : !hasPaymentSettings ? <p className="gr-invoice-payment-muted">Pengaturan pembayaran belum tersedia.</p> : <>
              <p>Setelah pembayaran, silakan hubungi admin untuk verifikasi.</p>
              <p><strong>Nomor Admin:</strong> {paymentSettings.admin_phone || 'Belum dikonfigurasi'}</p>
              {paymentSettings.payment_instruction ? <p className="gr-invoice-payment-instruction">{paymentSettings.payment_instruction}</p> : <p className="gr-invoice-payment-muted">Instruksi pembayaran belum dikonfigurasi.</p>}
              <p>Kirim bukti pembayaran setelah transfer/scan berhasil.</p>
            </>}
          </div>
          <div className="gr-invoice-qris-panel">
            {qrisImageUrl ? <img src={qrisImageUrl} alt="QRIS pembayaran GreenroomID" onError={onQrisLoadError} /> : paymentLoading ? <span>Memuat QRIS...</span> : qrisImageError ? <span className="gr-invoice-payment-error">{qrisImageError}</span> : hasQrisSource ? <span className="gr-invoice-payment-muted">QRIS belum dapat dimuat.</span> : <span className="gr-invoice-payment-muted">QRIS belum dikonfigurasi.</span>}
          </div>
        </section>
        <footer>GreenroomID · {invoice.invoice_no || 'Invoice draft'} · {formatDate(invoice.invoice_date)}</footer>
      </div>
    </aside>
  )
}

export default InvoicePreview
