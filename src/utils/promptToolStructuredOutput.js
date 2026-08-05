import { formatPromptAnswerValue } from './promptTools'

const DANGEROUS_PATH_SEGMENTS = new Set([
  '__proto__',
  'prototype',
  'constructor',
])

export const isDangerousPathSegment = (segment) => {
  return DANGEROUS_PATH_SEGMENTS.has(
    String(segment || '').toLowerCase().trim(),
  )
}

export const isValidStructuredPath = (path) => {
  const normalizedPath = String(path || '').trim()

  if (!normalizedPath) {
    return false
  }

  if (!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/.test(normalizedPath)) {
    return false
  }

  const segments = normalizedPath.split('.')
  return !segments.some(isDangerousPathSegment)
}

const isPlainObject = (value) => {
  return (
    value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
  )
}

export const safeSetNestedProperty = (targetObj, dotPath, value) => {
  if (!isPlainObject(targetObj)) {
    return false
  }

  const segments = String(dotPath || '').trim().split('.')

  if (segments.length === 0 || segments.some(isDangerousPathSegment)) {
    return false
  }

  let current = targetObj

  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index]

    if (!Object.prototype.hasOwnProperty.call(current, segment)) {
      current[segment] = {}
    } else if (!isPlainObject(current[segment])) {
      return false
    }

    current = current[segment]
  }

  const lastSegment = segments[segments.length - 1]

  if (
    Object.prototype.hasOwnProperty.call(current, lastSegment)
    && isPlainObject(current[lastSegment])
    && Object.keys(current[lastSegment]).length > 0
  ) {
    return false
  }

  current[lastSegment] = value
  return true
}

export const buildPromptToolFormData = (
  questions = [],
  answers = {},
  visibleQuestions = [],
) => {
  const formData = {}
  const visibleQuestionIds = new Set(
    (visibleQuestions || []).map((question) => question.id),
  )

  const formDataQuestions = (questions || []).filter((question) => {
    const scope = String(question?.structured_scope || 'form_data').trim()
    const path = String(question?.structured_path || '').trim()
    return scope === 'form_data' && path.length > 0
  })

  formDataQuestions.forEach((question) => {
    const path = String(question.structured_path).trim()

    if (!isValidStructuredPath(path)) {
      return
    }

    const isVisible = visibleQuestionIds.has(question.id)
    const rawAnswer = answers?.[question.variable_name]
    let formattedValue = null

    if (isVisible && rawAnswer !== undefined && rawAnswer !== null) {
      const type = question.question_type

      if (
        ['short_text', 'paragraph', 'email', 'phone', 'date'].includes(type)
      ) {
        const trimmed = String(rawAnswer).trim()
        formattedValue = trimmed || null
      } else if (type === 'number') {
        const rawString = String(rawAnswer).trim()

        if (rawString !== '') {
          const numericValue = Number(rawString)

          if (Number.isFinite(numericValue)) {
            formattedValue = numericValue
          }
        }
      } else if (['single_choice', 'dropdown'].includes(type)) {
        const trimmed = String(rawAnswer).trim()
        formattedValue = trimmed || null
      } else if (['checkbox', 'ranking'].includes(type)) {
        const list = Array.isArray(rawAnswer)
          ? rawAnswer.map((item) => String(item ?? '').trim()).filter(Boolean)
          : []
        formattedValue = list.length > 0 ? list : null
      } else {
        const trimmed = String(rawAnswer).trim()
        formattedValue = trimmed || null
      }
    }

    safeSetNestedProperty(formData, path, formattedValue)
  })

  return formData
}

const countNullFieldsInFormData = (formDataObj) => {
  let count = 0

  const traverse = (node) => {
    if (node === null) {
      count += 1
      return
    }

    if (isPlainObject(node)) {
      Object.values(node).forEach(traverse)
    }
  }

  traverse(formDataObj)
  return count
}

export const buildPromptToolValidationNotes = ({
  formData = {},
}) => {
  const notes = [
    {
      code: 'CLIENT_SIDE_PROMPT_ONLY',
      severity: 'information',
      field: null,
      message: (
        'Data hanya disusun menjadi prompt di browser. Validasi schema backend, validasi lintasjawaban, dan deidentifikasi otomatis belum dilakukan.'
      ),
    },
  ]

  const nullCount = countNullFieldsInFormData(formData)

  if (nullCount > 0) {
    notes.push({
      code: 'UNANSWERED_OR_NOT_APPLICABLE_FIELDS',
      severity: 'information',
      field: null,
      message: `Terdapat ${nullCount} field yang tidak dijawab, belum ditampilkan, atau tidak relevan.`,
    })
  }

  return notes.slice(0, 30)
}

