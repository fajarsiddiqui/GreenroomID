-- =====================================================
-- GreenroomID RB-03 — Kontribusi Kurasi dan Publikasi
-- Mode Manual QR / Rekening + Verifikasi Admin
--
-- Tidak memakai Midtrans atau webhook.
-- QRIS, rekening, dan instruksi pembayaran diambil dari
-- public.admin_payment_settings (menu Admin > Profile Payment).
--
-- Alur:
-- accepted_pending_payment
--   -> user klik "Saya sudah melakukan pembayaran"
--   -> payment_pending
--   -> admin cek mutasi QRIS/rekening secara manual
--   -> admin verifikasi
--   -> published otomatis
--
-- Tidak menyimpan screenshot, bukti transfer, rekening user, kartu,
-- dokumen pribadi, atau file pembayaran.
-- =====================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =====================================================
-- 1. Status artikel untuk tahap pembayaran manual.
-- =====================================================
ALTER TABLE public.learning_entries
  DROP CONSTRAINT IF EXISTS learning_entries_status_check;

ALTER TABLE public.learning_entries
  ADD CONSTRAINT learning_entries_status_check
  CHECK (status IN (
    'draft',
    'submitted',
    'under_review',
    'revision_requested',
    'rejected',
    'accepted_pending_payment',
    'payment_pending',
    'payment_verified',
    'published',
    'withdrawn',
    'archived'
  ));

-- =====================================================
-- 2. Pengaturan kontribusi publikasi.
-- QRIS/rekening tetap memakai admin_payment_settings yang telah ada.
-- =====================================================
CREATE TABLE IF NOT EXISTS public.learning_payment_settings (
  id text PRIMARY KEY DEFAULT 'default',
  is_enabled boolean NOT NULL DEFAULT false,
  amount integer NOT NULL DEFAULT 25000,
  title text NOT NULL DEFAULT 'Kontribusi Kurasi dan Publikasi',
  description text NOT NULL DEFAULT 'Kontribusi ini digunakan untuk proses kurasi dan publikasi hasil pembelajaran yang telah diterima secara editorial.',
  policy_text text NOT NULL DEFAULT 'Keputusan editorial telah selesai sebelum kontribusi publikasi diminta. Kontribusi tidak menentukan diterima atau tidaknya tulisan. Tidak ada jaminan indeksasi, DOI, SINTA, LoA, maupun kredit akademik.',
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT learning_payment_settings_amount_check CHECK (amount >= 1000)
);

ALTER TABLE public.learning_payment_settings
  ADD COLUMN IF NOT EXISTS is_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS amount integer NOT NULL DEFAULT 25000,
  ADD COLUMN IF NOT EXISTS title text NOT NULL DEFAULT 'Kontribusi Kurasi dan Publikasi',
  ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT 'Kontribusi ini digunakan untuk proses kurasi dan publikasi hasil pembelajaran yang telah diterima secara editorial.',
  ADD COLUMN IF NOT EXISTS policy_text text NOT NULL DEFAULT 'Keputusan editorial telah selesai sebelum kontribusi publikasi diminta. Kontribusi tidak menentukan diterima atau tidaknya tulisan. Tidak ada jaminan indeksasi, DOI, SINTA, LoA, maupun kredit akademik.',
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.learning_payment_settings
  DROP CONSTRAINT IF EXISTS learning_payment_settings_amount_check;

ALTER TABLE public.learning_payment_settings
  ADD CONSTRAINT learning_payment_settings_amount_check CHECK (amount >= 1000);

INSERT INTO public.learning_payment_settings (id)
VALUES ('default')
ON CONFLICT (id) DO NOTHING;

-- =====================================================
-- 3. Riwayat konfirmasi pembayaran manual.
-- Tidak menyimpan bukti file atau detail instrumen pembayaran user.
-- =====================================================
CREATE TABLE IF NOT EXISTS public.learning_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid NOT NULL REFERENCES public.learning_entries(id) ON DELETE RESTRICT,
  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  amount integer NOT NULL,
  currency text NOT NULL DEFAULT 'IDR',
  provider text NOT NULL DEFAULT 'manual_qr',
  status text NOT NULL DEFAULT 'awaiting_verification',
  confirmed_at timestamptz NOT NULL DEFAULT now(),
  verified_at timestamptz,
  verified_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  verification_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Kompatibilitas aman bila file versi Midtrans sempat pernah dijalankan.
ALTER TABLE public.learning_payments
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS verified_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS verification_note text;

ALTER TABLE public.learning_payments
  ALTER COLUMN provider SET DEFAULT 'manual_qr';

-- Lepas constraint versi sebelumnya dahulu agar migrasi dari desain Midtrans
-- (bila pernah diuji) tidak gagal ketika status/provider dikonversi.
ALTER TABLE public.learning_payments
  DROP CONSTRAINT IF EXISTS learning_payments_amount_check,
  DROP CONSTRAINT IF EXISTS learning_payments_currency_check,
  DROP CONSTRAINT IF EXISTS learning_payments_provider_check,
  DROP CONSTRAINT IF EXISTS learning_payments_status_check;

