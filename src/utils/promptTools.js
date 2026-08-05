import { supabase } from '../supabase'

export const PROMPT_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
export const PROMPT_VARIABLE_PATTERN = /^[a-z][a-z0-9_]*$/

export const PROMPT_QUESTION_TYPE_LABELS = {
  short_text: 'Jawaban Singkat',
  paragraph: 'Paragraf',
  number: 'Angka',
  email: 'Email',
  phone: 'Nomor HP',
  date: 'Tanggal',
  single_choice: 'Pilihan Tunggal',
  dropdown: 'Dropdown',
  checkbox: 'Checkbox',
  ranking: 'Ranking / Urutan Prioritas',
}

export const PROMPT_CHOICE_QUESTION_TYPES = [
  'single_choice',
  'dropdown',
  'checkbox',
  'ranking',
]

export const PROMPT_TOOL_DEPLOY_ACTIONS = [
  'publish',
  'update_published',
  'archive',
  'retry',
]

export const PROMPT_TOOL_DEPLOY_PROGRESS_MS = 5 * 60 * 1000
export const PROMPT_TOOL_DEPLOY_REQUEST_PHASE_MS = 15 * 1000

const PROMPT_TEMPLATE_PLACEHOLDER_PATTERN = /{{\s*([^{}]+?)\s*}}/g
const PROMPT_CONDITIONAL_OPERATORS = new Set([
  'equals',
  'not_equals',
  'contains',
  'not_empty',
])

