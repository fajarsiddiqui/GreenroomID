-- H46 - Invoice request integration
-- Apply after H44 and H45. Uses the existing one-to-many invoices.request_id FK.
BEGIN;

CREATE OR REPLACE FUNCTION public.save_invoice_draft_for_request(
  p_request_id text,
  p_header jsonb DEFAULT '{}'::jsonb,
  p_items jsonb DEFAULT '[]'::jsonb
)
RETURNS public.invoices
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_invoice public.invoices;
  v_request_id_type text;
  v_client_user_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT coalesce(public.is_admin(), false) THEN
    RAISE EXCEPTION 'Admin authorization required' USING ERRCODE = '42501';
  END IF;
  IF nullif(btrim(p_request_id), '') IS NULL THEN
    RAISE EXCEPTION 'A request ID is required' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_header) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'p_header must be a JSON object' USING ERRCODE = '22023';
  END IF;

  SELECT pg_catalog.format_type(a.atttypid, a.atttypmod)
  INTO v_request_id_type
  FROM pg_catalog.pg_attribute a
  WHERE a.attrelid = 'public.requests'::regclass
    AND a.attname = 'id' AND a.attnum > 0 AND NOT a.attisdropped;
  IF v_request_id_type IS NULL THEN
    RAISE EXCEPTION 'public.requests.id is missing' USING ERRCODE = '42883';
  END IF;

  v_client_user_id := nullif(p_header ->> 'client_user_id', '')::uuid;
  -- H45 performs header/item validation and all snapshot/total work. A nested
  -- function call remains part of this one PostgreSQL statement/transaction.
  v_invoice := public.save_invoice_draft(NULL, p_header, p_items);

  -- H44 deliberately derives request_id's type from the deployed requests.id.
  -- Dynamic SQL keeps this RPC compatible with that bigint/uuid/text contract.
  EXECUTE format(
    'UPDATE public.invoices SET request_id = $1::%s, client_user_id = $2 WHERE id = $3 RETURNING *',
    v_request_id_type
  )
  USING p_request_id, v_client_user_id, v_invoice.id
  INTO v_invoice;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice link could not be saved' USING ERRCODE = 'P0002';
  END IF;
  RETURN v_invoice;
END;
$$;
REVOKE ALL ON FUNCTION public.save_invoice_draft_for_request(text, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_invoice_draft_for_request(text, jsonb, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.sync_request_invoice_summary()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_linked_count bigint;
  v_request_invoice_status text;
BEGIN
  IF NEW.request_id IS NULL THEN RETURN NEW; END IF;

  -- requests has only one legacy harga/invoice_status summary while H44 permits
  -- many invoices per request. Update it only when that representation is exact.
  SELECT count(*) INTO v_linked_count
  FROM public.invoices i
  WHERE i.request_id = NEW.request_id;
  IF v_linked_count <> 1 THEN RETURN NEW; END IF;

  v_request_invoice_status := CASE NEW.status
    WHEN 'DRAFT' THEN 'NOT_CREATED'
    WHEN 'WAITING_PAYMENT' THEN 'WAITING_PAYMENT'
    WHEN 'PARTIALLY_PAID' THEN 'WAITING_PAYMENT'
    WHEN 'PAID' THEN 'PAID'
    WHEN 'EXPIRED' THEN 'EXPIRED'
    WHEN 'VOID' THEN 'NOT_CREATED'
    ELSE NULL
  END;
  IF v_request_invoice_status IS NULL THEN RETURN NEW; END IF;

  UPDATE public.requests
  SET invoice_status = v_request_invoice_status,
      harga = NEW.total
  WHERE id = NEW.request_id
    AND deleted_at IS NULL;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_request_invoice_summary() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS sync_request_invoice_summary ON public.invoices;
CREATE TRIGGER sync_request_invoice_summary
AFTER INSERT OR UPDATE OF request_id, status, total ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.sync_request_invoice_summary();

NOTIFY pgrst, 'reload schema';
COMMIT;
