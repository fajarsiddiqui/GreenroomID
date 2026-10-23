import { useEffect, useRef, useState } from 'react'
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../../../supabase'
import { formatDuration } from '../../lib/formatDuration'
import ShopAdminShell from '../../components/ShopAdminShell'

type Tab = 'waiting_verification' | 'verified' | 'rejected'
type Order = {
  buyer_city: string; order_id: string; order_code: string; buyer_name: string; buyer_phone: string
  created_at: string; paid_at: string | null; status: Tab; proof_path: string | null
  product_name: string | null; account_type: string | null; duration_days: number | null; price: number | null
}
type Action = { kind: 'verify' | 'reject'; order: Order }

const queryClient = new QueryClient()
const tabs: { key: Tab; label: string }[] = [
  { key: 'waiting_verification', label: 'Menunggu' },
  { key: 'verified', label: 'Terverifikasi' },
  { key: 'rejected', label: 'Ditolak' }
]
const buttonBase = 'inline-flex min-h-11 items-center justify-center rounded-greenroom-control border px-4 font-bold focus-visible:outline-2 focus-visible:outline-greenroom-primary disabled:opacity-50'
const buttonClass = `${buttonBase} border-greenroom-input-border bg-white text-greenroom-ink hover:bg-greenroom-bg`
const primaryButtonClass = `${buttonBase} border-greenroom-primary bg-greenroom-primary text-white hover:bg-greenroom-primary-hover`
const dangerButtonClass = `${buttonBase} border-greenroom-danger bg-greenroom-danger text-white`

async function fetchOrders(tab: Tab): Promise<Order[]> {
  const { data, error } = await supabase.rpc('shop_admin_list_orders', { p_status: tab })
  if (error) throw error
  return (data || []) as unknown as Order[]
}

function beep() {
  try {
    const context = new AudioContext()
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.frequency.value = 880
    gain.gain.value = 0.08
    oscillator.connect(gain).connect(context.destination)
    oscillator.start()
    oscillator.stop(context.currentTime + 0.1)
    oscillator.onended = () => { void context.close() }
  } catch { /* Audio may be blocked until the admin interacts with the page. */ }
}

