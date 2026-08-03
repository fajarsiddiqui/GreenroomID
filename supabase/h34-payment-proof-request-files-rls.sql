-- =====================================================
-- GreenroomID H34 - Payment Proof Request Files RLS
-- Mengizinkan client menyimpan dan membaca metadata
-- payment proof hanya untuk request miliknya sendiri.
-- =====================================================

BEGIN;

DROP POLICY IF EXISTS
  "Request files insert own additional or admin"
ON public.request_files;

CREATE POLICY "Request files insert own additional or admin"
ON public.request_files
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_admin()
  OR (
    uploaded_by = auth.uid()
    AND uploader_role = 'client'
    AND file_kind IN (
      'initial_client_file',
      'additional_client_file',
      'payment_proof'
    )
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

DROP POLICY IF EXISTS
  "Request files select own active eligible or admin"
ON public.request_files;

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
          request_files.file_kind IN (
            'initial_client_file',
            'additional_client_file',
            'preview_file',
            'payment_proof'
          )
          OR (
            request_files.file_kind IN (
              'final_result',
              'revision_result',
              'additional_result',
              'result_file'
            )
            AND (
              r.payment_status = 'VERIFIED'
              OR r.invoice_status = 'PAID'
            )
          )
        )
    )
  )
);

COMMIT;
