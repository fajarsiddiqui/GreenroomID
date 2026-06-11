-- =====================================================
-- GreenroomID H4 Minor Fix v2
-- Perbaikan delete permanen request/file dari Deleted Items.
-- Jalankan hanya jika tombol Delete Permanen masih gagal.
-- =====================================================

-- Admin boleh delete request secara langsung jika diperlukan.
DROP POLICY IF EXISTS "Requests delete admin only" ON public.requests;
CREATE POLICY "Requests delete admin only"
ON public.requests
FOR DELETE
TO authenticated
USING (public.is_admin());

-- Admin boleh delete diskusi terkait cleanup request permanen.
DROP POLICY IF EXISTS "Diskusi delete admin only" ON public.diskusi;
CREATE POLICY "Diskusi delete admin only"
ON public.diskusi
FOR DELETE
TO authenticated
USING (public.is_admin());

-- Admin boleh delete audit log jika request dihapus permanen.
DROP POLICY IF EXISTS "Audit logs delete admin only" ON public.audit_logs;
CREATE POLICY "Audit logs delete admin only"
ON public.audit_logs
FOR DELETE
TO authenticated
USING (public.is_admin());

-- Function cleanup request permanen. Dipakai frontend supaya tidak gagal karena relasi/RLS.
CREATE OR REPLACE FUNCTION public.admin_permanent_delete_request(target_request_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admin can permanently delete request';
  END IF;

  DELETE FROM public.request_files
  WHERE request_id = target_request_id;

  DELETE FROM public.diskusi
  WHERE request_id::text = target_request_id;

  DELETE FROM public.audit_logs
  WHERE request_id::text = target_request_id;

  DELETE FROM public.requests
  WHERE id::text = target_request_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_permanent_delete_request(text) TO authenticated;

-- Function cleanup file permanen.
CREATE OR REPLACE FUNCTION public.admin_permanent_delete_request_file(target_file_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admin can permanently delete file';
  END IF;

  DELETE FROM public.request_files
  WHERE id::text = target_file_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_permanent_delete_request_file(text) TO authenticated;