export const slugifyPromptTitle = (value = '') => {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export const isValidPromptSlug = (value = '') => {
  return PROMPT_SLUG_PATTERN.test(String(value || '').trim())
}

const isValidHttpUrl = (value) => {
  try {
    const parsedUrl = new URL(String(value || '').trim())
    return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:'
  } catch {
    return false
  }
}

export const validatePromptDraft = (payload) => {
  const {
    title,
    slug,
    category,
    prompt_template,
    submit_button_label,
    result_title,
    copy_button_label,
    survey_url,
    survey_cta,
    display_mode = 'single_page',
    previous_button_label = 'Sebelumnya',
    next_button_label = 'Berikutnya',
  } = payload

  if (!String(title || '').trim()) {
    return 'Judul wajib diisi.'
  }

  if (!isValidPromptSlug(slug)) {
    return 'Slug hanya boleh huruf kecil, angka, dan tanda hubung. Tidak boleh diawali atau diakhiri tanda hubung.'
  }

  if (!String(category || '').trim()) {
    return 'Kategori wajib diisi.'
  }

  if (!String(prompt_template || '').trim()) {
    return 'Template prompt wajib diisi.'
  }

  if (!String(submit_button_label || '').trim()) {
    return 'Label tombol submit wajib diisi.'
  }

  if (!String(result_title || '').trim()) {
    return 'Judul hasil wajib diisi.'
  }

  if (!String(copy_button_label || '').trim()) {
    return 'Label tombol salin wajib diisi.'
  }

  const url = String(survey_url || '').trim()
  const cta = String(survey_cta || '').trim()

  if (url) {
    if (!isValidHttpUrl(url)) {
      return 'Survey URL harus diawali dengan http:// atau https://'
    }

    if (!cta) {
      return 'Survey CTA wajib diisi bila Survey URL diisi.'
    }
  }

  if (cta && !url) {
    return 'Survey URL wajib diisi bila Survey CTA diisi.'
  }

  if (!['single_page', 'section_steps'].includes(display_mode)) {
    return 'Mode tampilan form belum valid.'
  }

  if (!String(previous_button_label || '').trim()) {
    return 'Label tombol sebelumnya wajib diisi.'
  }

  if (!String(next_button_label || '').trim()) {
    return 'Label tombol berikutnya wajib diisi.'
  }

  return ''
}

export const getPromptQuestionTypeLabel = (questionType) => {
  return (
    PROMPT_QUESTION_TYPE_LABELS[questionType]
    || questionType
    || 'Pertanyaan'
  )
}

export const isPromptAnswerEmpty = (value) => {
  if (Array.isArray(value)) {
    return value.length === 0
  }

  return String(value ?? '').trim() === ''
}

const normalizeComparableValue = (value) => {
  return String(value ?? '').trim()
}

export const evaluatePromptCondition = ({
  operator,
  parentValue,
  conditionValue,
}) => {
  const normalizedOperator = operator || 'equals'
  const expectedValue = normalizeComparableValue(conditionValue)

  if (normalizedOperator === 'not_empty') {
    return !isPromptAnswerEmpty(parentValue)
  }

  if (Array.isArray(parentValue)) {
    const normalizedValues = parentValue.map((value) => (
      normalizeComparableValue(value)
    ))

    if (normalizedOperator === 'equals') {
      return normalizedValues.includes(expectedValue)
    }

    if (normalizedOperator === 'not_equals') {
      return !normalizedValues.includes(expectedValue)
    }

    if (normalizedOperator === 'contains') {
      const expectedLowerCase = expectedValue.toLowerCase()

      return normalizedValues.some((value) => (
        value.toLowerCase().includes(expectedLowerCase)
      ))
    }

    return true
  }

  const actualValue = normalizeComparableValue(parentValue)

  if (normalizedOperator === 'equals') {
    return actualValue === expectedValue
  }

  if (normalizedOperator === 'not_equals') {
    return actualValue !== expectedValue
  }

  if (normalizedOperator === 'contains') {
    return actualValue
      .toLowerCase()
      .includes(expectedValue.toLowerCase())
  }

  return true
}

export const shouldShowPromptQuestion = (
  question,
  answers,
  questions,
) => {
  if (!question?.conditional_parent_question_id) {
    return true
  }

  const questionsById = new Map(
    (questions || []).map((item) => [item.id, item]),
  )

  const evaluateQuestion = (currentQuestion, visitedIds = new Set()) => {
    if (!currentQuestion?.conditional_parent_question_id) {
      return true
    }

    if (visitedIds.has(currentQuestion.id)) {
      return false
    }

    const nextVisitedIds = new Set(visitedIds)
    nextVisitedIds.add(currentQuestion.id)

    const parentQuestion = questionsById.get(
      currentQuestion.conditional_parent_question_id,
    )

    if (!parentQuestion) {
      return false
    }

    const parentIsVisible = evaluateQuestion(
      parentQuestion,
      nextVisitedIds,
    )

    if (!parentIsVisible) {
      return false
    }

    const parentValue = answers?.[parentQuestion.variable_name]

    return evaluatePromptCondition({
      operator: currentQuestion.conditional_operator,
      parentValue,
      conditionValue: currentQuestion.conditional_value,
    })
  }

  return evaluateQuestion(question)
}

export const getVisiblePromptQuestions = (
  questions,
  answers,
) => {
  return (questions || []).filter((question) => (
    shouldShowPromptQuestion(question, answers, questions)
  ))
}

const getQuestionOptions = (
  optionsByQuestionId,
  questionId,
) => {
  if (optionsByQuestionId instanceof Map) {
    return optionsByQuestionId.get(questionId) || []
  }

  return optionsByQuestionId?.[questionId] || []
}

const isValidEmailAddress = (value) => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

const formatValidationLimit = (value) => {
  const numberValue = Number(value)

  if (Number.isInteger(numberValue)) {
    return String(numberValue)
  }

  return String(value)
}

export const validatePromptAnswers = ({
  questions,
  answers,
  optionsByQuestionId,
}) => {
  const errors = {}
  const visibleQuestions = getVisiblePromptQuestions(
    questions,
    answers,
  )

  visibleQuestions.forEach((question) => {
    const value = answers?.[question.variable_name]
    const valueIsEmpty = isPromptAnswerEmpty(value)

    if (question.is_required && valueIsEmpty) {
      errors[question.variable_name] = (
        question.question_type === 'checkbox'
          ? 'Pilih minimal satu jawaban.'
          : 'Pertanyaan ini wajib diisi.'
      )

      return
    }

    if (valueIsEmpty) {
      return
    }

    if (question.question_type === 'email') {
      const emailValue = String(value).trim()

      if (!isValidEmailAddress(emailValue)) {
        errors[question.variable_name] = (
          'Masukkan alamat email yang valid.'
        )
      }

      return
    }

    if (question.question_type === 'number') {
      const numericValue = Number(value)

      if (!Number.isFinite(numericValue)) {
        errors[question.variable_name] = (
          'Masukkan nilai berupa angka.'
        )

        return
      }

      if (
        question.validation_min !== null
        && question.validation_min !== undefined
        && numericValue < Number(question.validation_min)
      ) {
        errors[question.variable_name] = (
          `Nilai minimal adalah ${formatValidationLimit(
            question.validation_min,
          )}.`
        )

        return
      }

      if (
        question.validation_max !== null
        && question.validation_max !== undefined
        && numericValue > Number(question.validation_max)
      ) {
        errors[question.variable_name] = (
          `Nilai maksimal adalah ${formatValidationLimit(
            question.validation_max,
          )}.`
        )
      }

      return
    }

    if (
      PROMPT_CHOICE_QUESTION_TYPES.includes(
        question.question_type,
      )
    ) {
      const questionOptions = getQuestionOptions(
        optionsByQuestionId,
        question.id,
      )

      const allowedValues = new Set(
        questionOptions.map((option) => (
          String(option.option_value)
        )),
      )

      if (question.question_type === 'checkbox') {
        const selectedValues = Array.isArray(value) ? value : []
        const hasInvalidValue = selectedValues.some((selectedValue) => (
          !allowedValues.has(String(selectedValue))
        ))

        if (hasInvalidValue) {
          errors[question.variable_name] = (
            'Pilihan yang dipilih tidak valid.'
          )
        }

        return
      }

      if (!allowedValues.has(String(value))) {
        errors[question.variable_name] = (
          'Pilih jawaban yang tersedia.'
        )
      }
    }
  })

  return {
    errors,
    firstErrorVariableName: (
      visibleQuestions.find((question) => (
        Boolean(errors[question.variable_name])
      ))?.variable_name || ''
    ),
    visibleQuestions,
  }
}

const getPromptOptionLabel = ({
  question,
  optionValue,
  optionsByQuestionId,
}) => {
  const questionOptions = getQuestionOptions(
    optionsByQuestionId,
    question.id,
  )

  const matchingOption = questionOptions.find((option) => (
    option.option_value === optionValue
  ))

  return String(
    matchingOption?.option_label ?? optionValue ?? '',
  ).trim()
}

export const formatPromptAnswerValue = ({
  question,
  value,
  optionsByQuestionId,
}) => {
  if (question?.question_type === 'checkbox') {
    const selectedValues = Array.isArray(value) ? value : []

    const optionLabels = selectedValues
      .map((optionValue) => getPromptOptionLabel({
        question,
        optionValue,
        optionsByQuestionId,
      }))
      .filter(Boolean)

    return optionLabels.length > 0
      ? optionLabels.join(', ')
      : 'Tidak diisi'
  }

  if (
    question?.question_type === 'single_choice'
    || question?.question_type === 'dropdown'
  ) {
    const optionLabel = getPromptOptionLabel({
      question,
      optionValue: value,
      optionsByQuestionId,
    })

    return optionLabel || 'Tidak diisi'
  }

  const cleanedValue = String(value ?? '').trim()

  return cleanedValue || 'Tidak diisi'
}

export const buildPromptFromTemplate = ({
  template,
  questions,
  answers,
  visibleQuestions,
  optionsByQuestionId,
}) => {
  const templateValue = String(template || '')

  if (!templateValue.trim()) {
    return {
      prompt: '',
      error: (
        'Template tool belum lengkap. Silakan hubungi pengelola.'
      ),
    }
  }

  const questionsByVariableName = new Map(
    (questions || []).map((question) => [
      question.variable_name,
      question,
    ]),
  )

  const visibleQuestionIds = new Set(
    (visibleQuestions || []).map((question) => question.id),
  )

  const unknownVariables = new Set()

  const generatedPrompt = templateValue.replace(
    PROMPT_TEMPLATE_PLACEHOLDER_PATTERN,
    (_placeholder, rawVariableName) => {
      const variableName = String(rawVariableName).trim()
      const question = questionsByVariableName.get(variableName)

      if (!question) {
        unknownVariables.add(variableName)
        return ''
      }

      if (!visibleQuestionIds.has(question.id)) {
        return 'Tidak diisi'
      }

      return formatPromptAnswerValue({
        question,
        value: answers?.[question.variable_name],
        optionsByQuestionId,
      })
    },
  )

  if (unknownVariables.size > 0) {
    return {
      prompt: '',
      error: (
        'Template tool belum lengkap. Silakan hubungi pengelola.'
      ),
    }
  }

  return {
    prompt: generatedPrompt.trim(),
    error: '',
  }
}

export const getSafePromptSurveyUrl = (value) => {
  const urlValue = String(value || '').trim()

  if (!urlValue) {
    return ''
  }

  try {
    const parsedUrl = new URL(urlValue)

    if (
      parsedUrl.protocol !== 'http:'
      && parsedUrl.protocol !== 'https:'
    ) {
      return ''
    }

    return parsedUrl.toString()
  } catch {
    return ''
  }
}

const getFunctionErrorStatus = (error) => {
  const possibleStatus = Number(
    error?.context?.status
    ?? error?.status
    ?? error?.statusCode,
  )

  return Number.isFinite(possibleStatus) ? possibleStatus : 0
}

const readFunctionErrorPayload = async (error) => {
  const context = error?.context

  if (!context || typeof context.json !== 'function') {
    return null
  }

  try {
    return await context.json()
  } catch {
    return null
  }
}

const getPromptToolDeployErrorMessage = (status, payload) => {
  const functionMessage = String(payload?.error || '').trim()

  if (status === 401) {
    return 'Sesi admin tidak valid. Silakan login kembali.'
  }

  if (status === 403) {
    return 'Anda tidak memiliki akses admin.'
  }

  if (status === 404) {
    return 'Tool tidak ditemukan.'
  }

  if (status === 409) {
    return 'Status tool sudah berubah. Muat ulang halaman.'
  }

  if (status === 429) {
    return functionMessage || 'Deployment baru saja diminta. Tunggu sekitar 5 menit sebelum mencoba lagi.'
  }

  if (status === 502) {
    return 'Deployment belum dapat diminta. Silakan coba lagi.'
  }

  return 'Deployment belum dapat diminta. Silakan coba lagi.'
}

export const triggerPromptToolDeploy = async (toolId, action) => {
  const normalizedToolId = String(toolId || '').trim()

  if (!normalizedToolId) {
    return {
      success: false,
      deployTriggered: false,
      status: '',
      error: 'Tool tidak valid.',
    }
  }

  if (!PROMPT_TOOL_DEPLOY_ACTIONS.includes(action)) {
    return {
      success: false,
      deployTriggered: false,
      status: '',
      error: 'Tindakan deployment tidak valid.',
    }
  }

  try {
    const { data, error } = await supabase.functions.invoke(
      'trigger-tool-deploy',
      {
        body: {
          toolId: normalizedToolId,
          action,
        },
      },
    )

    if (error) {
      const status = getFunctionErrorStatus(error)
      const payload = await readFunctionErrorPayload(error)

      return {
        success: false,
        deployTriggered: Boolean(payload?.deployTriggered),
        status: String(payload?.status || ''),
        error: getPromptToolDeployErrorMessage(status, payload),
      }
    }

    if (data?.deployTriggered === true) {
      return {
        success: true,
        deployTriggered: true,
        status: String(data.status || 'triggered'),
        message: String(
          data.message
          || 'Deployment berhasil diminta.',
        ),
        warning: data.ok === false
          ? String(data.error || '').trim()
          : '',
        error: '',
      }
    }

    if (data?.ok === true) {
      return {
        success: true,
        deployTriggered: Boolean(data.deployTriggered),
        status: String(data.status || ''),
        message: String(data.message || 'Deployment berhasil diminta.'),
        warning: '',
        error: '',
      }
    }

    return {
      success: false,
      deployTriggered: false,
      status: String(data?.status || ''),
      error: 'Deployment belum dapat diminta. Silakan coba lagi.',
    }
  } catch {
    return {
      success: false,
      deployTriggered: false,
      status: '',
      error: 'Deployment belum dapat diminta. Silakan coba lagi.',
    }
  }
}

export const touchPromptTool = async (toolId) => {
  const normalizedToolId = String(toolId || '').trim()

  if (!normalizedToolId) {
    return {
      success: false,
      error: 'Tool tidak valid.',
    }
  }

  const { error } = await supabase
    .from('prompt_tools')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', normalizedToolId)

  if (error) {
    return {
      success: false,
      error: 'Perubahan tersimpan, tetapi status pembaruan tool belum dapat ditandai.',
    }
  }

  return {
    success: true,
    error: '',
  }
}

export const hasPromptToolUndeployedChanges = (tool) => {
  if (tool?.status !== 'published') {
    return false
  }

  if (!tool.last_deploy_triggered_at) {
    return true
  }

  const updatedAt = Date.parse(tool.updated_at || '')
  const deployTriggeredAt = Date.parse(tool.last_deploy_triggered_at || '')

  if (Number.isNaN(deployTriggeredAt)) {
    return true
  }

  if (Number.isNaN(updatedAt)) {
    return false
  }

  return updatedAt > deployTriggeredAt
}

export const getPromptToolDeployStatusLabel = (status) => {
  const labels = {
    pending: 'Menyiapkan deployment',
    triggered: 'Deployment telah diminta',
    failed_to_trigger: 'Gagal meminta deployment',
  }

  return labels[status] || 'Belum ada permintaan deploy'
}

export const getPromptToolDeployProgress = (
  tool,
  now = Date.now(),
) => {
  const deployStatus = tool?.last_deploy_status
  const deployStartedAt = Date.parse(tool?.last_deploy_triggered_at || '')

  if (
    !['pending', 'triggered'].includes(deployStatus)
    || Number.isNaN(deployStartedAt)
  ) {
    return {
      visible: false,
      complete: false,
      progressPercent: 0,
      remainingMs: 0,
      label: '',
    }
  }

  const elapsedMs = Math.max(0, now - deployStartedAt)
  const remainingMs = Math.max(
    0,
    PROMPT_TOOL_DEPLOY_PROGRESS_MS - elapsedMs,
  )
  const complete = elapsedMs >= PROMPT_TOOL_DEPLOY_PROGRESS_MS
  const progressPercent = complete
    ? 100
    : Math.max(
      2,
      Math.min(
        99,
        Math.round(
          (elapsedMs / PROMPT_TOOL_DEPLOY_PROGRESS_MS) * 100,
        ),
      ),
    )

  let label = 'Deployment sedang diproses...'

  if (elapsedMs < PROMPT_TOOL_DEPLOY_REQUEST_PHASE_MS) {
    label = 'Sedang mengirim permintaan deployment...'
  } else if (complete) {
    label = 'Perkiraan deploy selesai. Silakan cek Vercel.'
  }

  return {
    visible: true,
    complete,
    progressPercent,
    remainingMs,
    label,
  }
}

export const formatPromptToolDeployCountdown = (remainingMs) => {
  const totalSeconds = Math.max(
    0,
    Math.ceil(Number(remainingMs || 0) / 1000),
  )
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

const collectPromptTemplateVariables = (template) => {
  const variables = []
  const templateValue = String(template || '')
  let match

  PROMPT_TEMPLATE_PLACEHOLDER_PATTERN.lastIndex = 0

  while (
    (match = PROMPT_TEMPLATE_PLACEHOLDER_PATTERN.exec(templateValue))
    !== null
  ) {
    const variableName = String(match[1] || '').trim()

    if (variableName) {
      variables.push(variableName)
    }
  }

  PROMPT_TEMPLATE_PLACEHOLDER_PATTERN.lastIndex = 0

  return variables
}

const comparePromptRows = (first, second) => {
  const orderDifference = Number(first?.sort_order || 0)
    - Number(second?.sort_order || 0)

  if (orderDifference !== 0) {
    return orderDifference
  }

  return String(first?.created_at || '').localeCompare(
    String(second?.created_at || ''),
  )
}

export const getOrderedPromptToolQuestions = (
  sections = [],
  questions = [],
) => {
  const orderedSections = [...sections].sort(comparePromptRows)
  const knownSectionIds = new Set(
    orderedSections.map((section) => section.id),
  )
  const orderedQuestions = []

  orderedSections.forEach((section) => {
    orderedQuestions.push(
      ...questions
        .filter((question) => question.section_id === section.id)
        .sort(comparePromptRows),
    )
  })

  orderedQuestions.push(
    ...questions
      .filter((question) => (
        !question.section_id
        || !knownSectionIds.has(question.section_id)
      ))
      .sort(comparePromptRows),
  )

  return orderedQuestions
}

const getLegacyPromptToolCondition = (
  question,
  questionsById,
) => {
  if (
    !question?.conditional_parent_question_id
    || !questionsById.has(question.conditional_parent_question_id)
    || !PROMPT_CONDITIONAL_OPERATORS.has(
      question.conditional_operator,
    )
  ) {
    return null
  }

  return {
    id: null,
    question_id: question.id,
    parent_question_id: question.conditional_parent_question_id,
    operator: question.conditional_operator,
    comparison_value: question.conditional_operator === 'not_empty'
      ? null
      : question.conditional_value,
    sort_order: 0,
    created_at: question.created_at || '',
    updated_at: question.updated_at || '',
    legacy: true,
  }
}

export const loadPromptToolBuilderData = async (toolId) => {
  const normalizedToolId = String(toolId || '').trim()

  if (!normalizedToolId) {
    return {
      success: false,
      error: 'Tool tidak valid.',
      sections: [],
      questions: [],
      options: [],
      conditions: [],
    }
  }

  const [sectionsResult, questionsResult] = await Promise.all([
    supabase
      .from('prompt_tool_sections')
      .select('*')
      .eq('tool_id', normalizedToolId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true }),
    supabase
      .from('prompt_tool_questions')
      .select('*')
      .eq('tool_id', normalizedToolId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true }),
  ])

  if (sectionsResult.error || questionsResult.error) {
    return {
      success: false,
      error: 'Builder tool belum dapat dimuat. Silakan coba lagi.',
      sections: [],
      questions: [],
      options: [],
      conditions: [],
    }
  }

  const sections = sectionsResult.data || []
  const questionRows = questionsResult.data || []
  const questionIds = questionRows
    .map((question) => question.id)
    .filter(Boolean)
  let options = []
  let conditions = []

  if (questionIds.length > 0) {
    const [optionsResult, conditionsResult] = await Promise.all([
      supabase
        .from('prompt_tool_options')
        .select('*')
        .in('question_id', questionIds)
        .order('group_sort_order', { ascending: true })
        .order('group_label', { ascending: true })
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true }),
      supabase
        .from('prompt_tool_question_conditions')
        .select(`
          id,
          question_id,
          parent_question_id,
          operator,
          comparison_value,
          sort_order,
          created_at,
          updated_at
        `)
        .in('question_id', questionIds)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true }),
    ])

    if (optionsResult.error || conditionsResult.error) {
      return {
        success: false,
        error: 'Pilihan atau kondisi pertanyaan belum dapat dimuat.',
        sections,
        questions: [],
        options: [],
        conditions: [],
      }
    }

    options = optionsResult.data || []
    conditions = conditionsResult.data || []
  }

  const questionsById = new Map(
    questionRows.map((question) => [question.id, question]),
  )
  const questions = questionRows.map((question) => {
    const questionOptions = options
      .filter((option) => option.question_id === question.id)
      .sort((first, second) => {
        const groupOrderDifference = Number(
          first.group_sort_order || 0,
        ) - Number(second.group_sort_order || 0)

        if (groupOrderDifference !== 0) {
          return groupOrderDifference
        }

        const groupLabelDifference = String(
          first.group_label || '',
        ).localeCompare(String(second.group_label || ''))

        if (groupLabelDifference !== 0) {
          return groupLabelDifference
        }

        return comparePromptRows(first, second)
      })
    const storedConditions = conditions
      .filter((condition) => condition.question_id === question.id)
      .sort(comparePromptRows)
    const legacyCondition = storedConditions.length === 0
      ? getLegacyPromptToolCondition(question, questionsById)
      : null

    return {
      ...question,
      conditional_mode: question.conditional_mode || 'all',
      min_selections: question.min_selections ?? null,
      max_selections: question.max_selections ?? null,
      options: questionOptions,
      conditions: legacyCondition
        ? [legacyCondition]
        : storedConditions,
    }
  })

  return {
    success: true,
    error: '',
    sections,
    questions,
    options,
    conditions,
  }
}

