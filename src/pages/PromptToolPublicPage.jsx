import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import PromptToolPublicForm from '../components/PromptToolPublicForm'
import PublicFooter from '../components/PublicFooter'
import { supabase } from '../supabase'
import { applyPageHeadMeta } from '../utils/headMeta'
import {
  getVisiblePromptQuestions,
  isValidPromptSlug,
} from '../utils/promptTools'
import { trackPromptToolEvent } from '../utils/promptToolAnalytics'
import NotFoundPage from './NotFoundPage'

function PromptToolPublicPage() {
  const { slug } = useParams()

  const [tool, setTool] = useState(null)
  const [sections, setSections] = useState([])
  const [questions, setQuestions] = useState([])
  const [options, setOptions] = useState([])

  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  const viewedToolIdRef = useRef('')

  useEffect(() => {
    let active = true
    let cleanupMeta = () => {}

    const fetchTool = async () => {
      setLoading(true)
      setNotFound(false)
      setErrorMessage('')
      setTool(null)
      setSections([])
      setQuestions([])
      setOptions([])

      if (!isValidPromptSlug(slug)) {
        if (active) {
          setNotFound(true)
          setLoading(false)
        }

        return
      }

      const { data: toolData, error: toolError } = await supabase
        .from('prompt_tools')
        .select(`
          id,
          title,
          slug,
          description,
          category,
          status,
          prompt_template,
          submit_button_label,
          result_title,
          copy_button_label,
          survey_url,
          survey_cta,
          display_mode,
          show_progress,
          previous_button_label,
          next_button_label,
          meta_title,
          meta_description,
          published_at,
          updated_at,
          structured_output_enabled,
          structured_schema_version,
          structured_prompt_version,
          structured_validation_rules_version,
          structured_pipeline_version,
          structured_deidentification_policy_version
        `)
        .eq('slug', slug)
        .eq('status', 'published')
        .maybeSingle()

      if (!active) return

      if (toolError) {
        setErrorMessage(
          'Tool belum dapat dimuat. Silakan coba lagi.',
        )
        setLoading(false)
        return
      }

      if (!toolData) {
        setNotFound(true)
        setLoading(false)
        return
      }

      const [sectionsResult, questionsResult] = await Promise.all([
        supabase
          .from('prompt_tool_sections')
          .select(`
            id,
            tool_id,
            title,
            description,
            sort_order,
            created_at
          `)
          .eq('tool_id', toolData.id)
          .order('sort_order', {
            ascending: true,
          })
          .order('created_at', {
            ascending: true,
          }),

        supabase
          .from('prompt_tool_questions')
          .select(`
            id,
            tool_id,
            section_id,
            variable_name,
            label,
            help_text,
            placeholder,
            question_type,
            is_required,
            validation_type,
            validation_min,
            validation_max,
            min_selections,
            max_selections,
            conditional_mode,
            sort_order,
            conditional_parent_question_id,
            conditional_operator,
            conditional_value,
            structured_scope,
            structured_path,
            structured_pass_value,
            created_at
          `)
          .eq('tool_id', toolData.id)
          .order('sort_order', {
            ascending: true,
          })
          .order('created_at', {
            ascending: true,
          }),
      ])

      if (!active) return

      if (sectionsResult.error || questionsResult.error) {
        setErrorMessage(
          'Form tool belum dapat dimuat. Silakan coba lagi.',
        )
        setLoading(false)
        return
      }

      const sectionRows = sectionsResult.data || []
      const questionRows = questionsResult.data || []
      const questionIds = questionRows.map(
        (question) => question.id,
      )

      let optionRows = []
      let conditionRows = []

      if (questionIds.length > 0) {
        const [optionsResult, conditionsResult] = await Promise.all([
          supabase
            .from('prompt_tool_options')
            .select(`
              id,
              question_id,
              option_label,
              option_value,
              sort_order,
              is_exclusive,
              group_label,
              group_sort_order,
              created_at
            `)
            .in('question_id', questionIds)
            .order('group_sort_order', {
              ascending: true,
            })
            .order('group_label', {
              ascending: true,
            })
            .order('sort_order', {
              ascending: true,
            })
            .order('created_at', {
              ascending: true,
            }),
          supabase
            .from('prompt_tool_question_conditions')
            .select(`
              id,
              question_id,
              parent_question_id,
              operator,
              comparison_value,
              sort_order,
              created_at
            `)
            .in('question_id', questionIds)
            .order('sort_order', {
              ascending: true,
            })
            .order('created_at', {
              ascending: true,
            }),
        ])

        if (!active) return

        if (optionsResult.error || conditionsResult.error) {
          setErrorMessage(
            'Konfigurasi form belum dapat dimuat. Silakan coba lagi.',
          )
          setLoading(false)
          return
        }

        optionRows = optionsResult.data || []
        conditionRows = conditionsResult.data || []
      }

      const questionsById = new Map(
        questionRows.map((question) => [question.id, question]),
      )
      const normalizedQuestions = questionRows.map((question) => {
        const storedConditions = conditionRows.filter((condition) => (
          condition.question_id === question.id
        ))
        const legacyParentId = String(
          question.conditional_parent_question_id || '',
        ).trim()
        const legacyOperator = String(
          question.conditional_operator || '',
        ).trim()
        const hasValidLegacyCondition = (
          storedConditions.length === 0
          && legacyParentId
          && questionsById.has(legacyParentId)
          && [
            'equals',
            'not_equals',
            'contains',
            'not_empty',
          ].includes(legacyOperator)
        )
        const legacyCondition = hasValidLegacyCondition
          ? {
            id: null,
            question_id: question.id,
            parent_question_id: legacyParentId,
            operator: legacyOperator,
            comparison_value: legacyOperator === 'not_empty'
              ? null
              : question.conditional_value,
            sort_order: 0,
            created_at: question.created_at || '',
            legacy: true,
          }
          : null

        return {
          ...question,
          conditional_mode: question.conditional_mode || 'all',
          min_selections: question.min_selections ?? null,
          max_selections: question.max_selections ?? null,
          options: optionRows.filter((option) => (
            option.question_id === question.id
          )),
          conditions: legacyCondition
            ? [legacyCondition]
            : storedConditions,
        }
      })

      const pageTitle = (
        String(toolData.meta_title || '').trim()
        || `${toolData.title} | GreenroomID`
      )

      const pageDescription = (
        String(toolData.meta_description || '').trim()
        || String(toolData.description || '').trim()
        || 'Gunakan tool gratis GreenroomID untuk menghasilkan prompt siap pakai.'
      )

      const canonicalUrl = (
        `https://www.greenroomid.com/tools/${toolData.slug}`
      )

      cleanupMeta = applyPageHeadMeta({
        title: pageTitle,
        description: pageDescription,
        canonicalUrl,
        robots: 'index, follow',
        ogTitle: pageTitle,
        ogDescription: pageDescription,
        ogUrl: canonicalUrl,
        ogType: 'website',
        twitterTitle: pageTitle,
        twitterDescription: pageDescription,
      })

      setTool(toolData)
      setSections(sectionRows)
      setQuestions(normalizedQuestions)
      setOptions(optionRows)
      setLoading(false)

      if (viewedToolIdRef.current !== toolData.id) {
        viewedToolIdRef.current = toolData.id

        const visibleQuestionCount = (
          getVisiblePromptQuestions(
            normalizedQuestions,
            {},
          ).length
        )

        trackPromptToolEvent('tool_view', {
          tool_id: toolData.id,
          tool_slug: toolData.slug,
          tool_category: toolData.category || 'umum',
          question_count: questionRows.length,
          visible_question_count: visibleQuestionCount,
        })
      }
    }

    fetchTool()

    return () => {
      active = false
      cleanupMeta()
    }
  }, [reloadKey, slug])

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 px-5 py-12 sm:px-6">
        <div
          className="mx-auto max-w-4xl space-y-5"
          role="status"
          aria-live="polite"
          aria-label="Memuat tool"
        >
          <div className="h-4 w-40 animate-pulse rounded bg-slate-200" />
          <div className="h-12 w-4/5 animate-pulse rounded bg-slate-200" />
          <div className="h-5 w-2/3 animate-pulse rounded bg-slate-200" />

          <div className="space-y-4 pt-8">
            {[0, 1, 2].map((item) => (
              <div
                key={item}
                className="h-40 animate-pulse rounded-2xl border border-slate-200 bg-white"
              />
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (errorMessage) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900">
        <main className="px-5 py-14 sm:px-6">
          <div className="mx-auto max-w-3xl rounded-3xl border border-red-100 bg-white p-6 shadow-sm sm:p-8">
            <p className="text-sm font-bold uppercase tracking-wide text-red-700">
              Tools Gratis
            </p>

            <h1 className="mt-3 text-3xl font-black tracking-tight">
              Tool belum dapat dibuka
            </h1>

            <p
              className="mt-4 text-base leading-7 text-slate-600"
              role="alert"
            >
              {errorMessage}
            </p>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => {
                  setReloadKey((value) => value + 1)
                }}
                className="inline-flex min-h-11 items-center justify-center rounded-xl bg-green-700 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-green-800 focus:outline-none focus:ring-2 focus:ring-green-300 focus:ring-offset-2"
              >
                Coba Lagi
              </button>

              <Link
                to="/tools"
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-bold text-slate-700 transition hover:border-green-600 hover:text-green-700 focus:outline-none focus:ring-2 focus:ring-green-200 focus:ring-offset-2"
              >
                Kembali ke Tools Gratis
              </Link>
            </div>
          </div>
        </main>

        <PublicFooter />
      </div>
    )
  }

  if (notFound || !tool) {
    return <NotFoundPage />
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <main>
        <section className="border-b border-slate-200 bg-white px-5 py-10 sm:px-6 sm:py-14">
          <div className="mx-auto max-w-4xl">
            <nav
              className="flex flex-wrap items-center gap-2 text-sm text-slate-500"
              aria-label="Breadcrumb"
            >
              <Link
                to="/"
                className="transition hover:text-green-700"
              >
                Beranda
              </Link>

              <span aria-hidden="true">/</span>

              <Link
                to="/tools"
                className="transition hover:text-green-700"
              >
                Tools Gratis
              </Link>

              <span aria-hidden="true">/</span>

              <span className="text-slate-700">
                {tool.title}
              </span>
            </nav>

            <p className="mt-8 text-sm font-bold uppercase tracking-wide text-green-700">
              {tool.category || 'Umum'}
            </p>

            <h1 className="mt-3 wrap-break-word text-4xl font-black tracking-tight text-slate-950 sm:text-5xl">
              {tool.title}
            </h1>

            {tool.description && (
              <p className="mt-5 max-w-3xl wrap-break-word text-base leading-8 text-slate-600 sm:text-lg">
                {tool.description}
              </p>
            )}

            <div className="mt-6 rounded-2xl border border-green-100 bg-green-50 p-4 text-sm leading-7 text-green-900">
              Jawaban Anda hanya diproses sementara di browser.
              Jawaban dan prompt hasil tidak disimpan oleh
              GreenroomID.
            </div>
          </div>
        </section>

        <section className="px-5 py-10 sm:px-6 sm:py-12">
          <div className="mx-auto max-w-4xl">
            <PromptToolPublicForm
              tool={tool}
              sections={sections}
              questions={questions}
              options={options}
            />
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  )
}

export default PromptToolPublicPage