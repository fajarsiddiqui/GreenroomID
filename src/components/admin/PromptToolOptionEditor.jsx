function normalizeOptionOrder(options) {
  return options.map((option, index) => ({
    ...option,
    sort_order: index,
  }))
}

function OptionFieldLabel({ children }) {
  return (
    <span className="mb-1 block text-xs font-bold text-gray-600">
      {children}
    </span>
  )
}

export default function PromptToolOptionEditor({
  options = [],
  onChange,
  disabled = false,
  allowExclusive = false,
}) {
  const updateOption = (index, key, value) => {
    const nextOptions = options.map((option, optionIndex) => (
      optionIndex === index
        ? { ...option, [key]: value }
        : option
    ))

    onChange(normalizeOptionOrder(nextOptions))
  }

  const addOption = () => {
    const existingValues = new Set(
      options.map((option) => String(option.option_value || '')),
    )
    let suffix = options.length + 1
    let optionValue = `pilihan_${suffix}`

    while (existingValues.has(optionValue)) {
      suffix += 1
      optionValue = `pilihan_${suffix}`
    }

    onChange(normalizeOptionOrder([
      ...options,
      {
        id: null,
        option_label: `Pilihan ${suffix}`,
        option_value: optionValue,
        sort_order: options.length,
        is_exclusive: false,
        group_label: '',
        group_sort_order: 0,
      },
    ]))
  }

  const removeOption = (index) => {
    onChange(normalizeOptionOrder(
      options.filter((_option, optionIndex) => optionIndex !== index),
    ))
  }

  const moveOption = (index, direction) => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1

    if (targetIndex < 0 || targetIndex >= options.length) {
      return
    }

    const nextOptions = [...options]
    const currentOption = nextOptions[index]
    nextOptions[index] = nextOptions[targetIndex]
    nextOptions[targetIndex] = currentOption
    onChange(normalizeOptionOrder(nextOptions))
  }

  return (
    <section className="space-y-4 rounded-2xl border border-gray-200 bg-gray-50 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h5 className="font-black text-gray-900">Pilihan Jawaban</h5>
          <p className="mt-1 text-xs leading-relaxed text-gray-500">
            Nilai internal dipakai untuk conditional, sedangkan label ditampilkan kepada pengguna.
          </p>
        </div>

        <button
          type="button"
          onClick={addOption}
          disabled={disabled}
          className="rounded-xl bg-gray-900 px-3 py-2 text-sm font-bold text-white disabled:opacity-50"
        >
          + Tambah Pilihan
        </button>
      </div>

      {options.length === 0 && (
        <p className="rounded-xl border border-dashed border-gray-300 bg-white p-4 text-sm text-gray-500">
          Belum ada pilihan. Tambahkan minimal dua pilihan.
        </p>
      )}

      <div className="space-y-3">
        {options.map((option, index) => (
          <article
            key={option.id || `new-option-${index}`}
            className="rounded-2xl border border-gray-200 bg-white p-4"
          >
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
              <label className="block">
                <OptionFieldLabel>Label pilihan</OptionFieldLabel>
                <input
                  value={option.option_label || ''}
                  onChange={(event) => updateOption(
                    index,
                    'option_label',
                    event.target.value,
                  )}
                  disabled={disabled}
                  className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                />
              </label>

              <label className="block">
                <OptionFieldLabel>Nilai internal</OptionFieldLabel>
                <input
                  value={option.option_value || ''}
                  onChange={(event) => updateOption(
                    index,
                    'option_value',
                    event.target.value,
                  )}
                  disabled={disabled}
                  className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                />
              </label>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]">
              <label className="block">
                <OptionFieldLabel>Nama kelompok</OptionFieldLabel>
                <input
                  value={option.group_label || ''}
                  onChange={(event) => updateOption(
                    index,
                    'group_label',
                    event.target.value,
                  )}
                  placeholder="Kosongkan bila tanpa kelompok"
                  disabled={disabled}
                  className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                />
              </label>

              <label className="block">
                <OptionFieldLabel>Urutan kelompok</OptionFieldLabel>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={option.group_sort_order ?? 0}
                  onChange={(event) => updateOption(
                    index,
                    'group_sort_order',
                    event.target.value,
                  )}
                  disabled={disabled}
                  className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                />
              </label>
            </div>

            {allowExclusive && (
              <label className="mt-3 flex items-start gap-3 rounded-xl border border-gray-200 bg-gray-50 p-3">
                <input
                  type="checkbox"
                  checked={option.is_exclusive === true}
                  onChange={(event) => updateOption(
                    index,
                    'is_exclusive',
                    event.target.checked,
                  )}
                  disabled={disabled}
                  className="mt-1 h-4 w-4 accent-green-700"
                />
                <span>
                  <span className="block text-sm font-bold text-gray-800">
                    Pilihan eksklusif
                  </span>
                  <span className="mt-1 block text-xs leading-relaxed text-gray-500">
                    Jika dipilih, pilihan lain akan dibatalkan pada form publik.
                  </span>
                </span>
              </label>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => moveOption(index, 'up')}
                disabled={disabled || index === 0}
                className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-bold disabled:opacity-40"
              >
                Naik
              </button>
              <button
                type="button"
                onClick={() => moveOption(index, 'down')}
                disabled={disabled || index === options.length - 1}
                className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-bold disabled:opacity-40"
              >
                Turun
              </button>
              <button
                type="button"
                onClick={() => removeOption(index)}
                disabled={disabled}
                className="rounded-lg border border-red-200 px-3 py-2 text-xs font-bold text-red-700 disabled:opacity-40"
              >
                Hapus
              </button>
            </div>
          </article>
        ))}
      </div>

      {options.length > 0 && options.length < 2 && (
        <p className="text-sm font-semibold text-red-700">
          Tambahkan minimal dua pilihan jawaban.
        </p>
      )}
    </section>
  )
}
