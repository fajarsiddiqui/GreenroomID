import type { ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { supabase } from '../../../supabase'

const links = [
  ['verifikasi', 'Verifikasi'], ['produk', 'Produk'], ['akun', 'Akun'],
  ['pembayaran', 'Pembayaran'], ['log', 'Log']
] as const

export default function ShopAdminShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  async function logout() { await supabase.auth.signOut(); navigate('/', { replace: true }) }
  return <div className="min-h-screen bg-greenroom-bg font-greenroom-sans text-greenroom-ink">
    <header className="border-b border-greenroom-border bg-white">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-5 py-4">
        <span aria-hidden="true" className="flex h-11 w-11 items-center justify-center rounded-greenroom-control bg-greenroom-primary font-extrabold text-white">GR</span>
        <span className="flex-1 text-lg font-extrabold">GreenroomID <span className="font-semibold text-greenroom-muted">Admin</span></span>
        <button type="button" onClick={() => void logout()} className="min-h-11 rounded-greenroom-control border border-greenroom-input-border bg-white px-4 font-bold">Keluar</button>
      </div>
      <nav aria-label="Navigasi shop admin" className="mx-auto flex max-w-7xl flex-wrap gap-2 px-5 pb-3">
        {links.map(([path, label]) => <NavLink key={path} to={`/shop/admin/${path}`}
          className={({ isActive }) => `inline-flex min-h-11 items-center rounded-greenroom-control px-4 font-bold ${isActive ? 'bg-greenroom-primary text-white' : 'text-greenroom-ink hover:bg-greenroom-tint'}`}>
          {label}
        </NavLink>)}
      </nav>
    </header>
    <main className="mx-auto max-w-7xl px-5 py-8">{children}</main>
  </div>
}
