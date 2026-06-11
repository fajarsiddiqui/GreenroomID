import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase'
import { createAuditLog } from '../utils/auditLog'

function AdminServicesPage({ user }) {
  const [categories, setCategories] = useState([])
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [openCategoryId, setOpenCategoryId] = useState(null)
  const [showCategoryModal, setShowCategoryModal] = useState(false)
  const [showItemModal, setShowItemModal] = useState(false)
  const [editingItemId, setEditingItemId] = useState(null)

  const [categoryForm, setCategoryForm] = useState({
    name: '',
    slug: '',
    description: '',
    icon: '',
    is_active: true
  })

  const [itemForm, setItemForm] = useState({
    category_id: '',
    name: '',
    slug: '',
    short_description: '',
    description: '',
    price_start: '',
    price_end: '',
    estimated_time: '',
    price_note: '',
    is_active: true
  })

  const createSlug = (text) => text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')

  const formatRupiah = (angka) => {
    if (!angka) return '-'
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(angka)
  }

  const fetchData = async () => {
    setLoading(true)

    const [{ data: categoryData, error: categoryError }, { data: itemData, error: itemError }] = await Promise.all([
      supabase
        .from('service_categories')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true }),
      supabase
        .from('service_items')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true })
    ])

    if (categoryError) {
      alert('Gagal mengambil kategori layanan: ' + categoryError.message)
      setCategories([])
    } else {
      setCategories(categoryData || [])
    }

    if (itemError) {
      alert('Gagal mengambil layanan: ' + itemError.message)
      setItems([])
    } else {
      setItems(itemData || [])
    }

    setLoading(false)
  }

  useEffect(() => {
    fetchData()
  }, [])

  const activeCategories = useMemo(() => categories.filter((item) => item.is_active), [categories])

  const categoriesForDisplay = useMemo(() => {
    const active = categories.filter((category) => category.is_active)
    const inactive = categories.filter((category) => !category.is_active)
    return [...active, ...inactive]
  }, [categories])

  const itemsByCategory = useMemo(() => {
    return items.reduce((acc, item) => {
      const key = item.category_id
      if (!acc[key]) acc[key] = []
      acc[key].push(item)
      return acc
    }, {})
  }, [items])

  const resetCategoryForm = () => {
    setCategoryForm({ name: '', slug: '', description: '', icon: '', is_active: true })
  }

  const resetItemForm = () => {
    setItemForm({
      category_id: activeCategories[0]?.id || categories[0]?.id || '',
      name: '',
      slug: '',
      short_description: '',
      description: '',
      price_start: '',
      price_end: '',
      estimated_time: '',
      price_note: '',
      is_active: true
    })
    setEditingItemId(null)
  }

  const openAddCategory = () => {
    resetCategoryForm()
    setShowCategoryModal(true)
  }

  const openAddItem = () => {
    resetItemForm()
    setShowItemModal(true)
  }

  const openEditItem = (item) => {
    setEditingItemId(item.id)
    setItemForm({
      category_id: item.category_id || '',
      name: item.name || '',
      slug: item.slug || '',
      short_description: item.short_description || '',
      description: item.description || '',
      price_start: item.price_start || '',
      price_end: item.price_end || '',
      estimated_time: item.estimated_time || '',
      price_note: item.price_note || '',
      is_active: item.is_active
    })
    setShowItemModal(true)
  }

  const normalizeActiveCategoryOrder = async () => {
    const { data } = await supabase
      .from('service_categories')
      .select('id, is_active, sort_order, created_at')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })

    const active = data || []
    await Promise.all(active.map((category, index) => supabase
      .from('service_categories')
      .update({ sort_order: index + 1, updated_at: new Date().toISOString() })
      .eq('id', category.id)))
  }

  const saveCategory = async () => {
    if (!categoryForm.name.trim()) {
      alert('Nama kategori wajib diisi.')
      return
    }

    setSaving(true)

    const slug = categoryForm.slug.trim() ? createSlug(categoryForm.slug) : createSlug(categoryForm.name)
    const sortOrder = categoryForm.is_active ? activeCategories.length + 1 : 999
    const payload = {
      name: categoryForm.name.trim(),
      slug,
      description: categoryForm.description.trim() || null,
      icon: categoryForm.icon.trim() || null,
      sort_order: sortOrder,
      is_active: categoryForm.is_active,
      updated_at: new Date().toISOString()
    }

    const { error } = await supabase.from('service_categories').insert(payload)

    if (error) {
      alert('Gagal menambahkan kategori: ' + error.message)
    } else {
      await createAuditLog({
        actorId: user?.id || null,
        actorEmail: user?.email || null,
        actorRole: 'admin',
        action: 'SERVICE_CATEGORY_CREATED',
        description: `Admin menambahkan kategori layanan: ${payload.name}`,
        metadata: payload
      })
      await normalizeActiveCategoryOrder()
      alert('Kategori berhasil ditambahkan.')
      setShowCategoryModal(false)
      resetCategoryForm()
      fetchData()
    }

    setSaving(false)
  }

  const saveItem = async () => {
    if (!itemForm.category_id) {
      alert('Pilih kategori dulu.')
      return
    }
    if (!itemForm.name.trim()) {
      alert('Nama layanan wajib diisi.')
      return
    }

    setSaving(true)

    const categoryItems = items.filter((item) => item.category_id === itemForm.category_id)
    const slug = itemForm.slug.trim() ? createSlug(itemForm.slug) : createSlug(itemForm.name)
    const payload = {
      category_id: itemForm.category_id,
      name: itemForm.name.trim(),
      slug,
      short_description: itemForm.short_description.trim() || null,
      description: itemForm.description.trim() || null,
      price_start: itemForm.price_start ? Number(itemForm.price_start) : null,
      price_end: itemForm.price_end ? Number(itemForm.price_end) : null,
      estimated_time: itemForm.estimated_time.trim() || null,
      price_note: itemForm.price_note.trim() || null,
      sort_order: editingItemId ? undefined : categoryItems.length + 1,
      is_active: itemForm.is_active,
      updated_at: new Date().toISOString()
    }

    const cleanPayload = Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined))
    const result = editingItemId
      ? await supabase.from('service_items').update(cleanPayload).eq('id', editingItemId)
      : await supabase.from('service_items').insert(cleanPayload)

    if (result.error) {
      alert('Gagal menyimpan layanan: ' + result.error.message)
    } else {
      const category = categories.find((item) => item.id === itemForm.category_id)
      await createAuditLog({
        actorId: user?.id || null,
        actorEmail: user?.email || null,
        actorRole: 'admin',
        action: editingItemId ? 'SERVICE_ITEM_UPDATED' : 'SERVICE_ITEM_CREATED',
        description: editingItemId
          ? `Admin mengedit layanan: ${cleanPayload.name}`
          : `Admin menambahkan layanan: ${cleanPayload.name}`,
        metadata: { ...cleanPayload, category_name: category?.name || null }
      })
      alert(editingItemId ? 'Layanan berhasil diperbarui.' : 'Layanan berhasil ditambahkan.')
      setShowItemModal(false)
      resetItemForm()
      fetchData()
    }

    setSaving(false)
  }

  const toggleCategoryStatus = async (category) => {
    const nextStatus = !category.is_active
    const label = nextStatus ? 'mengaktifkan' : 'menonaktifkan'
    if (!window.confirm(`Yakin ingin ${label} kategori "${category.name}"?`)) return

    const { error } = await supabase
      .from('service_categories')
      .update({
        is_active: nextStatus,
        sort_order: nextStatus ? activeCategories.length + 1 : 999,
        updated_at: new Date().toISOString()
      })
      .eq('id', category.id)

    if (error) {
      alert('Gagal mengubah status kategori: ' + error.message)
      return
    }

    await createAuditLog({
      actorId: user?.id || null,
      actorEmail: user?.email || null,
      actorRole: 'admin',
      action: 'SERVICE_CATEGORY_STATUS_CHANGED',
      description: `Admin ${label} kategori layanan: ${category.name}`,
      metadata: {
        category_id: category.id,
        category_name: category.name,
        previous_status: category.is_active,
        new_status: nextStatus
      }
    })

    await normalizeActiveCategoryOrder()
    fetchData()
  }

  const deleteCategory = async (category) => {
    if (!window.confirm(`Hapus kategori "${category.name}"?\n\nJika masih punya layanan, penghapusan bisa gagal. Alternatif aman: nonaktifkan.`)) return

    const { error } = await supabase
      .from('service_categories')
      .delete()
      .eq('id', category.id)

    if (error) {
      alert('Gagal menghapus kategori. Gunakan Nonaktifkan saja.\n\nDetail: ' + error.message)
      return
    }

    await createAuditLog({
      actorId: user?.id || null,
      actorEmail: user?.email || null,
      actorRole: 'admin',
      action: 'SERVICE_CATEGORY_DELETED',
      description: `Admin menghapus kategori layanan: ${category.name}`,
      metadata: category
    })

    await normalizeActiveCategoryOrder()
    fetchData()
  }

  const toggleItemStatus = async (item) => {
    const nextStatus = !item.is_active
    const label = nextStatus ? 'mengaktifkan' : 'menonaktifkan'
    if (!window.confirm(`Yakin ingin ${label} layanan "${item.name}"?`)) return

    const { error } = await supabase
      .from('service_items')
      .update({ is_active: nextStatus, updated_at: new Date().toISOString() })
      .eq('id', item.id)

    if (error) {
      alert('Gagal mengubah status layanan: ' + error.message)
      return
    }

    await createAuditLog({
      actorId: user?.id || null,
      actorEmail: user?.email || null,
      actorRole: 'admin',
      action: 'SERVICE_ITEM_STATUS_CHANGED',
      description: `Admin ${label} layanan: ${item.name}`,
      metadata: { service_item_id: item.id, service_name: item.name, previous_status: item.is_active, new_status: nextStatus }
    })

    fetchData()
  }

  const deleteItem = async (item) => {
    if (!window.confirm(`Hapus layanan "${item.name}"?\n\nJika layanan sudah dipakai request, penghapusan bisa gagal. Alternatif aman: nonaktifkan.`)) return

    const { error } = await supabase
      .from('service_items')
      .delete()
      .eq('id', item.id)

    if (error) {
      alert('Gagal menghapus layanan. Gunakan Nonaktifkan saja.\n\nDetail: ' + error.message)
      return
    }

    await createAuditLog({
      actorId: user?.id || null,
      actorEmail: user?.email || null,
      actorRole: 'admin',
      action: 'SERVICE_ITEM_DELETED',
      description: `Admin menghapus layanan: ${item.name}`,
      metadata: item
    })

    fetchData()
  }

  const Modal = ({ title, onClose, children }) => (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl bg-white rounded-3xl shadow-xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h3 className="font-bold text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl">×</button>
        </div>
        <div className="p-6 max-h-[78vh] overflow-y-auto">{children}</div>
      </div>
    </div>
  )

  return (
    <div className="p-6">
      <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <p className="text-xs text-gray-400 mb-1">Admin / Layanan & Harga</p>
          <h2 className="text-2xl font-bold text-gray-900">Kelola Kategori & Layanan</h2>
          <p className="text-sm text-gray-500 mt-1">Tampilan klasik: kategori sebagai laci, layanan sebagai tabel.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={openAddCategory} className="bg-gray-900 text-white px-5 py-3 rounded-xl text-sm hover:bg-gray-800">Tambah Kategori</button>
          <button onClick={openAddItem} className="bg-green-600 text-white px-5 py-3 rounded-xl text-sm hover:bg-green-700">Tambah Layanan</button>
        </div>
      </div>

      {loading && <div className="bg-white rounded-2xl shadow-sm p-10 text-center text-gray-400">Memuat layanan...</div>}

      {!loading && categoriesForDisplay.length === 0 && (
        <div className="bg-white rounded-2xl shadow-sm p-10 text-center">
          <p className="text-4xl mb-3">📁</p>
          <p className="text-gray-500">Belum ada kategori layanan.</p>
        </div>
      )}

      {!loading && categoriesForDisplay.length > 0 && (
        <div className="space-y-3">
          {categoriesForDisplay.map((category) => {
            const categoryItems = itemsByCategory[category.id] || []
            const activeIndex = activeCategories.findIndex((item) => item.id === category.id) + 1
            const open = openCategoryId === category.id

            return (
              <div key={category.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div
                  onClick={() => setOpenCategoryId(open ? null : category.id)}
                  className="cursor-pointer px-5 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3 hover:bg-gray-50"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-9 h-9 rounded-xl bg-green-50 text-green-700 font-bold flex items-center justify-center">
                      {category.is_active ? activeIndex : '–'}
                    </span>
                    <div>
                      <p className="font-bold text-gray-900">{category.icon ? `${category.icon} ` : ''}{category.name}</p>
                      <p className="text-xs text-gray-400">{category.slug} · {categoryItems.length} layanan</p>
                    </div>
                    <span className={'text-[11px] px-2 py-1 rounded-full ' + (category.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500')}>
                      {category.is_active ? 'Aktif' : 'Nonaktif'}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => toggleCategoryStatus(category)} className="text-xs bg-yellow-50 text-yellow-700 px-3 py-2 rounded-xl hover:bg-yellow-100">
                      {category.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                    </button>
                    <button onClick={() => deleteCategory(category)} className="text-xs bg-red-50 text-red-600 px-3 py-2 rounded-xl hover:bg-red-100">
                      Hapus
                    </button>
                  </div>
                </div>

                {open && (
                  <div className="border-t border-gray-100 p-5">
                    {category.description && <p className="text-sm text-gray-500 mb-4">{category.description}</p>}
                    {categoryItems.length === 0 ? (
                      <div className="rounded-2xl border border-gray-100 p-6 text-center text-sm text-gray-400">Belum ada layanan di kategori ini.</div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-gray-100 text-left text-xs text-gray-400">
                              <th className="py-3 pr-4 font-medium">Layanan</th>
                              <th className="py-3 pr-4 font-medium">Harga</th>
                              <th className="py-3 pr-4 font-medium">Estimasi</th>
                              <th className="py-3 pr-4 font-medium">Status</th>
                              <th className="py-3 pr-4 font-medium text-right">Aksi</th>
                            </tr>
                          </thead>
                          <tbody>
                            {categoryItems.map((item) => (
                              <tr key={item.id} className="border-b border-gray-50 align-top">
                                <td className="py-3 pr-4">
                                  <p className="font-medium text-gray-900">{item.name}</p>
                                  <p className="text-xs text-gray-400 mt-1">{item.short_description || item.slug}</p>
                                </td>
                                <td className="py-3 pr-4 whitespace-nowrap text-gray-600">
                                  {item.price_start && item.price_end
                                    ? `${formatRupiah(item.price_start)} - ${formatRupiah(item.price_end)}`
                                    : item.price_start
                                      ? `Mulai ${formatRupiah(item.price_start)}`
                                      : '-'}
                                </td>
                                <td className="py-3 pr-4 text-gray-600 whitespace-nowrap">{item.estimated_time || '-'}</td>
                                <td className="py-3 pr-4"><span className={'text-[11px] px-2 py-1 rounded-full ' + (item.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500')}>{item.is_active ? 'Aktif' : 'Nonaktif'}</span></td>
                                <td className="py-3 pr-4">
                                  <div className="flex justify-end gap-2">
                                    <button onClick={() => openEditItem(item)} className="text-xs bg-gray-100 text-gray-700 px-3 py-2 rounded-xl hover:bg-gray-200">Edit</button>
                                    <button onClick={() => toggleItemStatus(item)} className="text-xs bg-yellow-50 text-yellow-700 px-3 py-2 rounded-xl hover:bg-yellow-100">{item.is_active ? 'Nonaktif' : 'Aktif'}</button>
                                    <button onClick={() => deleteItem(item)} className="text-xs bg-red-50 text-red-600 px-3 py-2 rounded-xl hover:bg-red-100">Hapus</button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {showCategoryModal && (
        <Modal title="Tambah Kategori" onClose={() => setShowCategoryModal(false)}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Nama Kategori</label>
              <input value={categoryForm.name} onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value, slug: createSlug(e.target.value) })} className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm" placeholder="Contoh: Penulisan" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Slug</label>
              <input value={categoryForm.slug} onChange={(e) => setCategoryForm({ ...categoryForm, slug: e.target.value })} className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm" placeholder="penulisan" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Icon / Emoji</label>
              <input value={categoryForm.icon} onChange={(e) => setCategoryForm({ ...categoryForm, icon: e.target.value })} className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm" placeholder="📄" />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm text-gray-600">
                <input type="checkbox" checked={categoryForm.is_active} onChange={(e) => setCategoryForm({ ...categoryForm, is_active: e.target.checked })} /> Aktif
              </label>
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs text-gray-500 mb-1">Deskripsi</label>
              <textarea value={categoryForm.description} onChange={(e) => setCategoryForm({ ...categoryForm, description: e.target.value })} className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm" rows={3} placeholder="Deskripsi singkat kategori" />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-6">
            <button onClick={() => setShowCategoryModal(false)} className="bg-gray-100 text-gray-700 px-5 py-3 rounded-xl text-sm hover:bg-gray-200">Batal</button>
            <button onClick={saveCategory} disabled={saving} className="bg-gray-900 text-white px-5 py-3 rounded-xl text-sm hover:bg-gray-800 disabled:opacity-50">{saving ? 'Menyimpan...' : 'Simpan Kategori'}</button>
          </div>
        </Modal>
      )}

      {showItemModal && (
        <Modal title={editingItemId ? 'Edit Layanan' : 'Tambah Layanan'} onClose={() => setShowItemModal(false)}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-xs text-gray-500 mb-1">Kategori</label>
              <select value={itemForm.category_id} onChange={(e) => setItemForm({ ...itemForm, category_id: e.target.value })} className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm">
                <option value="">Pilih kategori...</option>
                {categories.map((category) => <option key={category.id} value={category.id}>{category.name}{category.is_active ? '' : ' (Nonaktif)'}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Nama Layanan</label>
              <input value={itemForm.name} onChange={(e) => setItemForm({ ...itemForm, name: e.target.value, slug: editingItemId ? itemForm.slug : createSlug(e.target.value) })} className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm" placeholder="Contoh: Olah Data SPSS" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Slug</label>
              <input value={itemForm.slug} onChange={(e) => setItemForm({ ...itemForm, slug: e.target.value })} className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm" placeholder="olah-data-spss" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Harga Mulai</label>
              <input type="number" value={itemForm.price_start} onChange={(e) => setItemForm({ ...itemForm, price_start: e.target.value })} className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Harga Maksimal</label>
              <input type="number" value={itemForm.price_end} onChange={(e) => setItemForm({ ...itemForm, price_end: e.target.value })} className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Estimasi Waktu</label>
              <input value={itemForm.estimated_time} onChange={(e) => setItemForm({ ...itemForm, estimated_time: e.target.value })} className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm" placeholder="1–3 hari" />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm text-gray-600"><input type="checkbox" checked={itemForm.is_active} onChange={(e) => setItemForm({ ...itemForm, is_active: e.target.checked })} /> Aktif</label>
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs text-gray-500 mb-1">Deskripsi Singkat</label>
              <input value={itemForm.short_description} onChange={(e) => setItemForm({ ...itemForm, short_description: e.target.value })} className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs text-gray-500 mb-1">Keterangan Detail</label>
              <textarea value={itemForm.description} onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })} className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm" rows={3} />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs text-gray-500 mb-1">Catatan Harga</label>
              <textarea value={itemForm.price_note} onChange={(e) => setItemForm({ ...itemForm, price_note: e.target.value })} className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm" rows={2} />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-6">
            <button onClick={() => setShowItemModal(false)} className="bg-gray-100 text-gray-700 px-5 py-3 rounded-xl text-sm hover:bg-gray-200">Batal</button>
            <button onClick={saveItem} disabled={saving} className="bg-green-600 text-white px-5 py-3 rounded-xl text-sm hover:bg-green-700 disabled:opacity-50">{saving ? 'Menyimpan...' : 'Simpan Layanan'}</button>
          </div>
        </Modal>
      )}
    </div>
  )
}

export default AdminServicesPage
