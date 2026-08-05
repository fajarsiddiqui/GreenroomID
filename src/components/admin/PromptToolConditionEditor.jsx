const OPERATOR_OPTIONS = [
  { value: 'equals', label: 'Sama dengan' },
  { value: 'not_equals', label: 'Tidak sama dengan' },
  { value: 'contains', label: 'Mengandung' },
  { value: 'not_empty', label: 'Sudah diisi' },
]

const CHOICE_TYPES = new Set([
  'single_choice',
  'dropdown',
  'checkbox',
  'ranking',
])

function normalizeConditionOrder(conditions) {
  return conditions.map((condition, index) => ({
    ...condition,
    sort_order: index,
  }))
}

function getParentLabel(question, sectionsById) {
  const sectionLabel = question.section_id
    ? sectionsById.get(question.section_id)?.title || 'Bagian'
    : 'Tanpa Bagian'

  return `${sectionLabel} — ${question.label || 'Tanpa label'}`
}

export default function PromptToolConditionEditor({
  conditionalMode = 'all',
  conditions = [],
  parentCandidates = [],
  sections = [],
  onModeChange,
  onChange,
  disabled = false,
}) {
  const sectionsById = new Map(
    sections
      .filter((section) => section.id)
      .map((section) => [section.id, section]),
  )
  const parentById = new Map(
    parentCandidates.map((question) => [question.id, question]),
  )

  const updateCondition = (index, key, value) => {
    const nextConditions = conditions.map((condition, conditionIndex) => {
      if (conditionIndex !== index) {
        return condition
      }

      if (key === 'operator') {
        return {
          ...condition,
          operator: value,
          comparison_value: value === 'not_empty'
            ? null
            : condition.comparison_value,
        }
      }

      return {
        ...condition,
        [key]: value,
      }
    })

    onChange(normalizeConditionOrder(nextConditions))
  }

  const addCondition = () => {
    onChange(normalizeConditionOrder([
      ...conditions,
      {
        id: null,
        parent_question_id: parentCandidates[0]?.id || '',
        operator: 'equals',
        comparison_value: '',
        sort_order: conditions.length,
      },
    ]))
  }

  const removeCondition = (index) => {
    onChange(normalizeConditionOrder(
      conditions.filter((_condition, conditionIndex) => (
        conditionIndex !== index
      )),
    ))
  }

  const moveCondition = (index, direction) => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1

    if (targetIndex < 0 || targetIndex >= conditions.length) {
      return
    }

    const nextConditions = [...conditions]
    const currentCondition = nextConditions[index]
    nextConditions[index] = nextConditions[targetIndex]
    nextConditions[targetIndex] = currentCondition
    onChange(normalizeConditionOrder(nextConditions))
  }

  const renderComparisonInput = (condition, index) => {
    if (condition.operator === 'not_empty') {
      return (
        <p className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500">
          Operator ini tidak membutuhkan nilai pembanding.
        </p>
      )
    }

    const parentQuestion = parentById.get(
      condition.parent_question_id,
    )

    if (
      parentQuestion
      && CHOICE_TYPES.has(parentQuestion.question_type)
    ) {
      return (
        <select
          value={condition.comparison_value || ''}
          onChange={(event) => updateCondition(
            index,
            'comparison_value',
            event.target.value,
          )}
          disabled={disabled}
          className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">Pilih nilai...</option>
          {(parentQuestion.options || []).map((option) => (
            <option key={option.id || option.option_value} value={option.option_value}>
              {option.option_label}
            </option>
          ))}
        </select>
      )
    }

    return (
      <input
        value={condition.comparison_value || ''}
        onChange={(event) => updateCondition(
          index,
          'comparison_value',
          event.target.value,
        )}
        disabled={disabled}
        className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
        placeholder="Masukkan nilai pembanding"
      />
    )
  }

  return (
    <section className="space-y-4 rounded-2xl border border-gray-200 bg-gray-50 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h5 className="font-black text-gray-900">
            Aturan Tampilan Pertanyaan
          </h5>
          <p className="mt-1 text-xs leading-relaxed text-gray-500">
            Hanya pertanyaan yang muncul sebelumnya dapat dipakai sebagai induk.
          </p>
        </div>

        <button
          type="button"
          onClick={addCondition}
          disabled={disabled || parentCandidates.length === 0}
          className="rounded-xl bg-gray-900 px-3 py-2 text-sm font-bold text-white disabled:opacity-50"
        >
          + Tambah Kondisi
        </button>
      </div>

      {conditions.length > 0 && (
        <label className="block">
          <span className="mb-1 block text-sm font-bold text-gray-700">
            Mode kondisi
          </span>
          <select
            value={conditionalMode || 'all'}
            onChange={(event) => onModeChange(event.target.value)}
            disabled={disabled}
            className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="all">Semua kondisi harus terpenuhi</option>
            <option value="any">Minimal satu kondisi terpenuhi</option>
          </select>
        </label>
      )}

      {conditions.length === 0 && (
        <p className="rounded-xl border border-dashed border-gray-300 bg-white p-4 text-sm text-gray-500">
          Tanpa kondisi. Pertanyaan selalu ditampilkan.
        </p>
      )}

      <div className="space-y-3">
        {conditions.map((condition, index) => {
          const parentIsValid = parentById.has(
            condition.parent_question_id,
          )

          return (
            <article
              key={condition.id || `new-condition-${index}`}
              className="rounded-2xl border border-gray-200 bg-white p-4"
            >
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-xs font-bold text-gray-600">
                    Pertanyaan induk
                  </span>
                  <select
                    value={condition.parent_question_id || ''}
                    onChange={(event) => updateCondition(
                      index,
                      'parent_question_id',
                      event.target.value,
                    )}
                    disabled={disabled}
                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                  >
                    <option value="">Pilih pertanyaan...</option>
                    {parentCandidates.map((question) => (
                      <option key={question.id} value={question.id}>
                        {getParentLabel(question, sectionsById)}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs font-bold text-gray-600">
                    Operator
                  </span>
                  <select
                    value={condition.operator || ''}
                    onChange={(event) => updateCondition(
                      index,
                      'operator',
                      event.target.value,
                    )}
                    disabled={disabled}
                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                  >
                    <option value="">Pilih operator...</option>
                    {OPERATOR_OPTIONS.map((operator) => (
                      <option key={operator.value} value={operator.value}>
                        {operator.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="mt-3">
                <span className="mb-1 block text-xs font-bold text-gray-600">
                  Nilai pembanding
                </span>
                {renderComparisonInput(condition, index)}
              </div>

              {!parentIsValid && condition.parent_question_id && (
                <p className="mt-2 text-sm font-semibold text-amber-700">
                  Pertanyaan induk tidak lagi muncul sebelum pertanyaan ini. Pilih induk lain sebelum menyimpan.
                </p>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => moveCondition(index, 'up')}
                  disabled={disabled || index === 0}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-bold disabled:opacity-40"
                >
                  Naik
                </button>
                <button
                  type="button"
                  onClick={() => moveCondition(index, 'down')}
                  disabled={disabled || index === conditions.length - 1}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-bold disabled:opacity-40"
                >
                  Turun
                </button>
                <button
                  type="button"
                  onClick={() => removeCondition(index)}
                  disabled={disabled}
                  aria-label={`Hapus kondisi ${index + 1}`}
                  className="rounded-lg border border-red-200 px-3 py-2 text-xs font-bold text-red-700 disabled:opacity-40"
                >
                  Hapus Kondisi
                </button>
              </div>
            </article>
          )
        })}
      </div>

      {parentCandidates.length === 0 && (
        <p className="text-xs leading-relaxed text-gray-500">
          Belum ada pertanyaan sebelumnya yang dapat dijadikan induk.
        </p>
      )}
    </section>
  )
}
