import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../supabase'
import {
  getOrderedPromptToolQuestions,
  PROMPT_CHOICE_QUESTION_TYPES,
  PROMPT_QUESTION_TYPE_LABELS,
  PROMPT_STRUCTURED_PASS_QUESTION_TYPES,
  PROMPT_STRUCTURED_SCOPE_LABELS,
  PROMPT_VARIABLE_PATTERN,
  syncPromptToolQuestionConditions,
} from '../../utils/promptTools'
import PromptToolConditionEditor from './PromptToolConditionEditor'
import PromptToolOptionEditor from './PromptToolOptionEditor'

const QUESTION_TYPES = [
  'short_text',
  'paragraph',
  'number',
  'email',
  'phone',
  'date',
  'single_choice',
  'dropdown',
  'checkbox',
  'ranking',
]

const SELECTION_LIMIT_TYPES = new Set(['checkbox', 'ranking'])
const CONDITION_OPERATORS = new Set([
  'equals',
  'not_equals',
  'contains',
  'not_empty',
])

const createQuestionState = (source = {}) => ({
  id: source.id || null,
  label: source.label || '',
  variable_name: source.variable_name || '',
  question_type: source.question_type || 'short_text',
  section_id: source.section_id ?? null,
  help_text: source.help_text || '',
  placeholder: source.placeholder || '',
  is_required: source.is_required === true,
  validation_min: source.validation_min ?? null,
  validation_max: source.validation_max ?? null,
  min_selections: source.min_selections ?? null,
  max_selections: source.max_selections ?? null,
  conditional_mode: source.conditional_mode || 'all',
  structured_scope: source.structured_scope || 'form_data',
  structured_path: source.structured_path || '',
  structured_pass_value: source.structured_pass_value || '',
  options: (source.options || []).map((option, index) => ({
    ...option,
    sort_order: index,
    is_exclusive: option.is_exclusive === true,
    group_label: option.group_label || '',
    group_sort_order: option.group_sort_order ?? 0,
  })),
  conditions: (source.conditions || []).map((condition, index) => ({
    ...condition,
    sort_order: index,
    comparison_value: condition.operator === 'not_empty'
      ? null
      : condition.comparison_value,
  })),
})

const variableFromLabel = (label) => String(label || '')
  .toLowerCase()
  .trim()
  .replace(/[^a-z0-9]+/g, '_')
  .replace(/_+/g, '_')
  .replace(/^_|_$/g, '')

const getNullableInteger = (value) => {
  if (value === null || value === undefined || value === '') {
    return null
  }

  const numericValue = Number(value)
  return Number.isInteger(numericValue) ? numericValue : Number.NaN
}

const STRUCTURED_PATH_PATTERN = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/

const getQuestionSaveErrorMessage = (error) => {
  const message = String(error?.message || '')

  if (/unique_structured_path|structured_path/i.test(message)) {
    return 'JSON path sudah digunakan oleh pertanyaan lain.'
  }

  if (/one_consent|scope persetujuan|consent/i.test(message)) {
    return 'Satu tool hanya boleh memiliki satu pertanyaan dengan scope Persetujuan.'
  }

  if (/nilai kelulusan|acknowledgement|output terstruktur/i.test(message)) {
    return 'Konfigurasi output terstruktur pertanyaan belum valid.'
  }

  return 'Pertanyaan belum dapat disimpan.'
}

const getOptionSaveErrorMessage = (error, action) => {
  const message = String(error?.message || '')

  if (/nilai kelulusan|structured_pass_value|output terstruktur/i.test(message)) {
    return action === 'delete'
      ? 'Pilihan yang dipakai sebagai nilai kelulusan tidak dapat dihapus. Pilih nilai kelulusan lain terlebih dahulu.'
      : 'Nilai internal pilihan yang dipakai sebagai nilai kelulusan tidak dapat diubah. Pilih nilai kelulusan lain terlebih dahulu.'
  }

  return ''
}