export const PROMPT_TOOL_ADVANCED_PUBLIC_GUARD_MESSAGE = (
  'Tool menggunakan fitur builder lanjutan yang belum didukung halaman publik. '
  + 'Selesaikan JT-2 sebelum memublikasikan atau menerapkan perubahan ini.'
)

export const getUnsupportedPublicPromptToolFeatures = (
  tool = {},
  questions = [],
  options = [],
  conditions = [],
) => {
  const features = []
  const optionRows = options.length > 0
    ? options
    : questions.flatMap((question) => question.options || [])
  const conditionRows = conditions.length > 0
    ? conditions
    : questions.flatMap((question) => question.conditions || [])

  if (tool.display_mode === 'section_steps') {
    features.push('Mode per bagian / bertahap')
  }

  if (tool.show_progress === true) {
    features.push('Progress form')
  }

  if (questions.some((question) => question.question_type === 'ranking')) {
    features.push('Pertanyaan ranking')
  }

  if (questions.some((question) => (
    question.min_selections !== null
    && question.min_selections !== undefined
  ))) {
    features.push('Minimum pilihan')
  }

  if (questions.some((question) => (
    question.max_selections !== null
    && question.max_selections !== undefined
  ))) {
    features.push('Maksimum pilihan')
  }

  if (questions.some((question) => question.conditional_mode === 'any')) {
    features.push('Mode kondisi ANY')
  }

  const conditionCounts = conditionRows.reduce((counts, condition) => {
    const questionId = condition.question_id
    counts.set(questionId, (counts.get(questionId) || 0) + 1)
    return counts
  }, new Map())

  if (Array.from(conditionCounts.values()).some((count) => count > 1)) {
    features.push('Banyak kondisi pada satu pertanyaan')
  }

  if (optionRows.some((option) => option.is_exclusive === true)) {
    features.push('Pilihan eksklusif')
  }

  if (optionRows.some((option) => String(option.group_label || '').trim())) {
    features.push('Kelompok pilihan')
  }

  if (optionRows.some((option) => Number(option.group_sort_order || 0) !== 0)) {
    features.push('Urutan kelompok pilihan')
  }

  return Array.from(new Set(features))
}

