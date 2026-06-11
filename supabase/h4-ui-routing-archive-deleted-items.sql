-- =====================================================
-- GreenroomID H+4 Update
-- Routing/UX cleanup, client deadline, archive files, deleted items, and safer file visibility.
-- Jalankan di Supabase SQL Editor sebelum menjalankan kode H+4 di localhost.
-- =====================================================

-- =====================================================
-- 1. REQUEST SOFT DELETE AND CLIENT DEADLINE
-- =====================================================

ALTER TABLE public.requests
ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
ADD COLUMN IF NOT EXISTS deleted_by uuid,
ADD COLUMN IF NOT EXISTS delete_reason text;

CREATE INDEX IF NOT EXISTS requests_deleted_at_idx
ON public.requests (deleted_at);

CREATE INDEX IF NOT EXISTS requests_deadline_at_idx
ON public.requests (deadline_at);

-- =====================================================
-- 2. REQUEST FILES ARCHIVE / DELETED ITEMS SUPPORT
-- =====================================================

ALTER TABLE public.request_files
ADD COLUMN IF NOT EXISTS storage_path text,
ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
ADD COLUMN IF NOT EXISTS deleted_by uuid,
ADD COLUMN IF NOT EXISTS delete_reason text;

CREATE INDEX IF NOT EXISTS request_files_deleted_at_idx
ON public.request_files (deleted_at);

CREATE INDEX IF NOT EXISTS request_files_storage_path_idx
ON public.request_files (storage_path);

-- =====================================================
-- 3. PUBLIC STATS: COUNT ACTIVE SERVICES, NOT HARDCODED 4
-- =====================================================

CREATE OR REPLACE FUNCTION public.get_public_stats()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'total_views', (
      SELECT count(*) FROM public.page_views
    ),
    'total_requests', (
      SELECT count(*) FROM public.requests WHERE deleted_at IS NULL
    ),
    'completed_requests', (
      SELECT count(*) FROM public.requests WHERE deleted_at IS NULL AND status = 'DONE'
    ),
    'service_categories', (
      SELECT count(*) FROM public.service_categories WHERE is_active = true
    ),
    'active_services', (
      SELECT count(*) FROM public.service_items WHERE is_active = true
    )
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_public_stats() TO anon, authenticated;

-- =====================================================
-- 4. REQUEST RLS: CLIENT ONLY SEES ACTIVE OWN REQUESTS; ADMIN SEES ALL
-- =====================================================

DROP POLICY IF EXISTS "Requests select own or admin" ON public.requests;
DROP POLICY IF EXISTS "Requests insert own" ON public.requests;
DROP POLICY IF EXISTS "Requests update own or admin" ON public.requests;

CREATE POLICY "Requests select own active or admin"
ON public.requests
FOR SELECT
TO authenticated
USING (
  public.is_admin()
  OR (
    client_id = auth.uid()
    AND deleted_at IS NULL
  )
);

