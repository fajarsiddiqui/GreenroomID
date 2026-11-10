import { useState } from 'react'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { supabase } from '../../../../supabase'
import ShopAdminShell from '../../components/ShopAdminShell'
import AccountFilter from '../../components/AccountFilter'

type Feedback = { id: string; buyer_name: string | null; account_email: string | null;
  submitted_at: string; rating: string; comment: string | null; total_count: number }
const client = new QueryClient()
const pageSize = 10
const button = 'min-h-11 rounded-greenroom-control border border-greenroom-input-border bg-white px-4 font-bold disabled:opacity-50'
const time = new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })

function Page() {
  const [page, setPage] = useState(0)
  const [account, setAccount] = useState('')
  const feedback = useQuery({ queryKey: ['shop-admin-feedback', page, account], queryFn: async () => {
    const { data, error } = await supabase.rpc('shop_admin_list_feedback_filtered', { p_limit: pageSize, p_offset: page * pageSize, p_filters: { email: account } })
    if (error) throw error
    return (data ?? []) as Feedback[]
  } })
  const total = feedback.data?.[0]?.total_count ?? 0
  return <ShopAdminShell>
    <h1 className="mb-6 text-3xl font-extrabold">Penilaian pembeli</h1>
    {feedback.isPending && <p role="status">Memuat penilaian…</p>}
    {feedback.isError && <p role="alert" className="mb-4 text-greenroom-danger">Gagal memuat penilaian. <button type="button" className={button} onClick={() => void feedback.refetch()}>Coba lagi</button></p>}
    <div className="overflow-x-auto rounded-greenroom-card border border-greenroom-border bg-white"><table className="w-full min-w-[700px] text-left text-sm">
      <thead className="bg-greenroom-tint text-greenroom-muted"><tr>{['Nama pembeli', 'Akun yang dipakai', 'Waktu (WIB)', 'Penilaian', 'Kritik dan saran'].map((heading) => <th key={heading} className="p-4">{heading}</th>)}</tr><tr><th /><th className="px-4 pb-3"><AccountFilter value={account} onChange={(email) => { setPage(0); setAccount(email) }} /></th><th colSpan={3} /></tr></thead>
      <tbody>{feedback.data?.map((entry) => <tr key={entry.id} className="border-t border-greenroom-border align-top">
        <td className="p-4">{entry.buyer_name ?? '—'}</td><td className="break-all p-4">{entry.account_email ?? 'Akun dihapus'}</td>
        <td className="whitespace-nowrap p-4" title={entry.submitted_at}>{time.format(new Date(entry.submitted_at))} WIB</td>
        <td className="p-4 font-bold capitalize">{entry.rating}</td><td className="max-w-md whitespace-pre-wrap break-words p-4">{entry.comment || '—'}</td>
      </tr>)}</tbody></table>{feedback.data?.length === 0 && <p className="p-4 text-greenroom-muted">Tidak ada penilaian sesuai filter.</p>}</div>
    <div className="mt-5 flex items-center gap-3"><button type="button" className={button} disabled={page === 0 || feedback.isPending} onClick={() => setPage(page - 1)}>Sebelumnya</button>
      <span className="text-greenroom-muted">Halaman {page + 1} · Total {total}</span>
      <button type="button" className={button} disabled={feedback.isPending || (page + 1) * pageSize >= total} onClick={() => setPage(page + 1)}>Berikutnya</button></div>
  </ShopAdminShell>
}

export default function AdminPenilaian() {
  return <QueryClientProvider client={client}><Page /></QueryClientProvider>
}
