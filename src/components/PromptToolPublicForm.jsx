import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  buildPromptFromTemplate,
  getPromptSelectionLimits,
  getPromptToolPublicConfigurationError,
  getSafePromptSurveyUrl,
  getVisiblePromptQuestions,
  validatePromptAnswers,
} from '../utils/promptTools'
import {
  buildPromptToolFormData,
  buildPromptToolProcessingMetadata,
  buildPromptToolValidationNotes,
  evaluatePromptToolStructuredGates,
  replacePromptToolTemplatePlaceholders,
} from '../utils/promptToolStructuredOutput'
import {
  trackPromptToolEvent,
} from '../utils/promptToolAnalytics'

function CopyIcon({ className = 'h-5 w-5' }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </svg>
  )
}

function CheckIcon({ className = 'h-5 w-5' }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="m5 12 4 4L19 6" />
    </svg>
  )
}

const getQuestionInputId = (question) => (
  `prompt-tool-question-${question.id}`
)

const getQuestionHelpId = (question) => (
  `prompt-tool-question-${question.id}-help`
)

const getQuestionErrorId = (question) => (
  `prompt-tool-question-${question.id}-error`
)

const getQuestionCountId = (question) => (
  `prompt-tool-question-${question.id}-count`
)

const compareRows = (first, second) => {
  const orderDifference = Number(first?.sort_order || 0)
    - Number(second?.sort_order || 0)

  if (orderDifference !== 0) {
    return orderDifference
  }

  return String(first?.created_at || '').localeCompare(
    String(second?.created_at || ''),
  )
}

const compareOptions = (first, second) => {
  const groupOrderDifference = Number(first?.group_sort_order || 0)
    - Number(second?.group_sort_order || 0)

  if (groupOrderDifference !== 0) {
    return groupOrderDifference
  }

  const groupLabelDifference = String(first?.group_label || '')
    .localeCompare(String(second?.group_label || ''))

  if (groupLabelDifference !== 0) {
    return groupLabelDifference
  }

  return compareRows(first, second)
}

const groupOptions = (options = []) => {
  const groupsByKey = new Map()
  const sortedOptions = [...options].sort(compareOptions)

  sortedOptions.forEach((option) => {
    const label = String(option.group_label || '').trim()
    const order = Number(option.group_sort_order || 0)
    const key = `${order}::${label}`

    if (!groupsByKey.has(key)) {
      groupsByKey.set(key, {
        key,
        label,
        order,
        options: [],
      })
    }

    groupsByKey.get(key).options.push(option)
  })

  return Array.from(groupsByKey.values()).sort((first, second) => {
    const orderDifference = first.order - second.order

    if (orderDifference !== 0) {
      return orderDifference
    }

    return first.label.localeCompare(second.label)
  })
}

const getEmptyAnswer = (question) => (
  ['checkbox', 'ranking'].includes(question.question_type)
    ? []
    : ''
)

