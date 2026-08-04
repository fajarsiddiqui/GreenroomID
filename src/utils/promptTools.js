export const PROMPT_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

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

const PROMPT_TEMPLATE_PLACEHOLDER_PATTERN = /{{\s*([^{}]+?)\s*}}/g

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
    if (!/^(https?:)?\/\//i.test(url)) {
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