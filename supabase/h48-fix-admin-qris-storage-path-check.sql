-- =====================================================
-- GreenroomID H48 - Fix Admin QRIS Storage Path Check
-- Izinkan pasangan karakter hex biasa, tetapi tetap tolak path berbahaya.
-- =====================================================

BEGIN;

ALTER TABLE public.admin_payment_settings
DROP CONSTRAINT IF EXISTS admin_payment_settings_qris_storage_path_check;

ALTER TABLE public.admin_payment_settings
ADD CONSTRAINT admin_payment_settings_qris_storage_path_check CHECK (
  qris_storage_path IS NULL
  OR (
    qris_storage_path ~ '^admin-qris/[A-Za-z0-9][A-Za-z0-9._-]*$'
    AND position(E'\\' in qris_storage_path) = 0
    AND qris_storage_path NOT LIKE '%..%'
    AND position('%' in qris_storage_path) = 0
  )
);

COMMENT ON CONSTRAINT admin_payment_settings_qris_storage_path_check
ON public.admin_payment_settings IS
'QRIS must be one safe object inside admin-qris/; encoded paths, traversal, URLs, nested paths, and backslashes are rejected.';

NOTIFY pgrst, 'reload schema';

COMMIT;
