import { lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import AdminGuard from './components/AdminGuard'

const ShopDelivery = lazy(() => import('./pages/ShopDelivery'))
const ShopOtpUlang = lazy(() => import('./pages/ShopOtpUlang'))
const AdminAkun = lazy(() => import('./pages/admin/AdminAkun'))
const AdminLog = lazy(() => import('./pages/admin/AdminLog'))
const AdminPenilaian = lazy(() => import('./pages/admin/AdminPenilaian'))
const AdminOtpUlang = lazy(() => import('./pages/admin/AdminOtpUlang'))
const AdminKodeOtp = lazy(() => import('./pages/admin/AdminKodeOtp'))

export default function ShopRoutes() {
  return (
    <Routes>
      <Route index element={<Navigate to="/" replace />} />
      <Route path="ambil/:id" element={<ShopDelivery />} />
      <Route path="otp-ulang/:id" element={<ShopOtpUlang />} />
      <Route path="admin" element={<AdminGuard />}>
        <Route path="akun" element={<AdminAkun />} />
        <Route path="kode-otp" element={<AdminKodeOtp />} />
        <Route path="log" element={<AdminLog />} />
        <Route path="penilaian" element={<AdminPenilaian />} />
        <Route path="otp-ulang" element={<AdminOtpUlang />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
