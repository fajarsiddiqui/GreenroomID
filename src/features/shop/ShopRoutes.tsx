import { lazy } from 'react'
import { Route, Routes } from 'react-router-dom'

const ShopHome = lazy(() => import('./pages/ShopHome'))
const ShopOrder = lazy(() => import('./pages/ShopOrder'))
const ShopOrderStatus = lazy(() => import('./pages/ShopOrderStatus'))
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
      <Route path="admin/login" element={<AdminLogin />} />
      <Route path="admin/verifikasi" element={<AdminVerifikasi />} />
      <Route path="admin/produk" element={<AdminProduk />} />
      <Route path="admin/akun" element={<AdminAkun />} />
      <Route path="admin/pembayaran" element={<AdminPembayaran />} />
      <Route path="admin/log" element={<AdminLog />} />
      <Route path="*" element={<ShopNotFound />} />
    </Routes>
  )
}
