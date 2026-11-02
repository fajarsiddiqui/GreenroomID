import { useState } from 'react'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { supabase } from '../../../../supabase'
import ShopAdminShell from '../../components/ShopAdminShell'

type Entry = { id: string; created_at: string; action: string; order_code: string | null;
  actor: string; detail: Record<string, unknown> | null; total_count: number }
type OtpEntry = { id: string; order_code: string; account_email: string | null;
  buyer_name: string | null; buyer_phone: string | null; buyer_device: string | null;
  buyer_city: string | null; taken_at: string; total_count: number }
const client = new QueryClient()
const button = 'inline-flex min-h-11 items-center justify-center rounded-greenroom-control border border-greenroom-input-border bg-white px-4 font-bold text-greenroom-ink disabled:opacity-50'
const actionLabels: Record<string, string> = {
  order_created: 'Pesanan dibuat', payment_submitted: 'Pembayaran dikirim', proof_uploaded: 'Bukti pembayaran diunggah',
  payment_retried: 'Pembayaran diulang', order_expired: 'Pesanan kedaluwarsa',
  order_verified: 'Pesanan diverifikasi', order_rejected: 'Pembayaran ditolak',
  product_created: 'Produk dibuat', product_updated: 'Produk diubah', product_deleted: 'Produk dihapus',
  variant_created: 'Varian dibuat', variant_updated: 'Varian diubah', variant_deleted: 'Varian dihapus',
  payment_method_created: 'Metode pembayaran dibuat', payment_method_updated: 'Metode pembayaran diubah',
  payment_method_deleted: 'Metode pembayaran dihapus', account_created: 'Akun dibuat',
  account_credentials_updated: 'Kredensial akun diubah', account_meta_updated: 'Data akun diubah',
  account_activated: 'Akun diaktifkan', account_deactivated: 'Akun dinonaktifkan',
  account_secret_revealed: 'Rahasia akun ditampilkan', credentials_revealed: 'Kredensial pembeli ditampilkan',
  totp_issue_started: 'Pengambilan kode authenticator dimulai', totp_code_delivered: 'Kode authenticator dikirim',
  totp_code_issued: 'Kode authenticator diterbitkan',
  image_created: 'Gambar ditambahkan', image_updated: 'Gambar diubah', image_deleted: 'Gambar dihapus'
}
function Page() {
  const [page, setPage] = useState(0)
  const [otpPage, setOtpPage] = useState(0)
  const otpLogs = useQuery({ queryKey: ['shop-admin-totp-log', otpPage], queryFn: async () => {
    const { data, error } = await supabase.rpc('shop_admin_totp_log', { p_limit: 50, p_offset: otpPage * 50 })
    if (error) throw error
    return (data ?? []) as OtpEntry[]
  } })
  const logs = useQuery({ queryKey: ['shop-admin-audit', page], queryFn: async () => {
    const { data, error } = await supabase.rpc('shop_admin_list_audit', { p_limit: 50, p_offset: page * 50 })
    if (error) throw error
    return (data ?? []) as Entry[]
  } })
  const total = logs.data?.[0]?.total_count ?? 0
  const time = new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
  return <ShopAdminShell>
    <h1 className="mb-6 text-3xl font-extrabold">Log pengambilan OTP</h1>
    {otpLogs.isPending && <p role="status">Memuat log OTP…</p>}
    {otpLogs.isError && <p role="alert" className="text-greenroom-danger">Gagal memuat log OTP. <button type="button" className={button} onClick={() => void otpLogs.refetch()}>Coba lagi</button></p>}
    <div className="overflow-x-auto rounded-greenroom-card border border-greenroom-border bg-white"><table className="w-full min-w-[900px] text-left text-sm">
      <thead className="bg-greenroom-tint text-greenroom-muted"><tr>{['Waktu pengambilan (WIB)', 'Kode', 'Akun', 'Nama', 'WhatsApp', 'Perangkat', 'Kota/kabupaten'].map((heading) => <th key={heading} className="p-4">{heading}</th>)}</tr></thead>
      <tbody>{otpLogs.data?.map((entry) => <tr key={entry.id} className="border-t border-greenroom-border"><td className="whitespace-nowrap p-4" title={entry.taken_at}>{time.format(new Date(entry.taken_at))} WIB</td>
        <td className="p-4">{entry.order_code}</td><td className="p-4">{entry.account_email ?? '—'}</td>
        <td className="p-4">{entry.buyer_name ?? '—'}</td><td className="p-4">{entry.buyer_phone ?? '—'}</td>
        <td className="p-4">{entry.buyer_device ?? '—'}</td><td className="p-4">{entry.buyer_city ?? '—'}</td></tr>)}</tbody>
    </table>{otpLogs.data?.length === 0 && <p className="p-4 text-greenroom-muted">Belum ada kode OTP yang diambil.</p>}</div>
    <div className="mt-5 flex items-center gap-3"><button type="button" className={button} disabled={otpPage === 0 || otpLogs.isPending} onClick={() => setOtpPage(otpPage - 1)}>Sebelumnya</button>
      <span className="text-greenroom-muted">Halaman {otpPage + 1} · Total {otpLogs.data?.[0]?.total_count ?? 0}</span>
      <button type="button" className={button} disabled={otpLogs.isPending || (otpPage + 1) * 50 >= (otpLogs.data?.[0]?.total_count ?? 0)} onClick={() => setOtpPage(otpPage + 1)}>Berikutnya</button></div>
    <h2 className="mb-4 mt-10 text-2xl font-bold">Aktivitas lain</h2>
    {logs.isPending && <p role="status">Memuat log…</p>}
    {logs.isError && <p role="alert" className="text-greenroom-danger">Gagal memuat log. <button type="button" className={button} onClick={() => void logs.refetch()}>Coba lagi</button></p>}
    <div className="overflow-x-auto rounded-greenroom-card border border-greenroom-border bg-white"><table className="w-full min-w-[750px] text-left text-sm">
      <thead className="bg-greenroom-tint text-greenroom-muted"><tr>{['Waktu', 'Aksi', 'Kode order', 'Pelaku', 'Detail'].map((heading) => <th key={heading} className="p-4">{heading}</th>)}</tr></thead>
      <tbody>{logs.data?.map((entry) => <tr key={entry.id} className="border-t border-greenroom-border align-top">
        <td className="p-4 whitespace-nowrap">{time.format(new Date(entry.created_at))}</td>
        <td className="p-4">{actionLabels[entry.action] ?? entry.action}</td><td className="p-4">{entry.order_code ?? '—'}</td>
        <td className="p-4">{entry.actor === 'admin' ? 'Admin' : entry.actor === 'system' ? 'Sistem' : entry.actor}</td>
        <td className="p-4"><details><summary className="min-h-11 cursor-pointer content-center font-bold">Lihat detail</summary>
          <pre className="max-w-md overflow-x-auto whitespace-pre-wrap break-all text-xs text-greenroom-muted">{JSON.stringify(entry.detail ?? {}, null, 2)}</pre></details></td>
      </tr>)}</tbody></table>{logs.data?.length === 0 && <p className="p-4 text-greenroom-muted">Belum ada log.</p>}</div>
    <div className="mt-5 flex items-center gap-3"><button type="button" className={button} disabled={page === 0 || logs.isPending} onClick={() => setPage(page - 1)}>Sebelumnya</button>
      <span className="text-greenroom-muted">Halaman {page + 1} · Total {total}</span>
      <button type="button" className={button} disabled={logs.isPending || (page + 1) * 50 >= total} onClick={() => setPage(page + 1)}>Berikutnya</button></div>
  </ShopAdminShell>
}
export default function AdminLog() { return <QueryClientProvider client={client}><Page /></QueryClientProvider> }
