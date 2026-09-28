import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../supabase'
import { createAuditLog } from '../utils/auditLog'
import { createAdminQrisSignedUrl } from '../utils/paymentAssetAccess'
import { DEFAULT_SITE_BRANDING, mergeSiteBrandingRows } from '../utils/siteBranding'
import InvoiceItemEditor from '../components/invoice/InvoiceItemEditor'
import InvoicePreview from '../components/invoice/InvoicePreview'
import InvoiceSkuPicker from '../components/invoice/InvoiceSkuPicker'
import InvoiceStatusBadge from '../components/invoice/InvoiceStatusBadge'
import InvoiceTotals from '../components/invoice/InvoiceTotals'
import { calculateInvoiceTotals } from '../utils/invoice'
import '../styles/admin-invoice.css'

const EMPTY_INVOICE = {
  invoice_no: '', client_name: '', client_meta: { institution: '' }, work_title: '', work_description: '',
  invoice_date: '', due_date: '', status: 'DRAFT', discount_percent: '0', note: '', request_id: null, client_user_id: null
}

const createLocalId = () => `local-${crypto.randomUUID()}`

function toEditorItem(item) {
  return {
    local_id: item.id || createLocalId(), id: item.id || null, catalog_item_id: item.catalog_item_id || null,
    sku: item.sku || '', name: item.name || '', description: item.description || '',
    qty: String(item.qty ?? 1), unit_price: String(item.unit_price ?? 0), sort_order: Number(item.sort_order || 0)
  }
}

function normalizeError(error, fallback) {
  if (!error?.message) return fallback
  if (error.code === '42501') return 'Akses ditolak. Masuk kembali dengan akun admin.'
  if (error.code === '22P02' || error.code === 'PGRST116') return 'Invoice atau request tidak ditemukan. Kembali ke daftar dan buka ulang.'
  if (error.code === '23503') return 'Data referensi sudah berubah. Muat ulang sebelum mencoba lagi.'
  if (/issuance requires|due date|at least one item/i.test(error.message)) return `Invoice belum bisa diterbitkan: ${error.message}`
  return `${fallback}: ${error.message}`
}

