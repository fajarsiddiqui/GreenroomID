import { supabase } from '../../../supabase'

export type ShopImage = { id: string; product_id: string; variant_id: string | null; path: string; sort_order: number }
export const imageAccept = 'image/jpeg,image/png,image/webp'
const bucket = 'shop-images'

export function imageUrl(path: string) {
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl
}

async function prepareImage(file: File): Promise<{ blob: Blob; extension: string }> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Pilih gambar JPG, PNG, atau WebP.')
  const source = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.src = source
    await image.decode()
    const scale = Math.min(1, 1200 / Math.max(image.naturalWidth, image.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Gagal memproses gambar.')
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    const encode = (type: string) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.85))
    let blob = await encode('image/webp')
    if (blob?.type !== 'image/webp') blob = await encode('image/jpeg')
    if (!blob) throw new Error('Gagal memproses gambar.')
    if (blob.size > 2097152) throw new Error('Gambar hasil kompresi masih lebih dari 2 MB.')
    return { blob, extension: blob.type === 'image/webp' ? 'webp' : 'jpg' }
  } catch (error) {
    if (error instanceof Error && error.message !== 'The source image cannot be decoded.') throw error
    throw new Error('Gambar tidak dapat dibuka.')
  } finally { URL.revokeObjectURL(source) }
}

export async function saveShopImage(file: File, productId: string, variantId: string | null, old?: ShopImage, sortOrder = 0) {
  const { blob, extension } = await prepareImage(file)
  const path = `${variantId ? 'variants' : 'products'}/${variantId ?? productId}/${crypto.randomUUID()}.${extension}`
  const storage = supabase.storage.from(bucket)
  const uploaded = await storage.upload(path, blob, { contentType: blob.type })
  if (uploaded.error) throw new Error('Gagal mengunggah gambar.')
  const result = old
    ? await supabase.from('shop_images').update({ path }).eq('id', old.id)
    : await supabase.from('shop_images').insert({ product_id: productId, variant_id: variantId, path, sort_order: sortOrder })
  if (result.error) {
    await storage.remove([path])
    throw new Error('Gagal menyimpan gambar.')
  }
  if (old) await storage.remove([old.path])
}

export async function deleteShopImage(image: ShopImage) {
  const removed = await supabase.from('shop_images').delete().eq('id', image.id)
  if (removed.error) throw new Error('Gagal menghapus gambar.')
  const object = await supabase.storage.from(bucket).remove([image.path])
  if (object.error) throw new Error('Data gambar dihapus, tetapi berkas gagal dihapus.')
}
