import { Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase } from '../supabase'

function ServiceCategoriesPage() {
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchCategories = async () => {
    setLoading(true)

    const { data, error } = await supabase
      .from('service_categories')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })

    if (error) {
      alert('Gagal mengambil kategori layanan: ' + error.message)
      setCategories([])
    } else {
      setCategories(data || [])
    }

    setLoading(false)
  }

  useEffect(() => {
    fetchCategories()
  }, [])

  const handleGoogleLogin = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin
      }
    })

    if (error) alert('Error: ' + error.message)
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="max-w-6xl mx-auto px-6 py-6">
        <div className="flex items-center justify-between mb-10">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">GreenroomID</h1>
            <p className="text-sm text-gray-500">Kategori Layanan</p>
          </div>

          <div className="flex gap-3">
            <Link
              to="/"
              className="bg-white text-gray-700 border border-gray-200 px-5 py-2 rounded-xl text-sm hover:bg-gray-50 transition"
            >
              Kembali
            </Link>

            <button
              onClick={handleGoogleLogin}
              className="bg-gray-900 text-white px-5 py-2 rounded-xl text-sm hover:bg-gray-800 transition"
            >
              Masuk
            </button>
          </div>
        </div>

        <div className="bg-white rounded-3xl shadow-sm p-8 mb-6">
          <p className="inline-block bg-green-100 text-green-700 text-xs font-medium px-3 py-1 rounded-full mb-4">
            Daftar kategori
          </p>

          <h2 className="text-4xl font-bold text-gray-900 mb-4">
            Pilih jenis layanan
          </h2>

          <p className="text-gray-600 leading-relaxed max-w-3xl">
            Pilih kategori layanan yang sesuai dengan kebutuhanmu. Setelah memilih
            kategori, kamu akan melihat daftar layanan, estimasi harga, estimasi
            waktu, dan keterangan tiap layanan.
          </p>
        </div>

        {loading && (
          <div className="bg-white rounded-3xl shadow-sm p-10 text-center">
            <p className="text-gray-400">Memuat kategori layanan...</p>
          </div>
        )}

        {!loading && categories.length === 0 && (
          <div className="bg-white rounded-3xl shadow-sm p-10 text-center">
            <p className="text-4xl mb-3">📦</p>
            <h3 className="font-bold text-gray-800 mb-2">
              Belum ada kategori layanan aktif
            </h3>
            <p className="text-sm text-gray-500">
              Kategori layanan akan muncul setelah admin menambah atau mengaktifkan layanan.
            </p>
          </div>
        )}

        {!loading && categories.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-8">
            {categories.map((category) => (
              <Link
                key={category.id}
                to={`/layanan/${category.slug}`}
                className="bg-white rounded-3xl shadow-sm p-6 hover:shadow-md transition block"
              >
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <p className="text-4xl mb-3">{category.icon || '📌'}</p>
                    <h3 className="text-2xl font-bold text-gray-900 mb-2">
                      {category.name}
                    </h3>
                  </div>

                  <span className="text-xs bg-blue-50 text-blue-600 px-3 py-1 rounded-full">
                    Lihat daftar
                  </span>
                </div>

                <p className="text-sm text-gray-600 leading-relaxed">
                  {category.description || 'Lihat daftar layanan dan estimasi harga untuk kategori ini.'}
                </p>
              </Link>
            ))}
          </div>
        )}

        <div className="bg-gray-900 rounded-3xl p-8 text-center">
          <h2 className="text-2xl font-bold text-white mb-3">
            Ingin membuat request?
          </h2>
          <p className="text-gray-300 mb-6">
            Pilih jenis layanan terlebih dahulu, lalu pilih paket layanan yang paling sesuai.
          </p>
          <button
            onClick={handleGoogleLogin}
            className="bg-white text-gray-900 px-6 py-3 rounded-xl text-sm font-medium hover:bg-gray-100 transition"
          >
            Masuk dengan Google
          </button>
        </div>

        <div className="py-8 text-center text-xs text-gray-400">
          © {new Date().getFullYear()} GreenroomID. Platform Freelance Terkelola.
        </div>
      </div>
    </div>
  )
}

export default ServiceCategoriesPage