function QueuePage() {
  const client = useQueryClient()
  const [tab, setTab] = useState<Tab>('waiting_verification')
  const [now, setNow] = useState(Date.now)
  const [action, setAction] = useState<Action | null>(null)
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [rowError, setRowError] = useState('')
  const seenWaitingIds = useRef<Set<string> | null>(null)
  const waitingOrders = useQuery({ queryKey: ['admin-orders', 'waiting_verification'], queryFn: () => fetchOrders('waiting_verification'), refetchInterval: 5000 })
  const orders = useQuery({ queryKey: ['admin-orders', tab], queryFn: () => fetchOrders(tab), refetchInterval: 5000 })

  useEffect(() => {
    const originalTitle = document.title
    const restoreTitle = () => { document.title = originalTitle }
    const clock = window.setInterval(() => setNow(Date.now()), 30000)
    window.addEventListener('focus', restoreTitle)
    return () => {
      window.clearInterval(clock)
      window.removeEventListener('focus', restoreTitle)
      restoreTitle()
    }
  }, [])

  useEffect(() => {
    if (!waitingOrders.data) return
    const ids = new Set(waitingOrders.data.map((order) => order.order_id))
    if (seenWaitingIds.current && waitingOrders.data.some((order) => !seenWaitingIds.current!.has(order.order_id))) {
      beep()
      document.title = '🔔 Pesanan Baru — GreenroomID Shop'
    }
    seenWaitingIds.current = ids
  }, [waitingOrders.data])

  useEffect(() => { setRowError('') }, [tab])

  async function viewProof(order: Order) {
    setRowError('')
    const popup = window.open('about:blank', '_blank')
    if (popup) popup.opener = null
    try {
      const { data } = await supabase.auth.getSession()
      const jwt = data.session?.access_token
      if (!jwt) throw new Error('no_session')
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/proof-signed-url`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${jwt}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ order_id: order.order_id, admin_token: jwt })
      })
      if (!response.ok) throw new Error('signed_url_failed')
      const result = await response.json() as { signed_url?: string }
      if (!result.signed_url) throw new Error('missing_signed_url')
      if (popup) popup.location.href = result.signed_url
      else window.open(result.signed_url, '_blank', 'noopener,noreferrer')
    } catch {
      popup?.close()
      setRowError(`Gagal membuka bukti pesanan ${order.order_code}.`)
    }
  }

  async function confirmAction() {
    if (!action || busy) return
    if (action.kind === 'reject' && reason.trim().length < 10) {
      setError('Alasan penolakan minimal 10 karakter.')
      return
    }
    setBusy(true)
    setError('')
    const { error: rpcError } = action.kind === 'verify'
      ? await supabase.rpc('admin_verify_order', { p_order_id: action.order.order_id })
      : await supabase.rpc('admin_reject_order', {
        p_order_id: action.order.order_id, p_reason: reason.trim()
      })
    setBusy(false)
    if (rpcError) { setError('Aksi gagal. Perbarui daftar dan coba lagi.'); return }
    setAction(null)
    setReason('')
    await client.invalidateQueries({ queryKey: ['admin-orders'] })
  }

  return <ShopAdminShell>
      <h1 className="text-3xl font-extrabold">Verifikasi pembayaran</h1>
      <p className="mt-2 text-greenroom-muted">Cocokkan nominal dan bukti dengan mutasi sebelum memutuskan. Pembeli menunggu paling lama 10 menit.</p>
      <div role="tablist" aria-label="Filter status" className="mt-6 mb-5 flex flex-wrap gap-2">
        {tabs.map((item) => <button key={item.key} type="button" role="tab" aria-selected={tab === item.key}
          onClick={() => setTab(item.key)} className={`min-h-11 rounded-full border px-4 font-bold focus-visible:outline-2 focus-visible:outline-greenroom-primary ${tab === item.key ? 'border-greenroom-primary bg-greenroom-primary text-white' : 'border-greenroom-input-border bg-white text-greenroom-ink'}`}>
          {item.label}
        </button>)}
      </div>
      {rowError && <p role="alert" className="mb-4 text-greenroom-danger">{rowError}</p>}
      {orders.isPending && <p role="status">Memuat pesanan…</p>}
      {orders.isError && <div role="alert" className="space-x-3"><span>Gagal memuat pesanan.</span><button type="button" className={buttonClass} onClick={() => orders.refetch()}>Coba lagi</button></div>}
      {orders.data && <div className="overflow-x-auto rounded-greenroom-card border border-greenroom-border bg-white">
        <table className="w-full min-w-[1080px] border-collapse text-left text-sm">
          <thead className="bg-greenroom-tint text-xs uppercase text-greenroom-muted"><tr>
            {['Kode Order', 'Nama', 'HP', 'Varian', 'Harga', 'Waktu', 'Status', 'Aksi'].map((heading) => <th key={heading} scope="col" className="p-4">{heading}</th>)}
          </tr></thead>
          <tbody>{orders.data.map((order) => {
            const late = order.status === 'waiting_verification' && !!order.paid_at && now - Date.parse(order.paid_at) > 600000
            return <tr key={order.order_id} className="border-t border-greenroom-border align-top">
              <td className="p-4 font-bold">{order.order_code}</td>
              <td className="p-4">{order.buyer_name}</td>
              <td className="p-4">{order.buyer_phone}</td>
            <td className="p-4">{order.product_name ? `${order.product_name} · ${order.account_type === 'sharing' ? 'Sharing' : 'Private'} · ${formatDuration(order.duration_days || 0)}` : '—'}</td>
              <td className="p-4">{order.price !== null ? `Rp ${new Intl.NumberFormat('id-ID').format(order.price)}` : '—'}</td>
              <td className="p-4 whitespace-nowrap">{new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(order.created_at))}</td>
              <td className="p-4"><span className={`inline-block rounded-full px-3 py-1 font-bold ${order.status === 'verified' ? 'bg-greenroom-tint text-greenroom-primary' : order.status === 'rejected' ? 'bg-greenroom-danger-bg text-greenroom-danger' : 'bg-greenroom-warn-bg text-greenroom-warn-ink'}`}>
                {order.status === 'verified' ? 'Terverifikasi' : order.status === 'rejected' ? 'Ditolak' : 'Menunggu'}
              </span>{late && <span className="mt-1 block text-greenroom-warn-ink">Terlambat</span>}</td>
              <td className="p-4"><div className="flex flex-wrap gap-2">
                {order.status === 'waiting_verification' && <>
                  <button type="button" disabled={!order.proof_path} className={buttonClass} onClick={() => void viewProof(order)}>Lihat Bukti</button>
                  <button type="button" className={primaryButtonClass} onClick={() => { setRowError(''); setAction({ kind: 'verify', order }); setError('') }}>Verifikasi</button>
                  <button type="button" className={`${buttonClass} border-greenroom-danger text-greenroom-danger`} onClick={() => { setRowError(''); setAction({ kind: 'reject', order }); setError('') }}>Tolak</button>
                </>}
              </div></td>
            </tr>
          })}</tbody>
        </table>
        {orders.data.length === 0 && <p className="p-10 text-center text-greenroom-muted">Tidak ada pesanan di tab ini.</p>}
      </div>}
    {action && <div className="fixed inset-0 z-50 flex items-center justify-center bg-greenroom-ink/60 p-5">
      <section role="dialog" aria-modal="true" aria-label={action.kind === 'verify' ? 'Konfirmasi verifikasi' : 'Alasan penolakan'} className="w-full max-w-md rounded-greenroom-card bg-white p-6">
        <h2 className="text-xl font-extrabold">{action.kind === 'verify' ? 'Konfirmasi verifikasi' : 'Tolak pembayaran'}</h2>
        {action.kind === 'verify' ? <p className="mt-3">Konfirmasi verifikasi pesanan {action.order.order_code}?</p> : <label className="mt-4 block font-bold">Alasan penolakan
          <textarea required minLength={10} value={reason} onChange={(event) => setReason(event.target.value)} className="mt-2 min-h-24 w-full rounded-greenroom-control border border-greenroom-input-border p-3" />
        </label>}
        {error && <p role="alert" className="mt-3 text-greenroom-danger">{error}</p>}
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" disabled={busy} className={buttonClass} onClick={() => { setAction(null); setReason(''); setError('') }}>Batal</button>
          <button type="button" disabled={busy} className={action.kind === 'verify' ? primaryButtonClass : dangerButtonClass} onClick={() => void confirmAction()}>
            {busy ? 'Memproses…' : action.kind === 'verify' ? 'Verifikasi' : 'Tolak'}
          </button>
        </div>
      </section>
    </div>}
  </ShopAdminShell>
}

export default function AdminVerifikasi() {
  return <QueryClientProvider client={queryClient}><QueuePage /></QueryClientProvider>
}
