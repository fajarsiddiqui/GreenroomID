import { useEffect, useRef, useState } from 'react'

export type GalleryItem = { url: string; caption: string; alt: string; variantId?: string }
const secondary = 'inline-flex min-h-11 min-w-11 items-center justify-center rounded-greenroom-control border border-greenroom-input-border bg-white px-3 font-bold text-greenroom-ink'
const primary = 'inline-flex min-h-11 items-center justify-center rounded-greenroom-control bg-greenroom-primary px-4 font-bold text-white hover:bg-greenroom-primary-hover'

export default function ShopGallery({ items, onClose, onSelect }: { items: GalleryItem[]; onClose: () => void; onSelect: (id: string) => void }) {
  const [index, setIndex] = useState(0)
  const [broken, setBroken] = useState<string[]>([])
  const dialog = useRef<HTMLDivElement>(null)
  const startX = useRef<number | null>(null)
  const item = items[index]
  const move = (step: number) => setIndex((current) => (current + step + items.length) % items.length)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    dialog.current?.focus()
    function keydown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
      if (event.key === 'ArrowLeft') move(-1)
      if (event.key === 'ArrowRight') move(1)
      if (event.key === 'Tab') {
        const controls = dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled)')
        if (!controls?.length) return
        const first = controls[0]; const last = controls[controls.length - 1]
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
        else if (document.activeElement === dialog.current) { event.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', keydown)
    return () => { document.removeEventListener('keydown', keydown); previous?.focus() }
  }, [onClose, items.length])
  if (!item) return null
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-greenroom-ink/80 p-3" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <div ref={dialog} role="dialog" aria-modal="true" aria-label="Galeri gambar produk" tabIndex={-1}
      className="max-h-[95vh] w-full max-w-3xl overflow-y-auto rounded-greenroom-card bg-white p-4 text-greenroom-ink sm:p-6"
      onTouchStart={(event) => { startX.current = event.touches[0].clientX }}
      onTouchEnd={(event) => { if (startX.current !== null) { const delta = event.changedTouches[0].clientX - startX.current; if (Math.abs(delta) > 50) move(delta > 0 ? -1 : 1) } startX.current = null }}>
      <div className="mb-3 flex items-center justify-between"><h2 className="text-xl font-bold">Gambar produk</h2><button type="button" className={secondary} onClick={onClose} aria-label="Tutup galeri">✕</button></div>
      {broken.includes(item.url) ? <div className="flex aspect-[4/3] items-center justify-center bg-greenroom-bg text-greenroom-muted">Gambar tidak tersedia</div>
        : <img src={item.url} alt={item.alt} className="aspect-[4/3] w-full object-contain" onError={() => setBroken((values) => [...values, item.url])} />}
      <p className="my-3 text-center font-bold">{item.caption}</p>
      <div className="flex items-center justify-between gap-3"><button type="button" className={secondary} onClick={() => move(-1)} aria-label="Gambar sebelumnya">←</button>
        <span className="text-sm text-greenroom-muted">{index + 1} / {items.length}</span><button type="button" className={secondary} onClick={() => move(1)} aria-label="Gambar berikutnya">→</button></div>
      {item.variantId && <button type="button" className={`${primary} mt-3 w-full`} onClick={() => onSelect(item.variantId!)}>Pilih varian ini</button>}
      <div className="mt-4 flex gap-2 overflow-x-auto">{items.map((entry, position) => <button key={`${entry.url}-${position}`} type="button" className={`min-h-11 min-w-11 rounded-greenroom-control border p-1 ${position === index ? 'border-greenroom-primary' : 'border-greenroom-border'}`} onClick={() => setIndex(position)} aria-label={`Lihat gambar ${position + 1}`} aria-current={position === index ? 'true' : undefined}>
        <img src={entry.url} alt="" className="h-12 w-12 object-cover" /></button>)}</div>
    </div>
  </div>
}
