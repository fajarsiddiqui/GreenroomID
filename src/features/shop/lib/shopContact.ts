import { QueryClient, useQuery } from '@tanstack/react-query'
import { getShopSupabase } from './supabase'

export const shopContactQueryClient = new QueryClient()

function normalizePhone(value: string | null | undefined) {
  const digits = String(value ?? '').replace(/\D/g, '')
  if (!digits) return null
  if (digits.startsWith('0')) return `62${digits.slice(1)}`
  return digits.startsWith('62') ? digits : `62${digits}`
}

export function useShopContact() {
  const fallback = normalizePhone(import.meta.env.VITE_SHOP_ADMIN_PHONE)
  const query = useQuery({ queryKey: ['shop-contact'], staleTime: 5 * 60 * 1000, queryFn: async () => {
    const { data, error } = await getShopSupabase().rpc('shop_public_contact')
    if (error) throw error
    return normalizePhone((data as { whatsapp: string | null }[] | null)?.[0]?.whatsapp)
  } })
  return query.data ?? fallback
}

export function buildWhatsAppLink(whatsapp: string | null, message: string) {
  const number = normalizePhone(whatsapp)
  return number ? `https://wa.me/${number}?text=${encodeURIComponent(message)}` : null
}
