type Props = { label: string; value: string; onChange: (value: string) => void; options?: string[]; date?: boolean; endValue?: string; onEndChange?: (value: string) => void }

export default function ColumnFilter({ label, value, onChange, options, date, endValue, onEndChange }: Props) {
  if (options) return <select aria-label={`Filter ${label}`} className="mt-2 w-full rounded border border-greenroom-input-border bg-white p-2 text-xs" value={value} onChange={(event) => onChange(event.target.value)}>
    <option value="">Semua</option>{options.map((option) => <option key={option} value={option}>{option}</option>)}
  </select>
  if (date) return <div className="mt-2 flex min-w-32 flex-col gap-1"><input aria-label={`${label} dari`} type="date" className="w-full rounded border border-greenroom-input-border bg-white p-2 text-xs" value={value} onChange={(event) => onChange(event.target.value)} /><input aria-label={`${label} sampai`} type="date" className="w-full rounded border border-greenroom-input-border bg-white p-2 text-xs" value={endValue ?? ''} onChange={(event) => onEndChange?.(event.target.value)} /></div>
  return <input aria-label={`Filter ${label}`} type="search" placeholder={`Cari ${label.toLowerCase()}`} className="mt-2 w-full min-w-24 rounded border border-greenroom-input-border bg-white p-2 text-xs" value={value} onChange={(event) => onChange(event.target.value)} />
}
