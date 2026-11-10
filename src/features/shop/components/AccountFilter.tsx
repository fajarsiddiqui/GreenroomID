import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../../supabase'

type Account = { email: string }

export default function AccountFilter({ value, onChange }: { value: string; onChange: (email: string) => void }) {
  const [emails, setEmails] = useState<string[]>([])
  const load = useCallback(async () => {
    const all: string[] = []
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabase.rpc('shop_admin_list_accounts').range(offset, offset + 999)
      if (error) return
      const rows = (data ?? []) as Account[]
      all.push(...rows.map((account) => account.email))
      if (rows.length < 1000) break
    }
    setEmails([...new Set(all)]
      .sort((a, b) => a.localeCompare(b, 'id-ID')))
  }, [])
  useEffect(() => { void load() }, [load])
  return <select aria-label="Filter akun" className="mt-2 w-full min-w-40 rounded border border-greenroom-input-border bg-white p-2 text-xs"
    value={value} onFocus={() => void load()} onChange={(event) => onChange(event.target.value)}>
    <option value="">Semua akun</option>
    {emails.map((email) => <option key={email} value={email}>{email}</option>)}
  </select>
}