UPDATE public.learning_payments
SET
  provider = 'manual_qr',
  status = CASE
    WHEN status = 'paid' THEN 'verified'
    WHEN status IN ('pending', 'failed', 'expired', 'cancelled', 'refunded') THEN 'not_verified'
    ELSE status
  END,
  confirmed_at = COALESCE(confirmed_at, created_at, now())
WHERE provider IS DISTINCT FROM 'manual_qr'
   OR confirmed_at IS NULL
   OR status IN ('pending', 'paid', 'failed', 'expired', 'cancelled', 'refunded');

ALTER TABLE public.learning_payments
  ALTER COLUMN confirmed_at SET NOT NULL;

ALTER TABLE public.learning_payments
  ADD CONSTRAINT learning_payments_amount_check CHECK (amount >= 1000),
  ADD CONSTRAINT learning_payments_currency_check CHECK (currency = 'IDR'),
  ADD CONSTRAINT learning_payments_provider_check CHECK (provider = 'manual_qr'),
  ADD CONSTRAINT learning_payments_status_check CHECK (status IN (
    'awaiting_verification',
    'verified',
    'not_verified',
    'cancelled'
  ));

CREATE INDEX IF NOT EXISTS learning_payments_entry_created_idx
ON public.learning_payments(entry_id, created_at DESC);

CREATE INDEX IF NOT EXISTS learning_payments_author_created_idx
ON public.learning_payments(author_id, created_at DESC);

CREATE INDEX IF NOT EXISTS learning_payments_status_created_idx
ON public.learning_payments(status, confirmed_at DESC);

DROP INDEX IF EXISTS public.learning_payments_one_pending_per_entry_idx;
DROP INDEX IF EXISTS public.learning_payments_one_paid_per_entry_idx;

CREATE UNIQUE INDEX IF NOT EXISTS learning_payments_one_awaiting_per_entry_idx
ON public.learning_payments(entry_id)
WHERE status = 'awaiting_verification';

CREATE UNIQUE INDEX IF NOT EXISTS learning_payments_one_verified_per_entry_idx
ON public.learning_payments(entry_id)
WHERE status = 'verified';

COMMENT ON TABLE public.learning_payment_settings IS 'Pengaturan nominal Kontribusi Kurasi dan Publikasi. QR/rekening memakai admin_payment_settings.';
COMMENT ON TABLE public.learning_payments IS 'Konfirmasi pembayaran manual Ruang Belajar. Tidak menyimpan screenshot, bukti transfer, rekening user, kartu, atau file pribadi.';

-- Trigger updated_at dari RB-01.
DROP TRIGGER IF EXISTS set_learning_payments_updated_at ON public.learning_payments;
CREATE TRIGGER set_learning_payments_updated_at
BEFORE UPDATE ON public.learning_payments
FOR EACH ROW
EXECUTE FUNCTION public.set_learning_updated_at();

-- =====================================================
-- 4. Pembayaran terverifikasi => artikel terbit otomatis.
-- Jika admin belum menemukan transaksi, artikel kembali ke tahap menunggu.
-- =====================================================
CREATE OR REPLACE FUNCTION public.sync_learning_entry_after_payment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP <> 'UPDATE' OR NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'verified' THEN
    UPDATE public.learning_entries
    SET
      status = 'published',
      published_at = COALESCE(published_at, NOW()),
      updated_at = NOW()
    WHERE id = NEW.entry_id
      AND status IN ('accepted_pending_payment', 'payment_pending', 'payment_verified');

  ELSIF OLD.status = 'awaiting_verification'
        AND NEW.status IN ('not_verified', 'cancelled') THEN
    UPDATE public.learning_entries
    SET
      status = 'accepted_pending_payment',
      published_at = NULL,
      updated_at = NOW()
    WHERE id = NEW.entry_id
      AND status = 'payment_pending';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_learning_entry_after_payment ON public.learning_payments;
CREATE TRIGGER sync_learning_entry_after_payment
AFTER UPDATE OF status ON public.learning_payments
FOR EACH ROW
EXECUTE FUNCTION public.sync_learning_entry_after_payment();

