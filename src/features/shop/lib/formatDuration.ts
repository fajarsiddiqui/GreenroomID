export function formatDuration(days: number): string {
  return days === 30 ? '1 bulan' : `${days} hari`
}