async function syncQuestionOptions(questionId, questionType, options) {
  const { data: existingRows, error: existingError } = await supabase
    .from('prompt_tool_options')
    .select('id')
    .eq('question_id', questionId)

  if (existingError) {
    return {
      success: false,
      error: 'Pilihan jawaban belum dapat diperiksa.',
    }
  }

  const existingIds = new Set(
    (existingRows || []).map((option) => option.id),
  )

  if (!PROMPT_CHOICE_QUESTION_TYPES.includes(questionType)) {
    if (existingIds.size > 0) {
      const { error } = await supabase
        .from('prompt_tool_options')
        .delete()
        .eq('question_id', questionId)

      if (error) {
        return {
          success: false,
          error: (
            getOptionSaveErrorMessage(error, 'delete')
            || 'Pilihan lama belum dapat dibersihkan.'
          ),
        }
      }
    }

    return { success: true, error: '' }
  }

  const retainedIds = new Set()

  for (let index = 0; index < options.length; index += 1) {
    const option = options[index]
    const payload = {
      option_label: String(option.option_label || '').trim(),
      option_value: String(option.option_value || '').trim(),
      sort_order: index,
      is_exclusive: option.is_exclusive === true,
      group_label: String(option.group_label || '').trim(),
      group_sort_order: Number(option.group_sort_order || 0),
    }

    if (option.id) {
      if (!existingIds.has(option.id)) {
        return {
          success: false,
          error: 'Data pilihan sudah berubah. Muat ulang editor dan coba lagi.',
        }
      }

      const { error } = await supabase
        .from('prompt_tool_options')
        .update(payload)
        .eq('id', option.id)
        .eq('question_id', questionId)

      if (error) {
        return {
          success: false,
          error: (
            getOptionSaveErrorMessage(error, 'update')
            || 'Sebagian pilihan mungkin sudah berubah. Muat ulang editor.'
          ),
        }
      }

      retainedIds.add(option.id)
      continue
    }

    const { error } = await supabase
      .from('prompt_tool_options')
      .insert({
        ...payload,
        question_id: questionId,
      })

    if (error) {
      return {
        success: false,
        error: 'Pilihan baru belum dapat disimpan seluruhnya.',
      }
    }
  }

  const staleIds = (existingRows || [])
    .filter((option) => !retainedIds.has(option.id))
    .map((option) => option.id)

  if (staleIds.length > 0) {
    const { error } = await supabase
      .from('prompt_tool_options')
      .delete()
      .in('id', staleIds)
      .eq('question_id', questionId)

    if (error) {
      return {
        success: false,
        error: (
          getOptionSaveErrorMessage(error, 'delete')
          || 'Pilihan lama belum dapat dihapus seluruhnya.'
        ),
      }
    }
  }

  return { success: true, error: '' }
}