-- =====================================================
-- 5. RPC aman: user menyatakan sudah membayar.
-- Tidak ada INSERT/UPDATE langsung ke tabel payments dari browser.
-- =====================================================
CREATE OR REPLACE FUNCTION public.submit_learning_payment_confirmation(target_entry_id uuid)
RETURNS TABLE (
  payment_id uuid,
  payment_status text,
  confirmed_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_entry public.learning_entries;
  settings_row public.learning_payment_settings;
  existing_payment public.learning_payments;
  new_payment public.learning_payments;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Anda harus masuk terlebih dahulu.';
  END IF;

  SELECT * INTO target_entry
  FROM public.learning_entries
  WHERE id = target_entry_id
  FOR UPDATE;

  IF target_entry.id IS NULL OR target_entry.author_id <> auth.uid() THEN
    RAISE EXCEPTION 'Hasil pembelajaran tidak ditemukan atau bukan milik Anda.';
  END IF;

  SELECT * INTO settings_row
  FROM public.learning_payment_settings
  WHERE id = 'default';

  IF settings_row.id IS NULL OR settings_row.is_enabled IS NOT TRUE THEN
    RAISE EXCEPTION 'Kontribusi publikasi belum dibuka oleh admin.';
  END IF;

  IF target_entry.status = 'payment_pending' THEN
    SELECT * INTO existing_payment
    FROM public.learning_payments
    WHERE entry_id = target_entry.id
      AND status = 'awaiting_verification'
    ORDER BY confirmed_at DESC
    LIMIT 1;

    IF existing_payment.id IS NOT NULL THEN
      RETURN QUERY SELECT existing_payment.id, existing_payment.status, existing_payment.confirmed_at;
      RETURN;
    END IF;
  END IF;

  IF target_entry.status <> 'accepted_pending_payment' THEN
    RAISE EXCEPTION 'Hasil pembelajaran belum berada pada tahap konfirmasi pembayaran.';
  END IF;

  INSERT INTO public.learning_payments (
    entry_id,
    author_id,
    amount,
    currency,
    provider,
    status,
    confirmed_at
  ) VALUES (
    target_entry.id,
    auth.uid(),
    settings_row.amount,
    'IDR',
    'manual_qr',
    'awaiting_verification',
    NOW()
  )
  RETURNING * INTO new_payment;

  UPDATE public.learning_entries
  SET
    status = 'payment_pending',
    published_at = NULL,
    updated_at = NOW()
  WHERE id = target_entry.id;

  RETURN QUERY SELECT new_payment.id, new_payment.status, new_payment.confirmed_at;
END;
$$;

-- =====================================================
-- 6. RPC aman: admin memverifikasi atau mengembalikan konfirmasi.
-- Keputusan "verified" menjalankan trigger yang menerbitkan artikel.
-- =====================================================
CREATE OR REPLACE FUNCTION public.admin_verify_learning_payment(
  target_payment_id uuid,
  verification_decision text,
  verification_note_input text DEFAULT NULL
)
RETURNS TABLE (
  payment_id uuid,
  payment_status text,
  entry_id uuid,
  entry_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_payment public.learning_payments;
  target_entry public.learning_entries;
  normalized_decision text := lower(trim(coalesce(verification_decision, '')));
  final_status text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Hanya admin yang dapat memverifikasi pembayaran.';
  END IF;

  IF normalized_decision NOT IN ('verified', 'not_verified') THEN
    RAISE EXCEPTION 'Keputusan verifikasi tidak valid.';
  END IF;

  SELECT * INTO target_payment
  FROM public.learning_payments
  WHERE id = target_payment_id
  FOR UPDATE;

  IF target_payment.id IS NULL THEN
    RAISE EXCEPTION 'Konfirmasi pembayaran tidak ditemukan.';
  END IF;

  IF target_payment.status <> 'awaiting_verification' THEN
    RAISE EXCEPTION 'Konfirmasi ini sudah diproses sebelumnya.';
  END IF;

  UPDATE public.learning_payments
  SET
    status = normalized_decision,
    verified_at = CASE WHEN normalized_decision = 'verified' THEN NOW() ELSE NULL END,
    verified_by = auth.uid(),
    verification_note = NULLIF(trim(coalesce(verification_note_input, '')), ''),
    updated_at = NOW()
  WHERE id = target_payment.id
  RETURNING * INTO target_payment;

  SELECT * INTO target_entry
  FROM public.learning_entries
  WHERE id = target_payment.entry_id;

  final_status := target_entry.status;

  RETURN QUERY SELECT target_payment.id, target_payment.status, target_entry.id, final_status;
END;
$$;

-- =====================================================
-- 7. RLS.
-- Pembelajar hanya dapat membaca data payment miliknya.
-- Insert dan update dilakukan lewat RPC di atas.
-- =====================================================
ALTER TABLE public.learning_payment_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Learning payment settings authenticated read" ON public.learning_payment_settings;
DROP POLICY IF EXISTS "Learning payment settings admin update" ON public.learning_payment_settings;
DROP POLICY IF EXISTS "Learning payments owner or admin read" ON public.learning_payments;
DROP POLICY IF EXISTS "Learning payments direct insert disabled" ON public.learning_payments;
DROP POLICY IF EXISTS "Learning payments direct update disabled" ON public.learning_payments;

CREATE POLICY "Learning payment settings authenticated read"
ON public.learning_payment_settings
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Learning payment settings admin update"
ON public.learning_payment_settings
FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "Learning payments owner or admin read"
ON public.learning_payments
FOR SELECT
TO authenticated
USING (
  public.is_admin()
  OR author_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.learning_entries le
    WHERE le.id = learning_payments.entry_id
      AND le.author_id = auth.uid()
  )
);

GRANT SELECT, UPDATE ON public.learning_payment_settings TO authenticated;
GRANT SELECT ON public.learning_payments TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_learning_payment_confirmation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_verify_learning_payment(uuid, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- =====================================================
-- 8. Cek hasil.
-- =====================================================
SELECT
  tablename,
  rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('learning_entries', 'learning_payment_settings', 'learning_payments')
ORDER BY tablename;