export const evaluatePromptToolStructuredGates = ({
  questions = [],
  answers = {},
  visibleQuestions = [],
}) => {
  const visibleQuestionIds = new Set(
    (visibleQuestions || []).map((question) => question.id),
  )

  const acknowledgementQuestions = questions.filter((question) => (
    String(question?.structured_scope || '').trim() === 'acknowledgement'
  ))

  for (const question of acknowledgementQuestions) {
    if (!visibleQuestionIds.has(question.id)) {
      return {
        passed: false,
        failedQuestion: question,
        reason: 'invalid_config',
        message: (
          'Konfigurasi output terstruktur tool ini perlu diperbaiki oleh pengelola.'
        ),
      }
    }

    const passValue = String(question.structured_pass_value || '').trim()
    const rawAnswer = answers?.[question.variable_name]
    let isPassed = false

    if (['single_choice', 'dropdown'].includes(question.question_type)) {
      isPassed = String(rawAnswer ?? '').trim() === passValue
    } else if (question.question_type === 'checkbox') {
      const selectedList = Array.isArray(rawAnswer) ? rawAnswer : []
      isPassed = selectedList.some((val) => String(val).trim() === passValue)
    }

    if (!isPassed) {
      return {
        passed: false,
        failedQuestion: question,
        reason: 'failed',
        message: 'Lengkapi seluruh pernyataan pemahaman sebelum membuat prompt.',
      }
    }
  }

  const consentQuestions = questions.filter((question) => (
    String(question?.structured_scope || '').trim() === 'consent'
  ))

  if (consentQuestions.length > 1) {
    return {
      passed: false,
      failedQuestion: consentQuestions[1],
      reason: 'invalid_config',
      message: (
        'Konfigurasi output terstruktur tool ini perlu diperbaiki oleh pengelola.'
      ),
    }
  }

  const consentQuestion = consentQuestions[0] || null

  if (consentQuestion) {
    if (!visibleQuestionIds.has(consentQuestion.id)) {
      return {
        passed: false,
        failedQuestion: consentQuestion,
        reason: 'invalid_config',
        message: (
          'Konfigurasi output terstruktur tool ini perlu diperbaiki oleh pengelola.'
        ),
      }
    }

    const passValue = String(consentQuestion.structured_pass_value || '').trim()
    const rawAnswer = answers?.[consentQuestion.variable_name]
    let isPassed = false

    if (
      ['single_choice', 'dropdown'].includes(consentQuestion.question_type)
    ) {
      isPassed = String(rawAnswer ?? '').trim() === passValue
    } else if (consentQuestion.question_type === 'checkbox') {
      const selectedList = Array.isArray(rawAnswer) ? rawAnswer : []
      isPassed = selectedList.some((val) => String(val).trim() === passValue)
    }

    if (!isPassed) {
      return {
        passed: false,
        failedQuestion: consentQuestion,
        reason: 'failed',
        message: 'Persetujuan yang diperlukan belum diberikan. Prompt belum dibuat.',
      }
    }
  }

  return {
    passed: true,
    failedQuestion: null,
    reason: '',
    message: '',
    acknowledgementCount: acknowledgementQuestions.length,
    consentConfigured: Boolean(consentQuestion),
    consentPassed: consentQuestion ? true : null,
  }
}

export const buildPromptToolProcessingMetadata = ({
  tool,
  questions = [],
  acknowledgementPassed = true,
  consentConfigured = false,
  consentPassed = null,
}) => {
  const acknowledgementCount = questions.filter((question) => (
    String(question?.structured_scope || '').trim() === 'acknowledgement'
  )).length

  return {
    processing_mode: 'browser_prompt_only',
    schema_version: String(tool?.structured_schema_version ?? ''),
    prompt_version: String(tool?.structured_prompt_version ?? ''),
    validation_rules_version: String(
      tool?.structured_validation_rules_version ?? '',
    ),
    pipeline_version: String(tool?.structured_pipeline_version ?? ''),
    deidentification_policy_version: String(
      tool?.structured_deidentification_policy_version ?? '',
    ),
    processed_at: new Date().toISOString(),
    scope_filtering_completed: true,
    acknowledgements_configured: acknowledgementCount,
    acknowledgements_passed: Boolean(acknowledgementPassed),
    consent_gate_configured: Boolean(consentConfigured),
    consent_gate_passed: consentConfigured ? Boolean(consentPassed) : null,
    form_schema_validated: false,
    cross_validation_completed: false,
    deidentification_completed: false,
    external_ai_request_sent: false,
  }
}

const TEMPLATE_PLACEHOLDER_PATTERN = /{{\s*([^{}]+?)\s*}}/g

export const replacePromptToolTemplatePlaceholders = ({
  template = '',
  formData = {},
  validationNotes = [],
  processingMetadata = {},
  questions = [],
  answers = {},
  visibleQuestions = [],
  optionsByQuestionId = new Map(),
}) => {
  const rawTemplate = String(template || '')

  if (!rawTemplate.trim()) {
    return {
      prompt: '',
      error: 'Template tool belum lengkap. Silakan hubungi pengelola.',
    }
  }

  const questionsByVariableName = new Map(
    (questions || []).map((question) => [question.variable_name, question]),
  )
  const visibleQuestionIds = new Set(
    (visibleQuestions || []).map((question) => question.id),
  )

  let unknownFound = false

  const promptResult = rawTemplate.replace(
    TEMPLATE_PLACEHOLDER_PATTERN,
    (_match, rawToken) => {
      const token = String(rawToken).trim()

      if (token === 'FORM_DATA_JSON') {
        return JSON.stringify(formData, null, 2)
      }

      if (token === 'VALIDATION_NOTES') {
        return JSON.stringify(validationNotes, null, 2)
      }

      if (token === 'PROCESSING_METADATA') {
        return JSON.stringify(processingMetadata, null, 2)
      }

      const question = questionsByVariableName.get(token)

      if (!question) {
        unknownFound = true
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

  if (unknownFound) {
    return {
      prompt: '',
      error: 'Template tool belum lengkap. Silakan hubungi pengelola.',
    }
  }

  return {
    prompt: promptResult.trim(),
    error: '',
  }
}
