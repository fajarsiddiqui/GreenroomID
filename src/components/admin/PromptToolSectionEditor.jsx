import { useState } from 'react'
import { supabase } from '../../supabase'

export default function PromptToolSectionEditor({ section, sections, questions, onChange, onCreateQuestion, readOnly }) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(section.title || '')
  const [description, setDescription] = useState(section.description || '')
  const isNoSection = section.id === null
  const [processing, setProcessing] = useState(false)

  const save = async () => {
    if (!title.trim()) return alert('Judul wajib diisi.')
    if (isNoSection) return
    setProcessing(true)
    const { error } = await supabase.from('prompt_tool_sections').update({ title: title.trim(), description: description.trim() }).eq('id', section.id)
    setProcessing(false)
    if (error) return alert('Gagal menyimpan section: '+error.message)
    setEditing(false)
    onChange()
  }

  const remove = async () => {
    if (isNoSection) return
    if (!confirm('Bagian akan dihapus. Pertanyaan di dalamnya tidak ikut terhapus dan akan dipindahkan ke Tanpa Bagian. Lanjutkan?')) return
    setProcessing(true)
    const { error } = await supabase.from('prompt_tool_sections').delete().eq('id', section.id)
    setProcessing(false)
    if (error) return alert('Gagal menghapus section: '+error.message)
    onChange()
  }

  const move = async (dir) => {
    if (isNoSection) return
    setProcessing(true)
    const idx = sections.findIndex(s=>s.id===section.id)
    if (idx === -1) { setProcessing(false); return }
    const targetIdx = dir === 'up' ? idx-1 : idx+1
    if (targetIdx < 0 || targetIdx >= sections.length) { setProcessing(false); return }
    const a = sections[idx]
    const b = sections[targetIdx]
    const { error: e1 } = await supabase.from('prompt_tool_sections').update({ sort_order: b.sort_order }).eq('id', a.id)
    const { error: e2 } = await supabase.from('prompt_tool_sections').update({ sort_order: a.sort_order }).eq('id', b.id)
    setProcessing(false)
    if (e1 || e2) return alert('Gagal mengubah urutan: '+(e1?.message || e2?.message))
    onChange()
  }

  return (
    <div className="border-b border-gray-100 pb-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h4 className="font-bold text-sm">{isNoSection ? 'Tanpa Bagian' : (section.title || 'Bagian')}</h4>
            <span className="text-xs text-gray-400">({questions.length} pertanyaan)</span>
          </div>
          {!isNoSection && editing ? (
            <div className="mt-2 space-y-2">
              <input value={title} onChange={(e)=>setTitle(e.target.value)} className="w-full rounded border px-3 py-2 text-sm" />
              <input value={description} onChange={(e)=>setDescription(e.target.value)} className="w-full rounded border px-3 py-2 text-sm" placeholder="Deskripsi (opsional)" />
              <div className="flex gap-2 mt-2">
                <button className="rounded bg-green-600 px-3 py-1 text-white text-sm" onClick={save}>Simpan</button>
                <button className="rounded border px-3 py-1 text-sm" onClick={()=>{ setEditing(false); setTitle(section.title||''); setDescription(section.description||'') }}>Batal</button>
              </div>
            </div>
          ) : (
            <div className="mt-2 text-sm text-gray-600">{!isNoSection && section.description}</div>
          )}
        </div>

        <div className="flex flex-col items-end gap-2">
          <div className="flex gap-2">
            {!isNoSection && <button className="rounded border px-2 py-1 text-xs" onClick={()=>setEditing((v)=>!v)} disabled={readOnly || processing}>{editing ? 'Tutup' : 'Edit'}</button>}
            {!isNoSection && <button className="rounded border px-2 py-1 text-xs" onClick={()=>move('up')} disabled={readOnly || processing}>Naik</button>}
            {!isNoSection && <button className="rounded border px-2 py-1 text-xs" onClick={()=>move('down')} disabled={readOnly || processing}>Turun</button>}
            {!isNoSection && <button className="rounded border px-2 py-1 text-xs text-red-700" onClick={remove} disabled={readOnly || processing}>Hapus</button>}
          </div>
          <div>
            <button className="rounded bg-gray-100 px-3 py-1 text-xs" onClick={()=>{ if (readOnly || processing) return; onCreateQuestion(section.id) }} disabled={readOnly || processing}>+ Tambah Pertanyaan</button>
          </div>
        </div>
      </div>
    </div>
  )
}