export default function PromptToolQuestionEditor({
  initialQuestion,
  toolId,
  sections = [],
  questions = [],
  structuredOutputEnabled = false,
  onDone,
  onMutation,
  readOnly,
}) {
  const [question, setQuestion] = useState(() => (
    createQuestionState(initialQuestion)
  ))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [manualVariable, setManualVariable] = useState(
    Boolean(initialQuestion?.variable_name),
  )

  useEffect(() => {
    setQuestion(createQuestionState(initialQuestion))
    setManualVariable(Boolean(initialQuestion?.variable_name))
  }, [initialQuestion])

  const realSections = useMemo(
    () => sections.filter((section) => section.id),
    [sections],
  )

  const orderedQuestions = useMemo(() => {
    const questionsWithDraftPosition = questions.map((item) => (
      item.id === question.id
        ? { ...item, section_id: question.section_id }
        : item
    ))

    return getOrderedPromptToolQuestions(
      realSections,
      questionsWithDraftPosition,
    )
  }, [question.id, question.section_id, questions, realSections])

  const parentCandidates = useMemo(() => {
    if (question.id) {
      const currentIndex = orderedQuestions.findIndex((item) => (
        item.id === question.id
      ))

      return currentIndex < 0
        ? []
        : orderedQuestions.slice(0, currentIndex)
    }

    if (!question.section_id) {
      return orderedQuestions
    }

    const sectionIndexById = new Map(
      realSections.map((section, index) => [section.id, index]),
    )
    const targetSectionIndex = sectionIndexById.get(question.section_id)

    if (targetSectionIndex === undefined) {
      return orderedQuestions
    }

    return orderedQuestions.filter((candidate) => {
      if (candidate.section_id === question.section_id) {
        return true
      }

      const candidateSectionIndex = sectionIndexById.get(
        candidate.section_id,
      )

      return candidateSectionIndex !== undefined
        && candidateSectionIndex < targetSectionIndex
    })
  }, [orderedQuestions, question.id, question.section_id, realSections])

  const validateQuestion = () => {
    const label = String(question.label || '').trim()
    const variableName = String(question.variable_name || '').trim()

    if (!label) {
      return 'Label wajib diisi.'
    }

    if (!PROMPT_VARIABLE_PATTERN.test(variableName)) {
      return 'Variable name wajib dan mengikuti pola huruf kecil, angka, serta underscore.'
    }

    if (PROMPT_CHOICE_QUESTION_TYPES.includes(question.question_type)) {
      if (question.options.length < 2) {
        return `Pertanyaan "${label}" memerlukan minimal dua pilihan.`
      }

      const optionValues = []

      for (let index = 0; index < question.options.length; index += 1) {
        const option = question.options[index]
        const optionLabel = String(option.option_label || '').trim()
        const optionValue = String(option.option_value || '').trim()
        const groupSortOrder = Number(option.group_sort_order || 0)

        if (!optionLabel || !optionValue) {
          return `Label dan nilai internal pilihan ke-${index + 1} wajib diisi.`
        }

        if (!Number.isInteger(groupSortOrder) || groupSortOrder < 0) {
          return `Urutan kelompok pada pilihan "${optionLabel}" harus berupa bilangan bulat minimal 0.`
        }

        if (optionValues.includes(optionValue)) {
          return `Nilai internal "${optionValue}" digunakan lebih dari sekali.`
        }

        optionValues.push(optionValue)
      }
    }

    if (SELECTION_LIMIT_TYPES.has(question.question_type)) {
      const minSelections = getNullableInteger(question.min_selections)
      const maxSelections = getNullableInteger(question.max_selections)

      if (Number.isNaN(minSelections) || Number.isNaN(maxSelections)) {
        return 'Minimum dan maksimum pilihan harus berupa bilangan bulat.'
      }

      if (minSelections !== null && minSelections < 0) {
        return 'Minimum pilihan tidak boleh negatif.'
      }

      if (maxSelections !== null && maxSelections < 0) {
        return 'Maksimum pilihan tidak boleh negatif.'
      }

      if (
        minSelections !== null
        && maxSelections !== null
        && minSelections > maxSelections
      ) {
        return 'Minimum pilihan tidak boleh melebihi maksimum.'
      }

      if (
        maxSelections !== null
        && maxSelections > question.options.length
      ) {
        return 'Maksimum pilihan tidak boleh melebihi jumlah pilihan tersedia.'
      }

      if (question.question_type === 'ranking' && maxSelections === 0) {
        return 'Maksimum pilihan ranking harus lebih dari 0.'
      }
    }

    if (structuredOutputEnabled) {
      const structuredScope = String(
        question.structured_scope || 'form_data',
      ).trim()
      const structuredPath = String(
        question.structured_path || '',
      ).trim()
      const structuredPassValue = String(
        question.structured_pass_value || '',
      ).trim()

      if (![
        'form_data',
        'acknowledgement',
        'consent',
        'exclude',
      ].includes(structuredScope)) {
        return 'Scope output terstruktur belum valid.'
      }

      if (structuredScope === 'form_data') {
        if (!structuredPath) {
          return 'JSON path wajib diisi untuk scope Data penelitian.'
        }

        if (structuredPath.length > 300) {
          return 'JSON path maksimal 300 karakter.'
        }

        if (!STRUCTURED_PATH_PATTERN.test(structuredPath)) {
          return 'JSON path harus memakai huruf kecil, angka, underscore, dan titik antarbagian.'
        }
      }

      if (['acknowledgement', 'consent'].includes(structuredScope)) {
        if (!PROMPT_STRUCTURED_PASS_QUESTION_TYPES.includes(
          question.question_type,
        )) {
          return 'Scope Pernyataan pemahaman atau Persetujuan hanya dapat dipakai pada pilihan tunggal, dropdown, atau checkbox.'
        }

        if (!structuredPassValue) {
          return 'Nilai kelulusan wajib dipilih.'
        }

        if (structuredPassValue.length > 300) {
          return 'Nilai kelulusan maksimal 300 karakter.'
        }

        const availableValues = question.options.map((option) => (
          String(option.option_value || '').trim()
        ))

        if (!availableValues.includes(structuredPassValue)) {
          return 'Nilai kelulusan harus cocok dengan salah satu nilai internal pilihan.'
        }

        if (
          structuredScope === 'consent'
          && questions.some((item) => (
            item.id !== question.id
            && item.structured_scope === 'consent'
          ))
        ) {
          return 'Satu tool hanya boleh memiliki satu pertanyaan dengan scope Persetujuan.'
        }
      }
    }

    if (!['all', 'any'].includes(question.conditional_mode || 'all')) {
      return 'Mode kondisi belum valid.'
    }

    const validParentIds = new Set(
      parentCandidates.map((candidate) => candidate.id),
    )
    const duplicateConditions = new Set()

    for (let index = 0; index < question.conditions.length; index += 1) {
      const condition = question.conditions[index]
      const parentId = String(condition.parent_question_id || '').trim()
      const operator = String(condition.operator || '').trim()
      const comparisonValue = operator === 'not_empty'
        ? null
        : String(condition.comparison_value || '').trim()

      if (!parentId || !validParentIds.has(parentId)) {
        return `Pertanyaan induk pada kondisi ke-${index + 1} harus muncul sebelum pertanyaan ini.`
      }

      if (!CONDITION_OPERATORS.has(operator)) {
        return `Operator pada kondisi ke-${index + 1} belum valid.`
      }

      if (operator !== 'not_empty' && !comparisonValue) {
        return `Nilai pada kondisi ke-${index + 1} wajib diisi.`
      }

      const duplicateKey = [
        parentId,
        operator,
        comparisonValue || '',
      ].join('::')

      if (duplicateConditions.has(duplicateKey)) {
        return 'Kondisi yang sama tidak boleh ditambahkan lebih dari sekali.'
      }

      duplicateConditions.add(duplicateKey)
    }

    return ''
  }

  const save = async () => {
    setError('')
    const validationError = validateQuestion()

    if (validationError) {
      setError(validationError)
      return
    }

    setSaving(true)
    const variableName = String(question.variable_name || '').trim()
    let duplicateQuery = supabase
      .from('prompt_tool_questions')
      .select('id')
      .eq('tool_id', toolId)
      .eq('variable_name', variableName)

    if (question.id) {
      duplicateQuery = duplicateQuery.neq('id', question.id)
    }

    const { data: duplicates, error: duplicateError } = await duplicateQuery

    if (duplicateError) {
      setSaving(false)
      setError('Nama variabel belum dapat diperiksa.')
      return
    }

    if ((duplicates || []).length > 0) {
      setSaving(false)
      setError('Nama variabel sudah digunakan oleh pertanyaan lain.')
      return
    }

    const selectionType = SELECTION_LIMIT_TYPES.has(
      question.question_type,
    )
    const structuredScope = String(
      question.structured_scope || 'form_data',
    ).trim()
    const structuredPath = String(
      question.structured_path || '',
    ).trim()
    const structuredPassValue = String(
      question.structured_pass_value || '',
    ).trim()
    const questionPayload = {
      label: String(question.label || '').trim(),
      variable_name: variableName,
      question_type: question.question_type,
      section_id: question.section_id || null,
      help_text: String(question.help_text || '').trim(),
      placeholder: String(question.placeholder || '').trim(),
      is_required: question.is_required === true,
      validation_min: question.question_type === 'number'
        ? (question.validation_min === '' ? null : question.validation_min)
        : null,
      validation_max: question.question_type === 'number'
        ? (question.validation_max === '' ? null : question.validation_max)
        : null,
      min_selections: selectionType
        ? getNullableInteger(question.min_selections)
        : null,
      max_selections: selectionType
        ? getNullableInteger(question.max_selections)
        : null,
      conditional_mode: question.conditional_mode || 'all',
      structured_scope: structuredScope,
      structured_path: structuredOutputEnabled
        ? structuredScope === 'form_data'
          ? structuredPath || null
          : null
        : structuredPath || null,
      structured_pass_value: structuredOutputEnabled
        ? ['acknowledgement', 'consent'].includes(structuredScope)
          ? structuredPassValue || null
          : null
        : structuredPassValue || null,
    }
    let savedQuestionId = question.id

    if (question.id) {
      const { error: updateError } = await supabase
        .from('prompt_tool_questions')
        .update(questionPayload)
        .eq('id', question.id)
        .eq('tool_id', toolId)

      if (updateError) {
        setSaving(false)
        setError(getQuestionSaveErrorMessage(updateError))
        return
      }
    } else {
      let siblingQuery = supabase
        .from('prompt_tool_questions')
        .select('sort_order')
        .eq('tool_id', toolId)

      siblingQuery = question.section_id
        ? siblingQuery.eq('section_id', question.section_id)
        : siblingQuery.is('section_id', null)

      const { data: siblings } = await siblingQuery
        .order('sort_order', { ascending: false })
        .limit(1)
      const nextSortOrder = siblings?.[0]?.sort_order !== undefined
        ? Number(siblings[0].sort_order) + 1
        : 0
      const { data: insertedQuestion, error: insertError } = await supabase
        .from('prompt_tool_questions')
        .insert({
          ...questionPayload,
          tool_id: toolId,
          sort_order: nextSortOrder,
        })
        .select('id')
        .single()

      if (insertError || !insertedQuestion?.id) {
        setSaving(false)
        setError(
          insertError
            ? getQuestionSaveErrorMessage(insertError)
            : 'Pertanyaan baru belum dapat disimpan.',
        )
        return
      }

      savedQuestionId = insertedQuestion.id
    }

    const optionsResult = await syncQuestionOptions(
      savedQuestionId,
      question.question_type,
      question.options,
    )

    if (!optionsResult.success) {
      setSaving(false)
      setError(
        `${optionsResult.error} Muat ulang editor sebelum mencoba lagi.`,
      )
      await onMutation?.({ touch: true })
      return
    }

    const conditionsResult = await syncPromptToolQuestionConditions({
      toolId,
      questionId: savedQuestionId,
      conditionalMode: question.conditional_mode || 'all',
      conditions: question.conditions,
    })

    setSaving(false)

    if (!conditionsResult.success) {
      setError(conditionsResult.error)
      await onMutation?.({ touch: true })
      return
    }

    onDone?.({
      changed: true,
      skipTouch: true,
      warning: conditionsResult.warning || '',
    })
  }

  const changeType = (newType) => {
    const currentlyChoice = PROMPT_CHOICE_QUESTION_TYPES.includes(
      question.question_type,
    )
    const nextChoice = PROMPT_CHOICE_QUESTION_TYPES.includes(newType)

    if (
      currentlyChoice
      && !nextChoice
      && question.options.length > 0
      && !window.confirm(
        'Mengubah tipe akan menghapus pilihan jawaban saat pertanyaan disimpan. Lanjutkan?',
      )
    ) {
      return
    }

    setQuestion((current) => ({
      ...current,
      question_type: newType,
      options: nextChoice
        ? current.options.map((option) => ({
          ...option,
          is_exclusive: ['checkbox', 'ranking'].includes(newType)
            ? option.is_exclusive === true
            : false,
        }))
        : [],
      min_selections: SELECTION_LIMIT_TYPES.has(newType)
        ? current.min_selections
        : null,
      max_selections: SELECTION_LIMIT_TYPES.has(newType)
        ? current.max_selections
        : null,
    }))
  }

  const moveQuestion = async (direction) => {
    if (!question.id) return

    let siblingsQuery = supabase
      .from('prompt_tool_questions')
      .select('id, sort_order')
      .eq('tool_id', toolId)

    siblingsQuery = question.section_id
      ? siblingsQuery.eq('section_id', question.section_id)
      : siblingsQuery.is('section_id', null)

    const { data: siblings, error: siblingsError } = await siblingsQuery
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })

    if (siblingsError) {
      setError('Urutan pertanyaan belum dapat dimuat.')
      return
    }

    const currentIndex = (siblings || []).findIndex((item) => (
      item.id === question.id
    ))
    const targetIndex = direction === 'up'
      ? currentIndex - 1
      : currentIndex + 1

    if (
      currentIndex < 0
      || targetIndex < 0
      || targetIndex >= siblings.length
    ) {
      return
    }

    const currentQuestion = siblings[currentIndex]
    const targetQuestion = siblings[targetIndex]
    const [firstUpdate, secondUpdate] = await Promise.all([
      supabase
        .from('prompt_tool_questions')
        .update({ sort_order: targetQuestion.sort_order })
        .eq('id', currentQuestion.id),
      supabase
        .from('prompt_tool_questions')
        .update({ sort_order: currentQuestion.sort_order })
        .eq('id', targetQuestion.id),
    ])

    if (firstUpdate.error || secondUpdate.error) {
      setError('Urutan pertanyaan belum dapat diperbarui.')
      return
    }

    await onMutation?.({ touch: true })
  }

  const isChoiceQuestion = PROMPT_CHOICE_QUESTION_TYPES.includes(
    question.question_type,
  )
  const usesSelectionLimits = SELECTION_LIMIT_TYPES.has(
    question.question_type,
  )

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h4 className="font-black text-gray-900">
          {question.id ? 'Edit Pertanyaan' : 'Tambah Pertanyaan'}
        </h4>
        <div className="flex flex-wrap gap-2">
          {question.id && (
            <>
              <button
                type="button"
                onClick={() => moveQuestion('up')}
                disabled={readOnly || saving}
                className="rounded-lg border px-3 py-2 text-xs font-bold"
              >
                Naik
              </button>
              <button
                type="button"
                onClick={() => moveQuestion('down')}
                disabled={readOnly || saving}
                className="rounded-lg border px-3 py-2 text-xs font-bold"
              >
                Turun
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => onDone?.({ changed: false })}
            disabled={saving}
            className="rounded-lg border px-3 py-2 text-xs font-bold"
          >
            Tutup
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        <label className="block">
          <span className="mb-1 block text-sm font-bold text-gray-700">
            Label
          </span>
          <input
            value={question.label}
            onChange={(event) => setQuestion((current) => ({
              ...current,
              label: event.target.value,
              variable_name: manualVariable
                ? current.variable_name
                : variableFromLabel(event.target.value),
            }))}
            disabled={readOnly}
            className="w-full rounded-xl border border-gray-300 px-3 py-2"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-bold text-gray-700">
            Variable name
          </span>
          <input
            value={question.variable_name}
            onChange={(event) => {
              setManualVariable(true)
              setQuestion((current) => ({
                ...current,
                variable_name: event.target.value,
              }))
            }}
            disabled={readOnly}
            className="w-full rounded-xl border border-gray-300 px-3 py-2"
          />
          <span className="mt-1 block text-xs text-gray-500">
            Preview: <code>{`{{${question.variable_name}}}`}</code>
          </span>
        </label>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-sm font-bold text-gray-700">
              Tipe pertanyaan
            </span>
            <select
              value={question.question_type}
              onChange={(event) => changeType(event.target.value)}
              disabled={readOnly}
              className="w-full rounded-xl border border-gray-300 px-3 py-2"
            >
              {QUESTION_TYPES.map((type) => (
                <option key={type} value={type}>
                  {PROMPT_QUESTION_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-bold text-gray-700">
              Bagian
            </span>
            <select
              value={question.section_id ?? ''}
              onChange={(event) => setQuestion((current) => ({
                ...current,
                section_id: event.target.value || null,
              }))}
              disabled={readOnly}
              className="w-full rounded-xl border border-gray-300 px-3 py-2"
            >
              {sections.map((section) => (
                <option key={String(section.id)} value={section.id ?? ''}>
                  {section.title}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="block">
          <span className="mb-1 block text-sm font-bold text-gray-700">
            Help text <span className="font-normal text-gray-400">(opsional)</span>
          </span>
          <input
            value={question.help_text}
            onChange={(event) => setQuestion((current) => ({
              ...current,
              help_text: event.target.value,
            }))}
            disabled={readOnly}
            className="w-full rounded-xl border border-gray-300 px-3 py-2"
          />
        </label>

        {['short_text', 'paragraph'].includes(question.question_type) && (
          <label className="block">
            <span className="mb-1 block text-sm font-bold text-gray-700">
              Placeholder <span className="font-normal text-gray-400">(opsional)</span>
            </span>
            <input
              value={question.placeholder}
              onChange={(event) => setQuestion((current) => ({
                ...current,
                placeholder: event.target.value,
              }))}
              disabled={readOnly}
              className="w-full rounded-xl border border-gray-300 px-3 py-2"
            />
          </label>
        )}

        {structuredOutputEnabled && (
          <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
            <h5 className="font-black text-gray-900">
              Pemetaan Output Terstruktur
            </h5>

            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-sm font-bold text-gray-700">
                  Scope output
                </span>
                <select
                  value={question.structured_scope}
                  onChange={(event) => setQuestion((current) => ({
                    ...current,
                    structured_scope: event.target.value,
                  }))}
                  disabled={readOnly}
                  className="w-full rounded-xl border border-gray-300 px-3 py-2"
                >
                  {Object.entries(PROMPT_STRUCTURED_SCOPE_LABELS).map(([
                    scope,
                    label,
                  ]) => (
                    <option
                      key={scope}
                      value={scope}
                      disabled={(
                        ['acknowledgement', 'consent'].includes(scope)
                        && !PROMPT_STRUCTURED_PASS_QUESTION_TYPES.includes(
                          question.question_type,
                        )
                      )}
                    >
                      {label}
                    </option>
                  ))}
                </select>
              </label>

              {question.structured_scope === 'form_data' && (
                <label className="block">
                  <span className="mb-1 block text-sm font-bold text-gray-700">
                    JSON path
                  </span>
                  <input
                    value={question.structured_path}
                    onChange={(event) => setQuestion((current) => ({
                      ...current,
                      structured_path: event.target.value,
                    }))}
                    disabled={readOnly}
                    className="w-full rounded-xl border border-gray-300 px-3 py-2"
                    placeholder="contoh: identitas.nama"
                  />
                </label>
              )}

              {['acknowledgement', 'consent'].includes(
                question.structured_scope,
              ) && (
                <label className="block">
                  <span className="mb-1 block text-sm font-bold text-gray-700">
                    Nilai kelulusan
                  </span>
                  <select
                    value={question.structured_pass_value}
                    onChange={(event) => setQuestion((current) => ({
                      ...current,
                      structured_pass_value: event.target.value,
                    }))}
                    disabled={readOnly || question.options.length === 0}
                    className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2"
                  >
                    <option value="">Pilih nilai kelulusan</option>
                    {question.options.map((option, index) => (
                      <option
                        key={option.id || `structured-pass-${index}`}
                        value={option.option_value || ''}
                      >
                        {option.option_label || option.option_value}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          </div>
        )}

        <label className="flex items-start gap-3 rounded-xl border border-gray-200 p-3">
          <input
            type="checkbox"
            checked={question.is_required}
            onChange={(event) => setQuestion((current) => ({
              ...current,
              is_required: event.target.checked,
            }))}
            disabled={readOnly}
            className="mt-1 h-4 w-4 accent-green-700"
          />
          <span>
            <span className="block text-sm font-bold text-gray-800">
              Pertanyaan wajib
            </span>
            {usesSelectionLimits && (
              <span className="mt-1 block text-xs text-gray-500">
                Jika minimum pilihan kosong, renderer publik JT-2 akan memperlakukan required sebagai minimal satu pilihan.
              </span>
            )}
          </span>
        </label>

        {question.question_type === 'number' && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-sm font-bold text-gray-700">
                Validation min
              </span>
              <input
                type="number"
                value={question.validation_min ?? ''}
                onChange={(event) => setQuestion((current) => ({
                  ...current,
                  validation_min: event.target.value,
                }))}
                disabled={readOnly}
                className="w-full rounded-xl border border-gray-300 px-3 py-2"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-bold text-gray-700">
                Validation max
              </span>
              <input
                type="number"
                value={question.validation_max ?? ''}
                onChange={(event) => setQuestion((current) => ({
                  ...current,
                  validation_max: event.target.value,
                }))}
                disabled={readOnly}
                className="w-full rounded-xl border border-gray-300 px-3 py-2"
              />
            </label>
          </div>
        )}

        {usesSelectionLimits && (
          <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
            <h5 className="font-black text-gray-900">Batas Pilihan</h5>
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-sm font-bold text-gray-700">
                  Minimum pilihan
                </span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={question.min_selections ?? ''}
                  onChange={(event) => setQuestion((current) => ({
                    ...current,
                    min_selections: event.target.value,
                  }))}
                  disabled={readOnly}
                  className="w-full rounded-xl border border-gray-300 px-3 py-2"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-bold text-gray-700">
                  Maksimum pilihan
                </span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={question.max_selections ?? ''}
                  onChange={(event) => setQuestion((current) => ({
                    ...current,
                    max_selections: event.target.value,
                  }))}
                  disabled={readOnly}
                  className="w-full rounded-xl border border-gray-300 px-3 py-2"
                />
              </label>
            </div>
          </div>
        )}

        {isChoiceQuestion && (
          <PromptToolOptionEditor
            options={question.options}
            onChange={(options) => setQuestion((current) => ({
              ...current,
              options,
            }))}
            disabled={readOnly}
            allowExclusive={['checkbox', 'ranking'].includes(
              question.question_type,
            )}
          />
        )}

        <PromptToolConditionEditor
          conditionalMode={question.conditional_mode}
          conditions={question.conditions}
          parentCandidates={parentCandidates}
          sections={realSections}
          onModeChange={(conditionalMode) => setQuestion((current) => ({
            ...current,
            conditional_mode: conditionalMode,
          }))}
          onChange={(conditions) => setQuestion((current) => ({
            ...current,
            conditions,
          }))}
          disabled={readOnly}
        />

        {error && (
          <div
            className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700"
            role="alert"
          >
            {error}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={save}
            disabled={readOnly || saving}
            className="rounded-xl bg-green-700 px-5 py-3 text-sm font-black text-white disabled:opacity-50"
          >
            {saving ? 'Menyimpan...' : 'Simpan Pertanyaan'}
          </button>
          <button
            type="button"
            onClick={() => onDone?.({ changed: false })}
            disabled={saving}
            className="rounded-xl border border-gray-300 px-5 py-3 text-sm font-bold text-gray-700"
          >
            Batal
          </button>
        </div>
      </div>
    </div>
  )
}
