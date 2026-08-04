import { useCallback, useEffect, useMemo, useState } from 'react'
import PromptToolSectionEditor from './PromptToolSectionEditor'
import PromptToolQuestionEditor from './PromptToolQuestionEditor'
import { supabase } from '../../supabase'

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
  options: []
}

export default function PromptToolBuilder({ toolId, readOnly, onToolChanged }) {
  const [sections, setSections] = useState([])
  const [questions, setQuestions] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeQuestionId, setActiveQuestionId] = useState(null)
  const [activeQuestionDraft, setActiveQuestionDraft] = useState(null)

  const reload = useCallback(async () => {
    setLoading(true)
    const { data: s } = await supabase.from('prompt_tool_sections').select('*').eq('tool_id', toolId).order('sort_order', { ascending: true }).order('created_at', { ascending: true })
    const { data: q } = await supabase.from('prompt_tool_questions').select('*').eq('tool_id', toolId).order('sort_order', { ascending: true }).order('created_at', { ascending: true })
    const qIds = (q || []).map((x) => x.id)
    const { data: o } = qIds.length ? await supabase.from('prompt_tool_options').select('*').in('question_id', qIds).order('sort_order', { ascending: true }).order('created_at', { ascending: true }) : { data: [] }

    setSections(s || [])
    setQuestions((q || []).map((qq) => ({ ...qq, options: (o || []).filter((opt) => opt.question_id === qq.id) })))
    setLoading(false)
  }, [toolId])

  useEffect(() => { if (!toolId) return; reload(); }, [toolId, reload])

  const sectionsWithNo = useMemo(() => {
    const noSection = { id: null, title: 'Tanpa Bagian' }
    return [ ...sections, noSection ]
  }, [sections])

  const handleSectionChange = () => { reload(); onToolChanged && onToolChanged() }
  const handleQuestionChange = () => { reload(); onToolChanged && onToolChanged() }

  const openNewQuestion = (sectionId) => {
    setActiveQuestionId(null)
    setActiveQuestionDraft({ ...NEW_QUESTION_TEMPLATE, section_id: sectionId ?? null })
  }

  const openExistingQuestion = (questionId) => {
    setActiveQuestionDraft(null)
    setActiveQuestionId(questionId)
  }

  const closeEditor = () => {
    setActiveQuestionId(null)
    setActiveQuestionDraft(null)
    handleQuestionChange()
  }

  const getQuestionsBySection = (sectionId) => {
    return questions
      .filter((q) => q.section_id === sectionId)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
  }

  if (!toolId) return <div className="rounded-2xl border border-gray-100 bg-yellow-50 p-4 text-sm text-amber-800">Simpan tool terlebih dahulu sebelum menambahkan pertanyaan.</div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-black">Form & Pertanyaan</h2>
        <div className="text-sm text-gray-500">Sections: {sections.length} • Questions: {questions.length}</div>
      </div>

      <div className="space-y-4">
        <div className="space-y-4">
          <div className="space-y-3">
            <button className="rounded-xl bg-gray-900 px-3 py-2 text-sm font-bold text-white" onClick={async () => {
              const nextOrder = (sections.length ? Math.max(...sections.map(s=>s.sort_order||0)) + 1 : 0)
              const { error } = await supabase.from('prompt_tool_sections').insert({ tool_id: toolId, title: 'Bagian baru', description: '', sort_order: nextOrder })
              if (error) return alert('Gagal membuat section: '+error.message)
              handleSectionChange()
            }}>+ Tambah Bagian</button>
            <div className="rounded-2xl border border-gray-100 bg-white p-4">
              {loading ? <div className="text-sm text-gray-400">Memuat builder...</div> : (
                sectionsWithNo.map((section) => (
                  <div key={String(section.id)} className="mb-6">
                    <PromptToolSectionEditor
                      section={section}
                      sections={sections}
                      toolId={toolId}
                      questions={getQuestionsBySection(section.id)}
                      onChange={handleSectionChange}
                      onEditQuestion={openExistingQuestion}
                      onCreateQuestion={openNewQuestion}
                      readOnly={readOnly}
                    />
                    <div className="space-y-3 mt-3">
                      {getQuestionsBySection(section.id).map((question) => (
                        <div key={question.id} className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-2 text-sm font-bold text-gray-900">
                                <span>{question.label || '(Tanpa label)'}</span>
                                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{question.question_type}</span>
                                {question.is_required && <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs text-rose-700">Wajib</span>}
                                {question.conditional_parent_question_id != null && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">Kondisional</span>}
                              </div>
                              <div className="text-xs text-gray-500">{`{{${question.variable_name}}}`} {['single_choice','dropdown','checkbox'].includes(question.question_type) ? `• ${question.options?.length ?? 0} pilihan` : ''}</div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <button type="button" className="rounded border px-3 py-1 text-xs" onClick={()=>openExistingQuestion(question.id)} disabled={readOnly}>Edit</button>
                              <button type="button" className="rounded border px-3 py-1 text-xs" onClick={async ()=>{
                                const secId = question.section_id
                                const { data: siblings } = await supabase.from('prompt_tool_questions').select('id,sort_order').eq('tool_id', toolId).eq('section_id', secId).order('sort_order', { ascending: true }).order('created_at', { ascending: true })
                                const idx = siblings.findIndex(s=>s.id===question.id)
                                if (idx <= 0) return
                                const target = idx - 1
                                const a = siblings[idx]
                                const b = siblings[target]
                                const { error: e1 } = await supabase.from('prompt_tool_questions').update({ sort_order: b.sort_order }).eq('id', a.id)
                                const { error: e2 } = await supabase.from('prompt_tool_questions').update({ sort_order: a.sort_order }).eq('id', b.id)
                                if (e1 || e2) return alert('Gagal mengubah urutan: '+(e1?.message||e2?.message))
                                handleQuestionChange()
                              }} disabled={readOnly}>Naik</button>
                              <button type="button" className="rounded border px-3 py-1 text-xs" onClick={async ()=>{
                                const secId = question.section_id
                                const { data: siblings } = await supabase.from('prompt_tool_questions').select('id,sort_order').eq('tool_id', toolId).eq('section_id', secId).order('sort_order', { ascending: true }).order('created_at', { ascending: true })
                                const idx = siblings.findIndex(s=>s.id===question.id)
                                if (idx === -1 || idx >= siblings.length-1) return
                                const target = idx + 1
                                const a = siblings[idx]
                                const b = siblings[target]
                                const { error: e1 } = await supabase.from('prompt_tool_questions').update({ sort_order: b.sort_order }).eq('id', a.id)
                                const { error: e2 } = await supabase.from('prompt_tool_questions').update({ sort_order: a.sort_order }).eq('id', b.id)
                                if (e1 || e2) return alert('Gagal mengubah urutan: '+(e1?.message||e2?.message))
                                handleQuestionChange()
                              }} disabled={readOnly}>Turun</button>
                              <button type="button" className="rounded border px-3 py-1 text-xs text-red-700" onClick={async ()=>{
                                if (!confirm('Hapus pertanyaan ini?')) return
                                const { error } = await supabase.from('prompt_tool_questions').delete().eq('id', question.id)
                                if (error) return alert('Gagal menghapus pertanyaan: '+error.message)
                                handleQuestionChange()
                              }} disabled={readOnly}>Hapus</button>
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
        </div>

      </div>

      <div>
        {(activeQuestionId || activeQuestionDraft) && (
          <div className="rounded-2xl border border-gray-100 bg-white p-4">
            <PromptToolQuestionEditor
              questionId={activeQuestionId}
              initialQuestion={activeQuestionDraft}
              toolId={toolId}
              sections={sectionsWithNo}
              questions={questions}
              onDone={closeEditor}
              readOnly={readOnly}
            />
          </div>
        )}
      </div>
    </div>
  )
}
