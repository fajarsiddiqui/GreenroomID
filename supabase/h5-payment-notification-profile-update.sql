-- =====================================================
-- GreenroomID H5 Payment, Profile, Notification Update
-- Jalankan file ini di Supabase SQL Editor sebelum deploy kode H5.
-- Aman untuk data lama: tidak menghapus request, bukti bayar, file client, atau file hasil.
-- =====================================================

-- =====================================================
-- 1. ADMIN PAYMENT SETTINGS
-- =====================================================

CREATE TABLE IF NOT EXISTS public.admin_payment_settings (
  id text PRIMARY KEY DEFAULT 'default',
  admin_name text,
  admin_phone text,
  bank_name text,
  account_type text,
  account_number text,
  account_holder text,
  payment_instruction text,
  qris_url text,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.admin_payment_settings (id)
VALUES ('default')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.admin_payment_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Payment settings select authenticated" ON public.admin_payment_settings;
DROP POLICY IF EXISTS "Payment settings insert admin only" ON public.admin_payment_settings;
DROP POLICY IF EXISTS "Payment settings update admin only" ON public.admin_payment_settings;

CREATE POLICY "Payment settings select authenticated"
ON public.admin_payment_settings
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Payment settings insert admin only"
ON public.admin_payment_settings
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin());

CREATE POLICY "Payment settings update admin only"
ON public.admin_payment_settings
FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- =====================================================
-- 2. DISKUSI READ RECEIPTS / NOTIFICATION BADGES
-- =====================================================

ALTER TABLE public.diskusi
ADD COLUMN IF NOT EXISTS read_by_admin_at timestamptz,
ADD COLUMN IF NOT EXISTS read_by_client_at timestamptz;

-- Tandai pesan lama sebagai sudah terbaca agar badge hanya muncul untuk pesan baru setelah update ini.
UPDATE public.diskusi
SET read_by_admin_at = COALESCE(read_by_admin_at, created_at, now())
WHERE role = 'client'
  AND read_by_admin_at IS NULL;

UPDATE public.diskusi
SET read_by_client_at = COALESCE(read_by_client_at, created_at, now())
WHERE role = 'admin'
  AND read_by_client_at IS NULL;

CREATE INDEX IF NOT EXISTS diskusi_unread_admin_idx
ON public.diskusi (request_id, role, read_by_admin_at);

CREATE INDEX IF NOT EXISTS diskusi_unread_client_idx
ON public.diskusi (request_id, role, read_by_client_at);

-- Client dan admin boleh update read receipt, tetapi bukan isi pesan.
CREATE OR REPLACE FUNCTION public.protect_diskusi_read_receipts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.request_id IS DISTINCT FROM OLD.request_id
     OR NEW.pengirim_email IS DISTINCT FROM OLD.pengirim_email
     OR NEW.pesan IS DISTINCT FROM OLD.pesan
     OR NEW.role IS DISTINCT FROM OLD.role
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Isi diskusi tidak boleh diubah';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_diskusi_read_receipts_trigger ON public.diskusi;

CREATE TRIGGER protect_diskusi_read_receipts_trigger
BEFORE UPDATE ON public.diskusi
FOR EACH ROW
EXECUTE FUNCTION public.protect_diskusi_read_receipts();

DROP POLICY IF EXISTS "Diskusi update read receipts own request or admin" ON public.diskusi;

CREATE POLICY "Diskusi update read receipts own request or admin"
ON public.diskusi
FOR UPDATE
TO authenticated
USING (
  public.is_admin()
  OR EXISTS (
    SELECT 1
    FROM public.requests r
    WHERE r.id::text = diskusi.request_id::text
      AND r.client_id = auth.uid()
      AND r.deleted_at IS NULL
  )
)
WITH CHECK (
  public.is_admin()
  OR EXISTS (
    SELECT 1
    FROM public.requests r
    WHERE r.id::text = diskusi.request_id::text
      AND r.client_id = auth.uid()
      AND r.deleted_at IS NULL
  )
);

-- =====================================================
-- 3. REQUEST LIST PERFORMANCE INDEXES
-- =====================================================

CREATE INDEX IF NOT EXISTS requests_active_created_at_idx
ON public.requests (created_at DESC)
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS requests_active_status_idx
ON public.requests (status, payment_status, invoice_status)
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS requests_active_deadline_idx
ON public.requests (deadline_at)
WHERE deleted_at IS NULL;

-- =====================================================
-- 4. NOTES
-- =====================================================
-- Kode H5 menyimpan QRIS sebagai file Storage di bucket request-files, folder admin-qris/.
-- File request_files lama tidak dimodifikasi. Kolom hasil_url/file_url/file_urls tetap dipertahankan.
