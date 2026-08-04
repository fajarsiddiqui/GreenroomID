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
}

export const PROMPT_CHOICE_QUESTION_TYPES = [
  'single_choice',
  'dropdown',
  'checkbox',
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

export const validatePromptToolPublishData = ({
  tool,
  questions,
  options,
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

    if (
      PROMPT_CHOICE_QUESTION_TYPES.includes(
        question.question_type,
      )
    ) {
      const questionOptions = optionRows.filter((option) => (
        option.question_id === question.id
      ))

      if (questionOptions.length < 2) {
        return `Pertanyaan "${questionLabel}" memerlukan minimal dua pilihan.`
      }
    }

    if (question.conditional_parent_question_id) {
      const parentQuestion = questionsById.get(
        question.conditional_parent_question_id,
      )

      if (!parentQuestion) {
        return `Pertanyaan induk untuk "${questionLabel}" tidak tersedia.`
      }

      if (
        !PROMPT_CONDITIONAL_OPERATORS.has(
          question.conditional_operator,
        )
      ) {
        return `Operator kondisional pada pertanyaan "${questionLabel}" belum valid.`
      }

      if (
        question.conditional_operator !== 'not_empty'
        && !String(question.conditional_value || '').trim()
      ) {
        return `Nilai kondisional pada pertanyaan "${questionLabel}" wajib diisi.`
      }
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

  const [toolResult, questionsResult] = await Promise.all([
    toolOverride
      ? Promise.resolve({ data: toolOverride, error: null })
      : supabase
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
          survey_cta
        `)
        .eq('id', normalizedToolId)
        .maybeSingle(),
    supabase
      .from('prompt_tool_questions')
      .select(`
        id,
        tool_id,
        label,
        variable_name,
        question_type,
        conditional_parent_question_id,
        conditional_operator,
        conditional_value
      `)
      .eq('tool_id', normalizedToolId),
  ])

  if (toolResult.error || questionsResult.error || !toolResult.data) {
    return {
      success: false,
      error: 'Data tool belum dapat diperiksa. Silakan coba lagi.',
    }
  }

  const questions = questionsResult.data || []
  const questionIds = questions.map((question) => question.id)
  let options = []

  if (questionIds.length > 0) {
    const optionsResult = await supabase
      .from('prompt_tool_options')
      .select('id, question_id, option_label, option_value')
      .in('question_id', questionIds)

    if (optionsResult.error) {
      return {
        success: false,
        error: 'Pilihan jawaban belum dapat diperiksa. Silakan coba lagi.',
      }
    }

    options = optionsResult.data || []
  }

  const validationError = validatePromptToolPublishData({
    tool: toolResult.data,
    questions,
    options,
  })

  if (validationError) {
    return {
      success: false,
      error: validationError,
    }
  }

  return {
    success: true,
    error: '',
    tool: toolResult.data,
    questions,
    options,
  }
}
