import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  buildPromptFromTemplate,
  getSafePromptSurveyUrl,
  getVisiblePromptQuestions,
  validatePromptAnswers,
} from '../utils/promptTools'
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
      <rect
        width="14"
        height="14"
        x="8"
        y="8"
        rx="2"
        ry="2"
      />
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

const getQuestionInputId = (question) => {
  return `prompt-tool-question-${question.id}`
}

const getQuestionHelpId = (question) => {
  return `prompt-tool-question-${question.id}-help`
}

const getQuestionErrorId = (question) => {
  return `prompt-tool-question-${question.id}-error`
}

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

  const formRef = useRef(null)
  const resultRef = useRef(null)
  const fieldRefs = useRef({})
  const copyTimeoutRef = useRef(null)
  const startedTrackedRef = useRef(false)

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current)
      }
    }
  }, [])

  const optionsByQuestionId = useMemo(() => {
    const nextOptions = new Map()

    options.forEach((option) => {
      const currentOptions = (
        nextOptions.get(option.question_id) || []
      )

      nextOptions.set(
        option.question_id,
        [...currentOptions, option],
      )
    })

    return nextOptions
  }, [options])

  const visibleQuestions = useMemo(() => {
    return getVisiblePromptQuestions(
      questions,
      answers,
    )
  }, [answers, questions])

  const questionGroups = useMemo(() => {
    const knownSectionIds = new Set(
      sections.map((section) => section.id),
    )

    const unsectionedQuestions = visibleQuestions.filter(
      (question) => (
        !question.section_id
        || !knownSectionIds.has(question.section_id)
      ),
    )

    const groups = []

    if (unsectionedQuestions.length > 0) {
      groups.push({
        id: 'general',
        title: sections.length > 0
          ? 'Pertanyaan Umum'
          : '',
        description: '',
        questions: unsectionedQuestions,
      })
    }

    sections.forEach((section) => {
      const sectionQuestions = visibleQuestions.filter(
        (question) => (
          question.section_id === section.id
        ),
      )

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

  const safeSurveyUrl = getSafePromptSurveyUrl(
  tool?.survey_url,
)

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
    registerStartedEvent()
  }

  const updateCheckboxAnswer = (
    question,
    optionValue,
    checked,
  ) => {
    const currentValue = answers[question.variable_name]
    const selectedValues = Array.isArray(currentValue)
      ? currentValue
      : []

    const nextValues = checked
      ? Array.from(
        new Set([...selectedValues, optionValue]),
      )
      : selectedValues.filter(
        (value) => value !== optionValue,
      )

    updateAnswer(question, nextValues)
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
        'input, textarea, select',
      )

      if (focusableElement) {
        focusableElement.focus({
          preventScroll: true,
        })
      }
    })
  }

  const handleGeneratePrompt = (event) => {
    event.preventDefault()

    if (generating) {
      return
    }

    setGenerating(true)
    setCopyStatus('idle')

    const validationResult = validatePromptAnswers({
      questions,
      answers,
      optionsByQuestionId,
    })

    if (
      Object.keys(validationResult.errors).length > 0
    ) {
      setErrors(validationResult.errors)
      setGeneratedPrompt('')
      setGenerateError('')
      setGenerating(false)

      scrollToFirstError(
        validationResult.firstErrorVariableName,
      )

      return
    }

    const result = buildPromptFromTemplate({
    template: tool.prompt_template,
    questions,
    answers,
    visibleQuestions:
        validationResult.visibleQuestions,
    optionsByQuestionId,
    })

    if (result.error) {
      setErrors({})
      setGeneratedPrompt('')
      setGenerateError(result.error)
      setGenerating(false)
      return
    }

    setErrors({})
    setGenerateError('')
    setGeneratedPrompt(result.prompt)
    setGenerating(false)

    trackPromptToolEvent(
      'tool_generated',
      analyticsMetadata(
        validationResult.visibleQuestions.length,
      ),
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

      await navigator.clipboard.writeText(
        generatedPrompt,
      )

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

  const getDescribedBy = (question) => {
    const describedByIds = []

    if (question.help_text) {
      describedByIds.push(
        getQuestionHelpId(question),
      )
    }

    if (errors[question.variable_name]) {
      describedByIds.push(
        getQuestionErrorId(question),
      )
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
        <span
          className="ml-1 text-red-600"
          aria-label="wajib"
        >
          *
        </span>
      )}
    </>
  )

  const renderQuestionHelp = (question) => {
    if (!question.help_text) {
      return null
    }

    return (
      <p
        id={getQuestionHelpId(question)}
        className="mt-2 text-sm leading-6 text-slate-500"
      >
        {question.help_text}
      </p>
    )
  }

  const renderQuestionError = (question) => {
    const errorMessage = errors[
      question.variable_name
    ]

    if (!errorMessage) {
      return null
    }

    return (
      <p
        id={getQuestionErrorId(question)}
        className="mt-2 text-sm font-semibold text-red-600"
        role="alert"
      >
        {errorMessage}
      </p>
    )
  }

  const inputClassName = (
    'mt-3 w-full rounded-xl border border-slate-300 '
    + 'bg-white px-4 py-3 text-base text-slate-900 '
    + 'outline-none transition placeholder:text-slate-400 '
    + 'focus:border-green-600 focus:ring-2 '
    + 'focus:ring-green-100'
  )

  const renderQuestion = (question) => {
    const value = (
      answers[question.variable_name] ?? ''
    )

    const questionOptions = (
      optionsByQuestionId.get(question.id) || []
    )

    const inputId = getQuestionInputId(question)
    const describedBy = getDescribedBy(question)
    const hasError = Boolean(
      errors[question.variable_name],
    )

    const cardClassName = [
      'scroll-mt-24 rounded-2xl border bg-white p-5',
      'shadow-sm transition sm:p-6',
      hasError
        ? 'border-red-300'
        : 'border-slate-200',
    ].join(' ')

    if (
      question.question_type === 'single_choice'
      || question.question_type === 'checkbox'
    ) {
      const selectedValues = Array.isArray(value)
        ? value
        : []

      return (
        <fieldset
          key={question.id}
          ref={(element) => {
            fieldRefs.current[
              question.variable_name
            ] = element
          }}
          className={cardClassName}
          aria-describedby={describedBy}
          aria-invalid={hasError}
        >
          <legend className="w-full px-0 text-base leading-7">
            {renderQuestionLabel(question)}
          </legend>

          {renderQuestionHelp(question)}

          {questionOptions.length === 0 && (
            <p className="mt-4 text-sm text-amber-700">
              Pilihan jawaban belum tersedia.
            </p>
          )}

          <div className="mt-4 space-y-3">
            {questionOptions.map((option) => {
              const optionId = (
                `${inputId}-${option.id}`
              )

              const isCheckbox = (
                question.question_type === 'checkbox'
              )

              const checked = isCheckbox
                ? selectedValues.includes(
                  option.option_value,
                )
                : value === option.option_value

              return (
                <label
                  key={option.id}
                  htmlFor={optionId}
                  className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 px-4 py-3 text-sm leading-6 text-slate-700 transition hover:border-green-300 hover:bg-green-50"
                >
                  <input
                    id={optionId}
                    type={isCheckbox
                      ? 'checkbox'
                      : 'radio'}
                    name={`question-${question.id}`}
                    value={option.option_value}
                    checked={checked}
                    onChange={(event) => {
                      if (isCheckbox) {
                        updateCheckboxAnswer(
                          question,
                          option.option_value,
                          event.target.checked,
                        )
                      } else {
                        updateAnswer(
                          question,
                          option.option_value,
                        )
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

          {renderQuestionError(question)}
        </fieldset>
      )
    }

    return (
      <div
        key={question.id}
        ref={(element) => {
          fieldRefs.current[
            question.variable_name
          ] = element
        }}
        className={cardClassName}
      >
        <label
          htmlFor={inputId}
          className="block text-base leading-7"
        >
          {renderQuestionLabel(question)}
        </label>

        {renderQuestionHelp(question)}

        {question.question_type === 'paragraph' && (
          <textarea
            id={inputId}
            value={value}
            onChange={(event) => {
              updateAnswer(
                question,
                event.target.value,
              )
            }}
            placeholder={
              question.placeholder || ''
            }
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
            onChange={(event) => {
              updateAnswer(
                question,
                event.target.value,
              )
            }}
            className={inputClassName}
            aria-describedby={describedBy}
            aria-invalid={hasError}
          >
            <option value="">
              Pilih jawaban
            </option>

            {questionOptions.map((option) => (
              <option
                key={option.id}
                value={option.option_value}
              >
                {option.option_label}
              </option>
            ))}
          </select>
        )}

        {![
          'paragraph',
          'dropdown',
        ].includes(question.question_type) && (
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
            onChange={(event) => {
              updateAnswer(
                question,
                event.target.value,
              )
            }}
            placeholder={
              question.placeholder || ''
            }
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
            inputMode={
              question.question_type === 'phone'
                ? 'tel'
                : undefined
            }
            className={inputClassName}
            aria-describedby={describedBy}
            aria-invalid={hasError}
          />
        )}

        {renderQuestionError(question)}
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <form
        ref={formRef}
        onSubmit={handleGeneratePrompt}
        noValidate
        className="scroll-mt-24 space-y-8"
      >
        {questionGroups.map((group) => (
          <section
            key={group.id}
            className="space-y-4"
          >
            {(group.title || group.description) && (
              <div>
                {group.title && (
                  <h2 className="text-2xl font-black tracking-tight text-slate-950">
                    {group.title}
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
        ))}

        {questions.length === 0 && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-7 text-amber-800">
            Pertanyaan untuk tool ini belum tersedia.
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

        <button
          type="submit"
          disabled={
            generating || questions.length === 0
          }
          className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-green-700 px-6 py-3 text-base font-bold text-white transition hover:bg-green-800 focus:outline-none focus:ring-2 focus:ring-green-300 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-300 sm:w-auto"
        >
          {generating
            ? 'Membuat Prompt...'
            : (
              tool.submit_button_label
              || 'Buat Prompt'
            )}
        </button>
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
              {copyStatus === 'success'
                ? <CheckIcon />
                : <CopyIcon />}

              {copyStatus === 'success'
                ? 'Tersalin'
                : (
                  tool.copy_button_label
                  || 'Salin Prompt'
                )}
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
              copyStatus === 'error'
                ? 'text-red-600'
                : 'text-green-700',
            ].join(' ')}
            aria-live="polite"
          >
            {copyStatus === 'success'
              ? 'Prompt berhasil disalin.'
              : ''}

            {copyStatus === 'error'
              ? (
                'Prompt belum berhasil disalin. '
                + 'Silakan coba lagi.'
              )
              : ''}
          </p>

          {safeSurveyUrl && (
            <div className="mt-6 border-t border-slate-200 pt-6">
              <p className="text-sm leading-7 text-slate-600">
                Masukan Anda membantu kami meningkatkan
                kualitas tool ini.
              </p>

              <a
                href={safeSurveyUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={handleSurveyClick}
                className="mt-3 inline-flex min-h-11 items-center justify-center rounded-xl border border-green-200 bg-green-50 px-5 py-2.5 text-sm font-bold text-green-800 transition hover:border-green-400 hover:bg-green-100 focus:outline-none focus:ring-2 focus:ring-green-200 focus:ring-offset-2"
              >
                {String(tool.survey_cta || '').trim()
                  || (
                    'Bantu kami memperbaiki tool ini '
                    + 'melalui survei singkat.'
                  )}
              </a>
            </div>
          )}
        </section>
      )}
    </div>
  )
}

export default PromptToolPublicForm