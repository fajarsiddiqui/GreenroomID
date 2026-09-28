import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase'
import { createAuditLog } from '../utils/auditLog'
import '../styles/admin-invoice-catalog.css'

const EMPTY_FORM = {
  sku: '',
  category: '',
  name: '',
  description: '',
  base_price: '',
  unit: 'pekerjaan',
  service_item_id: '',
  is_active: true,
  sort_order: ''
}

function formatRupiah(value) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(Number(value || 0))
}

function humanizeSupabaseError(error, fallback) {
  if (error?.code === '23505' || /duplicate key|unique constraint/i.test(error?.message || '')) {
    return 'SKU sudah digunakan. Gunakan SKU lain.'
  }

  return error?.message ? `${fallback}: ${error.message}` : fallback
}

function CatalogModal({ title, onClose, children }) {
  return (
    <div className="gr-invoice-catalog-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        aria-modal="true"
        aria-labelledby="gr-invoice-catalog-modal-title"
        className="gr-invoice-catalog-modal"
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="gr-invoice-catalog-modal-header">
          <h3 id="gr-invoice-catalog-modal-title">{title}</h3>
          <button type="button" className="gr-invoice-catalog-icon-button" onClick={onClose} aria-label="Tutup formulir">×</button>
        </header>
        {children}
      </section>
    </div>
  )
}

