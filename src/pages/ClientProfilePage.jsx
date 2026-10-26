import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import ClientPortalHeader from '../components/ClientPortalHeader'

const normalizePhone = (value) => String(value || '').replace(/[^0-9+]/g, '').slice(0, 20)

const getFallbackName = (user) => {
  const emailName = String(user?.email || '').split('@')[0]
  return user?.user_metadata?.full_name || user?.user_metadata?.name || emailName || 'Client GreenroomID'
}

function ClientProfilePage({ user }) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [form, setForm] = useState({
    full_name: '',
    phone: ''
  })

  const fetchProfile = async () => {
    setLoading(true)
    setMessage('')

    const { data, error } = await supabase
      .from('user_profiles')
      .select('full_name, phone')
      .eq('id', user.id)
      .maybeSingle()

    if (error) {
      setMessage('Gagal mengambil profil. Jalankan SQL supabase/h25-client-profile-lite.sql jika kolom profil belum tersedia. Detail: ' + error.message)
    }

    setForm({
      full_name: data?.full_name || getFallbackName(user),
      phone: data?.phone || ''
    })

    setLoading(false)
  }

  useEffect(() => {
    fetchProfile()
    // H37: profil dimuat ulang hanya saat user id berubah.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id])

  const saveProfile = async () => {
    const fullName = form.full_name.trim()
    const phone = normalizePhone(form.phone)

    if (fullName.length < 2) {
      setMessage('Nama tampilan minimal 2 karakter.')
      return
    }

    setSaving(true)
    setMessage('')

    const payload = {
      id: user.id,
      email: user.email,
      full_name: fullName,
      phone: phone || null,
      updated_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString()
    }

    const { error } = await supabase
      .from('user_profiles')
      .upsert(payload, { onConflict: 'id' })

    if (error) {
      setMessage('Gagal menyimpan profil. Detail: ' + error.message)
    } else {
      setMessage('Profil berhasil disimpan.')
      setForm((current) => ({
        ...current,
        phone,
        full_name: fullName
      }))
    }

    setSaving(false)
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <ClientPortalHeader user={user} subtitle="Portal Client · Profil Saya" />

      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-white rounded-3xl shadow-sm p-8 mb-6">
          <p className="inline-block bg-green-100 text-green-700 text-xs font-medium px-3 py-1 rounded-full mb-4">
            Profil Saya
          </p>
          <h2 className="text-3xl font-bold text-gray-900 mb-3">Atur identitas client</h2>
          <p className="text-gray-600 leading-relaxed max-w-3xl">
            Profil ini menyimpan nama tampilan dan nomor WhatsApp untuk kebutuhan akun serta request.
          </p>
        </div>

        {loading && (
          <div className="bg-white rounded-2xl shadow-sm p-10 text-center text-gray-400">
            Memuat profil...
          </div>
        )}

        {!loading && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-white rounded-3xl shadow-sm p-6 space-y-5">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Email akun</label>
                <input
                  value={user.email || ''}
                  disabled
                  className="w-full border border-gray-200 bg-gray-50 text-gray-500 rounded-xl px-4 py-3 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">Nama tampilan</label>
                <input
                  value={form.full_name}
                  onChange={(event) => setForm({ ...form, full_name: event.target.value })}
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10"
                  placeholder="Nama client"
                />
                <p className="text-xs text-gray-400 mt-1">Nama ini menjadi identitas utama di dashboard.</p>
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">Nomor WhatsApp opsional</label>
                <input
                  value={form.phone}
                  onChange={(event) => setForm({ ...form, phone: normalizePhone(event.target.value) })}
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10"
                  placeholder="62812xxxx"
                />
                <p className="text-xs text-gray-400 mt-1">Opsional. Bisa dipakai untuk kontak terkait request.</p>
              </div>

              {message && (
                <div className={`rounded-2xl px-4 py-3 text-sm ${message.includes('berhasil') ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-yellow-50 text-yellow-700 border border-yellow-100'}`}>
                  {message}
                </div>
              )}

              <div className="flex flex-col sm:flex-row justify-end gap-2">
                <button
                  onClick={fetchProfile}
                  disabled={saving}
                  className="bg-gray-100 text-gray-700 px-5 py-3 rounded-xl text-sm hover:bg-gray-200 disabled:opacity-50"
                >
                  Reset
                </button>
                <button
                  onClick={saveProfile}
                  disabled={saving}
                  className="bg-gray-900 text-white px-5 py-3 rounded-xl text-sm hover:bg-gray-800 disabled:opacity-50"
                >
                  {saving ? 'Menyimpan...' : 'Simpan Profil'}
                </button>
              </div>
            </div>

            <div className="bg-white rounded-3xl shadow-sm p-6 h-fit">
              <h3 className="font-bold text-gray-900 mb-4">Preview identitas</h3>

              <div className="border border-gray-200 rounded-2xl p-5">
                <p className="text-xs text-gray-400 mb-1">Nama client</p>
                <p className="text-lg font-bold text-gray-900">{form.full_name || getFallbackName(user)}</p>
                <p className="text-xs text-gray-400 mt-2 break-all">{user.email}</p>
              </div>

            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default ClientProfilePage
