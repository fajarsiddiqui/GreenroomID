import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase'
import { buildPublicFormUrl, downloadCsv, formatAnswerValue, getFormStatusLabel } from '../utils/dynamicForms'

function AdminFormsPage() {
  const [forms, setForms] = useState([])
  const [responses, setResponses] = useState([])
  const [questions, setQuestions] = useState([])
  const [loading, setLoading] = useState(true)
  const [keyword, setKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [selectedFormId, setSelectedFormId] = useState('')

  const responseCounts = useMemo(() => {
    return responses.reduce((acc, response) => {
      const key = response.form_id
      if (!acc[key]) acc[key] = { active: 0, deleted: 0 }
      if (response.deleted_at) acc[key].deleted += 1
      else acc[key].active += 1
      return acc
    }, {})
  }, [responses])

  const filteredForms = useMemo(() => {
    const q = keyword.trim().toLowerCase()
    return forms.filter((form) => {
      const matchKeyword = !q || [form.title, form.slug, form.owner_email, form.request_id]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q))
      const matchStatus = !statusFilter || form.status === statusFilter
      return matchKeyword && matchStatus
    })
  }, [forms, keyword, statusFilter])

  const selectedForm = forms.find((item) => item.id === selectedFormId)
  const selectedQuestions = questions.filter((item) => item.form_id === selectedFormId)
  const selectedResponses = responses.filter((item) => item.form_id === selectedFormId)

  const fetchData = async () => {
    setLoading(true)

    const [{ data: formRows, error: formsError }, { data: responseRows }, { data: questionRows }] = await Promise.all([
      supabase
        .from('forms')
        .select('*')
        .order('created_at', { ascending: false }),
      supabase
        .from('form_responses')
        .select('*')
        .order('created_at', { ascending: false }),
      supabase
        .from('form_questions')
        .select('*')
        .order('sort_order', { ascending: true })
    ])

    if (formsError) {
      alert('Gagal mengambil data form: ' + formsError.message)
      setForms([])
    } else {
      setForms(formRows || [])
    }

    setResponses(responseRows || [])
    setQuestions(questionRows || [])
    setLoading(false)
  }

  useEffect(() => {
    fetchData()
  }, [])

  const updateFormStatus = async (form, status) => {
    const { error } = await supabase
      .from('forms')
      .update({ status })
      .eq('id', form.id)

    if (error) alert('Gagal mengubah status form: ' + error.message)
    else await fetchData()
  }

  const restoreForm = async (form) => {
    const { error } = await supabase
      .from('forms')
      .update({ status: 'active', deleted_at: null, deleted_by: null, delete_reason: null })
      .eq('id', form.id)

    if (error) alert('Gagal memulihkan form: ' + error.message)
    else await fetchData()
  }

  const permanentlyDeleteForm = async (form) => {
    if (!confirm(`Hapus permanen form "${form.title}" beserta section, pertanyaan, opsi, dan responsnya? Tindakan ini tidak bisa dibatalkan.`)) return

    const { error } = await supabase
      .from('forms')
      .delete()
      .eq('id', form.id)

    if (error) alert('Gagal hapus permanen form: ' + error.message)
    else {
      if (selectedFormId === form.id) setSelectedFormId('')
      await fetchData()
    }
  }

  const restoreResponse = async (response) => {
    const { error } = await supabase
      .from('form_responses')
      .update({ deleted_at: null, deleted_by: null, delete_reason: null })
      .eq('id', response.id)

    if (error) alert('Gagal memulihkan respons: ' + error.message)
    else await fetchData()
  }

  const permanentlyDeleteResponse = async (response) => {
    if (!confirm('Hapus permanen respons ini? Tindakan ini tidak bisa dibatalkan.')) return

    const { error } = await supabase
      .from('form_responses')
      .delete()
      .eq('id', response.id)

    if (error) alert('Gagal hapus permanen respons: ' + error.message)
    else await fetchData()
  }

  const exportSelectedResponses = () => {
    if (!selectedForm) return
    const header = ['Timestamp', 'Status Hapus', ...selectedQuestions.map((question) => question.label)]
    const rows = selectedResponses.map((response) => [
      new Date(response.created_at).toLocaleString('id-ID'),
      response.deleted_at ? 'Terhapus' : 'Aktif',
      ...selectedQuestions.map((question) => formatAnswerValue(response.answers_json?.[question.id]?.value))
    ])

    downloadCsv(`admin-${selectedForm.slug || 'form'}-responses.csv`, [header, ...rows])
  }

  return (
    <div className="min-h-screen bg-gray-100 p-4 sm:p-6">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-black text-gray-900">Formulir Online</h1>
            <p className="mt-1 text-sm text-gray-500">Kelola semua form request link, respons, status link, dan penghapusan permanen.</p>
          </div>
          <button type="button" onClick={fetchData} className="rounded-xl bg-gray-900 px-4 py-3 text-sm font-bold text-white hover:bg-black">Refresh</button>
        </div>

        <div className="mb-5 grid gap-3 rounded-2xl bg-white p-4 shadow-sm sm:grid-cols-[minmax(0,1fr)_220px]">
          <input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="Cari judul, slug, owner, atau request ID"
            className="rounded-xl border border-gray-200 px-4 py-3 text-sm"
          />
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="rounded-xl border border-gray-200 px-4 py-3 text-sm">
            <option value="">Semua status</option>
            <option value="draft">Draft</option>
            <option value="active">Aktif</option>
            <option value="disabled">Dinonaktifkan</option>
            <option value="deleted_by_owner">Dihapus pemilik link</option>
          </select>
        </div>

        {loading && <p className="rounded-2xl bg-white p-8 text-center text-gray-400 shadow-sm">Memuat...</p>}

        {!loading && (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_440px]">
            <div className="space-y-3">
              {filteredForms.length === 0 && <p className="rounded-2xl bg-white p-8 text-center text-sm text-gray-400 shadow-sm">Belum ada form.</p>}

              {filteredForms.map((form) => {
                const counts = responseCounts[form.id] || { active: 0, deleted: 0 }
                const publicUrl = buildPublicFormUrl(form.slug)
                const selected = selectedFormId === form.id

                return (
                  <button
                    key={form.id}
                    type="button"
                    onClick={() => setSelectedFormId(form.id)}
                    className={`w-full rounded-2xl border bg-white p-5 text-left shadow-sm transition hover:shadow-md ${selected ? 'border-green-500 ring-2 ring-green-100' : 'border-transparent'}`}
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wide text-green-700">Request #{form.request_id}</p>
                        <h2 className="mt-1 font-black text-gray-900">{form.title}</h2>
                        <p className="mt-2 break-all text-xs text-gray-400">{publicUrl}</p>
                      </div>
                      <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-bold text-gray-700">{getFormStatusLabel(form.status)}</span>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-3 text-xs text-gray-500">
                      <span>Aktif: {counts.active}</span>
                      <span>Terhapus: {counts.deleted}</span>
                      <span>Dibuat: {new Date(form.created_at).toLocaleDateString('id-ID')}</span>
                    </div>
                  </button>
                )
              })}
            </div>

            <aside className="rounded-2xl bg-white p-5 shadow-sm lg:sticky lg:top-5 lg:self-start">
              {!selectedForm && <p className="text-sm text-gray-400">Pilih salah satu form untuk melihat tindakan admin.</p>}

              {selectedForm && (
                <div>
                  <p className="mb-1 text-xs font-bold uppercase tracking-wide text-green-700">Detail Form</p>
                  <h2 className="text-lg font-black text-gray-900">{selectedForm.title}</h2>
                  <p className="mt-2 break-all text-xs text-gray-500">{buildPublicFormUrl(selectedForm.slug)}</p>

                  <div className="mt-5 grid grid-cols-2 gap-2 text-center text-xs">
                    <div className="rounded-xl bg-green-50 p-3 text-green-800"><p className="text-lg font-black">{responseCounts[selectedForm.id]?.active || 0}</p><p>Respons aktif</p></div>
                    <div className="rounded-xl bg-red-50 p-3 text-red-700"><p className="text-lg font-black">{responseCounts[selectedForm.id]?.deleted || 0}</p><p>Respons terhapus</p></div>
                  </div>

                  <div className="mt-5 flex flex-wrap gap-2">
                    <button type="button" onClick={() => updateFormStatus(selectedForm, selectedForm.status === 'active' ? 'disabled' : 'active')} className="rounded-xl bg-amber-500 px-3 py-2 text-xs font-bold text-white hover:bg-amber-600">
                      {selectedForm.status === 'active' ? 'Nonaktifkan' : 'Aktifkan'}
                    </button>
                    {selectedForm.deleted_at && <button type="button" onClick={() => restoreForm(selectedForm)} className="rounded-xl bg-green-700 px-3 py-2 text-xs font-bold text-white hover:bg-green-800">Pulihkan form</button>}
                    <button type="button" onClick={() => permanentlyDeleteForm(selectedForm)} className="rounded-xl bg-red-600 px-3 py-2 text-xs font-bold text-white hover:bg-red-700">Hapus permanen</button>
                    <button type="button" onClick={exportSelectedResponses} className="rounded-xl bg-gray-900 px-3 py-2 text-xs font-bold text-white hover:bg-black">Export semua respons</button>
                  </div>

                  <div className="mt-6">
                    <h3 className="mb-3 text-sm font-black text-gray-900">Respons form ini</h3>
                    <div className="max-h-[460px] space-y-2 overflow-y-auto pr-1">
                      {selectedResponses.length === 0 && <p className="text-sm text-gray-400">Belum ada respons.</p>}
                      {selectedResponses.map((response) => (
                        <div key={response.id} className={`rounded-xl border p-3 ${response.deleted_at ? 'border-red-100 bg-red-50' : 'border-gray-100 bg-gray-50'}`}>
                          <div className="mb-2 flex items-start justify-between gap-2">
                            <div>
                              <p className="text-xs font-bold text-gray-800">{new Date(response.created_at).toLocaleString('id-ID')}</p>
                              {response.deleted_at && <p className="text-xs text-red-500">Dihapus: {new Date(response.deleted_at).toLocaleString('id-ID')}</p>}
                            </div>
                            <div className="flex gap-1">
                              {response.deleted_at && <button type="button" onClick={() => restoreResponse(response)} className="rounded-lg bg-green-700 px-2 py-1 text-[11px] font-bold text-white">Pulihkan</button>}
                              <button type="button" onClick={() => permanentlyDeleteResponse(response)} className="rounded-lg bg-red-600 px-2 py-1 text-[11px] font-bold text-white">Hapus permanen</button>
                            </div>
                          </div>
                          <div className="space-y-1">
                            {selectedQuestions.slice(0, 4).map((question) => (
                              <p key={question.id} className="text-xs text-gray-600"><span className="font-bold">{question.label}:</span> {formatAnswerValue(response.answers_json?.[question.id]?.value)}</p>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </aside>
          </div>
        )}
      </div>
    </div>
  )
}

export default AdminFormsPage
