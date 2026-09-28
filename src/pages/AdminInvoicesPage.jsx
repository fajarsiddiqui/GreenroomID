import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import InvoiceStatusBadge from '../components/invoice/InvoiceStatusBadge'
import { formatInvoiceRupiah, getInvoiceStatusLabel } from '../utils/invoice'
import '../styles/admin-invoice.css'

const STATUSES = ['DRAFT', 'WAITING_PAYMENT', 'PARTIALLY_PAID', 'PAID', 'EXPIRED', 'VOID']

function formatDate(value) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(`${value}T00:00:00`))
}

function AdminInvoicesPage() {
  const navigate = useNavigate()
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const loadInvoices = async () => {
    setLoading(true)
    setErrorMessage('')
    const { data, error } = await supabase
      .from('invoices')
      .select('id, invoice_no, client_name, work_title, invoice_date, due_date, total, status, created_at')
      .order('invoice_date', { ascending: false })
      .order('created_at', { ascending: false })

    if (error) {
      setInvoices([])
      setErrorMessage(`Invoice belum dapat dimuat: ${error.message}`)
    } else {
      setInvoices(data || [])
    }
    setLoading(false)
  }

  useEffect(() => { loadInvoices() }, [])

  const filteredInvoices = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('id-ID')
    return invoices.filter((invoice) => {
      const haystack = [invoice.invoice_no, invoice.client_name, invoice.work_title].join(' ').toLocaleLowerCase('id-ID')
      return (!statusFilter || invoice.status === statusFilter) && (!query || haystack.includes(query))
    })
  }, [invoices, search, statusFilter])

  return (
    <div className="gr-invoice-page">
      <header className="gr-invoice-page-header">
        <div><p className="gr-invoice-breadcrumb">Admin / Invoice</p><h1>Invoice</h1><p>Kelola draft invoice dan status pembayaran client.</p></div>
        <div className="gr-invoice-header-actions"><Link className="gr-invoice-button-secondary" to="/admin/invoices/catalog">Kelola Katalog SKU</Link><Link className="gr-invoice-button-primary" to="/admin/invoices/new">+ Buat Invoice</Link></div>
      </header>
      <section className="gr-invoice-list-toolbar" aria-label="Filter invoice">
        <input aria-label="Cari invoice" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari nomor invoice, client, atau pekerjaan..." />
        <select aria-label="Filter status invoice" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">Semua status</option>{STATUSES.map((status) => <option key={status} value={status}>{getInvoiceStatusLabel(status)}</option>)}</select>
      </section>
      {errorMessage && <section className="gr-invoice-error" role="alert"><div><strong>Invoice belum dapat ditampilkan.</strong><p>{errorMessage}</p></div><button type="button" onClick={loadInvoices}>Coba lagi</button></section>}
      {loading && <section className="gr-invoice-state" role="status"><span className="gr-invoice-spinner" /><p>Memuat invoice...</p></section>}
      {!loading && !errorMessage && invoices.length === 0 && <section className="gr-invoice-state"><h2>Belum ada invoice</h2><p>Buat draft pertama untuk mulai menagih pekerjaan client.</p><Link className="gr-invoice-button-primary" to="/admin/invoices/new">Buat Invoice</Link></section>}
      {!loading && !errorMessage && invoices.length > 0 && filteredInvoices.length === 0 && <section className="gr-invoice-state"><h2>Invoice tidak ditemukan</h2><p>Ubah kata kunci atau filter status.</p><button type="button" className="gr-invoice-button-plain" onClick={() => { setSearch(''); setStatusFilter('') }}>Reset filter</button></section>}
      {!loading && !errorMessage && filteredInvoices.length > 0 && <section className="gr-invoice-list-card"><div className="gr-invoice-table-scroll"><table className="gr-invoice-list-table"><thead><tr><th>Invoice</th><th>Client</th><th>Pekerjaan</th><th>Tanggal</th><th>Jatuh Tempo</th><th>Total</th><th>Status</th></tr></thead><tbody>{filteredInvoices.map((invoice) => <tr key={invoice.id} onClick={() => navigate(`/admin/invoices/${invoice.id}`)}><td><strong>{invoice.invoice_no}</strong></td><td>{invoice.client_name || <span className="gr-invoice-muted">Belum diisi</span>}</td><td>{invoice.work_title || <span className="gr-invoice-muted">Belum diisi</span>}</td><td>{formatDate(invoice.invoice_date)}</td><td>{formatDate(invoice.due_date)}</td><td className="gr-invoice-money">{formatInvoiceRupiah(invoice.total)}</td><td><InvoiceStatusBadge status={invoice.status} /></td></tr>)}</tbody></table></div></section>}
    </div>
  )
}

export default AdminInvoicesPage
