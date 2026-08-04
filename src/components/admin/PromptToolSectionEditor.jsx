import { useState } from 'react'
import { supabase } from '../../supabase'

export default function PromptToolSectionEditor({
  section,
  sections,
  questions,
  onChange,
  onCreateQuestion,
  readOnly,
}) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(section.title || '')
  const [description, setDescription] = useState(
    section.description || '',
  )
  const [processing, setProcessing] = useState(false)
  const isNoSection = section.id === null

  const save = async () => {
    if (!title.trim()) {
      window.alert('Judul wajib diisi.')
      return
    }

    if (isNoSection) return

    setProcessing(true)

    const { error } = await supabase
      .from('prompt_tool_sections')
      .update({
        title: title.trim(),
        description: description.trim(),
      })
      .eq('id', section.id)

    setProcessing(false)

    if (error) {
      window.alert('Bagian belum dapat disimpan.')
      return
    }

    setEditing(false)
    await onChange?.()
  }

  const remove = async () => {
    if (isNoSection) return

    const confirmed = window.confirm(
      'Bagian akan dihapus. Pertanyaan di dalamnya tidak ikut terhapus dan akan dipindahkan ke Tanpa Bagian. Lanjutkan?',
    )

    if (!confirmed) return

    setProcessing(true)

    const { error } = await supabase
      .from('prompt_tool_sections')
      .delete()
      .eq('id', section.id)

    setProcessing(false)

    if (error) {
      window.alert('Bagian belum dapat dihapus.')
      return
    }

    await onChange?.()
  }

  const move = async (direction) => {
    if (isNoSection) return

    const currentIndex = sections.findIndex((item) => (
      item.id === section.id
    ))
    const targetIndex = direction === 'up'
      ? currentIndex - 1
      : currentIndex + 1

    if (
      currentIndex === -1
      || targetIndex < 0
      || targetIndex >= sections.length
    ) {
      return
    }

    setProcessing(true)

    const currentSection = sections[currentIndex]
    const targetSection = sections[targetIndex]
    const [firstUpdate, secondUpdate] = await Promise.all([
      supabase
        .from('prompt_tool_sections')
        .update({ sort_order: targetSection.sort_order })
        .eq('id', currentSection.id),
      supabase
        .from('prompt_tool_sections')
        .update({ sort_order: currentSection.sort_order })
        .eq('id', targetSection.id),
    ])

    setProcessing(false)

    if (firstUpdate.error || secondUpdate.error) {
      window.alert('Urutan bagian belum dapat diperbarui.')
      return
    }

    await onChange?.()
  }

  const cancelEditing = () => {
    setEditing(false)
    setTitle(section.title || '')
    setDescription(section.description || '')
  }

  return (
    <div className="border-b border-gray-100 pb-3">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-bold">
              {isNoSection ? 'Tanpa Bagian' : (section.title || 'Bagian')}
            </h4>
            <span className="text-xs text-gray-400">
              ({questions.length} pertanyaan)
            </span>
          </div>

          {!isNoSection && editing ? (
            <div className="mt-2 space-y-2">
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="w-full rounded border px-3 py-2 text-sm"
              />
              <input
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                className="w-full rounded border px-3 py-2 text-sm"
                placeholder="Deskripsi (opsional)"
              />
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  className="rounded bg-green-600 px-3 py-1 text-sm text-white disabled:opacity-50"
                  onClick={save}
                  disabled={processing}
                >
                  Simpan
                </button>
                <button
                  type="button"
                  className="rounded border px-3 py-1 text-sm"
                  onClick={cancelEditing}
                  disabled={processing}
                >
                  Batal
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-2 text-sm text-gray-600">
              {!isNoSection && section.description}
            </div>
          )}
        </div>

        <div className="flex flex-col items-end gap-2">
          <div className="flex flex-wrap justify-end gap-2">
            {!isNoSection && (
              <>
                <button
                  type="button"
                  className="rounded border px-2 py-1 text-xs"
                  onClick={() => setEditing((value) => !value)}
                  disabled={readOnly || processing}
                >
                  {editing ? 'Tutup' : 'Edit'}
                </button>
                <button
                  type="button"
                  className="rounded border px-2 py-1 text-xs"
                  onClick={() => move('up')}
                  disabled={readOnly || processing}
                >
                  Naik
                </button>
                <button
                  type="button"
                  className="rounded border px-2 py-1 text-xs"
                  onClick={() => move('down')}
                  disabled={readOnly || processing}
                >
                  Turun
                </button>
                <button
                  type="button"
                  className="rounded border px-2 py-1 text-xs text-red-700"
                  onClick={remove}
                  disabled={readOnly || processing}
                >
                  Hapus
                </button>
              </>
            )}
          </div>

          <button
            type="button"
            className="rounded bg-gray-100 px-3 py-1 text-xs"
            onClick={() => onCreateQuestion(section.id)}
            disabled={readOnly || processing}
          >
            + Tambah Pertanyaan
          </button>
        </div>
      </div>
    </div>
  )
}
