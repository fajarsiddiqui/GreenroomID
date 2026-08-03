-- =====================================================
-- GreenroomID H36 - Admin QRIS Private Storage Access
-- QRIS disimpan sebagai storage path permanen, lalu diakses memakai signed URL sementara.
-- =====================================================

BEGIN;

ALTER TABLE public.admin_payment_settings
ADD COLUMN IF NOT EXISTS qris_storage_path text;

-- Backfill hanya dari public URL lama bucket request-files folder admin-qris/.
WITH mapped_settings AS (
  SELECT
    id,
    substring(qris_url from '/storage/v1/object/public/request-files/(admin-qris/[^?#]+)') AS raw_path
  FROM public.admin_payment_settings
  WHERE qris_storage_path IS NULL
    AND qris_url LIKE '%/storage/v1/object/public/request-files/admin-qris/%'
),
safe_settings AS (
  SELECT
    id,
    raw_path
  FROM mapped_settings
  WHERE raw_path IS NOT NULL
    AND raw_path <> ''
    AND position(E'\\' in raw_path) = 0
    AND raw_path NOT LIKE '%..%'
    AND position('%' in raw_path) = 0
    AND lower(raw_path) NOT LIKE '%2e%'
    AND lower(raw_path) NOT LIKE '%2f%'
    AND lower(raw_path) NOT LIKE '%5c%'
    AND lower(raw_path) NOT LIKE '%00%'
)
UPDATE public.admin_payment_settings aps
SET qris_storage_path = ss.raw_path
FROM safe_settings ss
WHERE aps.id = ss.id;

ALTER TABLE public.admin_payment_settings
DROP CONSTRAINT IF EXISTS admin_payment_settings_qris_storage_path_check;

ALTER TABLE public.admin_payment_settings
ADD CONSTRAINT admin_payment_settings_qris_storage_path_check CHECK (
  qris_storage_path IS NULL
  OR (
    qris_storage_path LIKE 'admin-qris/%'
    AND position(E'\\' in qris_storage_path) = 0
    AND qris_storage_path NOT LIKE '%..%'
    AND position('%' in qris_storage_path) = 0
    AND lower(qris_storage_path) NOT LIKE '%2e%'
    AND lower(qris_storage_path) NOT LIKE '%2f%'
    AND lower(qris_storage_path) NOT LIKE '%5c%'
    AND lower(qris_storage_path) NOT LIKE '%00%'
  )
);

DROP POLICY IF EXISTS "Admin QRIS active authenticated signed read" ON storage.objects;

CREATE POLICY "Admin QRIS active authenticated signed read"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'request-files'
  AND name LIKE 'admin-qris/%'
  AND EXISTS (
    SELECT 1
    FROM public.admin_payment_settings aps
    WHERE aps.id = 'default'
      AND aps.qris_storage_path = storage.objects.name
  )
);

NOTIFY pgrst, 'reload schema';

COMMIT;
