import { lazy } from 'react'
import { Route, Routes } from 'react-router-dom'
import AdminGuard from './components/AdminGuard'

const ShopHome = lazy(() => import('./pages/ShopHome'))
const ShopOrder = lazy(() => import('./pages/ShopOrder'))
const ShopOrderStatus = lazy(() => import('./pages/ShopOrderStatus'))
const ShopResult = lazy(() => import('./pages/ShopResult'))
const AdminLogin = lazy(() => import('./pages/admin/AdminLogin'))
const AdminVerifikasi = lazy(() => import('./pages/admin/AdminVerifikasi'))
const AdminProduk = lazy(() => import('./pages/admin/AdminProduk'))
const AdminAkun = lazy(() => import('./pages/admin/AdminAkun'))
const AdminPembayaran = lazy(() => import('./pages/admin/AdminPembayaran'))
const AdminLog = lazy(() => import('./pages/admin/AdminLog'))
const ShopNotFound = lazy(() => import('./pages/ShopNotFound'))

export default function ShopRoutes() {
  return (
    <Routes>
      <Route index element={<ShopHome />} />
      <Route path="beli/:varianId" element={<ShopOrder />} />
      <Route path="order/:kode" element={<ShopOrderStatus />} />
      <Route path="order/:kode/hasil" element={<ShopResult />} />
      <Route path="admin/login" element={<AdminLogin />} />
      <Route path="admin" element={<AdminGuard />}>
        <Route path="verifikasi" element={<AdminVerifikasi />} />
        <Route path="produk" element={<AdminProduk />} />
        <Route path="akun" element={<AdminAkun />} />
        <Route path="pembayaran" element={<AdminPembayaran />} />
        <Route path="log" element={<AdminLog />} />
      </Route>
      <Route path="*" element={<ShopNotFound />} />
    </Routes>
  )
}