function AdminInvoiceEditorPage({ user }) {
  const { invoiceId } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const location = useLocation()
  const isNew = !invoiceId
  const requestIdFromQuery = searchParams.get('request')
  const requestPrefillApplied = useRef('')
  const [invoice, setInvoice] = useState(EMPTY_INVOICE)
  const [items, setItems] = useState([])
  const [catalogItems, setCatalogItems] = useState([])
  const [loading, setLoading] = useState(!isNew)
  const [catalogLoading, setCatalogLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [catalogError, setCatalogError] = useState('')
  const [paymentSettings, setPaymentSettings] = useState(null)
  const [branding, setBranding] = useState(DEFAULT_SITE_BRANDING)
  const [paymentLoading, setPaymentLoading] = useState(true)
  const [paymentError, setPaymentError] = useState('')
  const [qrisImageUrl, setQrisImageUrl] = useState('')
  const [qrisImageError, setQrisImageError] = useState('')
  const [requestContextError, setRequestContextError] = useState('')
  const [requestContextLoading, setRequestContextLoading] = useState(false)
  const [saveError, setSaveError] = useState(location.state?.invoiceSaveError || '')
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  const editable = invoice.status === 'DRAFT'
  const liveTotals = useMemo(() => !dirty && invoice.total != null ? { subtotal: Number(invoice.subtotal), discountAmount: Number(invoice.discount_amount), total: Number(invoice.total) } : calculateInvoiceTotals(items, invoice.discount_percent), [dirty, items, invoice])

  const loadCatalog = async () => {
    setCatalogLoading(true)
    setCatalogError('')
    const { data, error } = await supabase.from('invoice_catalog_items').select('id, sku, name, description, base_price, unit, sort_order').eq('is_active', true).order('category').order('sort_order')
    if (error) { setCatalogItems([]); setCatalogError(`Katalog SKU belum dapat dimuat: ${error.message}`) } else setCatalogItems(data || [])
    setCatalogLoading(false)
  }

  const loadPaymentSettings = async () => {
    setPaymentLoading(true)
    setPaymentError('')
    setQrisImageUrl('')
    setQrisImageError('')
    const { data, error } = await supabase
      .from('admin_payment_settings')
      .select('admin_phone, payment_instruction, qris_url, qris_storage_path')
      .eq('id', 'default')
      .maybeSingle()
    if (error) {
      setPaymentSettings(null)
      setPaymentError(`Pengaturan pembayaran belum dapat dimuat: ${error.message}`)
      setPaymentLoading(false)
      return
    }
    setPaymentSettings(data || null)
    if (!data) {
      setPaymentError('Pengaturan pembayaran GreenroomID belum tersedia.')
      setPaymentLoading(false)
      return
    }
    if (data.qris_storage_path) {
      const { url, error: signedUrlError } = await createAdminQrisSignedUrl(supabase, data.qris_storage_path)
      if (signedUrlError) setQrisImageError(signedUrlError)
      else setQrisImageUrl(url)
    } else if (data.qris_url) {
      setQrisImageUrl(data.qris_url)
    }
    setPaymentLoading(false)
  }

  const loadBranding = async () => {
    const { data, error } = await supabase
      .from('landing_content')
      .select('content_key, content_value')
      .in('content_key', ['site_name', 'site_logo_url', 'site_favicon_url'])

    if (!error && data) setBranding(mergeSiteBrandingRows(data))
  }

  const loadInvoice = async (id = invoiceId) => {
    if (!id) return
    setLoading(true)
    setLoadError('')
    const [invoiceResult, itemResult] = await Promise.all([
      supabase.from('invoices').select('id, invoice_no, request_id, client_user_id, client_name, client_meta, work_title, work_description, invoice_date, due_date, status, subtotal, discount_percent, discount_amount, total, note, issued_at').eq('id', id).single(),
      supabase.from('invoice_items').select('id, invoice_id, catalog_item_id, sku, name, description, qty, unit_price, subtotal, sort_order').eq('invoice_id', id).order('sort_order').order('created_at')
    ])
    if (invoiceResult.error || itemResult.error) {
      setLoadError(normalizeError(invoiceResult.error || itemResult.error, 'Invoice belum dapat dimuat'))
    } else {
      const loadedInvoice = invoiceResult.data
      setInvoice({ ...loadedInvoice, client_meta: loadedInvoice.client_meta || {}, discount_percent: String(loadedInvoice.discount_percent ?? 0) })
      const editorItems = (itemResult.data || []).map(toEditorItem)
      setItems(editorItems)
      setDirty(false)
    }
    setLoading(false)
  }

  useEffect(() => { loadCatalog(); loadPaymentSettings(); loadBranding() }, [])
  useEffect(() => {
    if (!isNew || !requestIdFromQuery || requestPrefillApplied.current === requestIdFromQuery) return
    requestPrefillApplied.current = requestIdFromQuery
    const loadRequestPrefill = async () => {
      setRequestContextLoading(true)
      setRequestContextError('')
      const { data, error } = await supabase
        .from('requests')
        .select('id, client_id, client_email, judul, deskripsi')
        .eq('id', requestIdFromQuery)
        .is('deleted_at', null)
        .maybeSingle()
      if (error || !data) {
        setRequestContextError(error ? `Request belum dapat dimuat: ${error.message}` : 'Request tidak ditemukan atau sudah dihapus.')
        setRequestContextLoading(false)
        return
      }
      const clientName = String(data.client_email || '').split('@')[0]
      setInvoice((current) => ({
        ...current,
        request_id: data.id,
        client_user_id: data.client_id || null,
        client_name: current.client_name || clientName,
        client_meta: { ...(current.client_meta || {}), ...(data.client_email ? { email: data.client_email } : {}) },
        work_title: current.work_title || data.judul || '',
        work_description: current.work_description || data.deskripsi || ''
      }))
      setRequestContextLoading(false)
    }
    loadRequestPrefill()
  }, [isNew, requestIdFromQuery])
  // Loading is intentionally keyed to the route ID; loadInvoice also relies on
  // the current Supabase client and must not re-run after every editor state edit.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (!isNew) loadInvoice() }, [invoiceId, isNew])

  const updateInvoiceField = (field, value) => setInvoice((current) => ({ ...current, [field]: value }))
  const updateInstitution = (institution) => setInvoice((current) => ({ ...current, client_meta: { ...(current.client_meta || {}), institution } }))
  const updateItem = (localId, field, value) => setItems((current) => current.map((item) => item.local_id === localId ? { ...item, [field]: value } : item))
  const removeItem = (localId) => (setDirty(true), setItems((current) => current.filter((item) => item.local_id !== localId)))

  const addCatalogItem = (catalogItem) => (setDirty(true), setItems((current) => [...current, toEditorItem({
    catalog_item_id: catalogItem.id, sku: catalogItem.sku, name: catalogItem.name, description: catalogItem.description,
    qty: 1, unit_price: catalogItem.base_price, sort_order: current.length
  })]))
  const addCustomItem = () => (setDirty(true), setItems((current) => [...current, toEditorItem({ sku: 'CUSTOM', name: '', description: '', qty: 1, unit_price: 0, sort_order: current.length })]))

  const validateItems = () => {
    for (const item of items) {
      if (!item.sku.trim() || !item.name.trim()) return 'Setiap item harus memiliki SKU dan nama pekerjaan.'
      if (!Number.isFinite(Number(item.qty)) || Number(item.qty) <= 0) return `Jumlah untuk ${item.sku || 'item'} harus lebih dari nol.`
      if (!Number.isFinite(Number(item.unit_price)) || Number(item.unit_price) < 0) return `Harga untuk ${item.sku || 'item'} tidak valid.`
    }
    return ''
  }

  const headerPayload = () => ({
    client_name: invoice.client_name.trim(), client_meta: invoice.client_meta || {}, work_title: invoice.work_title.trim(),
    work_description: invoice.work_description.trim(), invoice_date: invoice.invoice_date || null,
    due_date: invoice.due_date || null, note: invoice.note.trim(), discount_percent: Number(invoice.discount_percent || 0)
  })

  const persistDraft = async () => {
    if (invoiceId && !dirty) return { invoice, id: invoiceId }
    if (isNew && requestIdFromQuery && (requestContextLoading || requestContextError)) {
      setSaveError(requestContextLoading ? 'Tunggu data request selesai dimuat sebelum menyimpan invoice.' : requestContextError)
      return null
    }
    const itemValidationError = validateItems()
    if (itemValidationError) { setSaveError(itemValidationError); return null }
    if (!Number.isFinite(Number(invoice.discount_percent)) || Number(invoice.discount_percent) < 0 || Number(invoice.discount_percent) > 100) {
      setSaveError('Diskon harus berada antara 0 dan 100 persen.'); return null
    }

    setSaving(true)
    setSaveError('')
    const itemPayload = items.map((item) => ({
      ...(item.id ? { id: item.id } : {}),
      catalog_item_id: item.catalog_item_id || null,
      sku: item.sku.trim(),
      name: item.name.trim(),
      description: item.description.trim(),
      qty: Number(item.qty),
      unit_price: Number(item.unit_price)
    }))
    const rpcName = !invoiceId && invoice.request_id ? 'save_invoice_draft_for_request' : 'save_invoice_draft'
    const rpcArgs = rpcName === 'save_invoice_draft_for_request'
      ? { p_request_id: String(invoice.request_id), p_header: { ...headerPayload(), client_user_id: invoice.client_user_id || null }, p_items: itemPayload }
      : { p_invoice_id: invoiceId || null, p_header: headerPayload(), p_items: itemPayload }
    const { data: refreshedInvoice, error } = await supabase.rpc(rpcName, rpcArgs).single()
    if (error) { setSaveError(normalizeError(error, 'Draft tidak dapat disimpan')); setSaving(false); return null }
    const currentInvoiceId = refreshedInvoice.id

    const auditResult = await createAuditLog({ requestId: refreshedInvoice.request_id || invoice.request_id || null, actorId: user?.id || null, actorEmail: user?.email || null, actorRole: 'admin', action: invoiceId ? 'INVOICE_UPDATED' : 'INVOICE_CREATED', description: invoiceId ? `Admin memperbarui draft invoice: ${refreshedInvoice.invoice_no}` : `Admin membuat draft invoice: ${refreshedInvoice.invoice_no}`, metadata: { invoice_id: currentInvoiceId, invoice_no: refreshedInvoice.invoice_no, request_id: refreshedInvoice.request_id || invoice.request_id || null, previous_status: invoiceId ? invoice.status : null, new_status: refreshedInvoice.status, total: refreshedInvoice.total } })
    if (auditResult?.error) window.alert('Draft tersimpan, tetapi audit log gagal. Periksa Riwayat Aktivitas; jangan ulangi pembuatan invoice.')
    setSaving(false)
    return { invoice: refreshedInvoice, id: currentInvoiceId }
  }

  const saveDraft = async () => {
    const result = await persistDraft()
    if (!result) return
    if (isNew) { navigate(`/admin/invoices/${result.id}`, { replace: true }); return }
    await loadInvoice(result.id)
  }

  const issueInvoice = async () => {
    const result = await persistDraft()
    if (!result) return
    setSaving(true)
    const { error } = await supabase.from('invoices').update({ status: 'WAITING_PAYMENT' }).eq('id', result.id).select().single()
    if (error) {
      const message = normalizeError(error, 'Draft tersimpan, tetapi invoice belum dapat diterbitkan')
      setSaveError(message)
      setSaving(false)
      if (isNew) navigate(`/admin/invoices/${result.id}`, { replace: true, state: { invoiceSaveError: message } })
      else await loadInvoice(result.id)
      return
    }
    setSaving(false)
    navigate(`/admin/invoices/${result.id}`, { replace: true })
    await loadInvoice(result.id)
  }

  const printInvoice = () => window.print()

  if (loading || (isNew && requestIdFromQuery && requestContextLoading)) return <div className="gr-invoice-state" role="status"><span className="gr-invoice-spinner" /><p>Memuat invoice...</p></div>
  if (loadError) return <div className="gr-invoice-page"><section className="gr-invoice-error" role="alert"><div><strong>Invoice belum dapat dibuka.</strong><p>{loadError}</p></div><button type="button" onClick={() => loadInvoice()}>Coba lagi</button></section><Link className="gr-invoice-button-secondary" to="/admin/invoices">Kembali ke Invoice</Link></div>

  return (
    <div className="gr-invoice-page gr-invoice-editor-page">
      <header className="gr-invoice-page-header"><div><p className="gr-invoice-breadcrumb">Admin / Invoice / {isNew ? 'Buat' : invoice.invoice_no}</p><div className="gr-invoice-title-row"><h1>{isNew ? 'Buat Invoice' : invoice.invoice_no}</h1><InvoiceStatusBadge status={invoice.status} /></div><p>{editable ? 'Lengkapi informasi, lalu simpan draft atau terbitkan saat siap ditagihkan.' : 'Invoice ini sudah diterbitkan dan ditampilkan sebagai catatan billing yang tidak dapat diedit.'}</p></div><div className="gr-invoice-header-actions gr-invoice-screen-action"><Link className="gr-invoice-button-plain" to="/admin/invoices">← Semua Invoice</Link><button type="button" className="gr-invoice-button-secondary" onClick={printInvoice}>Cetak Invoice</button></div></header>
      {requestContextLoading && <section className="gr-invoice-request-context" role="status">Memuat data request untuk invoice...</section>}
      {requestContextError && <section className="gr-invoice-save-error" role="alert">{requestContextError}</section>}
      {invoice.request_id && <section className="gr-invoice-request-context"><span>Invoice tertaut ke request</span><Link to={`/admin/requests/${invoice.request_id}`}>Buka Request #{invoice.request_id}</Link></section>}
      {catalogError && <section className="gr-invoice-error" role="alert"><div><strong>Katalog SKU belum tersedia.</strong><p>{catalogError}</p></div><button type="button" onClick={loadCatalog}>Coba lagi</button></section>}
      {saveError && <section className="gr-invoice-save-error" role="alert">{saveError}</section>}
      <div className="gr-invoice-editor-layout">
        <form onChange={() => setDirty(true)} className={`gr-invoice-editor ${editable ? '' : 'is-readonly'}`} onSubmit={(event) => { event.preventDefault(); saveDraft() }}>
          <section className="gr-invoice-editor-section"><h2>Informasi invoice</h2><div className="gr-invoice-form-grid"><label>Nomor invoice<input disabled value={invoice.invoice_no || 'Dibuat otomatis saat draft disimpan'} /></label><label>Tanggal invoice<input disabled={!editable} type="date" value={invoice.invoice_date || ''} onChange={(event) => updateInvoiceField('invoice_date', event.target.value)} /></label><label>Jatuh tempo<input disabled={!editable} type="date" value={invoice.due_date || ''} onChange={(event) => updateInvoiceField('due_date', event.target.value)} /></label></div></section>
          <section className="gr-invoice-editor-section"><h2>Client</h2><div className="gr-invoice-form-grid"><label>Nama client<input disabled={!editable} value={invoice.client_name || ''} onChange={(event) => updateInvoiceField('client_name', event.target.value)} placeholder="Nama client" /></label><label>Institusi / universitas<input disabled={!editable} value={invoice.client_meta?.institution || ''} onChange={(event) => updateInstitution(event.target.value)} placeholder="Opsional" /></label></div></section>
          <section className="gr-invoice-editor-section"><h2>Detail pekerjaan</h2><div className="gr-invoice-form-grid"><label className="gr-invoice-field-wide">Judul pekerjaan<input disabled={!editable} value={invoice.work_title || ''} onChange={(event) => updateInvoiceField('work_title', event.target.value)} placeholder="Contoh: Makalah Manajemen Pendidikan" /></label><label className="gr-invoice-field-wide">Deskripsi<textarea disabled={!editable} rows="3" value={invoice.work_description || ''} onChange={(event) => updateInvoiceField('work_description', event.target.value)} /></label></div></section>
          <section className="gr-invoice-editor-section"><h2>Item invoice</h2>{editable && <InvoiceSkuPicker catalogItems={catalogItems} disabled={catalogLoading} onAddCatalogItem={addCatalogItem} onAddCustomItem={addCustomItem} />}{catalogLoading && <p className="gr-invoice-section-note">Memuat katalog SKU...</p>}{items.length === 0 ? <p className="gr-invoice-empty-items">Belum ada item. Tambahkan SKU atau item manual.</p> : <div className="gr-invoice-item-list">{items.map((item) => <InvoiceItemEditor key={item.local_id} item={item} editable={editable} onChange={updateItem} onRemove={removeItem} />)}</div>}</section>
          <section className="gr-invoice-editor-section"><h2>Ringkasan</h2><InvoiceTotals totals={liveTotals} discountPercent={invoice.discount_percent} editable={editable} onDiscountPercentChange={(value) => updateInvoiceField('discount_percent', value)} /><label className="gr-invoice-note-field">Catatan<textarea disabled={!editable} rows="3" value={invoice.note || ''} onChange={(event) => updateInvoiceField('note', event.target.value)} placeholder="Catatan tambahan untuk invoice." /></label></section>
          {editable && <footer className="gr-invoice-editor-actions"><button type="submit" className="gr-invoice-button-secondary" disabled={saving}>{saving ? 'Menyimpan...' : 'Simpan Draft'}</button><button type="button" className="gr-invoice-button-primary" disabled={saving} onClick={issueInvoice}>{saving ? 'Memproses...' : 'Terbitkan Invoice'}</button></footer>}
        </form>
        <InvoicePreview
          invoice={invoice}
          items={items}
          totals={liveTotals}
          paymentSettings={paymentSettings}
          paymentLoading={paymentLoading}
          paymentError={paymentError}
          qrisImageUrl={qrisImageUrl}
          qrisImageError={qrisImageError}
          branding={branding}
          onQrisLoadError={() => {
            setQrisImageUrl('')
            setQrisImageError('QRIS belum dapat ditampilkan. Periksa pengaturan pembayaran GreenroomID.')
          }}
        />
      </div>
    </div>
  )
}

export default AdminInvoiceEditorPage