function PromptToolPublicForm({
  tool,
  sections = [],
  questions = [],
  options = [],
}) {
  const [answers, setAnswers] = useState({})
  const [errors, setErrors] = useState({})
  const [generatedPrompt, setGeneratedPrompt] = useState('')
  const [generateError, setGenerateError] = useState('')
  const [generating, setGenerating] = useState(false)
  const [copyStatus, setCopyStatus] = useState('idle')
  const [currentStep, setCurrentStep] = useState(0)

  const formRef = useRef(null)
  const resultRef = useRef(null)
  const stepHeadingRef = useRef(null)
  const fieldRefs = useRef({})
  const copyTimeoutRef = useRef(null)
  const startedTrackedRef = useRef(false)
  const focusStepAfterNavigationRef = useRef(false)

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current)
      }
    }
  }, [])

  const sourceOptions = useMemo(() => {
    if (options.length > 0) {
      return [...options].sort(compareOptions)
    }

    return questions
      .flatMap((question) => question.options || [])
      .sort(compareOptions)
  }, [options, questions])

  const optionsByQuestionId = useMemo(() => {
    const nextOptions = new Map()

    sourceOptions.forEach((option) => {
      const currentOptions = nextOptions.get(option.question_id) || []
      nextOptions.set(option.question_id, [...currentOptions, option])
    })

    return nextOptions
  }, [sourceOptions])

  const configurationError = useMemo(() => (
    getPromptToolPublicConfigurationError({
      tool,
      questions,
      optionsByQuestionId,
    })
  ), [optionsByQuestionId, questions, tool])

  const visibleQuestions = useMemo(() => (
    getVisiblePromptQuestions(questions, answers)
  ), [answers, questions])

  const visibleQuestionIds = useMemo(() => (
    new Set(visibleQuestions.map((question) => question.id))
  ), [visibleQuestions])

  useEffect(() => {
    setAnswers((currentAnswers) => {
      let changed = false
      const nextAnswers = { ...currentAnswers }

      questions.forEach((question) => {
        if (
          !visibleQuestionIds.has(question.id)
          && Object.prototype.hasOwnProperty.call(
            nextAnswers,
            question.variable_name,
          )
        ) {
          delete nextAnswers[question.variable_name]
          changed = true
        }
      })

      return changed ? nextAnswers : currentAnswers
    })

    setErrors((currentErrors) => {
      let changed = false
      const nextErrors = { ...currentErrors }

      questions.forEach((question) => {
        if (
          !visibleQuestionIds.has(question.id)
          && nextErrors[question.variable_name]
        ) {
          delete nextErrors[question.variable_name]
          changed = true
        }
      })

      return changed ? nextErrors : currentErrors
    })
  }, [questions, visibleQuestionIds])

  const questionGroups = useMemo(() => {
    const orderedSections = [...sections].sort(compareRows)
    const knownSectionIds = new Set(
      orderedSections.map((section) => section.id),
    )
    const groups = []
    const unsectionedQuestions = visibleQuestions
      .filter((question) => (
        !question.section_id
        || !knownSectionIds.has(question.section_id)
      ))
      .sort(compareRows)

    if (unsectionedQuestions.length > 0) {
      groups.push({
        id: 'general',
        title: sections.length > 0 ? 'Pertanyaan Umum' : '',
        description: '',
        questions: unsectionedQuestions,
      })
    }

    orderedSections.forEach((section) => {
      const sectionQuestions = visibleQuestions
        .filter((question) => question.section_id === section.id)
        .sort(compareRows)

      if (sectionQuestions.length === 0) {
        return
      }

      groups.push({
        id: section.id,
        title: section.title,
        description: section.description,
        questions: sectionQuestions,
      })
    })

    return groups
  }, [sections, visibleQuestions])

  const displayMode = tool?.display_mode === 'section_steps'
    ? 'section_steps'
    : 'single_page'
  const safeCurrentStep = Math.min(
    currentStep,
    Math.max(questionGroups.length - 1, 0),
  )
  const currentGroup = questionGroups[safeCurrentStep] || null

  useEffect(() => {
    setCurrentStep((previousStep) => Math.min(
      previousStep,
      Math.max(questionGroups.length - 1, 0),
    ))
  }, [questionGroups.length])

  useEffect(() => {
    if (!focusStepAfterNavigationRef.current) {
      return
    }

    focusStepAfterNavigationRef.current = false
    requestAnimationFrame(() => {
      stepHeadingRef.current?.focus({ preventScroll: true })
      stepHeadingRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
    })
  }, [safeCurrentStep])

  const safeSurveyUrl = getSafePromptSurveyUrl(tool?.survey_url)

  const analyticsMetadata = (visibleCount) => ({
    tool_id: tool.id,
    tool_slug: tool.slug,
    tool_category: tool.category || 'umum',
    question_count: questions.length,
    visible_question_count: visibleCount,
  })

  const clearQuestionError = (variableName) => {
    setErrors((currentErrors) => {
      if (!currentErrors[variableName]) {
        return currentErrors
      }

      const nextErrors = { ...currentErrors }
      delete nextErrors[variableName]
      return nextErrors
    })
  }

  const registerStartedEvent = () => {
    if (startedTrackedRef.current) {
      return
    }

    startedTrackedRef.current = true
    trackPromptToolEvent(
      'tool_started',
      analyticsMetadata(visibleQuestions.length),
    )
  }

  const updateAnswer = (question, value) => {
    setAnswers((currentAnswers) => ({
      ...currentAnswers,
      [question.variable_name]: value,
    }))

    clearQuestionError(question.variable_name)
    setGenerateError('')
    setGeneratedPrompt('')
    setCopyStatus('idle')
    registerStartedEvent()
  }

  const updateCheckboxAnswer = (question, option, checked) => {
    const questionOptions = optionsByQuestionId.get(question.id) || []
    const currentValue = answers[question.variable_name]
    const selectedValues = Array.isArray(currentValue) ? currentValue : []
    const exclusiveValues = new Set(
      questionOptions
        .filter((item) => item.is_exclusive === true)
        .map((item) => String(item.option_value)),
    )
    const optionValue = String(option.option_value)
    const { effectiveMax } = getPromptSelectionLimits({
      question,
      optionCount: questionOptions.length,
    })
    let nextValues

    if (!checked) {
      nextValues = selectedValues.filter((value) => (
        String(value) !== optionValue
      ))
    } else if (option.is_exclusive === true) {
      nextValues = [optionValue]
    } else {
      const regularValues = selectedValues.filter((value) => (
        !exclusiveValues.has(String(value))
      ))

      if (
        !regularValues.includes(optionValue)
        && regularValues.length >= effectiveMax
      ) {
        setErrors((currentErrors) => ({
          ...currentErrors,
          [question.variable_name]: (
            `Pilih maksimal ${effectiveMax} jawaban untuk “${question.label}”.`
          ),
        }))
        return
      }

      nextValues = Array.from(new Set([
        ...regularValues,
        optionValue,
      ]))
    }

    updateAnswer(question, nextValues)
  }

  const addRankingOption = (question, option) => {
    const questionOptions = optionsByQuestionId.get(question.id) || []
    const currentValue = answers[question.variable_name]
    const selectedValues = Array.isArray(currentValue) ? currentValue : []
    const exclusiveValues = new Set(
      questionOptions
        .filter((item) => item.is_exclusive === true)
        .map((item) => String(item.option_value)),
    )
    const optionValue = String(option.option_value)
    const { effectiveMax } = getPromptSelectionLimits({
      question,
      optionCount: questionOptions.length,
    })

    if (selectedValues.map(String).includes(optionValue)) {
      return
    }

    if (option.is_exclusive === true) {
      updateAnswer(question, [optionValue])
      return
    }

    const regularValues = selectedValues.filter((value) => (
      !exclusiveValues.has(String(value))
    ))

    if (regularValues.length >= effectiveMax) {
      setErrors((currentErrors) => ({
        ...currentErrors,
        [question.variable_name]: (
          `Pilih maksimal ${effectiveMax} jawaban untuk “${question.label}”.`
        ),
      }))
      return
    }

    updateAnswer(question, [...regularValues, optionValue])
  }

  const moveRankingOption = (question, currentIndex, direction) => {
    const currentValue = answers[question.variable_name]
    const selectedValues = Array.isArray(currentValue)
      ? [...currentValue]
      : []
    const targetIndex = currentIndex + direction

    if (targetIndex < 0 || targetIndex >= selectedValues.length) {
      return
    }

    const [movedValue] = selectedValues.splice(currentIndex, 1)
    selectedValues.splice(targetIndex, 0, movedValue)
    updateAnswer(question, selectedValues)
  }

  const removeRankingOption = (question, optionValue) => {
    const currentValue = answers[question.variable_name]
    const selectedValues = Array.isArray(currentValue) ? currentValue : []

    updateAnswer(
      question,
      selectedValues.filter((value) => (
        String(value) !== String(optionValue)
      )),
    )
  }

  const scrollToFirstError = (variableName) => {
    if (!variableName) {
      return
    }

    requestAnimationFrame(() => {
      const fieldElement = fieldRefs.current[variableName]

      if (!fieldElement) {
        return
      }

      fieldElement.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      })

      const focusableElement = fieldElement.querySelector(
        'input, textarea, select, button',
      )

      focusableElement?.focus({ preventScroll: true })
    })
  }

  const validateQuestionSet = (questionRows = null) => {
    const validationResult = validatePromptAnswers({
      questions,
      answers,
      optionsByQuestionId,
      questionIdsToValidate: questionRows
        ? questionRows.map((question) => question.id)
        : null,
    })

    if (Object.keys(validationResult.errors).length > 0) {
      setErrors(validationResult.errors)
      setGeneratedPrompt('')
      setGenerateError('')
      scrollToFirstError(
        validationResult.firstErrorVariableName,
      )
      return null
    }

    setErrors({})
    return validationResult
  }

  const handleNextStep = () => {
    if (!currentGroup) {
      return
    }

    const validationResult = validateQuestionSet(
      currentGroup.questions,
    )

    if (!validationResult) {
      return
    }

    focusStepAfterNavigationRef.current = true
    setCurrentStep((step) => Math.min(
      step + 1,
      questionGroups.length - 1,
    ))
  }

  const handlePreviousStep = () => {
    focusStepAfterNavigationRef.current = true
    setCurrentStep((step) => Math.max(0, step - 1))
  }

  const handleGeneratePrompt = (event) => {
    event.preventDefault()

    if (generating || configurationError) {
      return
    }

    setGenerating(true)
    setCopyStatus('idle')

    const validationResult = validateQuestionSet()

    if (!validationResult) {
      setGenerating(false)
      return
    }

    let result

    if (tool?.structured_output_enabled === true) {
      const gateResult = evaluatePromptToolStructuredGates({
        questions,
        answers,
        visibleQuestions: validationResult.visibleQuestions,
      })

      if (!gateResult.passed) {
        setGenerating(false)
        setGeneratedPrompt('')

        if (gateResult.reason === 'invalid_config') {
          setGenerateError(gateResult.message)
          return
        }

        if (gateResult.failedQuestion) {
          const failedQuestion = gateResult.failedQuestion
          setErrors((currentErrors) => ({
            ...currentErrors,
            [failedQuestion.variable_name]: gateResult.message,
          }))

          if (displayMode === 'section_steps') {
            const stepIndex = questionGroups.findIndex((group) => (
              group.questions.some((question) => question.id === failedQuestion.id)
            ))

            if (stepIndex !== -1) {
              focusStepAfterNavigationRef.current = true
              setCurrentStep(stepIndex)
            }
          }

          scrollToFirstError(failedQuestion.variable_name)
          return
        }

        setGenerateError(gateResult.message)
        return
      }

      const formData = buildPromptToolFormData(
        questions,
        answers,
        validationResult.visibleQuestions,
      )
      const validationNotes = buildPromptToolValidationNotes({ formData })
      const processingMetadata = buildPromptToolProcessingMetadata({
        tool,
        questions,
        acknowledgementPassed: true,
        consentConfigured: gateResult.consentConfigured,
        consentPassed: gateResult.consentPassed,
      })

      result = replacePromptToolTemplatePlaceholders({
        template: tool.prompt_template,
        formData,
        validationNotes,
        processingMetadata,
        questions,
        answers,
        visibleQuestions: validationResult.visibleQuestions,
        optionsByQuestionId,
      })
    } else {
      result = buildPromptFromTemplate({
        template: tool.prompt_template,
        questions,
        answers,
        visibleQuestions: validationResult.visibleQuestions,
        optionsByQuestionId,
      })
    }

    if (result.error) {
      setGeneratedPrompt('')
      setGenerateError(result.error)
      setGenerating(false)
      return
    }

    setGenerateError('')
    setGeneratedPrompt(result.prompt)
    setGenerating(false)

    trackPromptToolEvent(
      'tool_generated',
      analyticsMetadata(validationResult.visibleQuestions.length),
    )

    requestAnimationFrame(() => {
      resultRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
    })
  }

  const handleCopyPrompt = async () => {
    if (!generatedPrompt) {
      return
    }

    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error('Clipboard tidak tersedia.')
      }

      await navigator.clipboard.writeText(generatedPrompt)
      setCopyStatus('success')

      trackPromptToolEvent(
        'tool_copied',
        analyticsMetadata(visibleQuestions.length),
      )

      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current)
      }

      copyTimeoutRef.current = setTimeout(() => {
        setCopyStatus('idle')
      }, 1800)
    } catch {
      setCopyStatus('error')
    }
  }

  const handleEditAnswers = () => {
    formRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    })
  }

  const handleSurveyClick = () => {
    trackPromptToolEvent(
      'tool_survey_clicked',
      analyticsMetadata(visibleQuestions.length),
    )
  }

  const getDescribedBy = (question, includeCount = false) => {
    const describedByIds = []

    if (question.help_text) {
      describedByIds.push(getQuestionHelpId(question))
    }

    if (includeCount) {
      describedByIds.push(getQuestionCountId(question))
    }

    if (errors[question.variable_name]) {
      describedByIds.push(getQuestionErrorId(question))
    }

    return describedByIds.length > 0
      ? describedByIds.join(' ')
      : undefined
  }

  const renderQuestionLabel = (question) => (
    <>
      <span className="font-bold text-slate-900">
        {question.label}
      </span>

      {question.is_required && (
        <span className="ml-1 text-red-600" aria-label="wajib">
          *
        </span>
      )}
    </>
  )

  const renderQuestionHelp = (question) => (
    question.help_text
      ? (
        <p
          id={getQuestionHelpId(question)}
          className="mt-2 text-sm leading-6 text-slate-500"
        >
          {question.help_text}
        </p>
      )
      : null
  )

  const renderQuestionError = (question) => {
    const errorMessage = errors[question.variable_name]

    return errorMessage
      ? (
        <p
          id={getQuestionErrorId(question)}
          className="mt-2 text-sm font-semibold text-red-600"
          role="alert"
        >
          {errorMessage}
        </p>
      )
      : null
  }

  const inputClassName = (
    'mt-3 w-full rounded-xl border border-slate-300 '
    + 'bg-white px-4 py-3 text-base text-slate-900 '
    + 'outline-none transition placeholder:text-slate-400 '
    + 'focus:border-green-600 focus:ring-2 focus:ring-green-100'
  )

  const renderGroupedChoiceOptions = ({
    question,
    questionOptions,
    value,
    inputId,
    isCheckbox,
  }) => {
    const selectedValues = Array.isArray(value) ? value.map(String) : []
    const { effectiveMax } = getPromptSelectionLimits({
      question,
      optionCount: questionOptions.length,
    })
    const exclusiveValues = new Set(
      questionOptions
        .filter((option) => option.is_exclusive === true)
        .map((option) => String(option.option_value)),
    )
    const regularSelectedCount = selectedValues.filter((selectedValue) => (
      !exclusiveValues.has(selectedValue)
    )).length

    return groupOptions(questionOptions).map((group) => (
      <div key={group.key} className="space-y-3">
        {group.label && (
          <h3 className="text-sm font-extrabold text-slate-700">
            {group.label}
          </h3>
        )}

        <div className="space-y-3">
          {group.options.map((option) => {
            const optionId = `${inputId}-${option.id}`
            const optionValue = String(option.option_value)
            const checked = isCheckbox
              ? selectedValues.includes(optionValue)
              : String(value ?? '') === optionValue
            const maxReached = (
              isCheckbox
              && !checked
              && (
                option.is_exclusive === true
                  ? effectiveMax < 1
                  : regularSelectedCount >= effectiveMax
              )
            )

            return (
              <label
                key={option.id}
                htmlFor={optionId}
                className={[
                  'flex items-start gap-3 rounded-xl border px-4 py-3',
                  'text-sm leading-6 transition',
                  maxReached
                    ? 'cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400'
                    : 'cursor-pointer border-slate-200 text-slate-700 hover:border-green-300 hover:bg-green-50',
                ].join(' ')}
              >
                <input
                  id={optionId}
                  type={isCheckbox ? 'checkbox' : 'radio'}
                  name={`question-${question.id}`}
                  value={optionValue}
                  checked={checked}
                  disabled={maxReached}
                  onChange={(event) => {
                    if (isCheckbox) {
                      updateCheckboxAnswer(
                        question,
                        option,
                        event.target.checked,
                      )
                    } else {
                      updateAnswer(question, optionValue)
                    }
                  }}
                  className="mt-1 h-4 w-4 shrink-0 accent-green-700"
                />

                <span className="min-w-0 wrap-break-word">
                  {option.option_label}
                </span>
              </label>
            )
          })}
        </div>
      </div>
    ))
  }

  const renderRankingQuestion = ({
    question,
    questionOptions,
    value,
    inputId,
    cardClassName,
    hasError,
  }) => {
    const selectedValues = Array.isArray(value) ? value.map(String) : []
    const selectedValueSet = new Set(selectedValues)
    const selectedOptions = selectedValues
      .map((selectedValue) => questionOptions.find((option) => (
        String(option.option_value) === selectedValue
      )))
      .filter(Boolean)
    const availableOptions = questionOptions.filter((option) => (
      !selectedValueSet.has(String(option.option_value))
    ))
    const { effectiveMax } = getPromptSelectionLimits({
      question,
      optionCount: questionOptions.length,
    })
    const maxReached = selectedValues.length >= effectiveMax

    return (
      <fieldset
        key={question.id}
        ref={(element) => {
          fieldRefs.current[question.variable_name] = element
        }}
        className={cardClassName}
        aria-describedby={getDescribedBy(question, true)}
        aria-invalid={hasError}
      >
        <legend className="w-full px-0 text-base leading-7">
          {renderQuestionLabel(question)}
        </legend>

        {renderQuestionHelp(question)}

        <p
          id={getQuestionCountId(question)}
          className="mt-3 text-sm font-semibold text-slate-600"
        >
          {selectedValues.length} dari maksimal {effectiveMax} pilihan
        </p>

        <div className="mt-5 space-y-4">
          <div>
            <h3 className="text-sm font-extrabold text-slate-800">
              Pilihan tersedia
            </h3>

            {availableOptions.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">
                Semua pilihan sudah dimasukkan ke urutan prioritas.
              </p>
            ) : (
              <div className="mt-3 space-y-4">
                {groupOptions(availableOptions).map((group) => (
                  <div key={group.key} className="space-y-2">
                    {group.label && (
                      <h4 className="text-sm font-bold text-slate-600">
                        {group.label}
                      </h4>
                    )}

                    <div className="grid gap-2 sm:grid-cols-2">
                      {group.options.map((option) => {
                        const addDisabled = option.is_exclusive === true
                          ? effectiveMax < 1
                          : maxReached

                        return (
                          <button
                            key={option.id}
                            id={`${inputId}-add-${option.id}`}
                            type="button"
                            disabled={addDisabled}
                            onClick={() => addRankingOption(question, option)}
                            aria-label={`Tambahkan ${option.option_label} ke urutan prioritas`}
                            className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-left text-sm font-semibold text-slate-700 transition hover:border-green-400 hover:bg-green-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                          >
                            <span className="wrap-break-word">
                              {option.option_label}
                            </span>
                            <span aria-hidden="true">Tambahkan</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <h3 className="text-sm font-extrabold text-slate-800">
              Urutan prioritas
            </h3>

            {selectedOptions.length === 0 ? (
              <p className="mt-3 rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">
                Belum ada pilihan yang diurutkan.
              </p>
            ) : (
              <ol className="mt-3 space-y-3">
                {selectedOptions.map((option, index) => (
                  <li
                    key={option.id}
                    className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center"
                  >
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-green-700 text-sm font-black text-white">
                        {index + 1}
                      </span>
                      <span className="min-w-0 wrap-break-word text-sm font-semibold text-slate-800">
                        {option.option_label}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={index === 0}
                        onClick={() => moveRankingOption(question, index, -1)}
                        aria-label={`Naikkan ${option.option_label} ke urutan sebelumnya`}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 disabled:cursor-not-allowed disabled:text-slate-300"
                      >
                        Naik
                      </button>
                      <button
                        type="button"
                        disabled={index === selectedOptions.length - 1}
                        onClick={() => moveRankingOption(question, index, 1)}
                        aria-label={`Turunkan ${option.option_label} ke urutan berikutnya`}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 disabled:cursor-not-allowed disabled:text-slate-300"
                      >
                        Turun
                      </button>
                      <button
                        type="button"
                        onClick={() => removeRankingOption(
                          question,
                          option.option_value,
                        )}
                        aria-label={`Hapus ${option.option_label} dari urutan prioritas`}
                        className="rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-50"
                      >
                        Hapus
                      </button>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>

        {renderQuestionError(question)}
      </fieldset>
    )
  }

  const renderQuestion = (question) => {
    const value = answers[question.variable_name]
      ?? getEmptyAnswer(question)
    const questionOptions = optionsByQuestionId.get(question.id) || []
    const inputId = getQuestionInputId(question)
    const hasError = Boolean(errors[question.variable_name])
    const cardClassName = [
      'scroll-mt-24 rounded-2xl border bg-white p-5',
      'shadow-sm transition sm:p-6',
      hasError ? 'border-red-300' : 'border-slate-200',
    ].join(' ')

    if (question.question_type === 'ranking') {
      return renderRankingQuestion({
        question,
        questionOptions,
        value,
        inputId,
        cardClassName,
        hasError,
      })
    }

    if (
      question.question_type === 'single_choice'
      || question.question_type === 'checkbox'
    ) {
      const isCheckbox = question.question_type === 'checkbox'
      const selectedValues = Array.isArray(value) ? value : []
      const { effectiveMax } = getPromptSelectionLimits({
        question,
        optionCount: questionOptions.length,
      })

      return (
        <fieldset
          key={question.id}
          ref={(element) => {
            fieldRefs.current[question.variable_name] = element
          }}
          className={cardClassName}
          aria-describedby={getDescribedBy(question, isCheckbox)}
          aria-invalid={hasError}
        >
          <legend className="w-full px-0 text-base leading-7">
            {renderQuestionLabel(question)}
          </legend>

          {renderQuestionHelp(question)}

          {isCheckbox && (
            <p
              id={getQuestionCountId(question)}
              className="mt-3 text-sm font-semibold text-slate-600"
            >
              {selectedValues.length} dari maksimal {effectiveMax} pilihan
            </p>
          )}

          {questionOptions.length === 0 && (
            <p className="mt-4 text-sm text-amber-700">
              Pilihan jawaban belum tersedia.
            </p>
          )}

          <div className="mt-4 space-y-5">
            {renderGroupedChoiceOptions({
              question,
              questionOptions,
              value,
              inputId,
              isCheckbox,
            })}
          </div>

          {renderQuestionError(question)}
        </fieldset>
      )
    }

    const describedBy = getDescribedBy(question)

    return (
      <div
        key={question.id}
        ref={(element) => {
          fieldRefs.current[question.variable_name] = element
        }}
        className={cardClassName}
      >
        <label htmlFor={inputId} className="block text-base leading-7">
          {renderQuestionLabel(question)}
        </label>

        {renderQuestionHelp(question)}

        {question.question_type === 'paragraph' && (
          <textarea
            id={inputId}
            value={value}
            onChange={(event) => updateAnswer(question, event.target.value)}
            placeholder={question.placeholder || ''}
            rows={5}
            className={`${inputClassName} resize-y`}
            aria-describedby={describedBy}
            aria-invalid={hasError}
          />
        )}

        {question.question_type === 'dropdown' && (
          <select
            id={inputId}
            value={value}
            onChange={(event) => updateAnswer(question, event.target.value)}
            className={inputClassName}
            aria-describedby={describedBy}
            aria-invalid={hasError}
          >
            <option value="">Pilih jawaban</option>

            {groupOptions(questionOptions).map((group) => (
              group.label
                ? (
                  <optgroup key={group.key} label={group.label}>
                    {group.options.map((option) => (
                      <option key={option.id} value={option.option_value}>
                        {option.option_label}
                      </option>
                    ))}
                  </optgroup>
                )
                : group.options.map((option) => (
                  <option key={option.id} value={option.option_value}>
                    {option.option_label}
                  </option>
                ))
            ))}
          </select>
        )}

        {!['paragraph', 'dropdown'].includes(question.question_type) && (
          <input
            id={inputId}
            type={{
              short_text: 'text',
              number: 'number',
              email: 'email',
              phone: 'tel',
              date: 'date',
            }[question.question_type] || 'text'}
            value={value}
            onChange={(event) => updateAnswer(question, event.target.value)}
            placeholder={question.placeholder || ''}
            min={
              question.question_type === 'number'
              && question.validation_min !== null
              && question.validation_min !== undefined
                ? question.validation_min
                : undefined
            }
            max={
              question.question_type === 'number'
              && question.validation_max !== null
              && question.validation_max !== undefined
                ? question.validation_max
                : undefined
            }
            inputMode={question.question_type === 'phone' ? 'tel' : undefined}
            className={inputClassName}
            aria-describedby={describedBy}
            aria-invalid={hasError}
          />
        )}

        {renderQuestionError(question)}
      </div>
    )
  }

  const renderGroup = (group, isActiveStep = false) => (
    <section key={group.id} className="space-y-4">
      {(group.title || group.description || isActiveStep) && (
        <div
          ref={isActiveStep ? stepHeadingRef : undefined}
          tabIndex={isActiveStep ? -1 : undefined}
          className="scroll-mt-24 outline-none"
        >
          {group.title && (
            <h2 className="text-2xl font-black tracking-tight text-slate-950">
              {group.title}
            </h2>
          )}

          {!group.title && isActiveStep && (
            <h2 className="text-2xl font-black tracking-tight text-slate-950">
              Pertanyaan
            </h2>
          )}

          {group.description && (
            <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600">
              {group.description}
            </p>
          )}
        </div>
      )}

      <div className="space-y-4">
        {group.questions.map(renderQuestion)}
      </div>
    </section>
  )

  if (configurationError) {
    return (
      <div
        className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-7 text-amber-900"
        role="alert"
      >
        {configurationError}
      </div>
    )
  }

  const showEmptyState = questionGroups.length === 0
  const previousButtonLabel = String(
    tool?.previous_button_label || '',
  ).trim() || 'Sebelumnya'
  const nextButtonLabel = String(
    tool?.next_button_label || '',
  ).trim() || 'Berikutnya'
  const progressPercent = questionGroups.length > 0
    ? Math.round(((safeCurrentStep + 1) / questionGroups.length) * 100)
    : 0

  return (
    <div className="space-y-8">
      <form
        ref={formRef}
        onSubmit={handleGeneratePrompt}
        noValidate
        className="scroll-mt-24 space-y-8"
      >
        {displayMode === 'section_steps'
          && tool?.show_progress === true
          && questionGroups.length > 0 && (
            <div className="rounded-2xl border border-green-100 bg-green-50 p-4">
              <p className="text-sm font-bold text-green-900">
                Bagian {safeCurrentStep + 1} dari {questionGroups.length}
              </p>
              <div
                className="mt-3 h-2 overflow-hidden rounded-full bg-green-100"
                role="progressbar"
                aria-label={`Bagian ${safeCurrentStep + 1} dari ${questionGroups.length}`}
                aria-valuemin="0"
                aria-valuemax="100"
                aria-valuenow={progressPercent}
              >
                <div
                  className="h-full rounded-full bg-green-700 transition-all"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          )}

        {displayMode === 'single_page'
          ? questionGroups.map((group) => renderGroup(group))
          : currentGroup
            ? renderGroup(currentGroup, true)
            : null}

        {showEmptyState && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-7 text-amber-800">
            Form ini belum memiliki pertanyaan yang dapat ditampilkan.
          </div>
        )}

        {generateError && (
          <div
            className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold leading-6 text-red-700"
            role="alert"
          >
            {generateError}
          </div>
        )}

        {!showEmptyState && displayMode === 'section_steps' && (
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              {safeCurrentStep > 0 && (
                <button
                  type="button"
                  onClick={handlePreviousStep}
                  className="inline-flex min-h-12 w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-6 py-3 text-base font-bold text-slate-700 transition hover:border-green-600 hover:text-green-700 focus:outline-none focus:ring-2 focus:ring-green-200 focus:ring-offset-2 sm:w-auto"
                >
                  {previousButtonLabel}
                </button>
              )}
            </div>

            {safeCurrentStep < questionGroups.length - 1 ? (
              <button
                type="button"
                onClick={handleNextStep}
                className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-green-700 px-6 py-3 text-base font-bold text-white transition hover:bg-green-800 focus:outline-none focus:ring-2 focus:ring-green-300 focus:ring-offset-2 sm:w-auto"
              >
                {nextButtonLabel}
              </button>
            ) : (
              <button
                type="submit"
                disabled={generating}
                className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-green-700 px-6 py-3 text-base font-bold text-white transition hover:bg-green-800 focus:outline-none focus:ring-2 focus:ring-green-300 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-300 sm:w-auto"
              >
                {generating
                  ? 'Membuat Prompt...'
                  : tool.submit_button_label || 'Buat Prompt'}
              </button>
            )}
          </div>
        )}

        {!showEmptyState && displayMode === 'single_page' && (
          <button
            type="submit"
            disabled={generating}
            className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-green-700 px-6 py-3 text-base font-bold text-white transition hover:bg-green-800 focus:outline-none focus:ring-2 focus:ring-green-300 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-300 sm:w-auto"
          >
            {generating
              ? 'Membuat Prompt...'
              : tool.submit_button_label || 'Buat Prompt'}
          </button>
        )}
      </form>

      {generatedPrompt && (
        <section
          ref={resultRef}
          className="scroll-mt-24 rounded-3xl border border-green-200 bg-white p-5 shadow-sm sm:p-7"
          aria-labelledby="prompt-tool-result-title"
        >
          <p className="text-sm font-bold uppercase tracking-wide text-green-700">
            Hasil
          </p>

          <h2
            id="prompt-tool-result-title"
            className="mt-2 text-2xl font-black tracking-tight text-slate-950"
          >
            {tool.result_title || 'Prompt Siap Pakai'}
          </h2>

          <div className="mt-5 whitespace-pre-wrap wrap-break-word rounded-2xl border border-slate-200 bg-slate-50 p-5 font-mono text-sm leading-7 text-slate-800">
            {generatedPrompt}
          </div>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={handleCopyPrompt}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-green-700 px-5 py-3 text-sm font-bold text-white transition hover:bg-green-800 focus:outline-none focus:ring-2 focus:ring-green-300 focus:ring-offset-2"
            >
              {copyStatus === 'success' ? <CheckIcon /> : <CopyIcon />}
              {copyStatus === 'success'
                ? 'Tersalin'
                : tool.copy_button_label || 'Salin Prompt'}
            </button>

            <button
              type="button"
              onClick={handleEditAnswers}
              className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-bold text-slate-700 transition hover:border-green-600 hover:text-green-700 focus:outline-none focus:ring-2 focus:ring-green-200 focus:ring-offset-2"
            >
              Ubah Jawaban
            </button>
          </div>

          <p
            className={[
              'mt-3 min-h-6 text-sm font-semibold',
              copyStatus === 'error' ? 'text-red-600' : 'text-green-700',
            ].join(' ')}
            aria-live="polite"
          >
            {copyStatus === 'success' ? 'Prompt berhasil disalin.' : ''}
            {copyStatus === 'error'
              ? 'Prompt belum berhasil disalin. Silakan coba lagi.'
              : ''}
          </p>

          {safeSurveyUrl && (
            <div className="mt-6 border-t border-slate-200 pt-6">
              <p className="text-sm leading-7 text-slate-600">
                Masukan Anda membantu kami meningkatkan kualitas tool ini.
              </p>

              <a
                href={safeSurveyUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={handleSurveyClick}
                className="mt-3 inline-flex min-h-11 items-center justify-center rounded-xl border border-green-200 bg-green-50 px-5 py-2.5 text-sm font-bold text-green-800 transition hover:border-green-400 hover:bg-green-100 focus:outline-none focus:ring-2 focus:ring-green-200 focus:ring-offset-2"
              >
                {String(tool.survey_cta || '').trim()
                  || 'Bantu kami memperbaiki tool ini melalui survei singkat.'}
              </a>
            </div>
          )}
        </section>
      )}
    </div>
  )
}

export default PromptToolPublicForm
