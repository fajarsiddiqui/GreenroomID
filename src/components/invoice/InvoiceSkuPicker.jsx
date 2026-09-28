import { useMemo, useState } from 'react'
import { formatInvoiceRupiah } from '../../utils/invoice'

function InvoiceSkuPicker({ catalogItems, disabled, onAddCatalogItem, onAddCustomItem }) {
  const [selectedSku, setSelectedSku] = useState('')
  const selectedItem = useMemo(() => catalogItems.find((item) => item.sku === selectedSku), [catalogItems, selectedSku])

  const addSelected = () => {
    if (!selectedItem) return
    onAddCatalogItem(selectedItem)
    setSelectedSku('')
  }

  return (
    <section className="gr-invoice-sku-picker">
      <div>
        <label htmlFor="gr-invoice-sku-search">Tambah dari katalog</label>
        <input
          id="gr-invoice-sku-search"
          list="gr-invoice-sku-options"
          value={selectedSku}
          disabled={disabled}
          onChange={(event) => setSelectedSku(event.target.value)}
          placeholder="Cari SKU atau pilih pekerjaan..."
        />
        <datalist id="gr-invoice-sku-options">
          {catalogItems.map((item) => <option key={item.id} value={item.sku}>{item.name} · {formatInvoiceRupiah(item.base_price)}</option>)}
        </datalist>
      </div>
      <button type="button" className="gr-invoice-button-secondary" disabled={disabled || !selectedItem} onClick={addSelected}>Tambah SKU</button>
      <button type="button" className="gr-invoice-button-plain" disabled={disabled} onClick={onAddCustomItem}>+ Item manual</button>
    </section>
  )
}

export default InvoiceSkuPicker
