import { lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import AdminGuard from './components/AdminGuard'

const ShopDelivery = lazy(() => import('./pages/ShopDelivery'))
const AdminAkun = lazy(() => import('./pages/admin/AdminAkun'))
const AdminLog = lazy(() => import('./pages/admin/AdminLog'))
const AdminPenilaian = lazy(() => import('./pages/admin/AdminPenilaian'))

export default function ShopRoutes() {
  return (
    <Routes>
      <Route index element={<Navigate to="/" replace />} />
      <Route path="ambil/:id" element={<ShopDelivery />} />
      <Route path="admin" element={<AdminGuard />}>
        <Route path="akun" element={<AdminAkun />} />
        <Route path="log" element={<AdminLog />} />
        <Route path="penilaian" element={<AdminPenilaian />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
