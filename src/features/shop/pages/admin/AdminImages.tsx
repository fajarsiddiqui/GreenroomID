import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../../../supabase'
import { deleteShopImage, imageAccept, imageUrl, saveShopImage } from '../../lib/shopImages'
import type { ShopImage } from '../../lib/shopImages'

const button = 'inline-flex min-h-11 items-center justify-center rounded-greenroom-control border border-greenroom-input-border bg-white px-4 font-bold text-greenroom-ink disabled:opacity-50'

export function AdminImages({ productId, variantId, images }: { productId: string; variantId?: string; images: ShopImage[] }) {
  const queryClient = useQueryClient()
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')
  const shown = images.filter((image) => image.product_id === productId && (variantId ? image.variant_id === variantId : !image.variant_id))
    .sort((a, b) => a.sort_order - b.sort_order)
  async function upload(files: FileList | null) {
    if (!files?.length || busy) return
    setBusy(true); setError('')
    try {
      if (variantId && files.length > 1) throw new Error('Pilih satu gambar varian.')
      for (let index = 0; index < files.length; index++) {
        setProgress(`Mengunggah gambar ${index + 1} dari ${files.length}…`)
        await saveShopImage(files[index], productId, variantId ?? null, variantId ? shown[0] : undefined,
          variantId ? 0 : Math.max(-1, ...shown.map((image) => image.sort_order)) + index + 1)
      }
      await queryClient.invalidateQueries({ queryKey: ['shop-admin-images'] })
      await queryClient.invalidateQueries({ queryKey: ['shop-images'] })
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Gagal mengunggah gambar.') }
    finally { setBusy(false); setProgress('') }
  }
  async function remove(image: ShopImage) {
    if (!window.confirm('Hapus gambar ini?') || busy) return
    setBusy(true); setError(''); setProgress('Menghapus gambar…')
    try { await deleteShopImage(image); await queryClient.invalidateQueries({ queryKey: ['shop-admin-images'] }); await queryClient.invalidateQueries({ queryKey: ['shop-images'] }) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Gagal menghapus gambar.') }
    finally { setBusy(false); setProgress('') }
  }
  async function move(index: number, direction: number) {
    const current = shown[index]; const other = shown[index + direction]
    if (!current || !other || busy) return
    setBusy(true); setError('')
    const order = shown.map((image) => image.id)
    ;[order[index], order[index + direction]] = [order[index + direction], order[index]]
    try {
      for (let position = 0; position < order.length; position++) {
        const { error: updateError } = await supabase.from('shop_images').update({ sort_order: position }).eq('id', order[position])
        if (updateError) throw updateError
      }
      await queryClient.invalidateQueries({ queryKey: ['shop-admin-images'] })
      await queryClient.invalidateQueries({ queryKey: ['shop-images'] })
    } catch { setError('Gagal mengubah urutan gambar.'); await queryClient.invalidateQueries({ queryKey: ['shop-admin-images'] }) }
    finally { setBusy(false) }
  }
  return <div className="space-y-3">
    <h3 className="font-bold">{variantId ? 'Gambar varian' : 'Gambar produk'}</h3>
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{shown.map((image, index) => <div key={image.id} className="rounded-greenroom-control border border-greenroom-border p-2">
      <img src={imageUrl(image.path)} alt={variantId ? 'Gambar varian' : `Gambar produk ${index + 1}`} className="aspect-square w-full rounded-greenroom-control object-cover" />
      <div className="mt-2 flex flex-wrap gap-1">{!variantId && <><button type="button" disabled={busy || index === 0} className={button} aria-label={`Naikkan gambar ${index + 1}`} onClick={() => void move(index, -1)}>↑</button>
        <button type="button" disabled={busy || index === shown.length - 1} className={button} aria-label={`Turunkan gambar ${index + 1}`} onClick={() => void move(index, 1)}>↓</button></>}
        <button type="button" disabled={busy} className={button} onClick={() => void remove(image)}>Hapus</button></div>
    </div>)}</div>
    <label className={`${button} cursor-pointer`}>{variantId ? shown.length ? 'Ganti gambar' : 'Pilih gambar' : 'Tambah gambar'}
      <input className="sr-only" type="file" accept={imageAccept} multiple={!variantId} disabled={busy}
        onChange={(event) => { void upload(event.target.files); event.target.value = '' }} /></label>
    {progress && <p role="status" className="text-sm text-greenroom-muted">{progress}</p>}
    {error && <p role="alert" className="text-sm text-greenroom-danger">{error}</p>}
  </div>
}
