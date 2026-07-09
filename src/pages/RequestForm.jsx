import { useState, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../supabase'
import {
  validateFiles,
  allowedRequestFileTypes,
  MAX_REQUEST_FILE_SIZE_MB
} from '../utils/fileValidation'
import { createAuditLog } from '../utils/auditLog'
import ClientPortalHeader from '../components/ClientPortalHeader'
import { FORM_REQUEST_TYPE, SERVICE_REQUEST_TYPE, makeUniqueSlug } from '../utils/dynamicForms'


function RequestForm({ user, onBack, initialService = null }) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const serviceFromStorage = useMemo(() => {
    if (initialService) return initialService
    try {
      const stored = localStorage.getItem('greenroomid_pending_service')
      return stored ? JSON.parse(stored) : null
    } catch {
      localStorage.removeItem('greenroomid_pending_service')
      return null
    }
  }, [initialService])
  const serviceBackPath =
    serviceFromStorage?.return_to ||
    (serviceFromStorage?.category_slug ? `/layanan/${serviceFromStorage.category_slug}` : null)

  const goBack = () => {
    if (onBack) {
      onBack()
      return
    }

    if (serviceBackPath) {
      localStorage.removeItem('greenroomid_pending_service')
      navigate(serviceBackPath, { replace: true })
      return
    }

    navigate('/dashboard')
  }

  const goSuccessBack = () => {
    localStorage.removeItem('greenroomid_pending_service')
    navigate('/dashboard', { replace: true })
  }

  const initialJudul = serviceFromStorage?.service_name
    ? `Request ${serviceFromStorage.service_name}`
    : ''

  const initialKategori = serviceFromStorage?.category_name || ''

  const initialDeskripsi = ''
  const initialRequestType = searchParams.get('type') === 'form' ? FORM_REQUEST_TYPE : SERVICE_REQUEST_TYPE

  const [requestType, setRequestType] = useState(initialRequestType)
  const isFormRequestType = requestType === FORM_REQUEST_TYPE

  const [judul, setJudul] = useState(initialRequestType === FORM_REQUEST_TYPE ? 'Request Link Formulir Online' : initialJudul)
  const [deskripsi, setDeskripsi] = useState(initialDeskripsi)
  const [kategori, setKategori] = useState(initialRequestType === FORM_REQUEST_TYPE ? 'Formulir Online' : initialKategori)
  const [files, setFiles] = useState([])
  const [deadlineAt, setDeadlineAt] = useState('')
  const [loading, setLoading] = useState(false)
  const [sukses, setSukses] = useState(false)

  const formatRupiah = (angka) => {
    if (!angka) return '-'
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(angka)
  }

  const handleSubmit = async () => {
    if (!judul || !deskripsi || !kategori || !deadlineAt) {
      alert('Mohon isi semua kolom!')
      return
    }

    if (files.length > 0) {
      const validation = validateFiles(
        files,
        allowedRequestFileTypes,
        MAX_REQUEST_FILE_SIZE_MB
      )

      if (!validation.valid) {
        alert(validation.message)
        return
      }
    }

    setLoading(true)

    const uploadedFiles = []

    if (files.length > 0) {
      for (const selectedFile of files) {
        const safeName = selectedFile.name.replace(/[^a-zA-Z0-9._-]/g, '_')
        const fileName = `${user.id}-${Date.now()}-${crypto.randomUUID()}-${safeName}`

        const { error: uploadError } = await supabase.storage
          .from('request-files')
          .upload(fileName, selectedFile)

        if (uploadError) {
          alert('Gagal upload file: ' + uploadError.message)
          setLoading(false)
          return
        }

        const { data: urlData } = supabase.storage
          .from('request-files')
          .getPublicUrl(fileName)

        uploadedFiles.push({
          name: selectedFile.name,
          url: urlData.publicUrl,
          size: selectedFile.size,
          type: selectedFile.type,
          storage_path: fileName
        })
      }
    }

    const file_url = uploadedFiles.length > 0 ? uploadedFiles[0].url : null

    const { data: insertedRequest, error } = await supabase
      .from('requests')
      .insert({
        client_id: user.id,
        client_email: user.email,
        judul,
        deskripsi,
        kategori,
        file_url,
        file_urls: uploadedFiles,
        deadline_at: new Date(deadlineAt).toISOString(),
        service_item_id: isFormRequestType ? null : (serviceFromStorage?.service_item_id || null),
        service_snapshot: isFormRequestType ? null : (serviceFromStorage || null),
        request_type: requestType,
        form_request_snapshot: isFormRequestType
          ? {
              type: 'request_link_formulir',
              note: '1 request hanya untuk 1 form. Form aktif setelah pembayaran diverifikasi admin.'
            }
          : null,
        status: isFormRequestType ? 'WAITING PAYMENT' : 'PENDING',
        invoice_status: isFormRequestType ? 'WAITING_PAYMENT' : 'NOT_CREATED',
        payment_status: 'UNPAID'
      })
      .select()
      .single()

    if (error) {
      alert('Gagal kirim request: ' + error.message)
    } else {
      if (uploadedFiles.length > 0 && insertedRequest?.id) {
        const initialFileRows = uploadedFiles.map((file) => ({
          request_id: String(insertedRequest.id),
          uploaded_by: user.id,
          uploader_email: user.email,
          uploader_role: 'client',
          file_kind: 'initial_client_file',
          file_name: file.name,
          file_url: file.url,
          file_size: file.size,
          file_type: file.type,
          storage_path: file.storage_path
        }))

        const { error: requestFilesError } = await supabase
          .from('request_files')
          .insert(initialFileRows)

        if (requestFilesError) {
          console.log('Gagal menyimpan metadata file awal:', requestFilesError.message)
        }
      }

      if (isFormRequestType && insertedRequest?.id) {
        const { data: formRow, error: formError } = await supabase
          .from('forms')
          .insert({
            request_id: String(insertedRequest.id),
            owner_id: user.id,
            title: judul,
            description: deskripsi,
            slug: makeUniqueSlug(judul),
            status: 'draft'
          })
          .select('id')
          .single()

        if (!formError && formRow?.id) {
          const { error: sectionError } = await supabase
            .from('form_sections')
            .insert({
              form_id: formRow.id,
              title: 'Bagian 1',
              description: '',
              sort_order: 1
            })

          if (sectionError) {
            console.log('Form dibuat, tapi bagian awal gagal dibuat:', sectionError.message)
          }
        }

        if (formError) {
          console.log('Request terkirim, tapi form awal gagal dibuat:', formError.message)
        }
      }

      await createAuditLog({
        requestId: insertedRequest?.id || null,
        actorId: user.id,
        actorEmail: user.email,
        actorRole: 'client',
        action: 'REQUEST_CREATED',
        description: `Client membuat request: ${judul}`,
        metadata: {
          judul,
          kategori,
          service: serviceFromStorage,
          request_type: requestType,
          total_files: uploadedFiles.length,
          deadline_at: deadlineAt
        }
      })

      localStorage.removeItem('greenroomid_pending_service')
      setSukses(true)
    }

    setLoading(false)
  }

  if (sukses) return (
    <div className="min-h-screen bg-gray-100">
      <ClientPortalHeader user={user} subtitle="Portal Client · Request Baru" />
      <div className="flex items-center justify-center px-6 py-12">
        <div className="bg-white p-10 rounded-2xl shadow-lg text-center w-full max-w-sm">
          <h1 className="text-4xl mb-4">🎉</h1>
          <h2 className="text-xl font-bold text-gray-800 mb-2">Request Terkirim!</h2>
          <p className="text-gray-500 mb-6">Request kamu sudah kami terima. Jika ini request link formulir, invoice dan upload bukti pembayaran tersedia di detail request.</p>
          <button
            onClick={goSuccessBack}
            className="w-full bg-blue-600 text-white py-3 rounded-xl hover:bg-blue-700 transition"
          >
            Kembali ke Dashboard
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-100">
      <ClientPortalHeader user={user} subtitle="Portal Client · Request Baru" />
      <div className="p-6">
      <div className="max-w-xl mx-auto bg-white rounded-2xl shadow-lg p-8">
        <button
          onClick={goBack}
          className="text-gray-400 hover:text-gray-600 mb-6 flex items-center gap-2 text-sm"
        >
          ← Kembali
        </button>

        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-800">Buat Request Baru</h1>
          <p className="text-sm text-gray-400 mt-1">Pilih request biasa atau request link formulir online.</p>
        </div>

        <div className="mb-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => {
              setRequestType(SERVICE_REQUEST_TYPE)
              if (kategori === 'Formulir Online') setKategori(initialKategori || '')
              if (judul === 'Request Link Formulir Online') setJudul(initialJudul || '')
            }}
            className={
              'rounded-2xl border px-4 py-4 text-left transition ' +
              (!isFormRequestType ? 'border-blue-500 bg-blue-50 text-blue-900' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50')
            }
          >
            <p className="font-bold">Request biasa</p>
            <p className="text-xs mt-1">Untuk layanan pengerjaan seperti biasa.</p>
          </button>

          <button
            type="button"
            onClick={() => {
              setRequestType(FORM_REQUEST_TYPE)
              setKategori('Formulir Online')
              if (!judul || judul === initialJudul) setJudul('Request Link Formulir Online')
            }}
            className={
              'rounded-2xl border px-4 py-4 text-left transition ' +
              (isFormRequestType ? 'border-green-500 bg-green-50 text-green-900' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50')
            }
          >
            <p className="font-bold">Request Link Formulir</p>
            <p className="text-xs mt-1">1 request hanya untuk 1 form. Aktif setelah pembayaran diverifikasi.</p>
          </button>
        </div>

        {serviceFromStorage && !isFormRequestType && (
          <div className="border border-blue-100 bg-blue-50 rounded-2xl p-4 mb-6">
            <p className="text-xs text-blue-500 mb-1">Layanan dipilih</p>
            <h2 className="font-bold text-blue-900 mb-2">
              {serviceFromStorage.service_name}
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm mb-3">
              <div>
                <p className="text-blue-500 text-xs">Kategori</p>
                <p className="font-medium text-blue-800">{serviceFromStorage.category_name}</p>
              </div>

              <div>
                <p className="text-blue-500 text-xs">Estimasi Waktu</p>
                <p className="font-medium text-blue-800">{serviceFromStorage.estimated_time || '-'}</p>
              </div>

              <div className="sm:col-span-2">
                <p className="text-blue-500 text-xs">Estimasi Harga</p>
                <p className="font-medium text-blue-800">
                  {serviceFromStorage.price_start && serviceFromStorage.price_end
                    ? `${formatRupiah(serviceFromStorage.price_start)} - ${formatRupiah(serviceFromStorage.price_end)}`
                    : serviceFromStorage.price_start
                      ? `Mulai ${formatRupiah(serviceFromStorage.price_start)}`
                      : '-'}
                </p>
              </div>
            </div>

            {serviceFromStorage.price_note && (
              <p className="text-xs text-blue-700">
                {serviceFromStorage.price_note}
              </p>
            )}
          </div>
        )}

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Judul Request</label>
          <input
            type="text"
            placeholder="Contoh: Desain logo perusahaan"
            value={judul}
            onChange={(e) => setJudul(e.target.value)}
            className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Kategori</label>
          <select
            value={kategori}
            onChange={(e) => setKategori(e.target.value)}
            disabled={isFormRequestType}
            className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          >
            <option value="">Pilih kategori...</option>
            <option value="Penulisan">Penulisan</option>
            <option value="Desain">Desain</option>
            <option value="Video">Video</option>
            <option value="Programming">Programming</option>
            <option value="Lainnya">Lainnya</option>
            <option value="Formulir Online">Formulir Online</option>
          </select>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Deskripsi</label>
          <textarea
            placeholder={isFormRequestType ? 'Jelaskan kebutuhan form, contoh: Formulir Peserta Didik Baru, kuesioner alumni, survei kepuasan, atau kebutuhan lain.' : 'Jelaskan detail request kamu...'}
            value={deskripsi}
            onChange={(e) => setDeskripsi(e.target.value)}
            rows={5}
            className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">{isFormRequestType ? 'Target Link Aktif' : 'Deadline Tugas'}</label>
          <input
            type="datetime-local"
            value={deadlineAt}
            onChange={(e) => setDeadlineAt(e.target.value)}
            className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <p className="text-xs text-gray-400 mt-2">
            {isFormRequestType ? 'Isi target kapan link formulir ingin mulai digunakan.' : 'Deadline diisi oleh client dan akan terlihat oleh admin sebagai acuan pengerjaan.'}
          </p>
        </div>

        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {isFormRequestType ? 'Upload Contoh Form / Dokumen Pendukung' : 'Upload File Pendukung'}
          </label>
          <input
            type="file"
            multiple
            accept=".pdf,.doc,.docx,.xls,.xlsx,.zip,.jpg,.jpeg,.png,.webp"
            onChange={(e) => setFiles(Array.from(e.target.files || []))}
            className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm"
          />
          <p className="text-xs text-gray-400 mt-2">
            {isFormRequestType ? 'Opsional. Upload contoh formulir, draft pertanyaan, atau dokumen acuan. Maksimal 5 MB per file.' : 'Opsional. Bisa lebih dari satu file. Maksimal 5 MB per file.'}
          </p>

          {files.length > 0 && (
            <div className="mt-3 space-y-1">
              {files.map((file, index) => (
                <p key={index} className="text-xs text-gray-500">
                  {index + 1}. {file.name} — {(file.size / 1024 / 1024).toFixed(2)} MB
                </p>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={handleSubmit}
          disabled={loading}
          className="w-full bg-blue-600 text-white font-medium py-3 rounded-xl hover:bg-blue-700 transition disabled:opacity-50"
        >
          {loading ? 'Mengirim...' : isFormRequestType ? 'Kirim Request Link Formulir' : 'Kirim Request'}
        </button>
      </div>
      </div>
    </div>
  )
}

export default RequestForm