function Pagination({ page, pageSize, totalItems, onPageChange, onPageSizeChange }) {
  const totalPages = Math.max(1, Math.ceil((totalItems || 0) / pageSize))
  const safePage = Math.min(Math.max(page, 1), totalPages)
  const pages = []

  for (let i = 1; i <= totalPages; i += 1) {
    if (i === 1 || i === totalPages || Math.abs(i - safePage) <= 1) {
      pages.push(i)
    } else if (pages[pages.length - 1] !== '...') {
      pages.push('...')
    }
  }

  if (!totalItems) return null

  return (
    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mt-5 text-sm">
      <div className="flex items-center gap-2 text-gray-500">
        <span>Tampilkan</span>
        <select
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          className="border border-gray-200 rounded-xl px-3 py-2 bg-white text-gray-700"
        >
          {[10, 25, 50].map((size) => (
            <option key={size} value={size}>{size}</option>
          ))}
        </select>
        <span>row</span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => onPageChange(Math.max(1, safePage - 1))}
          disabled={safePage === 1}
          className="px-3 py-2 rounded-xl border border-gray-200 disabled:opacity-40 bg-white hover:bg-gray-50"
        >
          Sebelumnya
        </button>

        {pages.map((item, index) => item === '...' ? (
          <span key={`dots-${index}`} className="px-2 text-gray-400">...</span>
        ) : (
          <button
            key={item}
            onClick={() => onPageChange(item)}
            className={
              'min-w-10 px-3 py-2 rounded-xl border text-sm ' +
              (item === safePage
                ? 'bg-gray-900 text-white border-gray-900'
                : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50')
            }
          >
            {item}
          </button>
        ))}

        <button
          onClick={() => onPageChange(Math.min(totalPages, safePage + 1))}
          disabled={safePage === totalPages}
          className="px-3 py-2 rounded-xl border border-gray-200 disabled:opacity-40 bg-white hover:bg-gray-50"
        >
          Berikutnya
        </button>
      </div>
    </div>
  )
}

export default Pagination
