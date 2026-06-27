-- =====================================================
-- GreenroomID H25 - Client Profile Lite
-- Jalankan setelah account-management-update.sql.
-- Menambah profil ringan untuk client dan preferensi nama donatur.
-- =====================================================

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS donor_display_name text,
  ADD COLUMN IF NOT EXISTS donor_public_default boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS user_profiles_donor_public_idx
ON public.user_profiles(donor_public_default);

COMMENT ON COLUMN public.user_profiles.phone IS 'Nomor WhatsApp opsional client.';
COMMENT ON COLUMN public.user_profiles.donor_display_name IS 'Nama tampilan khusus jika client ingin tampil di Top Donatur.';
COMMENT ON COLUMN public.user_profiles.donor_public_default IS 'Preferensi default apakah nama client ditampilkan sebagai donatur publik.';

-- Pastikan policy lama tetap ada dan mengizinkan user mengubah profil sendiri.
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "User profiles select own or admin" ON public.user_profiles;
DROP POLICY IF EXISTS "User profiles insert own" ON public.user_profiles;
DROP POLICY IF EXISTS "User profiles update own or admin" ON public.user_profiles;

CREATE POLICY "User profiles select own or admin"
ON public.user_profiles
FOR SELECT
TO authenticated
USING (auth.uid() = id OR public.is_admin());

CREATE POLICY "User profiles insert own"
ON public.user_profiles
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id AND role = 'client');

CREATE POLICY "User profiles update own or admin"
ON public.user_profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = id OR public.is_admin())
WITH CHECK (auth.uid() = id OR public.is_admin());

GRANT SELECT, INSERT, UPDATE ON public.user_profiles TO authenticated;

NOTIFY pgrst, 'reload schema';
