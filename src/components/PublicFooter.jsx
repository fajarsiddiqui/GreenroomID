import { Link } from 'react-router-dom'

const footerLinks = [
  { label: 'Beranda', to: '/' },
  { label: 'Cara Kerja', to: '/cara-kerja' },
  { label: 'Layanan', to: '/layanan' },
  { label: 'FAQ', to: '/faq' },
  { label: 'Layanan Gratis', to: '/layanan-gratis' },
  { label: 'Ruang Belajar', to: '/ruang-belajar' },
  { label: 'Dukung GreenroomID', to: '/donate-us' },
  { label: 'Top Donatur', to: '/top-donatur' }
]

function PublicFooter({ className = '' }) {
  return (
    <footer className={`border-t border-gray-200 bg-white/80 px-6 py-8 text-gray-600 ${className}`}>
      <div className="mx-auto flex max-w-6xl flex-col gap-6 md:flex-row md:items-start md:justify-between">
        <div className="max-w-xl">
          <p className="text-base font-black text-gray-950">GreenroomID</p>
          <p className="mt-2 text-sm leading-relaxed">
            Platform bantuan tugas digital dan tools online untuk mendukung kebutuhan dokumen, presentasi, penulisan, data, dan pekerjaan digital lainnya.
          </p>
          <p className="mt-3 text-xs leading-relaxed text-gray-500">
            Harga dan waktu pada halaman layanan merupakan estimasi awal. Harga final dikonfirmasi setelah kebutuhan direview.
          </p>
        </div>

        <nav className="grid grid-cols-2 gap-x-5 gap-y-2 text-sm font-semibold sm:grid-cols-4 md:max-w-lg" aria-label="Link publik GreenroomID">
          {footerLinks.map((link) => (
            <Link key={link.to} to={link.to} className="text-gray-600 transition hover:text-green-700">
              {link.label}
            </Link>
          ))}
        </nav>
      </div>

      <p className="mx-auto mt-7 max-w-6xl text-xs text-gray-400">
        &copy; {new Date().getFullYear()} GreenroomID.
      </p>
    </footer>
  )
}

export default PublicFooter
