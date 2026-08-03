-- =====================================================
-- GreenroomID H33 - Request Files Signed URL Compatibility
-- Batch A1: bucket request-files tetap public, aplikasi mulai memakai signed URL.
-- Jangan menjalankan perubahan bucket private pada tahap ini.
-- =====================================================

BEGIN;

ALTER TABLE public.request_files
ADD COLUMN IF NOT EXISTS storage_path text,
ADD COLUMN IF NOT EXISTS storage_deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS request_files_storage_path_idx
ON public.request_files (storage_path);

ALTER TABLE public.request_files
DROP CONSTRAINT IF EXISTS request_files_file_kind_check;

ALTER TABLE public.request_files
ADD CONSTRAINT request_files_file_kind_check CHECK (
  file_kind IN (
    'initial_client_file',
    'additional_client_file',
    'preview_file',
    'final_result',
    'revision_result',
    'additional_result',
    'result_file',
    'payment_proof'
  )
);

-- Backfill storage_path hanya dari URL public Supabase bucket request-files.
WITH mapped_files AS (
  SELECT
    id,
    substring(file_url from '/storage/v1/object/public/request-files/([^?#]+)') AS raw_path
  FROM public.request_files
  WHERE storage_path IS NULL
    AND file_url LIKE '%/storage/v1/object/public/request-files/%'
),
safe_files AS (
  SELECT
    id,
    raw_path
  FROM mapped_files
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
UPDATE public.request_files rf
SET storage_path = sf.raw_path
FROM safe_files sf
WHERE rf.id = sf.id;

-- Metadata payment proof legacy dari requests.payment_proof_url.
INSERT INTO public.request_files (
  request_id,
  uploader_email,
  uploader_role,
  file_kind,
  file_name,
  file_url,
  file_size,
  file_type,
  storage_path,
  created_at
)
SELECT
  r.id::text,
  r.client_email,
  'client',
  'payment_proof',
  'Bukti Pembayaran',
  r.payment_proof_url,
  NULL,
  NULL,
  substring(r.payment_proof_url from '/storage/v1/object/public/request-files/([^?#]+)') AS storage_path,
  COALESCE(r.updated_at, r.created_at, now())
FROM public.requests r
WHERE r.payment_proof_url IS NOT NULL
  AND r.payment_proof_url LIKE '%/storage/v1/object/public/request-files/%'
  AND substring(r.payment_proof_url from '/storage/v1/object/public/request-files/([^?#]+)') IS NOT NULL
  AND substring(r.payment_proof_url from '/storage/v1/object/public/request-files/([^?#]+)') <> ''
  AND position(
    E'\\' in substring(
      r.payment_proof_url
      from '/storage/v1/object/public/request-files/([^?#]+)'
    )
  ) = 0
  AND substring(r.payment_proof_url from '/storage/v1/object/public/request-files/([^?#]+)') NOT LIKE '%..%'
  AND position('%' in substring(r.payment_proof_url from '/storage/v1/object/public/request-files/([^?#]+)')) = 0
  AND lower(substring(r.payment_proof_url from '/storage/v1/object/public/request-files/([^?#]+)')) NOT LIKE '%2e%'
  AND lower(substring(r.payment_proof_url from '/storage/v1/object/public/request-files/([^?#]+)')) NOT LIKE '%2f%'
  AND lower(substring(r.payment_proof_url from '/storage/v1/object/public/request-files/([^?#]+)')) NOT LIKE '%5c%'
  AND lower(substring(r.payment_proof_url from '/storage/v1/object/public/request-files/([^?#]+)')) NOT LIKE '%00%'
  AND NOT EXISTS (
    SELECT 1
    FROM public.request_files rf
    WHERE rf.request_id = r.id::text
      AND rf.storage_path = substring(r.payment_proof_url from '/storage/v1/object/public/request-files/([^?#]+)')
  );

-- Persiapan SELECT policy private access.
DROP POLICY IF EXISTS "Allow public read" ON storage.objects;
DROP POLICY IF EXISTS "Allow public read request files" ON storage.objects;
DROP POLICY IF EXISTS "Request files authenticated signed read" ON storage.objects;

CREATE POLICY "Request files authenticated signed read"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'request-files'
  AND EXISTS (
    SELECT 1
    FROM public.request_files rf
    JOIN public.requests r ON r.id::text = rf.request_id
    WHERE rf.storage_path = storage.objects.name
      AND rf.deleted_at IS NULL
      AND rf.storage_deleted_at IS NULL
      AND r.deleted_at IS NULL
      AND (
        public.is_admin()
        OR (
          r.client_id = auth.uid()
          AND (
            rf.file_kind IN (
              'initial_client_file',
              'additional_client_file',
              'preview_file',
              'payment_proof'
            )
            OR (
              rf.file_kind IN (
                'final_result',
                'revision_result',
                'additional_result',
                'result_file'
              )
              AND (r.payment_status = 'VERIFIED' OR r.invoice_status = 'PAID')
            )
          )
        )
      )
  )
);

COMMIT;

-- =====================================================
-- Preflight/report queries aman setelah migration dijalankan.
-- =====================================================

-- Total metadata:
-- SELECT count(*) AS total_request_files FROM public.request_files;

-- Row yang belum punya storage_path:
-- SELECT count(*) AS storage_path_null FROM public.request_files WHERE storage_path IS NULL;

-- Row yang berhasil punya storage_path dari bucket request-files:
-- SELECT count(*) AS mapped_request_files FROM public.request_files WHERE storage_path IS NOT NULL;

-- Public URL request-files yang belum dapat dipetakan:
-- SELECT count(*) AS unmapped_public_urls
-- FROM public.request_files
-- WHERE storage_path IS NULL
--   AND file_url LIKE '%/storage/v1/object/public/request-files/%';

-- Metadata payment proof yang dibuat/tersedia:
-- SELECT count(*) AS payment_proof_metadata FROM public.request_files WHERE file_kind = 'payment_proof';

-- storage_path duplikat:
-- SELECT storage_path, count(*) AS total
-- FROM public.request_files
-- WHERE storage_path IS NOT NULL
-- GROUP BY storage_path
-- HAVING count(*) > 1;

-- Metadata soft-deleted:
-- SELECT count(*) AS soft_deleted_files FROM public.request_files WHERE deleted_at IS NOT NULL;

-- File legacy URL eksternal/non-Supabase:
-- SELECT count(*) AS external_legacy_urls
-- FROM public.request_files
-- WHERE file_url IS NOT NULL
--   AND file_url NOT LIKE '%/storage/v1/object/public/request-files/%';