const normalizeConditionValue = (operator, value) => {
  if (operator === 'not_empty') {
    return null
  }

  return String(value ?? '').trim()
}

export const syncPromptToolQuestionConditions = async ({
  toolId,
  questionId,
  conditionalMode = 'all',
  conditions = [],
}) => {
  const normalizedToolId = String(toolId || '').trim()
  const normalizedQuestionId = String(questionId || '').trim()

  if (!normalizedToolId || !normalizedQuestionId) {
    return {
      success: false,
      error: 'Pertanyaan tidak valid.',
    }
  }

  if (!['all', 'any'].includes(conditionalMode)) {
    return {
      success: false,
      error: 'Mode kondisi belum valid.',
    }
  }

  const [questionsResult, existingResult] = await Promise.all([
    supabase
      .from('prompt_tool_questions')
      .select('id')
      .eq('tool_id', normalizedToolId),
    supabase
      .from('prompt_tool_question_conditions')
      .select('id, question_id')
      .eq('question_id', normalizedQuestionId),
  ])

  if (questionsResult.error || existingResult.error) {
    return {
      success: false,
      error: 'Kondisi pertanyaan belum dapat diperiksa.',
    }
  }

  const validQuestionIds = new Set(
    (questionsResult.data || []).map((question) => question.id),
  )
  const duplicateKeys = new Set()
  const normalizedConditions = []

  for (let index = 0; index < conditions.length; index += 1) {
    const condition = conditions[index]
    const parentQuestionId = String(
      condition.parent_question_id || '',
    ).trim()
    const operator = String(condition.operator || '').trim()
    const comparisonValue = normalizeConditionValue(
      operator,
      condition.comparison_value,
    )

    if (!parentQuestionId || !validQuestionIds.has(parentQuestionId)) {
      return {
        success: false,
        error: `Kondisi ke-${index + 1} belum memiliki pertanyaan induk yang valid.`,
      }
    }

    if (parentQuestionId === normalizedQuestionId) {
      return {
        success: false,
        error: 'Pertanyaan tidak dapat bergantung pada dirinya sendiri.',
      }
    }

    if (!PROMPT_CONDITIONAL_OPERATORS.has(operator)) {
      return {
        success: false,
        error: `Operator pada kondisi ke-${index + 1} belum valid.`,
      }
    }

    if (operator !== 'not_empty' && !comparisonValue) {
      return {
        success: false,
        error: `Nilai pada kondisi ke-${index + 1} wajib diisi.`,
      }
    }

    const duplicateKey = [
      parentQuestionId,
      operator,
      comparisonValue || '',
    ].join('::')

    if (duplicateKeys.has(duplicateKey)) {
      return {
        success: false,
        error: 'Kondisi yang sama tidak boleh ditambahkan lebih dari sekali.',
      }
    }

    duplicateKeys.add(duplicateKey)
    normalizedConditions.push({
      id: condition.id || null,
      question_id: normalizedQuestionId,
      parent_question_id: parentQuestionId,
      operator,
      comparison_value: comparisonValue,
      sort_order: index,
    })
  }

  const existingRows = existingResult.data || []
  const existingIds = new Set(existingRows.map((row) => row.id))
  const retainedIds = new Set()

  for (const condition of normalizedConditions.filter((row) => row.id)) {
    if (!existingIds.has(condition.id)) {
      return {
        success: false,
        error: 'Data kondisi sudah berubah. Muat ulang editor dan coba lagi.',
      }
    }

    const { error } = await supabase
      .from('prompt_tool_question_conditions')
      .update({
        parent_question_id: condition.parent_question_id,
        operator: condition.operator,
        comparison_value: condition.comparison_value,
        sort_order: condition.sort_order,
      })
      .eq('id', condition.id)
      .eq('question_id', normalizedQuestionId)

    if (error) {
      return {
        success: false,
        partial: true,
        error: 'Sebagian kondisi mungkin sudah berubah. Muat ulang editor sebelum mencoba lagi.',
      }
    }

    retainedIds.add(condition.id)
  }

  const newRows = normalizedConditions
    .filter((condition) => !condition.id)
    .map((condition) => ({
      question_id: condition.question_id,
      parent_question_id: condition.parent_question_id,
      operator: condition.operator,
      comparison_value: condition.comparison_value,
      sort_order: condition.sort_order,
    }))

  if (newRows.length > 0) {
    const { error } = await supabase
      .from('prompt_tool_question_conditions')
      .insert(newRows)

    if (error) {
      return {
        success: false,
        partial: true,
        error: 'Kondisi baru belum tersimpan seluruhnya. Muat ulang editor dan coba lagi.',
      }
    }
  }

  const staleIds = existingRows
    .filter((row) => !retainedIds.has(row.id))
    .map((row) => row.id)

  if (staleIds.length > 0) {
    const { error } = await supabase
      .from('prompt_tool_question_conditions')
      .delete()
      .in('id', staleIds)
      .eq('question_id', normalizedQuestionId)

    if (error) {
      return {
        success: false,
        partial: true,
        error: 'Kondisi lama belum dapat dibersihkan seluruhnya. Muat ulang editor.',
      }
    }
  }

  const firstCondition = normalizedConditions[0] || null
  const { error: questionUpdateError } = await supabase
    .from('prompt_tool_questions')
    .update({
      conditional_mode: conditionalMode,
      conditional_parent_question_id: firstCondition?.parent_question_id || null,
      conditional_operator: firstCondition?.operator || null,
      conditional_value: firstCondition
        ? firstCondition.comparison_value
        : null,
    })
    .eq('id', normalizedQuestionId)
    .eq('tool_id', normalizedToolId)

  if (questionUpdateError) {
    return {
      success: false,
      partial: true,
      error: 'Kondisi tersimpan, tetapi data kompatibilitas lama belum dapat diperbarui. Muat ulang editor.',
    }
  }

  const touchResult = await touchPromptTool(normalizedToolId)

  return {
    success: true,
    error: '',
    warning: touchResult.success ? '' : touchResult.error,
  }
}

