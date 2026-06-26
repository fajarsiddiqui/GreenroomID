-- H8 Admin UI Refresh migration
-- Menambahkan jejak waktu edit agar urutan request bisa mengikuti request paling baru diedit.

ALTER TABLE public.requests
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION public.set_requests_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_requests_updated_at ON public.requests;
CREATE TRIGGER set_requests_updated_at
BEFORE UPDATE ON public.requests
FOR EACH ROW
EXECUTE FUNCTION public.set_requests_updated_at();

UPDATE public.requests
SET updated_at = COALESCE(updated_at, created_at, now())
WHERE updated_at IS NULL;

CREATE INDEX IF NOT EXISTS requests_status_updated_idx
ON public.requests (status, updated_at DESC)
WHERE deleted_at IS NULL;

-- Opsional: pastikan admin dapat membersihkan log bila RLS audit_logs membatasi delete langsung.
CREATE OR REPLACE FUNCTION public.admin_delete_all_audit_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admin can delete all audit logs';
  END IF;

  DELETE FROM public.audit_logs;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_delete_all_audit_logs() TO authenticated;