function AdminInvoiceCatalogPage({ user }) {
  const [catalogItems, setCatalogItems] = useState([])
  const [serviceItems, setServiceItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [statusUpdatingId, setStatusUpdatingId] = useState(null)

  const loadCatalog = async () => {
    setLoading(true)
    setErrorMessage('')

    const [catalogResult, serviceResult] = await Promise.all([
      supabase
        .from('invoice_catalog_items')
        .select('id, sku, category, name, description, base_price, unit, service_item_id, is_active, sort_order, created_at, updated_at')
        .order('is_active', { ascending: false })
        .order('category', { ascending: true })
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true }),
      supabase
        .from('service_items')
        .select('id, name, is_active')
        .order('name', { ascending: true })
    ])

    if (catalogResult.error) {
      setCatalogItems([])
      setErrorMessage(humanizeSupabaseError(catalogResult.error, 'Katalog SKU belum dapat dimuat'))
    } else {
      setCatalogItems(catalogResult.data || [])
    }

    if (serviceResult.error) {
      // The relation is optional. Do not block catalog CRUD if the supporting
      // service list is unavailable to the current database/RLS configuration.
      setServiceItems([])
    } else {
      setServiceItems(serviceResult.data || [])
    }

    setLoading(false)
  }

  useEffect(() => {
    loadCatalog()
  }, [])

  const categories = useMemo(() => [...new Set(
    catalogItems.map((item) => item.category).filter(Boolean)
  )].sort((first, second) => first.localeCompare(second, 'id-ID')), [catalogItems])

  const filteredItems = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('id-ID')

    return catalogItems.filter((item) => {
      const matchesCategory = !categoryFilter || item.category === categoryFilter
      const matchesSearch = !query
        || item.sku.toLocaleLowerCase('id-ID').includes(query)
        || item.name.toLocaleLowerCase('id-ID').includes(query)

      return matchesCategory && matchesSearch
    })
  }, [catalogItems, categoryFilter, search])

  const openCreateModal = () => {
    const nextSortOrder = catalogItems.reduce((highest, item) => Math.max(highest, Number(item.sort_order) || 0), 0) + 1
    setEditingItem(null)
    setForm({ ...EMPTY_FORM, sort_order: String(nextSortOrder) })
    setFormError('')
    setIsModalOpen(true)
  }

  const openEditModal = (item) => {
    setEditingItem(item)
    setForm({
      sku: item.sku || '',
      category: item.category || '',
      name: item.name || '',
      description: item.description || '',
      base_price: String(item.base_price ?? ''),
      unit: item.unit || 'pekerjaan',
      service_item_id: item.service_item_id || '',
      is_active: Boolean(item.is_active),
      sort_order: String(item.sort_order ?? 0)
    })
    setFormError('')
    setIsModalOpen(true)
  }

  const closeModal = () => {
    if (saving) return
    setIsModalOpen(false)
    setEditingItem(null)
    setFormError('')
  }

  const saveCatalogItem = async (event) => {
    event.preventDefault()
    const sku = form.sku.trim()
    const category = form.category.trim()
    const name = form.name.trim()
    const unit = form.unit.trim()
    const price = Number(form.base_price)
    const sortOrder = Number(form.sort_order)

    if (!sku || !category || !name || !unit) {
      setFormError('SKU, kategori, nama, dan satuan wajib diisi.')
      return
    }
    if (!Number.isFinite(price) || price < 0) {
      setFormError('Harga dasar harus berupa angka nol atau lebih.')
      return
    }
    if (!Number.isInteger(sortOrder) || sortOrder < 0) {
      setFormError('Urutan tampil harus berupa bilangan bulat nol atau lebih.')
      return
    }

    setSaving(true)
    setFormError('')
    const payload = {
      sku,
      category,
      name,
      description: form.description.trim(),
      base_price: price,
      unit,
      service_item_id: form.service_item_id || null,
      is_active: form.is_active,
      sort_order: sortOrder
    }

    const result = editingItem
      ? await supabase.from('invoice_catalog_items').update(payload).eq('id', editingItem.id).select().single()
      : await supabase.from('invoice_catalog_items').insert(payload).select().single()

    if (result.error) {
      setFormError(humanizeSupabaseError(result.error, 'Gagal menyimpan SKU'))
      setSaving(false)
      return
    }

    const auditResult = await createAuditLog({
      actorId: user?.id || null,
      actorEmail: user?.email || null,
      actorRole: 'admin',
      action: editingItem ? (editingItem.is_active && !payload.is_active ? 'INVOICE_CATALOG_DISABLED' : 'INVOICE_CATALOG_UPDATED') : 'INVOICE_CATALOG_CREATED',
      description: editingItem
        ? `Admin memperbarui SKU invoice: ${payload.sku}`
        : `Admin menambahkan SKU invoice: ${payload.sku}`,
      metadata: { catalog_item_id: result.data.id, ...payload }
    })

    if (auditResult?.error) window.alert('SKU tersimpan, tetapi audit log gagal. Periksa Riwayat Aktivitas.')
    setSaving(false)
    closeModal()
    await loadCatalog()
  }

  const toggleActiveStatus = async (item) => {
    const nextStatus = !item.is_active
    const actionLabel = nextStatus ? 'mengaktifkan' : 'menonaktifkan'
    if (!window.confirm(`Yakin ingin ${actionLabel} SKU "${item.sku}"?`)) return

    setStatusUpdatingId(item.id)
    const { error } = await supabase
      .from('invoice_catalog_items')
      .update({ is_active: nextStatus })
      .eq('id', item.id)

    if (error) {
      setErrorMessage(humanizeSupabaseError(error, 'Gagal mengubah status SKU'))
      setStatusUpdatingId(null)
      return
    }

    const auditResult = await createAuditLog({
      actorId: user?.id || null,
      actorEmail: user?.email || null,
      actorRole: 'admin',
      action: nextStatus ? 'INVOICE_CATALOG_UPDATED' : 'INVOICE_CATALOG_DISABLED',
      description: `Admin ${actionLabel} SKU invoice: ${item.sku}`,
      metadata: { catalog_item_id: item.id, sku: item.sku, previous_status: item.is_active, new_status: nextStatus }
    })

    if (auditResult?.error) window.alert('Status SKU tersimpan, tetapi audit log gagal. Periksa Riwayat Aktivitas.')
    setStatusUpdatingId(null)
    await loadCatalog()
  }

  return (
    <div className="gr-invoice-catalog-page">
      <header className="gr-invoice-catalog-header">
        <div>
          <p className="gr-invoice-catalog-breadcrumb">Admin / Invoice / Katalog SKU</p>
          <h1>Katalog Invoice</h1>
          <p>Kelola SKU, harga dasar, dan ketersediaan item untuk invoice.</p>
        </div>
        <button type="button" className="gr-invoice-catalog-primary-button" onClick={openCreateModal}>+ Tambah SKU</button>
      </header>

      <section className="gr-invoice-catalog-toolbar" aria-label="Filter katalog invoice">
        <label className="gr-invoice-catalog-search">
          <span className="sr-only">Cari SKU atau nama pekerjaan</span>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari SKU atau pekerjaan..." />
        </label>
        <label className="gr-invoice-catalog-filter">
          <span>Kategori</span>
          <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
            <option value="">Semua kategori</option>
            {categories.map((category) => <option key={category} value={category}>{category}</option>)}
          </select>
        </label>
      </section>

      {errorMessage && (
        <section className="gr-invoice-catalog-error" role="alert">
          <div><strong>Katalog belum dapat ditampilkan.</strong><p>{errorMessage}</p></div>
          <button type="button" onClick={loadCatalog}>Coba lagi</button>
        </section>
      )}

      {loading && (
        <section className="gr-invoice-catalog-state" role="status" aria-live="polite">
          <span className="gr-invoice-catalog-spinner" />
          <p>Memuat katalog SKU...</p>
        </section>
      )}

      {!loading && !errorMessage && catalogItems.length === 0 && (
        <section className="gr-invoice-catalog-state">
          <p className="gr-invoice-catalog-empty-icon">⌘</p>
          <h2>Belum ada SKU invoice</h2>
          <p>Buat SKU pertama untuk mulai menyiapkan item penagihan.</p>
          <button type="button" className="gr-invoice-catalog-secondary-button" onClick={openCreateModal}>Tambah SKU pertama</button>
        </section>
      )}

      {!loading && !errorMessage && catalogItems.length > 0 && filteredItems.length === 0 && (
        <section className="gr-invoice-catalog-state">
          <h2>SKU tidak ditemukan</h2>
          <p>Ubah kata kunci pencarian atau filter kategori.</p>
          <button type="button" className="gr-invoice-catalog-text-button" onClick={() => { setSearch(''); setCategoryFilter('') }}>Reset filter</button>
        </section>
      )}

      {!loading && !errorMessage && filteredItems.length > 0 && (
        <section className="gr-invoice-catalog-table-card">
          <div className="gr-invoice-catalog-table-scroll">
            <table>
              <thead>
                <tr><th>SKU</th><th>Pekerjaan</th><th>Kategori</th><th>Harga Dasar</th><th>Status</th><th><span className="sr-only">Aksi</span></th></tr>
              </thead>
              <tbody>
                {filteredItems.map((item) => (
                  <tr key={item.id}>
                    <td><code>{item.sku}</code><span className="gr-invoice-catalog-unit">per {item.unit}</span></td>
                    <td><strong>{item.name}</strong>{item.description && <span className="gr-invoice-catalog-description">{item.description}</span>}</td>
                    <td>{item.category}</td>
                    <td className="gr-invoice-catalog-price">{formatRupiah(item.base_price)}</td>
                    <td><span className={`gr-invoice-catalog-status ${item.is_active ? 'is-active' : 'is-inactive'}`}>{item.is_active ? 'Aktif' : 'Nonaktif'}</span></td>
                    <td className="gr-invoice-catalog-actions">
                      <button type="button" onClick={() => openEditModal(item)}>Edit</button>
                      <button type="button" disabled={statusUpdatingId === item.id} onClick={() => toggleActiveStatus(item)}>
                        {statusUpdatingId === item.id ? 'Memproses...' : item.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {isModalOpen && (
        <CatalogModal title={editingItem ? 'Edit SKU Invoice' : 'Tambah SKU Invoice'} onClose={closeModal}>
          <form className="gr-invoice-catalog-form" onSubmit={saveCatalogItem}>
            {formError && <p className="gr-invoice-catalog-form-error" role="alert">{formError}</p>}
            <div className="gr-invoice-catalog-form-grid">
              <label>SKU<input required value={form.sku} onChange={(event) => setForm({ ...form, sku: event.target.value })} placeholder="MK-CRE-P03" /></label>
              <label>Kategori<input required value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} placeholder="Makalah" /></label>
              <label className="gr-invoice-catalog-full-field">Nama pekerjaan<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Pembuatan makalah lengkap 16–20 halaman" /></label>
              <label className="gr-invoice-catalog-full-field">Deskripsi<textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} rows="3" placeholder="Keterangan yang akan disalin ke invoice." /></label>
              <label>Harga dasar<input required min="0" step="0.01" type="number" value={form.base_price} onChange={(event) => setForm({ ...form, base_price: event.target.value })} placeholder="75000" /></label>
              <label>Satuan<input required value={form.unit} onChange={(event) => setForm({ ...form, unit: event.target.value })} placeholder="pekerjaan" /></label>
              <label>Urutan tampil<input required min="0" step="1" type="number" value={form.sort_order} onChange={(event) => setForm({ ...form, sort_order: event.target.value })} /></label>
              <label>Layanan terkait <span className="gr-invoice-catalog-optional">opsional</span>
                <select value={form.service_item_id} onChange={(event) => setForm({ ...form, service_item_id: event.target.value })}>
                  <option value="">Tidak ditautkan</option>
                  {serviceItems.map((service) => <option key={service.id} value={service.id}>{service.name}{service.is_active ? '' : ' (Nonaktif)'}</option>)}
                </select>
              </label>
              <label className="gr-invoice-catalog-checkbox"><input type="checkbox" checked={form.is_active} onChange={(event) => setForm({ ...form, is_active: event.target.checked })} /> SKU aktif dan dapat dipilih</label>
            </div>
            <footer className="gr-invoice-catalog-form-actions">
              <button type="button" className="gr-invoice-catalog-secondary-button" onClick={closeModal}>Batal</button>
              <button type="submit" className="gr-invoice-catalog-primary-button" disabled={saving}>{saving ? 'Menyimpan...' : 'Simpan SKU'}</button>
            </footer>
          </form>
        </CatalogModal>
      )}
    </div>
  )
}

export default AdminInvoiceCatalogPage