const getQuestionConditionsForValidation = (
  question,
  conditionRows,
  questionsById,
) => {
  const storedConditions = conditionRows
    .filter((condition) => condition.question_id === question.id)
    .sort(comparePromptRows)

  if (storedConditions.length > 0) {
    return storedConditions
  }

  const legacyCondition = getLegacyPromptToolCondition(
    question,
    questionsById,
  )

  return legacyCondition ? [legacyCondition] : []
}

const getNullableSelectionLimit = (value) => {
  if (value === null || value === undefined || value === '') {
    return null
  }

  const numericValue = Number(value)

  return Number.isInteger(numericValue) ? numericValue : Number.NaN
}

export const validatePromptToolPublishData = ({
  tool,
  sections = [],
  questions,
  options,
  conditions = [],
}) => {
  const identityError = validatePromptDraft(tool || {})

  if (identityError) {
    return identityError
  }

  const questionRows = questions || []
  const optionRows = options || []

  if (questionRows.length === 0) {
    return 'Tambahkan minimal satu pertanyaan sebelum tool dipublikasikan.'
  }

  const questionsById = new Map(
    questionRows.map((question) => [question.id, question]),
  )
  const orderedQuestions = getOrderedPromptToolQuestions(
    sections,
    questionRows,
  )
  const orderByQuestionId = new Map(
    orderedQuestions.map((question, index) => [question.id, index]),
  )
  const variables = new Set()

  for (const question of questionRows) {
    const questionLabel = String(question.label || '').trim()
    const variableName = String(question.variable_name || '').trim()

    if (!questionLabel) {
      return 'Setiap pertanyaan wajib memiliki label.'
    }

    if (!PROMPT_VARIABLE_PATTERN.test(variableName)) {
      return `Variable name pada pertanyaan "${questionLabel}" belum valid.`
    }

    if (variables.has(variableName)) {
      return `Variable name "${variableName}" digunakan lebih dari sekali.`
    }

    variables.add(variableName)

    const questionOptions = optionRows.filter((option) => (
      option.question_id === question.id
    ))

    if (
      PROMPT_CHOICE_QUESTION_TYPES.includes(question.question_type)
      && questionOptions.length < 2
    ) {
      return `Pertanyaan "${questionLabel}" memerlukan minimal dua pilihan.`
    }

    const minSelections = getNullableSelectionLimit(
      question.min_selections,
    )
    const maxSelections = getNullableSelectionLimit(
      question.max_selections,
    )

    if (Number.isNaN(minSelections) || Number.isNaN(maxSelections)) {
      return `Batas pilihan pada "${questionLabel}" harus berupa bilangan bulat.`
    }

    if (
      minSelections !== null
      && minSelections < 0
    ) {
      return `Minimum pilihan pada "${questionLabel}" tidak boleh negatif.`
    }

    if (
      maxSelections !== null
      && maxSelections < 0
    ) {
      return `Maksimum pilihan pada "${questionLabel}" tidak boleh negatif.`
    }

    if (
      minSelections !== null
      && maxSelections !== null
      && minSelections > maxSelections
    ) {
      return `Minimum pilihan pada "${questionLabel}" tidak boleh melebihi maksimum.`
    }

    if (
      maxSelections !== null
      && maxSelections > questionOptions.length
    ) {
      return `Maksimum pilihan pada "${questionLabel}" melebihi jumlah pilihan tersedia.`
    }

    if (
      question.question_type === 'ranking'
      && maxSelections === 0
    ) {
      return `Maksimum pilihan pada "${questionLabel}" harus lebih dari 0.`
    }

    if (!['all', 'any'].includes(question.conditional_mode || 'all')) {
      return `Mode kondisi pada pertanyaan "${questionLabel}" belum valid.`
    }

    const questionConditions = getQuestionConditionsForValidation(
      question,
      conditions,
      questionsById,
    )
    const duplicateConditions = new Set()

    for (const condition of questionConditions) {
      const parentQuestion = questionsById.get(
        condition.parent_question_id,
      )

      if (!parentQuestion) {
        return `Pertanyaan induk untuk "${questionLabel}" tidak tersedia.`
      }

      if (parentQuestion.id === question.id) {
        return `Kondisi pada "${questionLabel}" tidak boleh menunjuk pertanyaan yang sama.`
      }

      const parentOrder = orderByQuestionId.get(parentQuestion.id)
      const childOrder = orderByQuestionId.get(question.id)

      if (
        parentOrder === undefined
        || childOrder === undefined
        || parentOrder >= childOrder
      ) {
        return `Kondisi pada "${questionLabel}" menunjuk pertanyaan yang muncul setelahnya.`
      }

      if (!PROMPT_CONDITIONAL_OPERATORS.has(condition.operator)) {
        return `Operator kondisional pada pertanyaan "${questionLabel}" belum valid.`
      }

      const comparisonValue = normalizeConditionValue(
        condition.operator,
        condition.comparison_value,
      )

      if (condition.operator !== 'not_empty' && !comparisonValue) {
        return `Nilai kondisional pada pertanyaan "${questionLabel}" wajib diisi.`
      }

      const duplicateKey = [
        condition.parent_question_id,
        condition.operator,
        comparisonValue || '',
      ].join('::')

      if (duplicateConditions.has(duplicateKey)) {
        return `Kondisi yang sama pada pertanyaan "${questionLabel}" tidak boleh diduplikasi.`
      }

      duplicateConditions.add(duplicateKey)
    }
  }

  const placeholderVariables = collectPromptTemplateVariables(
    tool?.prompt_template,
  )

  if (placeholderVariables.length === 0) {
    return 'Template prompt harus menggunakan minimal satu placeholder.'
  }

  const unknownVariables = Array.from(
    new Set(
      placeholderVariables.filter((variableName) => (
        !variables.has(variableName)
      )),
    ),
  )

  if (unknownVariables.length > 0) {
    const formattedVariables = unknownVariables
      .map((variableName) => `{{${variableName}}}`)
      .join(', ')

    return `Template menggunakan variabel yang belum tersedia: ${formattedVariables}`
  }

  const unsupportedFeatures = getUnsupportedPublicPromptToolFeatures(
    tool,
    questionRows,
    optionRows,
    conditions,
  )

  if (unsupportedFeatures.length > 0) {
    return PROMPT_TOOL_ADVANCED_PUBLIC_GUARD_MESSAGE
  }

  return ''
}

