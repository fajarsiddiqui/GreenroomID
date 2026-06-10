import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { createAuditLog } from '../utils/auditLog'

function AdminServicesPage({ user }) {
  const [categories, setCategories] = useState([])
  const [items, setItems] = useState([])
  const [selectedCategory, setSelectedCategory] = useState(null)

  const [loadingCategories, setLoadingCategories] = useState(true)
  const [loadingItems, setLoadingItems] = useState(false)
  const [savingCategory, setSavingCategory] = useState(false)
  const [savingItem, setSavingItem] = useState(false)

  const [categoryForm, setCategoryForm] = useState({
    id: null,
    name: '',
    slug: '',
    description: '',
    icon: '',
    sort_order: 0,
    is_active: true
  })

  const [itemForm, setItemForm] = useState({
    id: null,
    name: '',
    slug: '',
    short_description: '',
    description: '',
    price_start: '',
    price_end: '',
    estimated_time: '',
    price_note: '',
    sort_order: 0,
    is_active: true
  })

  const createSlug = (text) => {
    return text
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
  }

  const formatRupiah = (angka) => {
    if (!angka) return '-'
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(angka)
  }

  const fetchCategories = async () => {
    setLoadingCategories(true)

    const { data, error } = await supabase
      .from('service_categories')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })

    if (error) {
      alert('Gagal mengambil kategori layanan: ' + error.message)
      setCategories([])
    } else {
      setCategories(data || [])

      if (!selectedCategory && data && data.length > 0) {
        setSelectedCategory(data[0])
        fetchItems(data[0])
      }
    }

    setLoadingCategories(false)
  }

  const fetchItems = async (category) => {
    if (!category) return

    setSelectedCategory(category)
    setLoadingItems(true)

    const { data, error } = await supabase
      .from('service_items')
      .select('*')
      .eq('category_id', category.id)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })

    if (error) {
      alert('Gagal mengambil layanan: ' + error.message)
      setItems([])
    } else {
      setItems(data || [])
    }

    setLoadingItems(false)
  }

  useEffect(() => {
    fetchCategories()
  }, [])

  const resetCategoryForm = () => {
    setCategoryForm({
      id: null,
      name: '',
      slug: '',
      description: '',
      icon: '',
      sort_order: 0,
      is_active: true
    })
  }

  const resetItemForm = () => {
    setItemForm({
      id: null,
      name: '',
      slug: '',
      short_description: '',
      description: '',
      price_start: '',
      price_end: '',
      estimated_time: '',
      price_note: '',
      sort_order: 0,
      is_active: true
    })
  }

  const editCategory = (category) => {
    setCategoryForm({
      id: category.id,
      name: category.name || '',
      slug: category.slug || '',
      description: category.description || '',
      icon: category.icon || '',
      sort_order: category.sort_order || 0,
      is_active: category.is_active
    })
  }

  const editItem = (item) => {
    setItemForm({
      id: item.id,
      name: item.name || '',
      slug: item.slug || '',
      short_description: item.short_description || '',
      description: item.description || '',
      price_start: item.price_start || '',
      price_end: item.price_end || '',
      estimated_time: item.estimated_time || '',
      price_note: item.price_note || '',
      sort_order: item.sort_order || 0,
      is_active: item.is_active
    })
  }

  const saveCategory = async () => {
    if (!categoryForm.name.trim()) {
      alert('Nama kategori wajib diisi.')
      return
    }

    setSavingCategory(true)

    const slug = categoryForm.slug.trim()
      ? createSlug(categoryForm.slug)
      : createSlug(categoryForm.name)

    const payload = {
      name: categoryForm.name.trim(),
      slug,
      description: categoryForm.description.trim() || null,
      icon: categoryForm.icon.trim() || null,
      sort_order: Number(categoryForm.sort_order) || 0,
      is_active: categoryForm.is_active,
      updated_at: new Date().toISOString()
    }

    let result

    if (categoryForm.id) {
      result = await supabase
        .from('service_categories')
        .update(payload)
        .eq('id', categoryForm.id)
    } else {
      result = await supabase
        .from('service_categories')
        .insert(payload)
    }

    if (result.error) {
      alert('Gagal menyimpan kategori: ' + result.error.message)
    } else {
    await createAuditLog({
        actorId: user?.id || null,
        actorEmail: user?.email || null,
        actorRole: 'admin',
        action: categoryForm.id ? 'SERVICE_CATEGORY_UPDATED' : 'SERVICE_CATEGORY_CREATED',
        description: categoryForm.id
        ? `Admin mengedit kategori layanan: ${payload.name}`
        : `Admin menambahkan kategori layanan: ${payload.name}`,
        metadata: payload
    })

    alert(categoryForm.id ? 'Kategori berhasil diperbarui.' : 'Kategori berhasil ditambahkan.')
    resetCategoryForm()
    fetchCategories()
    }

    setSavingCategory(false)
  }

  const saveItem = async () => {
    if (!selectedCategory) {
      alert('Pilih kategori dulu.')
      return
    }

    if (!itemForm.name.trim()) {
      alert('Nama layanan wajib diisi.')
      return
    }

    setSavingItem(true)

    const slug = itemForm.slug.trim()
      ? createSlug(itemForm.slug)
      : createSlug(itemForm.name)

    const payload = {
      category_id: selectedCategory.id,
      name: itemForm.name.trim(),
      slug,
      short_description: itemForm.short_description.trim() || null,
      description: itemForm.description.trim() || null,
      price_start: itemForm.price_start ? Number(itemForm.price_start) : null,
      price_end: itemForm.price_end ? Number(itemForm.price_end) : null,
      estimated_time: itemForm.estimated_time.trim() || null,
      price_note: itemForm.price_note.trim() || null,
      sort_order: Number(itemForm.sort_order) || 0,
      is_active: itemForm.is_active,
      updated_at: new Date().toISOString()
    }

    let result

    if (itemForm.id) {
      result = await supabase
        .from('service_items')
        .update(payload)
        .eq('id', itemForm.id)
    } else {
      result = await supabase
        .from('service_items')
        .insert(payload)
    }

    if (result.error) {
      alert('Gagal menyimpan layanan: ' + result.error.message)
    } else {
    await createAuditLog({
        actorId: user?.id || null,
        actorEmail: user?.email || null,
        actorRole: 'admin',
        action: itemForm.id ? 'SERVICE_ITEM_UPDATED' : 'SERVICE_ITEM_CREATED',
        description: itemForm.id
        ? `Admin mengedit layanan: ${payload.name}`
        : `Admin menambahkan layanan: ${payload.name}`,
        metadata: {
        ...payload,
        category_name: selectedCategory?.name || null
        }
    })

    alert(itemForm.id ? 'Layanan berhasil diperbarui.' : 'Layanan berhasil ditambahkan.')
    resetItemForm()
    fetchItems(selectedCategory)
    }

    setSavingItem(false)
  }

  const toggleCategoryStatus = async (category) => {
    const { error } = await supabase
      .from('service_categories')
      .update({
        is_active: !category.is_active,
        updated_at: new Date().toISOString()
      })
      .eq('id', category.id)

      await createAuditLog({
        actorId: user?.id || null,
        actorEmail: user?.email || null,
        actorRole: 'admin',
        action: 'SERVICE_CATEGORY_STATUS_CHANGED',
        description: `Admin ${category.is_active ? 'menonaktifkan' : 'mengaktifkan'} kategori layanan: ${category.name}`,
        metadata: {
            category_id: category.id,
            category_name: category.name,
            previous_status: category.is_active,
            new_status: !category.is_active
        }
    })

    if (error) {
      alert('Gagal mengubah status kategori: ' + error.message)
    } else {
      fetchCategories()
    }
  }

  const toggleItemStatus = async (item) => {
    const { error } = await supabase
      .from('service_items')
      .update({
        is_active: !item.is_active,
        updated_at: new Date().toISOString()
      })
      .eq('id', item.id)

      await createAuditLog({
        actorId: user?.id || null,
        actorEmail: user?.email || null,
        actorRole: 'admin',
        action: 'SERVICE_ITEM_STATUS_CHANGED',
        description: `Admin ${item.is_active ? 'menonaktifkan' : 'mengaktifkan'} layanan: ${item.name}`,
        metadata: {
            service_item_id: item.id,
            service_name: item.name,
            previous_status: item.is_active,
            new_status: !item.is_active,
            category_name: selectedCategory?.name || null
        }
        })

    if (error) {
      alert('Gagal mengubah status layanan: ' + error.message)
    } else {
      fetchItems(selectedCategory)
    }
  }

  const deleteCategory = async (category) => {
    const confirmDelete = confirm(
      `Hapus kategori "${category.name}"?\n\nCatatan: kategori yang masih punya layanan mungkin tidak bisa dihapus. Lebih aman gunakan Nonaktifkan.`
    )

    if (!confirmDelete) return

    const { error } = await supabase
      .from('service_categories')
      .delete()
      .eq('id', category.id)

        await createAuditLog({
        actorId: user?.id || null,
        actorEmail: user?.email || null,
        actorRole: 'admin',
        action: 'SERVICE_CATEGORY_DELETED',
        description: `Admin menghapus kategori layanan: ${category.name}`,
        metadata: category
        })

    if (error) {
      alert('Gagal menghapus kategori. Gunakan Nonaktifkan saja.\n\nDetail: ' + error.message)
    } else {
      alert('Kategori berhasil dihapus.')
      setSelectedCategory(null)
      setItems([])
      fetchCategories()
    }
  }

  const deleteItem = async (item) => {
    const confirmDelete = confirm(
      `Hapus layanan "${item.name}"?\n\nKalau layanan sudah pernah dipakai request, penghapusan bisa gagal. Lebih aman gunakan Nonaktifkan.`
    )

    if (!confirmDelete) return

    const { error } = await supabase
      .from('service_items')
      .delete()
      .eq('id', item.id)

      await createAuditLog({
        actorId: user?.id || null,
        actorEmail: user?.email || null,
        actorRole: 'admin',
        action: 'SERVICE_ITEM_DELETED',
        description: `Admin menghapus layanan: ${item.name}`,
        metadata: item
        })

    if (error) {
      alert('Gagal menghapus layanan. Gunakan Nonaktifkan saja.\n\nDetail: ' + error.message)
    } else {
      alert('Layanan berhasil dihapus.')
      fetchItems(selectedCategory)
    }
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <p className="inline-block bg-blue-50 text-blue-600 text-xs font-medium px-3 py-1 rounded-full mb-3">
          Layanan & Harga
        </p>

        <h2 className="text-2xl font-bold text-gray-900">
          Kelola Layanan & Harga
        </h2>

        <p className="text-sm text-gray-500 mt-2">
          Admin bisa menambah kategori, mengatur paket layanan, mengubah estimasi harga,
          mengubah estimasi waktu, serta mengaktifkan atau menonaktifkan layanan.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="space-y-6">
          <div className="bg-white rounded-2xl shadow-sm p-6">
            <h3 className="font-bold text-gray-800 mb-4">
              {categoryForm.id ? 'Edit Kategori' : 'Tambah Kategori'}
            </h3>

            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Nama Kategori</label>
                <input
                  type="text"
                  value={categoryForm.name}
                  onChange={(e) => setCategoryForm({
                    ...categoryForm,
                    name: e.target.value,
                    slug: categoryForm.id ? categoryForm.slug : createSlug(e.target.value)
                  })}
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm"
                  placeholder="Contoh: Penulisan"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">Slug</label>
                <input
                  type="text"
                  value={categoryForm.slug}
                  onChange={(e) => setCategoryForm({ ...categoryForm, slug: e.target.value })}
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm"
                  placeholder="contoh: penulisan"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">Icon / Emoji</label>
                <input
                  type="text"
                  value={categoryForm.icon}
                  onChange={(e) => setCategoryForm({ ...categoryForm, icon: e.target.value })}
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm"
                  placeholder="Contoh: ✍️"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">Deskripsi</label>
                <textarea
                  value={categoryForm.description}
                  onChange={(e) => setCategoryForm({ ...categoryForm, description: e.target.value })}
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm"
                  rows={3}
                  placeholder="Deskripsi singkat kategori"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">Urutan Tampil</label>
                <input
                  type="number"
                  value={categoryForm.sort_order}
                  onChange={(e) => setCategoryForm({ ...categoryForm, sort_order: e.target.value })}
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm"
                />
              </div>

              <label className="flex items-center gap-2 text-sm text-gray-600">
                <input
                  type="checkbox"
                  checked={categoryForm.is_active}
                  onChange={(e) => setCategoryForm({ ...categoryForm, is_active: e.target.checked })}
                />
                Aktif
              </label>

              <div className="flex gap-2">
                <button
                  onClick={saveCategory}
                  disabled={savingCategory}
                  className="flex-1 bg-gray-900 text-white px-4 py-3 rounded-xl text-sm hover:bg-gray-800 disabled:opacity-50"
                >
                  {savingCategory ? 'Menyimpan...' : 'Simpan'}
                </button>

                {categoryForm.id && (
                  <button
                    onClick={resetCategoryForm}
                    className="bg-gray-100 text-gray-700 px-4 py-3 rounded-xl text-sm hover:bg-gray-200"
                  >
                    Batal
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm p-6">
            <h3 className="font-bold text-gray-800 mb-4">Daftar Kategori</h3>

            {loadingCategories && (
              <p className="text-sm text-gray-400">Memuat kategori...</p>
            )}

            {!loadingCategories && categories.length === 0 && (
              <p className="text-sm text-gray-400">Belum ada kategori.</p>
            )}

            <div className="space-y-3">
              {categories.map((category) => (
                <div
                  key={category.id}
                  className={
                    'border rounded-2xl p-4 cursor-pointer transition ' +
                    (selectedCategory?.id === category.id
                      ? 'border-blue-300 bg-blue-50'
                      : 'border-gray-200 bg-white hover:bg-gray-50')
                  }
                  onClick={() => fetchItems(category)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-bold text-gray-800">
                        {category.icon ? `${category.icon} ` : ''}{category.name}
                      </p>
                      <p className="text-xs text-gray-400">{category.slug}</p>
                    </div>

                    <span
                      className={
                        'text-[11px] px-2 py-1 rounded-full ' +
                        (category.is_active
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-500')
                      }
                    >
                      {category.is_active ? 'Aktif' : 'Nonaktif'}
                    </span>
                  </div>

                  <p className="text-xs text-gray-500 mt-2 line-clamp-2">
                    {category.description || '-'}
                  </p>

                  <div className="flex flex-wrap gap-2 mt-3">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        editCategory(category)
                      }}
                      className="text-xs bg-gray-100 text-gray-700 px-3 py-2 rounded-xl hover:bg-gray-200"
                    >
                      Edit
                    </button>

                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        toggleCategoryStatus(category)
                      }}
                      className="text-xs bg-yellow-50 text-yellow-700 px-3 py-2 rounded-xl hover:bg-yellow-100"
                    >
                      {category.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                    </button>

                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        deleteCategory(category)
                      }}
                      className="text-xs bg-red-50 text-red-600 px-3 py-2 rounded-xl hover:bg-red-100"
                    >
                      Hapus
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="xl:col-span-2 space-y-6">
          <div className="bg-white rounded-2xl shadow-sm p-6">
            <h3 className="font-bold text-gray-800 mb-4">
              {itemForm.id ? 'Edit Paket Layanan' : 'Tambah Paket Layanan'}
            </h3>

            {!selectedCategory && (
              <p className="text-sm text-gray-400">
                Pilih kategori terlebih dahulu untuk menambah paket layanan.
              </p>
            )}

            {selectedCategory && (
              <>
                <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 mb-4">
                  <p className="text-xs text-blue-500 mb-1">Kategori dipilih</p>
                  <p className="font-bold text-blue-900">{selectedCategory.name}</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Nama Layanan</label>
                    <input
                      type="text"
                      value={itemForm.name}
                      onChange={(e) => setItemForm({
                        ...itemForm,
                        name: e.target.value,
                        slug: itemForm.id ? itemForm.slug : createSlug(e.target.value)
                      })}
                      className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm"
                      placeholder="Contoh: Penyusunan Artikel dari Skripsi"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Slug</label>
                    <input
                      type="text"
                      value={itemForm.slug}
                      onChange={(e) => setItemForm({ ...itemForm, slug: e.target.value })}
                      className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm"
                      placeholder="penyusunan-artikel-dari-skripsi"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Harga Mulai</label>
                    <input
                      type="number"
                      value={itemForm.price_start}
                      onChange={(e) => setItemForm({ ...itemForm, price_start: e.target.value })}
                      className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm"
                      placeholder="100000"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Harga Maksimal</label>
                    <input
                      type="number"
                      value={itemForm.price_end}
                      onChange={(e) => setItemForm({ ...itemForm, price_end: e.target.value })}
                      className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm"
                      placeholder="300000"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Estimasi Waktu</label>
                    <input
                      type="text"
                      value={itemForm.estimated_time}
                      onChange={(e) => setItemForm({ ...itemForm, estimated_time: e.target.value })}
                      className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm"
                      placeholder="1–3 hari"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Urutan Tampil</label>
                    <input
                      type="number"
                      value={itemForm.sort_order}
                      onChange={(e) => setItemForm({ ...itemForm, sort_order: e.target.value })}
                      className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-xs text-gray-500 mb-1">Deskripsi Singkat</label>
                    <input
                      type="text"
                      value={itemForm.short_description}
                      onChange={(e) => setItemForm({ ...itemForm, short_description: e.target.value })}
                      className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm"
                      placeholder="Menyusun artikel dari skripsi yang sudah final."
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-xs text-gray-500 mb-1">Keterangan Detail</label>
                    <textarea
                      value={itemForm.description}
                      onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })}
                      className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm"
                      rows={3}
                      placeholder="Keterangan lengkap layanan"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-xs text-gray-500 mb-1">Catatan Harga</label>
                    <textarea
                      value={itemForm.price_note}
                      onChange={(e) => setItemForm({ ...itemForm, price_note: e.target.value })}
                      className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm"
                      rows={2}
                      placeholder="Harga bisa berubah tergantung jumlah halaman dan tingkat kerumitan."
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="flex items-center gap-2 text-sm text-gray-600">
                      <input
                        type="checkbox"
                        checked={itemForm.is_active}
                        onChange={(e) => setItemForm({ ...itemForm, is_active: e.target.checked })}
                      />
                      Aktif
                    </label>
                  </div>
                </div>

                <div className="flex gap-2 mt-4">
                  <button
                    onClick={saveItem}
                    disabled={savingItem}
                    className="bg-gray-900 text-white px-5 py-3 rounded-xl text-sm hover:bg-gray-800 disabled:opacity-50"
                  >
                    {savingItem ? 'Menyimpan...' : 'Simpan Layanan'}
                  </button>

                  {itemForm.id && (
                    <button
                      onClick={resetItemForm}
                      className="bg-gray-100 text-gray-700 px-5 py-3 rounded-xl text-sm hover:bg-gray-200"
                    >
                      Batal Edit
                    </button>
                  )}
                </div>
              </>
            )}
          </div>

          <div className="bg-white rounded-2xl shadow-sm p-6">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <h3 className="font-bold text-gray-800">Daftar Paket Layanan</h3>
                <p className="text-xs text-gray-400 mt-1">
                  {selectedCategory
                    ? `Kategori: ${selectedCategory.name}`
                    : 'Pilih kategori terlebih dahulu'}
                </p>
              </div>

              {selectedCategory && (
                <button
                  onClick={() => fetchItems(selectedCategory)}
                  className="bg-gray-100 text-gray-700 px-4 py-2 rounded-xl text-sm hover:bg-gray-200"
                >
                  Refresh
                </button>
              )}
            </div>

            {loadingItems && (
              <p className="text-sm text-gray-400">Memuat layanan...</p>
            )}

            {!loadingItems && selectedCategory && items.length === 0 && (
              <div className="border border-gray-200 rounded-2xl p-8 text-center">
                <p className="text-gray-400">Belum ada layanan di kategori ini.</p>
              </div>
            )}

            {!loadingItems && items.length > 0 && (
              <div className="space-y-4">
                {items.map((item) => (
                  <div key={item.id} className="border border-gray-200 rounded-2xl p-5">
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <div>
                        <h4 className="font-bold text-gray-900">{item.name}</h4>
                        <p className="text-xs text-gray-400">{item.slug}</p>
                      </div>

                      <span
                        className={
                          'text-[11px] px-2 py-1 rounded-full ' +
                          (item.is_active
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-500')
                        }
                      >
                        {item.is_active ? 'Aktif' : 'Nonaktif'}
                      </span>
                    </div>

                    <p className="text-sm text-gray-600 mb-3">
                      {item.short_description || '-'}
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm mb-3">
                      <div className="bg-gray-50 rounded-xl p-3">
                        <p className="text-xs text-gray-400 mb-1">Harga</p>
                        <p className="font-medium text-gray-800">
                          {item.price_start && item.price_end
                            ? `${formatRupiah(item.price_start)} - ${formatRupiah(item.price_end)}`
                            : item.price_start
                              ? `Mulai ${formatRupiah(item.price_start)}`
                              : '-'}
                        </p>
                      </div>

                      <div className="bg-gray-50 rounded-xl p-3">
                        <p className="text-xs text-gray-400 mb-1">Estimasi</p>
                        <p className="font-medium text-gray-800">
                          {item.estimated_time || '-'}
                        </p>
                      </div>

                      <div className="bg-gray-50 rounded-xl p-3">
                        <p className="text-xs text-gray-400 mb-1">Urutan</p>
                        <p className="font-medium text-gray-800">
                          {item.sort_order || 0}
                        </p>
                      </div>
                    </div>

                    {item.price_note && (
                      <p className="text-xs text-yellow-700 bg-yellow-50 border border-yellow-100 rounded-xl p-3 mb-3">
                        {item.price_note}
                      </p>
                    )}

                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => editItem(item)}
                        className="text-xs bg-gray-100 text-gray-700 px-3 py-2 rounded-xl hover:bg-gray-200"
                      >
                        Edit
                      </button>

                      <button
                        onClick={() => toggleItemStatus(item)}
                        className="text-xs bg-yellow-50 text-yellow-700 px-3 py-2 rounded-xl hover:bg-yellow-100"
                      >
                        {item.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                      </button>

                      <button
                        onClick={() => deleteItem(item)}
                        className="text-xs bg-red-50 text-red-600 px-3 py-2 rounded-xl hover:bg-red-100"
                      >
                        Hapus
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!selectedCategory && (
              <div className="border border-gray-200 rounded-2xl p-8 text-center">
                <p className="text-gray-400">Pilih kategori di sebelah kiri.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default AdminServicesPage