CREATE POLICY "Requests insert own"
ON public.requests
FOR INSERT
TO authenticated
WITH CHECK (
  client_id = auth.uid()
  AND lower(client_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  AND deleted_at IS NULL
);

CREATE POLICY "Requests update own or admin"
ON public.requests
FOR UPDATE
TO authenticated
USING (
  public.is_admin()
  OR (
    client_id = auth.uid()
    AND deleted_at IS NULL
  )
)
WITH CHECK (
  public.is_admin()
  OR (
    client_id = auth.uid()
    AND deleted_at IS NULL
  )
);

-- =====================================================
-- 5. PROTECT REQUEST ADMIN FIELDS, BUT ALLOW CLIENT DEADLINE UPDATE
-- =====================================================

CREATE OR REPLACE FUNCTION public.protect_request_admin_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF OLD.client_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Tidak boleh mengubah request milik user lain';
  END IF;

  IF OLD.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Request sudah dihapus';
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
    OR NEW.client_id IS DISTINCT FROM OLD.client_id
    OR NEW.client_email IS DISTINCT FROM OLD.client_email
    OR NEW.judul IS DISTINCT FROM OLD.judul
    OR NEW.deskripsi IS DISTINCT FROM OLD.deskripsi
    OR NEW.kategori IS DISTINCT FROM OLD.kategori
    OR NEW.file_url IS DISTINCT FROM OLD.file_url
    OR NEW.file_urls IS DISTINCT FROM OLD.file_urls
    OR NEW.harga IS DISTINCT FROM OLD.harga
    OR NEW.invoice_status IS DISTINCT FROM OLD.invoice_status
    OR NEW.hasil_url IS DISTINCT FROM OLD.hasil_url
    OR NEW.admin_note IS DISTINCT FROM OLD.admin_note
    OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
    OR NEW.deleted_by IS DISTINCT FROM OLD.deleted_by
    OR NEW.delete_reason IS DISTINCT FROM OLD.delete_reason
  THEN
    RAISE EXCEPTION 'Client tidak boleh mengubah data admin request';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
    AND NEW.status <> 'PAYMENT UPLOADED'
  THEN
    RAISE EXCEPTION 'Client hanya boleh mengubah status menjadi PAYMENT UPLOADED';
  END IF;

  IF NEW.payment_status IS DISTINCT FROM OLD.payment_status
    AND NEW.payment_status <> 'UPLOADED'
  THEN
    RAISE EXCEPTION 'Client tidak boleh mengubah status pembayaran selain UPLOADED';
  END IF;

  IF NEW.payment_proof_url IS DISTINCT FROM OLD.payment_proof_url
    AND NEW.payment_proof_url IS NULL
  THEN
    RAISE EXCEPTION 'Bukti pembayaran tidak boleh dikosongkan';
  END IF;

  -- deadline_at boleh diubah client, agar instruksi/deadline tugas tetap berasal dari client.
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_request_admin_fields_trigger ON public.requests;
CREATE TRIGGER protect_request_admin_fields_trigger
BEFORE UPDATE ON public.requests
FOR EACH ROW
EXECUTE FUNCTION public.protect_request_admin_fields();

-- =====================================================
-- 6. REQUEST FILES RLS: CLIENT ONLY SEES NON-DELETED ELIGIBLE FILES
-- =====================================================

DROP POLICY IF EXISTS "Request files select own request or admin" ON public.request_files;
DROP POLICY IF EXISTS "Request files insert own additional or admin" ON public.request_files;
DROP POLICY IF EXISTS "Request files update admin only" ON public.request_files;
DROP POLICY IF EXISTS "Request files delete admin only" ON public.request_files;

CREATE POLICY "Request files select own active eligible or admin"
ON public.request_files
FOR SELECT
TO authenticated
USING (
  public.is_admin()
  OR (
    deleted_at IS NULL
    AND EXISTS (
      SELECT 1
      FROM public.requests r
      WHERE r.id::text = request_files.request_id
        AND r.client_id = auth.uid()
        AND r.deleted_at IS NULL
        AND (
          request_files.file_kind IN ('initial_client_file', 'additional_client_file', 'preview_file')
          OR (
            request_files.file_kind IN ('final_result', 'revision_result', 'additional_result', 'result_file')
            AND (r.payment_status = 'VERIFIED' OR r.invoice_status = 'PAID')
          )
        )
    )
  )
);

CREATE POLICY "Request files insert own additional or admin"
ON public.request_files
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_admin()
  OR (
    uploaded_by = auth.uid()
    AND uploader_role = 'client'
    AND file_kind IN ('initial_client_file', 'additional_client_file')
    AND deleted_at IS NULL
    AND EXISTS (
      SELECT 1
      FROM public.requests r
      WHERE r.id::text = request_files.request_id
        AND r.client_id = auth.uid()
        AND r.deleted_at IS NULL
    )
  )
);

CREATE POLICY "Request files update admin only"
ON public.request_files
FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "Request files delete admin only"
ON public.request_files
FOR DELETE
TO authenticated
USING (public.is_admin());

-- =====================================================
-- 7. STORAGE DELETE POLICY FOR ADMIN PERMANENT DELETE
-- Catatan: bucket masih public read untuk MVP. Private bucket + signed URL tetap disarankan nanti.
-- =====================================================

DROP POLICY IF EXISTS "Allow admin delete request files" ON storage.objects;

CREATE POLICY "Allow admin delete request files"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'request-files'
  AND public.is_admin()
);

-- =====================================================
-- 8. NEW AUDIT ACTIONS USED BY FRONTEND
-- CLIENT_DEADLINE_UPDATED
-- REQUEST_SOFT_DELETED
-- REQUEST_RESTORED
-- REQUEST_PERMANENT_DELETED
-- FILE_SOFT_DELETED
-- FILE_RESTORED
-- FILE_PERMANENT_DELETED
-- =====================================================
