import { lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import AdminGuard from './components/AdminGuard'

const ShopDelivery = lazy(() => import('./pages/ShopDelivery'))
const AdminVerifikasi = lazy(() => import('./pages/admin/AdminVerifikasi'))
const AdminProduk = lazy(() => import('./pages/admin/AdminProduk'))
const AdminAkun = lazy(() => import('./pages/admin/AdminAkun'))
const AdminPembayaran = lazy(() => import('./pages/admin/AdminPembayaran'))
const AdminLog = lazy(() => import('./pages/admin/AdminLog'))

export default function ShopRoutes() {
  return (
    <Routes>
      <Route index element={<Navigate to="/" replace />} />
      <Route path="ambil/:id" element={<ShopDelivery />} />
      <Route path="admin" element={<AdminGuard />}>
        <Route path="verifikasi" element={<AdminVerifikasi />} />
        <Route path="produk" element={<AdminProduk />} />
        <Route path="akun" element={<AdminAkun />} />
        <Route path="pembayaran" element={<AdminPembayaran />} />
        <Route path="log" element={<AdminLog />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
