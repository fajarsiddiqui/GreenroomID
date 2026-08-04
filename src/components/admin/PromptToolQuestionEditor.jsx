import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../supabase'

const QUESTION_TYPES = [
  'short_text','paragraph','number','email','phone','date','single_choice','dropdown','checkbox'
]

const TYPE_LABEL = {
  short_text: 'Jawaban Singkat', paragraph: 'Paragraf', number: 'Angka', email: 'Email', phone: 'Nomor HP', date: 'Tanggal', single_choice: 'Pilihan Tunggal', dropdown: 'Dropdown', checkbox: 'Checkbox'
}

const VALID_VAR_RE = /^[a-z][a-z0-9_]*$/

export default function PromptToolQuestionEditor({ questionId, initialQuestion, toolId, sections = [], questions = [], onDone, onMutation, readOnly }) {
  const [question, setQuestion] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [manualVar, setManualVar] = useState(false)
  const [conditionalEnabled, setConditionalEnabled] = useState(false)

  const fetchQuestion = useCallback(async () => {
    if (!questionId) return
    setLoading(true)
    const { data, error } = await supabase.from('prompt_tool_questions').select('*').eq('id', questionId).maybeSingle()
    if (error) { setError('Pertanyaan belum dapat dimuat.'); setLoading(false); return }
    if (data) {
      if (['single_choice','dropdown','checkbox'].includes(data.question_type)) {
        const { data: opts } = await supabase.from('prompt_tool_options').select('*').eq('question_id', data.id).order('sort_order', { ascending: true })
        data.options = opts || []
      } else {
        data.options = []
      }

      // if conditional parent points to missing question, clear conditional
      if (data.conditional_parent_question_id) {
        const { data: parent } = await supabase.from('prompt_tool_questions').select('id').eq('id', data.conditional_parent_question_id).maybeSingle()
        if (!parent) {
          await supabase.from('prompt_tool_questions').update({ conditional_parent_question_id: null, conditional_operator: null, conditional_value: null }).eq('id', data.id)
          await onMutation?.()
          data.conditional_parent_question_id = null
          data.conditional_operator = null
          data.conditional_value = null
        }
      }

      setQuestion(data)
      setManualVar(Boolean(data.variable_name))
      setConditionalEnabled(Boolean(data.conditional_parent_question_id))
    }
    setLoading(false)
  }, [onMutation, questionId])

  useEffect(() => {
    if (initialQuestion) {
      setQuestion(initialQuestion)
      setManualVar(Boolean(initialQuestion.variable_name))
      setConditionalEnabled(Boolean(initialQuestion.conditional_parent_question_id))
      setLoading(false)
      return
    }

    if (questionId) {
      fetchQuestion()
      return
    }

    setQuestion(null)
    setLoading(false)
  }, [initialQuestion, questionId, fetchQuestion])

  const variableFromLabel = (label) => label.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/_+/g,'_').replace(/^_|_$/g,'')

  const save = async () => {
    setError('')
    if (!question.label || !question.label.trim()) return setError('Label wajib diisi.')
    if (!question.variable_name || !VALID_VAR_RE.test(question.variable_name)) return setError('Variable name wajib dan mengikuti pola ^[a-z][a-z0-9_]*$')
    // uniqueness check within tool
    const { data: dup } = await supabase.from('prompt_tool_questions').select('id').eq('tool_id', toolId).eq('variable_name', question.variable_name).neq('id', question.id)
    if (dup && dup.length) return setError('Nama variabel sudah digunakan oleh pertanyaan lain. Pilih nama variabel lain.')
    if (question.validation_min != null && question.validation_max != null && Number(question.validation_min) > Number(question.validation_max)) return setError('validation_min tidak boleh > validation_max')

    // conditional validations
    if (question.conditional_parent_question_id) {
      // must be earlier question
      if (!parentCandidates.find(p=>p.id === question.conditional_parent_question_id)) return setError('Parent harus merupakan pertanyaan yang muncul sebelumnya dalam form.')
      // operator value requirements
      if (['equals','not_equals','contains'].includes(question.conditional_operator) && (question.conditional_value == null || String(question.conditional_value).trim() === '')) return setError('Operator ini membutuhkan nilai perbandingan.')
      // circular detection
      const checkCircular = async (parentId) => {
        let cur = parentId
        const seen = new Set()
        while (cur) {
          if (seen.has(cur)) return true
          if (question.id && cur === question.id) return true
          seen.add(cur)
          const { data: p } = await supabase.from('prompt_tool_questions').select('conditional_parent_question_id').eq('id', cur).maybeSingle()
          if (!p) break
          cur = p.conditional_parent_question_id
        }
        return false
      }
      const circ = await checkCircular(question.conditional_parent_question_id)
      if (circ) return setError('Circular dependency terdeteksi. Pilih parent lain.')
    }

    setSaving(true)
    const payload = {
      label: question.label,
      variable_name: question.variable_name,
      question_type: question.question_type,
      section_id: question.section_id,
      help_text: question.help_text || '',
      placeholder: question.placeholder || '',
      is_required: question.is_required || false,
      validation_min: question.validation_min != null ? question.validation_min : null,
      validation_max: question.validation_max != null ? question.validation_max : null,
      conditional_parent_question_id: conditionalEnabled ? (question.conditional_parent_question_id || null) : null,
      conditional_operator: conditionalEnabled ? (question.conditional_operator || null) : null,
      conditional_value: conditionalEnabled ? (question.conditional_operator === 'not_empty' ? '' : (question.conditional_value || '')) : null
    }

    let insertedQuestionId = question.id
    if (!question.id) {
      let siblingsQuery = supabase
        .from('prompt_tool_questions')
        .select('sort_order')
        .eq('tool_id', toolId)

      siblingsQuery = question.section_id === null
        ? siblingsQuery.is('section_id', null)
        : siblingsQuery.eq('section_id', question.section_id)

      const { data: siblings } = await siblingsQuery
        .order('sort_order', { ascending: false })
        .limit(1)
      const nextSort = (siblings && siblings.length && siblings[0].sort_order != null) ? siblings[0].sort_order + 1 : 0
      const { data: inserted, error: insertError } = await supabase.from('prompt_tool_questions').insert({ ...payload, tool_id: toolId, sort_order: nextSort }).select('id').single()
      if (insertError) { setError('Pertanyaan belum dapat disimpan.'); setSaving(false); return }
      insertedQuestionId = inserted.id
    } else {
      const { error: err } = await supabase.from('prompt_tool_questions').update(payload).eq('id', question.id)
      if (err) { setError('Pertanyaan belum dapat disimpan.'); setSaving(false); return }
    }

    // sync options if present
    let optionErrors = []
    if (['single_choice','dropdown','checkbox'].includes(question.question_type)) {
      const existing = question.options || []
      // validate options client-side first
      const values = (existing || []).map(o => (o.option_value||'').trim())
      if (existing.length < 2) {
        optionErrors.push('Pilihan harus minimal dua opsi.')
      }
      if (values.some(v => !v)) optionErrors.push('Semua option value harus diisi.')
      const dupValues = values.filter((v,i)=> values.indexOf(v) !== i)
      if (dupValues.length) optionErrors.push('Nilai option harus unik per pertanyaan.')

      for (const opt of existing) {
        try {
          if (opt.id) {
            const { error: e } = await supabase.from('prompt_tool_options').update({ option_label: opt.option_label, option_value: opt.option_value, sort_order: opt.sort_order }).eq('id', opt.id)
            if (e) optionErrors.push('Pilihan belum dapat diperbarui.')
          } else {
            const { error: e } = await supabase.from('prompt_tool_options').insert({ question_id: insertedQuestionId, option_label: opt.option_label, option_value: opt.option_value, sort_order: opt.sort_order })
            if (e) optionErrors.push('Pilihan belum dapat disimpan.')
          }
        } catch { optionErrors.push('Pilihan belum dapat disimpan.') }
      }
    } else {
      // non-choice: ensure no lingering options in DB
      try {
        await supabase.from('prompt_tool_options').delete().eq('question_id', question.id)
      } catch { /* ignore */ }
    }

    setSaving(false)

    if (optionErrors.length) {
      setError('Pertanyaan disimpan, tetapi ada masalah pada pilihan: ' + optionErrors.join(' | '))
      // reload parent builder data via onDone which triggers reload
      onDone?.({ changed: true })
      return
    }

    onDone?.({ changed: true })
  }

  const addOption = () => {
    const opts = question.options || []
    const next = opts.length ? Math.max(...opts.map(o=>o.sort_order||0))+1 : 0
    // generate a unique option_value
    const base = 'pilihan'
    let candidate = base+'_'+Math.random().toString(36).slice(2,6)
    const existing = (question.options||[]).map(o=>o.option_value)
    while (existing.includes(candidate)) candidate = base+'_'+Math.random().toString(36).slice(2,6)
    setQuestion((q)=>({ ...q, options: [...(q.options||[]), { option_label: 'Pilihan', option_value: candidate, sort_order: next }] }))
  }

  const removeOption = async (idx) => {
    const opt = question.options[idx]
    if (opt.id) {
      const { error } = await supabase.from('prompt_tool_options').delete().eq('id', opt.id)
      if (error) return setError('Pilihan belum dapat dihapus.')
    }
    const newOpts = (question.options||[]).filter((_,i)=>i!==idx).map((o, i)=>({ ...o, sort_order: i }))
    setQuestion((q)=>({ ...q, options: newOpts }))
    if (opt.id) await onMutation?.()
  }

  const changeType = async (newType) => {
    if (!question) return
    if (!['single_choice','dropdown','checkbox'].includes(newType) && (question.options || []).length > 0) {
      if (!confirm('Mengubah tipe akan menghapus pilihan jawaban yang sudah ada. Lanjutkan?')) return
      // delete options
      let removedStoredOption = false
      for (const opt of question.options || []) {
        if (opt.id) {
          const { error } = await supabase.from('prompt_tool_options').delete().eq('id', opt.id)
          if (!error) removedStoredOption = true
        }
      }
      setQuestion((q)=>({ ...q, question_type: newType, options: [] }))
      if (removedStoredOption) await onMutation?.()
    } else {
      setQuestion((q)=>({ ...q, question_type: newType }))
    }
  }

  const moveQuestion = async (dir) => {
    // fetch other questions in same section (including null)
    const secId = question.section_id
    let siblingsQuery = supabase
      .from('prompt_tool_questions')
      .select('*')
      .eq('tool_id', toolId)

    siblingsQuery = secId === null
      ? siblingsQuery.is('section_id', null)
      : siblingsQuery.eq('section_id', secId)

    const { data: siblings, error: siblingsError } = await siblingsQuery
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })

    if (siblingsError) {
      setError('Urutan pertanyaan belum dapat dimuat.')
      return
    }

    const idx = siblings.findIndex(s=>s.id===question.id)
    if (idx === -1) return
    const target = dir==='up' ? idx-1 : idx+1
    if (target < 0 || target >= siblings.length) return
    // swap sort orders
    const a = siblings[idx]
    const b = siblings[target]
    const firstUpdate = await supabase.from('prompt_tool_questions').update({ sort_order: b.sort_order }).eq('id', a.id)
    const secondUpdate = await supabase.from('prompt_tool_questions').update({ sort_order: a.sort_order }).eq('id', b.id)
    if (firstUpdate.error || secondUpdate.error) {
      setError('Urutan pertanyaan belum dapat diperbarui.')
      return
    }
    await onMutation?.()
    await fetchQuestion()
  }

  // build ordered list of questions by sections prop order
  const parentCandidates = (()=>{
    const flat = []
    for (const s of sections) {
      const qs = (questions || []).filter(q=>q.section_id === s.id)
      qs.sort((a,b)=> (a.sort_order||0) - (b.sort_order||0))
      for (const q of qs) flat.push(q)
    }
    const others = (questions||[]).filter(q=>!sections.some(s=>s.id===q.section_id))
    others.sort((a,b)=> (a.sort_order||0) - (b.sort_order||0))
    for (const q of others) flat.push(q)
    if (!question) return []
    if (!question.id) return flat
    const idx = flat.findIndex(f=>f.id===question.id)
    if (idx === -1) return flat
    return flat.slice(0, idx).filter(f=>f.id !== question.id)
  })()

  const CONDITIONAL_OPERATORS = [ 'equals', 'not_equals', 'contains', 'not_empty' ]

  if (loading) return <div className="text-sm text-gray-500">Memuat pertanyaan...</div>
  if (!question) return <div className="text-sm text-gray-500">Pertanyaan tidak ditemukan.</div>

  return (
    <div>
      <div className="flex items-center justify-between">
        <h4 className="font-bold">Edit Pertanyaan</h4>
        <div className="flex gap-2">
          <button className="rounded border px-3 py-1 text-sm" onClick={()=>moveQuestion('up')} disabled={readOnly}>Naik</button>
          <button className="rounded border px-3 py-1 text-sm" onClick={()=>moveQuestion('down')} disabled={readOnly}>Turun</button>
          <button className="rounded border px-3 py-1 text-sm" onClick={() => onDone?.({ changed: false })}>Tutup</button>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3">
        <label className="block"><div className="text-sm font-bold">Label</div><input value={question.label||''} onChange={(e)=>setQuestion({...question, label: e.target.value, variable_name: manualVar ? question.variable_name : variableFromLabel(e.target.value) })} className="w-full rounded border px-3 py-2" /></label>
        <label className="block"><div className="text-sm font-bold">Variable name</div><input value={question.variable_name||''} onChange={(e)=>{ setQuestion({...question, variable_name: e.target.value}); setManualVar(true) }} className="w-full rounded border px-3 py-2" /><div className="text-xs text-gray-400 mt-1">Preview: <code className="rounded bg-gray-100 px-1">{`{{${question.variable_name||''}}}`}</code></div></label>

        <label className="block"><div className="text-sm font-bold">Tipe pertanyaan</div>
          <select value={question.question_type} onChange={(e)=>changeType(e.target.value)} className="w-full rounded border px-3 py-2">
            {QUESTION_TYPES.map((t)=> <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
          </select>
        </label>

        <label className="block"><div className="text-sm font-bold">Bagian</div>
          <select value={question.section_id ?? ''} onChange={(e)=>setQuestion({...question, section_id: e.target.value || null})} className="w-full rounded border px-3 py-2">
            {sections.map(s=> <option key={String(s.id)} value={s.id ?? ''}>{s.title}</option>)}
          </select>
        </label>

        <label className="block"><div className="text-sm font-bold">Help text (opsional)</div><input value={question.help_text||''} onChange={(e)=>setQuestion({...question, help_text: e.target.value})} className="w-full rounded border px-3 py-2" /></label>

        {['short_text','paragraph'].includes(question.question_type) && (
          <label className="block"><div className="text-sm font-bold">Placeholder (opsional)</div><input value={question.placeholder||''} onChange={(e)=>setQuestion({...question, placeholder: e.target.value})} className="w-full rounded border px-3 py-2" /></label>
        )}

        {question.question_type === 'number' && (
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><div className="text-sm font-bold">Validation min</div><input type="number" value={question.validation_min||''} onChange={(e)=>setQuestion({...question, validation_min: e.target.value})} className="w-full rounded border px-3 py-2" /></label>
            <label className="block"><div className="text-sm font-bold">Validation max</div><input type="number" value={question.validation_max||''} onChange={(e)=>setQuestion({...question, validation_max: e.target.value})} className="w-full rounded border px-3 py-2" /></label>
          </div>
        )}

        {['single_choice','dropdown','checkbox'].includes(question.question_type) && (
          <div className="mt-2 border-t pt-3">
            <div className="flex items-center justify-between"><div className="font-bold">Pilihan Jawaban</div><button className="rounded bg-gray-900 text-white px-2 py-1 text-sm" onClick={addOption}>+ Tambah Pilihan</button></div>
            {(question.options||[]).length === 0 && <div className="text-sm text-gray-400 mt-2">Tidak ada pilihan.</div>}
            {(question.options||[]).map((opt, idx)=> (
              <div key={idx} className="flex items-center gap-2 mt-2">
                <input value={opt.option_label||''} onChange={(e)=>{ const newOpts = (question.options||[]).slice(); newOpts[idx].option_label = e.target.value; setQuestion({...question, options: newOpts}) }} className="rounded border px-2 py-1 flex-1" />
                <input value={opt.option_value||''} onChange={(e)=>{ const newOpts = (question.options||[]).slice(); newOpts[idx].option_value = e.target.value; setQuestion({...question, options: newOpts}) }} className="rounded border px-2 py-1 w-36" />
                <button className="rounded border px-2 py-1 text-sm" onClick={()=>{ const newOpts = (question.options||[]).slice(); if (idx>0) { const tmp = newOpts[idx-1]; newOpts[idx-1] = newOpts[idx]; newOpts[idx] = tmp; newOpts.forEach((o,i)=>o.sort_order=i); setQuestion({...question, options: newOpts}) } }}>Naik</button>
                <button className="rounded border px-2 py-1 text-sm" onClick={()=>{ const newOpts = (question.options||[]).slice(); if (idx < newOpts.length-1) { const tmp=newOpts[idx+1]; newOpts[idx+1]=newOpts[idx]; newOpts[idx]=tmp; newOpts.forEach((o,i)=>o.sort_order=i); setQuestion({...question, options: newOpts}) } }}>Turun</button>
                <button className="rounded border px-2 py-1 text-sm text-red-600" onClick={()=>removeOption(idx)}>Hapus</button>
              </div>
            ))}
            {(question.options||[]).length > 0 && (question.options||[]).length < 2 && <div className="mt-2 text-sm text-red-700">Tambahkan minimal dua pilihan jawaban.</div>}
          </div>
        )}

            <div className="mt-3 border-t pt-3">
              <div className="flex items-center justify-between">
                <div className="font-bold">Logika Kondisional</div>
                <div className="text-xs text-gray-500">Hanya pertanyaan sebelumnya dapat dipilih sebagai parent</div>
              </div>
              <div className="mt-2 grid grid-cols-1 gap-2">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={conditionalEnabled} onChange={(e)=>{
                    const checked = e.target.checked
                    setConditionalEnabled(checked)
                    if (!checked) {
                      setQuestion(q=>({...q, conditional_parent_question_id: null, conditional_operator: null, conditional_value: null}))
                    }
                  }} /> Aktifkan Kondisional
                </label>

                {conditionalEnabled && (
                  <>
                    <label className="block"><div className="text-sm font-bold">Pertanyaan Induk</div>
                      <select value={question.conditional_parent_question_id || ''} onChange={(e)=>setQuestion({...question, conditional_parent_question_id: e.target.value || null})} className="w-full rounded border px-3 py-2">
                        <option value="">Pilih pertanyaan...</option>
                        {parentCandidates.map(pc => (
                          <option key={pc.id} value={pc.id}>{pc.label}</option>
                        ))}
                      </select>
                    </label>

                    <label className="block"><div className="text-sm font-bold">Operator</div>
                      <select value={question.conditional_operator || ''} onChange={(e)=>setQuestion({...question, conditional_operator: e.target.value || null, conditional_value: null})} className="w-full rounded border px-3 py-2">
                        <option value="">Pilih operator...</option>
                        {CONDITIONAL_OPERATORS.map(op => <option key={op} value={op}>{op}</option>)}
                      </select>
                    </label>

                    {question.conditional_operator && question.conditional_operator !== 'not_empty' && (
                      <label className="block"><div className="text-sm font-bold">Nilai</div><input value={question.conditional_value || ''} onChange={(e)=>setQuestion({...question, conditional_value: e.target.value})} className="w-full rounded border px-3 py-2" /></label>
                    )}
                  </>
                )}
              </div>
            </div>

        <div className="mt-3 flex items-center gap-2">
          <button className="rounded bg-green-600 px-4 py-2 text-white" onClick={save} disabled={saving}>Simpan</button>
          <button className="rounded border px-4 py-2" onClick={() => onDone?.({ changed: false })}>Batal</button>
        </div>
        {error && <div className="mt-2 text-sm text-red-700">{error}</div>}
      </div>
    </div>
  )
}
