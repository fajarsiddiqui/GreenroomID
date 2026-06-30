-- =====================================================
-- GreenroomID H28 - Donation Public Visibility Toggle
-- Jalankan setelah:
-- 1) supabase/h26-midtrans-donation-gateway.sql
-- 2) supabase/h27-donation-anonymous-leaderboard.sql
--
-- Tujuan:
-- - Admin bisa menyembunyikan Donate Us dari publik tanpa menghapus data donasi.
-- - Admin bisa menyembunyikan Top Donatur dari publik tanpa menghapus leaderboard.
-- - Edge Function create-donation menolak invoice baru saat Donate Us dimatikan.
-- =====================================================

ALTER TABLE public.donation_settings
  ADD COLUMN IF NOT EXISTS show_donate_page boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_top_donors_page boolean NOT NULL DEFAULT true;

UPDATE public.donation_settings
SET
  show_donate_page = COALESCE(show_donate_page, true),
  show_top_donors_page = COALESCE(show_top_donors_page, true),
  updated_at = now()
WHERE id = 'default';

CREATE OR REPLACE FUNCTION public.get_public_donation_settings()
RETURNS TABLE (
  is_enabled boolean,
  show_donate_page boolean,
  show_top_donors_page boolean,
  title text,
  description text,
  min_amount integer,
  preset_amounts integer[],
  note text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    ds.is_enabled,
    ds.show_donate_page,
    ds.show_top_donors_page,
    ds.title,
    ds.description,
    ds.min_amount,
    ds.preset_amounts,
    ds.note
  FROM public.donation_settings ds
  WHERE ds.id = 'default'
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_donation_settings() TO anon, authenticated;