export const validatePromptToolPublish = async (
  toolId,
  toolOverride = null,
) => {
  const normalizedToolId = String(toolId || '').trim()

  if (!normalizedToolId) {
    return {
      success: false,
      error: 'Tool tidak valid.',
    }
  }

  const [toolResult, builderResult] = await Promise.all([
    supabase
      .from('prompt_tools')
      .select(`
        id,
        title,
        slug,
        description,
        category,
        prompt_template,
        submit_button_label,
        result_title,
        copy_button_label,
        survey_url,
        survey_cta,
        display_mode,
        show_progress,
        previous_button_label,
        next_button_label
      `)
      .eq('id', normalizedToolId)
      .maybeSingle(),
    loadPromptToolBuilderData(normalizedToolId),
  ])

  if (
    toolResult.error
    || !toolResult.data
    || !builderResult.success
  ) {
    return {
      success: false,
      error: 'Data tool belum dapat diperiksa. Silakan coba lagi.',
    }
  }

  const tool = {
    ...toolResult.data,
    ...(toolOverride || {}),
  }
  const validationError = validatePromptToolPublishData({
    tool,
    sections: builderResult.sections,
    questions: builderResult.questions,
    options: builderResult.options,
    conditions: builderResult.conditions,
  })

  if (validationError) {
    return {
      success: false,
      error: validationError,
      unsupportedFeatures: getUnsupportedPublicPromptToolFeatures(
        tool,
        builderResult.questions,
        builderResult.options,
        builderResult.conditions,
      ),
    }
  }

  return {
    success: true,
    error: '',
    tool,
    sections: builderResult.sections,
    questions: builderResult.questions,
    options: builderResult.options,
    conditions: builderResult.conditions,
    unsupportedFeatures: [],
  }
}
