import { Link, useLocation } from 'react-router-dom'

const pageMap = {
  '/layanan-gratis': {
    title: 'Layanan Gratis',
    description: 'Halaman layanan gratis sedang disiapkan. Nanti bagian ini bisa dipakai untuk promo, layanan terbatas, atau program bantuan dari GreenroomID.'
  },
  '/donate-us': {
    title: 'Donate Us',
    description: 'Halaman donasi sedang disiapkan. Bagian ini bisa dipakai untuk menampilkan metode dukungan dan pesan singkat untuk pengunjung.'
  },
  '/top-donatur': {
    title: 'Top Donatur',
    description: 'Halaman top donatur sedang disiapkan. Nanti halaman ini bisa menampilkan daftar pendukung terbaik GreenroomID.'
  },
  '/kritik-saran': {
    title: 'Kritik dan Saran',
    description: 'Halaman kritik dan saran sedang disiapkan. Nanti pengunjung bisa mengirim masukan agar layanan GreenroomID semakin rapi.'
  }
}

function ComingSoonPage() {
  const location = useLocation()
  const page = pageMap[location.pathname] || {
    title: 'Coming Soon',
    description: 'Halaman ini sedang disiapkan dan akan tersedia setelah fiturnya selesai dibuat.'
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center px-4 py-10">
      <div className="max-w-xl w-full bg-gray-950 text-white rounded-[2rem] p-8 shadow-lg text-center">
        <div className="w-16 h-16 rounded-2xl bg-white mx-auto p-2 mb-5">
          <img src="/favicon.svg" alt="GreenroomID logo" className="w-full h-full object-contain" />
        </div>
        <p className="text-xs font-bold tracking-[0.2em] text-green-300 uppercase mb-3">Coming Soon</p>
        <h1 className="text-3xl font-black mb-4">{page.title}</h1>
        <p className="text-gray-300 leading-relaxed mb-7">{page.description}</p>
        <div className="flex flex-col sm:flex-row justify-center gap-3">
          <Link to="/" className="bg-white text-gray-950 px-5 py-3 rounded-2xl text-sm font-bold hover:bg-gray-100 transition">
            Kembali ke Landing
          </Link>
          <Link to="/layanan" className="bg-gray-800 text-white px-5 py-3 rounded-2xl text-sm font-bold hover:bg-gray-700 transition">
            Lihat Daftar Layanan
          </Link>
        </div>
      </div>
    </div>
  )
}

export default ComingSoonPage
