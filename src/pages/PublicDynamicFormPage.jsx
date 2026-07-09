import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../supabase'
import { formatAnswerValue, shouldShowQuestion } from '../utils/dynamicForms'

const DEFAULT_FORM_THEME = {
  primaryColor: '#3f51b5',
  backgroundColor: '#c8cdec',
  headerFont: 'Lexend',
  questionFont: 'Roboto',
  bodyFont: 'Comfortaa',
  headerSize: 30,
  questionSize: 16,
  bodySize: 14,
  headerImageUrl: '',
  leftAdImageUrl: '',
  leftAdImageUrl2: '',
  rightAdImageUrl: '',
  rightAdImageUrl2: '',
  leftAdLink: '',
  leftAdLink2: '',
  rightAdLink: '',
  rightAdLink2: ''
}

function normalizeTheme(rawTheme) {
  return {
    ...DEFAULT_FORM_THEME,
    ...(rawTheme && typeof rawTheme === 'object' ? rawTheme : {})
  }
}

function fontStyle(font, size) {
  return {
    fontFamily: `${font}, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`,
    fontSize: `${Number(size) || 14}px`
  }
}

function normalizeExternalUrl(url) {
  const value = String(url || '').trim()
  if (!value) return ''
  if (/^(https?:)?\/\//i.test(value) || /^(mailto:|tel:)/i.test(value)) return value
  return `https://${value}`
}

function PublicDynamicFormPage() {
  const { slug } = useParams()
  const [form, setForm] = useState(null)
  const [sections, setSections] = useState([])
  const [questions, setQuestions] = useState([])
  const [options, setOptions] = useState([])
  const [answers, setAnswers] = useState({})
  const [currentSectionIndex, setCurrentSectionIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [errorText, setErrorText] = useState('')

  const theme = useMemo(() => normalizeTheme(form?.theme_json), [form?.theme_json])

  const optionsByQuestion = useMemo(() => {
    return (options || []).reduce((acc, option) => {
      const key = option.question_id
      if (!acc[key]) acc[key] = []
      acc[key].push(option)
      return acc
    }, {})
  }, [options])

  const visibleQuestions = useMemo(() => {
    return questions.filter((question) => shouldShowQuestion(question, answers))
  }, [questions, answers])

  const visibleSections = useMemo(() => {
    return sections
      .map((section, index) => ({
        ...section,
        sectionNumber: index + 1,
        questions: visibleQuestions.filter((question) => question.section_id === section.id)
      }))
      .filter((section) => section.questions.length > 0)
  }, [sections, visibleQuestions])

  const currentSection = visibleSections[currentSectionIndex] || visibleSections[0]
  const progressPercent = visibleSections.length > 0 ? Math.round(((currentSectionIndex + 1) / visibleSections.length) * 100) : 0

  useEffect(() => {
    let active = true

    const loadForm = async () => {
      setLoading(true)
      setErrorText('')

      const { data: formData, error: formError } = await supabase
        .from('forms')
        .select('*')
        .eq('slug', slug)
        .eq('status', 'active')
        .is('deleted_at', null)
        .maybeSingle()

      if (!active) return

      if (formError || !formData) {
        setForm(null)
        setErrorText('Formulir tidak ditemukan, belum aktif, atau sudah ditutup.')
        setLoading(false)
        return
      }

      const [{ data: sectionRows }, { data: questionRows }, { data: optionRows }] = await Promise.all([
        supabase.from('form_sections').select('*').eq('form_id', formData.id).order('sort_order', { ascending: true }),
        supabase.from('form_questions').select('*').eq('form_id', formData.id).order('sort_order', { ascending: true }),
        supabase.from('form_options').select('*').eq('form_id', formData.id).order('sort_order', { ascending: true })
      ])

      if (!active) return

      setForm({ ...formData, theme_json: normalizeTheme(formData.theme_json) })
      setSections(sectionRows || [])
      setQuestions(questionRows || [])
      setOptions(optionRows || [])
      setLoading(false)
    }

    loadForm()

    return () => {
      active = false
    }
  }, [slug])

  useEffect(() => {
    if (currentSectionIndex > Math.max(visibleSections.length - 1, 0)) {
      setCurrentSectionIndex(Math.max(visibleSections.length - 1, 0))
    }
  }, [currentSectionIndex, visibleSections.length])

  const updateAnswer = (question, value) => {
    setAnswers((current) => ({ ...current, [question.id]: value }))
  }

  const updateCheckboxAnswer = (question, optionValue, checked) => {
    setAnswers((current) => {
      const existing = Array.isArray(current[question.id]) ? current[question.id] : []
      const next = checked ? Array.from(new Set([...existing, optionValue])) : existing.filter((item) => item !== optionValue)
      return { ...current, [question.id]: next }
    })
  }

  const inputBaseStyle = {
    ...fontStyle(theme.bodyFont, theme.bodySize),
    '--focus-color': theme.primaryColor
  }

  const inputBaseClass = 'mt-3 w-full border-0 border-b border-gray-300 bg-transparent px-0 py-2 text-gray-900 outline-none transition focus:ring-0'

  const renderQuestionInput = (question) => {
    const value = answers[question.id] ?? ''
    const questionOptions = optionsByQuestion[question.id] || []

    if (question.question_type === 'paragraph') {
      return (
        <textarea
          value={value}
          onChange={(event) => updateAnswer(question, event.target.value)}
          placeholder={question.placeholder || 'Jawaban Anda'}
          rows={4}
          className="mt-3 w-full resize-y rounded-md border border-gray-200 bg-white px-3 py-3 text-gray-900 outline-none transition focus:ring-2"
          style={{ ...inputBaseStyle, borderColor: '#e5e7eb' }}
        />
      )
    }

    if (question.question_type === 'single_choice') {
      return (
        <div className="mt-4 space-y-3">
          {questionOptions.map((option) => (
            <label key={option.id} className="flex cursor-pointer items-center gap-3 text-gray-700 transition hover:text-gray-950" style={fontStyle(theme.bodyFont, theme.bodySize)}>
              <span className="relative flex h-5 w-5 shrink-0 items-center justify-center">
                <input
                  type="radio"
                  name={question.id}
                  value={option.option_value}
                  checked={value === option.option_value}
                  onChange={() => updateAnswer(question, option.option_value)}
                  className="peer h-5 w-5 appearance-none rounded-full border-2 border-gray-400 transition"
                  style={{ borderColor: value === option.option_value ? theme.primaryColor : undefined }}
                />
                <span className="pointer-events-none absolute h-2.5 w-2.5 scale-0 rounded-full transition peer-checked:scale-100" style={{ backgroundColor: theme.primaryColor }} />
              </span>
              <span className="min-w-0 break-words">{option.option_label}</span>
            </label>
          ))}
        </div>
      )
    }

    if (question.question_type === 'dropdown') {
      return (
        <select
          value={value}
          onChange={(event) => updateAnswer(question, event.target.value)}
          className="mt-3 w-full rounded-md border border-gray-300 bg-white px-3 py-2.5 text-gray-800 outline-none transition focus:ring-2"
          style={inputBaseStyle}
        >
          <option value="">Pilih jawaban</option>
          {questionOptions.map((option) => <option key={option.id} value={option.option_value}>{option.option_label}</option>)}
        </select>
      )
    }

    if (question.question_type === 'checkbox') {
      const selected = Array.isArray(answers[question.id]) ? answers[question.id] : []
      return (
        <div className="mt-4 space-y-3">
          {questionOptions.map((option) => (
            <label key={option.id} className="flex cursor-pointer items-center gap-3 text-gray-700 transition hover:text-gray-950" style={fontStyle(theme.bodyFont, theme.bodySize)}>
              <input
                type="checkbox"
                checked={selected.includes(option.option_value)}
                onChange={(event) => updateCheckboxAnswer(question, option.option_value, event.target.checked)}
                className="h-5 w-5 shrink-0 rounded border-gray-400"
                style={{ accentColor: theme.primaryColor }}
              />
              <span className="min-w-0 break-words">{option.option_label}</span>
            </label>
          ))}
        </div>
      )
    }

    const typeMap = {
      number: 'number',
      email: 'email',
      phone: 'tel',
      date: 'date',
      short_text: 'text'
    }

    return (
      <input
        type={typeMap[question.question_type] || 'text'}
        value={value}
        onChange={(event) => updateAnswer(question, event.target.value)}
        placeholder={question.placeholder || 'Jawaban Anda'}
        className={inputBaseClass}
        style={inputBaseStyle}
      />
    )
  }

  const validateQuestions = (targetQuestions) => {
    for (const question of targetQuestions) {
      if (!question.is_required) continue
      const value = answers[question.id]
      const isEmpty = Array.isArray(value) ? value.length === 0 : String(value || '').trim() === ''
      if (isEmpty) return question.label
    }
    return null
  }

  const handleSubmit = async () => {
    const missing = validateQuestions(visibleQuestions)
    if (missing) {
      alert(`Mohon isi pertanyaan wajib: ${missing}`)
      return
    }

    setSubmitting(true)

    const readableAnswers = visibleQuestions.reduce((acc, question) => {
      acc[question.id] = {
        label: question.label,
        type: question.question_type,
        value: answers[question.id] ?? (question.question_type === 'checkbox' ? [] : '')
      }
      return acc
    }, {})

    const { error } = await supabase
      .from('form_responses')
      .insert({
        form_id: form.id,
        answers_json: readableAnswers,
        respondent_meta: {
          source: 'public_form',
          user_agent: navigator.userAgent,
          submitted_slug: slug
        }
      })

    if (error) alert('Gagal mengirim formulir: ' + error.message)
    else {
      setSubmitted(true)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }

    setSubmitting(false)
  }

  const goNext = async () => {
    const missing = validateQuestions(currentSection?.questions || [])
    if (missing) {
      alert(`Mohon isi pertanyaan wajib: ${missing}`)
      return
    }

    if (currentSectionIndex >= visibleSections.length - 1) {
      await handleSubmit()
      return
    }

    setCurrentSectionIndex((value) => value + 1)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const goBack = () => {
    setCurrentSectionIndex((value) => Math.max(value - 1, 0))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  if (loading) return <PublicStateShell theme={theme} title="Memuat formulir..." spinner />

  if (submitted) {
    return (
      <PublicStateShell theme={theme} title="Respons Anda telah direkam." text="Terima kasih. Jawaban sudah masuk ke pemilik formulir.">
        <button
          type="button"
          onClick={() => {
            setAnswers({})
            setCurrentSectionIndex(0)
            setSubmitted(false)
            window.scrollTo({ top: 0, behavior: 'smooth' })
          }}
          className="mt-6 rounded-md px-5 py-2.5 text-sm font-semibold text-white transition brightness-95 hover:brightness-90"
          style={{ backgroundColor: theme.primaryColor }}
        >
          Kirim respons lain
        </button>
      </PublicStateShell>
    )
  }

  if (errorText) {
    return (
      <PublicStateShell theme={theme} title="Formulir tidak tersedia" text={errorText}>
        <Link to="/" className="mt-6 inline-flex rounded-md border border-gray-300 px-5 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50">
          Kembali ke GreenroomID
        </Link>
      </PublicStateShell>
    )
  }

  return (
    <div className="min-h-screen px-3 py-6 transition-colors duration-300 sm:px-4 sm:py-8" style={{ backgroundColor: theme.backgroundColor }}>
      <FormCanvas theme={theme}>
      <div className="mx-auto max-w-3xl">
        <div className="mb-3 overflow-hidden rounded-lg bg-white shadow-sm">
          <div className="h-2" style={{ backgroundColor: theme.primaryColor }} />
          {currentSectionIndex === 0 && theme.headerImageUrl && <HeaderImage src={theme.headerImageUrl} alt="Header formulir" />}
          <div className="px-6 py-6 sm:px-8">
            <h1 className="break-words font-semibold leading-tight text-gray-900" style={fontStyle(theme.headerFont, theme.headerSize)}>{form.title}</h1>
            {currentSectionIndex === 0 && form.description && <p className="mt-4 whitespace-pre-line break-words leading-6 text-gray-700" style={fontStyle(theme.bodyFont, theme.bodySize)}>{form.description}</p>}
            {currentSectionIndex === 0 && <div className="mt-5 border-t border-gray-200 pt-4 text-xs font-medium text-red-600">* Menunjukkan pertanyaan yang wajib diisi</div>}
          </div>
        </div>

        {visibleSections.length > 1 && (
          <div className="mb-3 rounded-lg bg-white px-6 py-4 shadow-sm sm:px-8">
            <div className="mb-2 flex items-center justify-between text-xs font-medium text-gray-600">
              <span>Bagian {currentSectionIndex + 1} dari {visibleSections.length}</span>
              <span>{progressPercent}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-gray-100">
              <div className="h-full rounded-full transition-all duration-500 ease-out" style={{ width: `${progressPercent}%`, backgroundColor: theme.primaryColor }} />
            </div>
          </div>
        )}

        {currentSection ? (
          <section className="mb-3 overflow-hidden rounded-lg bg-white shadow-sm transition-all duration-300">
            <div className="px-6 py-5 text-white sm:px-8" style={{ backgroundColor: theme.primaryColor }}>
              <p className="text-xs font-semibold uppercase tracking-wide opacity-80">Bagian {currentSectionIndex + 1} dari {visibleSections.length || 1}</p>
              <h2 className="mt-1 break-words text-xl font-semibold">{currentSection.title}</h2>
              {currentSection.description && <p className="mt-2 whitespace-pre-line break-words leading-6 opacity-90" style={fontStyle(theme.bodyFont, theme.bodySize)}>{currentSection.description}</p>}
            </div>
          </section>
        ) : null}

        <div className="space-y-3">
          {(currentSection?.questions || []).map((question) => (
            <div key={question.id} className="rounded-lg bg-white px-6 py-5 shadow-sm transition-all duration-300 hover:shadow-md sm:px-8">
              <label className="block break-words font-medium leading-6 text-gray-900" style={fontStyle(theme.questionFont, theme.questionSize)}>
                {question.label}
                {question.is_required && <span className="ml-1 text-red-600">*</span>}
              </label>
              {question.helper_text && <p className="mt-2 whitespace-pre-line break-words leading-5 text-gray-500" style={fontStyle(theme.bodyFont, Math.max(Number(theme.bodySize) - 1, 10))}>{question.helper_text}</p>}
              {renderQuestionInput(question)}
            </div>
          ))}
        </div>

        {visibleQuestions.length > 0 && currentSectionIndex === visibleSections.length - 1 && (
          <div className="mt-3 rounded-lg bg-white px-6 py-5 shadow-sm sm:px-8">
            <h2 className="mb-3 text-base font-semibold text-gray-900">Periksa jawaban sebelum dikirim</h2>
            <div className="max-h-64 overflow-y-auto rounded-md border border-gray-200">
              {visibleQuestions.map((question) => (
                <div key={question.id} className="border-b border-gray-100 px-4 py-3 last:border-b-0">
                  <p className="break-words text-xs font-medium text-gray-500">{question.label}</p>
                  <p className="mt-1 break-words text-sm text-gray-900">{formatAnswerValue(answers[question.id])}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mb-12 mt-4 flex items-center justify-between">
          <button
            type="button"
            onClick={goBack}
            disabled={currentSectionIndex === 0 || submitting}
            className="rounded-md px-5 py-2.5 text-sm font-semibold transition hover:bg-white/60 disabled:cursor-not-allowed disabled:text-gray-400"
            style={{ color: theme.primaryColor }}
          >
            Kembali
          </button>
          <button
            type="button"
            onClick={goNext}
            disabled={submitting || visibleQuestions.length === 0}
            className="rounded-md px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition brightness-95 hover:brightness-90 disabled:cursor-not-allowed disabled:bg-gray-300"
            style={{ backgroundColor: submitting || visibleQuestions.length === 0 ? '#d1d5db' : theme.primaryColor }}
          >
            {submitting ? 'Mengirim...' : currentSectionIndex >= visibleSections.length - 1 ? 'Kirim' : 'Berikutnya'}
          </button>
        </div>
      </div>
      </FormCanvas>
    </div>
  )
}

function HeaderImage({ src, alt }) {
  return (
    <div className="w-full overflow-hidden rounded-b-none bg-white">
      <div className="flex h-28 w-full items-center justify-center overflow-hidden bg-white sm:h-36">
        <img
          src={src}
          alt={alt}
          className="h-full w-full object-contain object-center"
        />
      </div>
    </div>
  )
}

function PublicStateShell({ theme, title, text, spinner, children }) {
  return (
    <div className="min-h-screen px-4 py-12" style={{ backgroundColor: theme.backgroundColor }}>
      <FormCanvas theme={theme}>
      <div className="mx-auto max-w-3xl overflow-hidden rounded-lg bg-white shadow-sm">
        <div className="h-2" style={{ backgroundColor: theme.primaryColor }} />
        <div className="p-8 text-center">
          {spinner && <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-gray-200" style={{ borderTopColor: theme.primaryColor }} />}
          <h1 className="mb-2 break-words text-xl font-semibold text-gray-900">{title}</h1>
          {text && <p className="break-words text-sm text-gray-600">{text}</p>}
          {children}
        </div>
      </div>
      </FormCanvas>
    </div>
  )
}

function FormCanvas({ theme, children }) {
  const hasAds = theme.leftAdImageUrl || theme.leftAdImageUrl2 || theme.rightAdImageUrl || theme.rightAdImageUrl2
  if (!hasAds) return <div className="mx-auto w-full max-w-3xl">{children}</div>

  return (
    <div className="mx-auto grid max-w-7xl grid-cols-1 gap-6 xl:grid-cols-[180px_minmax(0,768px)_180px] 2xl:grid-cols-[220px_minmax(0,768px)_220px] xl:items-start xl:justify-center">
      <FormAdColumn theme={theme} side="left" />
      <div className="min-w-0">{children}</div>
      <FormAdColumn theme={theme} side="right" />
    </div>
  )
}

function FormAdColumn({ theme, side }) {
  const slots = side === 'left'
    ? [
      { image: theme.leftAdImageUrl, link: theme.leftAdLink, label: 'Iklan kiri 1' },
      { image: theme.leftAdImageUrl2, link: theme.leftAdLink2, label: 'Iklan kiri 2' }
    ]
    : [
      { image: theme.rightAdImageUrl, link: theme.rightAdLink, label: 'Iklan kanan 1' },
      { image: theme.rightAdImageUrl2, link: theme.rightAdLink2, label: 'Iklan kanan 2' }
    ]

  const visibleSlots = slots.filter((slot) => slot.image)
  if (visibleSlots.length === 0) return <div className="hidden xl:block" />

  return (
    <aside className="hidden space-y-5 xl:sticky xl:top-8 xl:block">
      {visibleSlots.map((slot, index) => <SideAdCard key={`${side}-${index}`} slot={slot} />)}
    </aside>
  )
}

function SideAdCard({ slot }) {
  const href = normalizeExternalUrl(slot.link)
  const card = (
    <div className="group flex aspect-[4/5] w-full items-center justify-center overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-black/10 transition duration-200 hover:shadow-md">
      <img src={slot.image} alt={slot.label} className="h-full w-full object-cover transition duration-200 group-hover:scale-[1.015]" />
    </div>
  )

  if (href) return <a href={href} target="_blank" rel="noreferrer" className="block">{card}</a>
  return card
}

export default PublicDynamicFormPage
