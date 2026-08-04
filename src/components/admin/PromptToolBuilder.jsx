import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../supabase'
import { touchPromptTool } from '../../utils/promptTools'
import PromptToolQuestionEditor from './PromptToolQuestionEditor'
import PromptToolSectionEditor from './PromptToolSectionEditor'

const NEW_QUESTION_TEMPLATE = {
  label: '',
  variable_name: '',
  question_type: 'short_text',
  section_id: null,
  help_text: '',
  placeholder: '',
  is_required: false,
  validation_min: null,
  validation_max: null,
  conditional_parent_question_id: null,
  conditional_operator: null,
  conditional_value: null,
  options: [],
}

export default function PromptToolBuilder({
  toolId,
  readOnly,
  onToolChanged,
}) {
  const [sections, setSections] = useState([])
  const [questions, setQuestions] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeQuestionId, setActiveQuestionId] = useState(null)
  const [activeQuestionDraft, setActiveQuestionDraft] = useState(null)
  const [warningMessage, setWarningMessage] = useState('')

  const reload = useCallback(async () => {
    setLoading(true)

    const [sectionsResult, questionsResult] = await Promise.all([
      supabase
        .from('prompt_tool_sections')
        .select('*')
        .eq('tool_id', toolId)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true }),
      supabase
        .from('prompt_tool_questions')
        .select('*')
        .eq('tool_id', toolId)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true }),
    ])

    const questionRows = questionsResult.data || []
    const questionIds = questionRows.map((question) => question.id)
    let optionRows = []

    if (questionIds.length > 0) {
      const optionsResult = await supabase
        .from('prompt_tool_options')
        .select('*')
        .in('question_id', questionIds)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true })

      optionRows = optionsResult.data || []
    }

    setSections(sectionsResult.data || [])
    setQuestions(
      questionRows.map((question) => ({
        ...question,
        options: optionRows.filter((option) => (
          option.question_id === question.id
        )),
      })),
    )
    setLoading(false)
  }, [toolId])

  useEffect(() => {
    if (!toolId) return
    reload()
  }, [reload, toolId])

  const sectionsWithNo = useMemo(() => {
    const noSection = { id: null, title: 'Tanpa Bagian' }
    return [...sections, noSection]
  }, [sections])

  const markToolChanged = useCallback(async () => {
    const touchResult = await touchPromptTool(toolId)

    if (!touchResult.success) {
      setWarningMessage(touchResult.error)
    } else {
      setWarningMessage('')
    }

    onToolChanged?.(touchResult)
  }, [onToolChanged, toolId])

  const refreshAfterMutation = useCallback(async () => {
    await reload()
    await markToolChanged()
  }, [markToolChanged, reload])

  const openNewQuestion = (sectionId) => {
    setActiveQuestionId(null)
    setActiveQuestionDraft({
      ...NEW_QUESTION_TEMPLATE,
      section_id: sectionId ?? null,
    })
  }

  const openExistingQuestion = (questionId) => {
    setActiveQuestionDraft(null)
    setActiveQuestionId(questionId)
  }

  const closeEditor = async ({ changed = false } = {}) => {
    setActiveQuestionId(null)
    setActiveQuestionDraft(null)

    if (changed) {
      await refreshAfterMutation()
    } else {
      await reload()
    }
  }

  const getQuestionsBySection = (sectionId) => {
    return questions
      .filter((question) => question.section_id === sectionId)
      .sort((first, second) => (
        (first.sort_order || 0) - (second.sort_order || 0)
      ))
  }

  const getQuestionSiblingQuery = (sectionId) => {
    const query = supabase
      .from('prompt_tool_questions')
      .select('id, sort_order')
      .eq('tool_id', toolId)

    return sectionId === null
      ? query.is('section_id', null)
      : query.eq('section_id', sectionId)
  }

  const moveQuestion = async (question, direction) => {
    const { data: siblings, error: siblingsError } = await getQuestionSiblingQuery(
      question.section_id,
    )
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })

    if (siblingsError) {
      window.alert('Urutan pertanyaan belum dapat diperbarui.')
      return
    }

    const currentIndex = siblings.findIndex((item) => (
      item.id === question.id
    ))
    const targetIndex = direction === 'up'
      ? currentIndex - 1
      : currentIndex + 1

    if (
      currentIndex === -1
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
      window.alert('Urutan pertanyaan belum dapat diperbarui.')
      return
    }

    await refreshAfterMutation()
  }

  const deleteQuestion = async (question) => {
    if (!window.confirm('Hapus pertanyaan ini?')) return

    const { error } = await supabase
      .from('prompt_tool_questions')
      .delete()
      .eq('id', question.id)

    if (error) {
      window.alert('Pertanyaan belum dapat dihapus.')
      return
    }

    await refreshAfterMutation()
  }

  const createSection = async () => {
    const nextOrder = sections.length
      ? Math.max(...sections.map((section) => section.sort_order || 0)) + 1
      : 0

    const { error } = await supabase
      .from('prompt_tool_sections')
      .insert({
        tool_id: toolId,
        title: 'Bagian baru',
        description: '',
        sort_order: nextOrder,
      })

    if (error) {
      window.alert('Bagian baru belum dapat dibuat.')
      return
    }

    await refreshAfterMutation()
  }

  if (!toolId) {
    return (
      <div className="rounded-2xl border border-gray-100 bg-yellow-50 p-4 text-sm text-amber-800">
        Simpan tool terlebih dahulu sebelum menambahkan pertanyaan.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-black">Form & Pertanyaan</h2>
        <div className="text-sm text-gray-500">
          Sections: {sections.length} • Questions: {questions.length}
        </div>
      </div>

      {warningMessage && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          {warningMessage}
        </div>
      )}

      <div className="space-y-3">
        <button
          type="button"
          className="rounded-xl bg-gray-900 px-3 py-2 text-sm font-bold text-white disabled:opacity-50"
          onClick={createSection}
          disabled={readOnly}
        >
          + Tambah Bagian
        </button>

        <div className="rounded-2xl border border-gray-100 bg-white p-4">
          {loading ? (
            <div className="text-sm text-gray-400">Memuat builder...</div>
          ) : (
            sectionsWithNo.map((section) => (
              <div key={String(section.id)} className="mb-6">
                <PromptToolSectionEditor
                  section={section}
                  sections={sections}
                  questions={getQuestionsBySection(section.id)}
                  onChange={refreshAfterMutation}
                  onCreateQuestion={openNewQuestion}
                  readOnly={readOnly}
                />

                <div className="mt-3 space-y-3">
                  {getQuestionsBySection(section.id).map((question) => (
                    <div
                      key={question.id}
                      className="rounded-2xl border border-gray-200 bg-gray-50 p-4"
                    >
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2 text-sm font-bold text-gray-900">
                            <span>{question.label || '(Tanpa label)'}</span>
                            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                              {question.question_type}
                            </span>
                            {question.is_required && (
                              <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs text-rose-700">
                                Wajib
                              </span>
                            )}
                            {question.conditional_parent_question_id && (
                              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                                Kondisional
                              </span>
                            )}
                          </div>

                          <div className="text-xs text-gray-500">
                            {`{{${question.variable_name}}}`}
                            {['single_choice', 'dropdown', 'checkbox'].includes(
                              question.question_type,
                            )
                              ? ` • ${question.options?.length ?? 0} pilihan`
                              : ''}
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            className="rounded border px-3 py-1 text-xs"
                            onClick={() => openExistingQuestion(question.id)}
                            disabled={readOnly}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="rounded border px-3 py-1 text-xs"
                            onClick={() => moveQuestion(question, 'up')}
                            disabled={readOnly}
                          >
                            Naik
                          </button>
                          <button
                            type="button"
                            className="rounded border px-3 py-1 text-xs"
                            onClick={() => moveQuestion(question, 'down')}
                            disabled={readOnly}
                          >
                            Turun
                          </button>
                          <button
                            type="button"
                            className="rounded border px-3 py-1 text-xs text-red-700"
                            onClick={() => deleteQuestion(question)}
                            disabled={readOnly}
                          >
                            Hapus
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {(activeQuestionId || activeQuestionDraft) && (
        <div className="rounded-2xl border border-gray-100 bg-white p-4">
          <PromptToolQuestionEditor
            questionId={activeQuestionId}
            initialQuestion={activeQuestionDraft}
            toolId={toolId}
            sections={sectionsWithNo}
            questions={questions}
            onDone={closeEditor}
            onMutation={refreshAfterMutation}
            readOnly={readOnly}
          />
        </div>
      )}
    </div>
  )
}
