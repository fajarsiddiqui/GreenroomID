import { useState } from 'react'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { supabase } from '../../../../supabase'
import ShopAdminShell from '../../components/ShopAdminShell'

type OtpEntry = { id: string; order_code: string; account_email: string | null;
  buyer_name: string | null; buyer_phone: string | null; buyer_device: string | null;
  buyer_city: string | null; taken_at: string; total_count: number }
type ReissueEntry = { id: string; account_email: string | null; buyer_name: string | null;
  buyer_phone: string | null; buyer_device: string | null; buyer_city: string | null;
  taken_at: string; total_count: number }
const client = new QueryClient()
const pageSize = 10
const button = 'inline-flex min-h-11 items-center justify-center rounded-greenroom-control border border-greenroom-input-border bg-white px-4 font-bold text-greenroom-ink disabled:opacity-50'
function Page() {
  const [otpPage, setOtpPage] = useState(0)
  const [reissuePage, setReissuePage] = useState(0)
  const reissueLogs = useQuery({ queryKey: ['shop-admin-otp-reissue-log', reissuePage], queryFn: async () => {
    const { data, error } = await supabase.rpc('shop_admin_otp_reissue_log', { p_limit: pageSize, p_offset: reissuePage * pageSize })
    if (error) throw error
    return (data ?? []) as ReissueEntry[]
  } })
  const otpLogs = useQuery({ queryKey: ['shop-admin-totp-log', otpPage], queryFn: async () => {
    const { data, error } = await supabase.rpc('shop_admin_totp_log', { p_limit: pageSize, p_offset: otpPage * pageSize })
    if (error) throw error
    return (data ?? []) as OtpEntry[]
  } })
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
      <button type="button" className={button} disabled={otpLogs.isPending || (otpPage + 1) * pageSize >= (otpLogs.data?.[0]?.total_count ?? 0)} onClick={() => setOtpPage(otpPage + 1)}>Selanjutnya</button></div>
    <h2 className="mb-4 mt-10 text-2xl font-bold">Pengambilan OTP ulang</h2>
    {reissueLogs.isPending && <p role="status">Memuat log OTP ulang…</p>}
    {reissueLogs.isError && <p role="alert" className="text-greenroom-danger">Gagal memuat log OTP ulang. <button type="button" className={button} onClick={() => void reissueLogs.refetch()}>Coba lagi</button></p>}
    <div className="overflow-x-auto rounded-greenroom-card border border-greenroom-border bg-white"><table className="w-full min-w-[900px] text-left text-sm">
      <thead className="bg-greenroom-tint text-greenroom-muted"><tr>{['Waktu pengambilan (WIB)', 'Jenis', 'Akun', 'Nama', 'WhatsApp', 'Perangkat', 'Kota/kabupaten'].map((heading) => <th key={heading} className="p-4">{heading}</th>)}</tr></thead>
      <tbody>{reissueLogs.data?.map((entry) => <tr key={entry.id} className="border-t border-greenroom-border"><td className="whitespace-nowrap p-4" title={entry.taken_at}>{time.format(new Date(entry.taken_at))} WIB</td>
        <td className="p-4">OTP ulang</td><td className="p-4">{entry.account_email ?? 'Akun dihapus'}</td>
        <td className="p-4">{entry.buyer_name ?? '—'}</td><td className="p-4">{entry.buyer_phone ?? '—'}</td>
        <td className="p-4">{entry.buyer_device ?? '—'}</td><td className="p-4">{entry.buyer_city ?? '—'}</td></tr>)}</tbody>
    </table>{reissueLogs.data?.length === 0 && <p className="p-4 text-greenroom-muted">Belum ada OTP ulang yang diambil.</p>}</div>
    <div className="mt-5 flex items-center gap-3"><button type="button" className={button} disabled={reissuePage === 0 || reissueLogs.isPending} onClick={() => setReissuePage(reissuePage - 1)}>Sebelumnya</button>
      <span className="text-greenroom-muted">Halaman {reissuePage + 1} · Total {reissueLogs.data?.[0]?.total_count ?? 0}</span>
      <button type="button" className={button} disabled={reissueLogs.isPending || (reissuePage + 1) * pageSize >= (reissueLogs.data?.[0]?.total_count ?? 0)} onClick={() => setReissuePage(reissuePage + 1)}>Selanjutnya</button></div>
  </ShopAdminShell>
}
export default function AdminLog() { return <QueryClientProvider client={client}><Page /></QueryClientProvider> }
