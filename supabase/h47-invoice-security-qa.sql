-- H47: apply after H44, H45, H46. No historical data deletion.
BEGIN;
CREATE OR REPLACE FUNCTION public.save_invoice_draft(
  p_invoice_id uuid DEFAULT NULL,
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
  v_item jsonb;
  v_item_id uuid;
  v_catalog_item_id uuid;
  v_seen_item_ids uuid[] := ARRAY[]::uuid[];
  v_client_meta jsonb;
  v_invoice_date date;
  v_due_date date;
  v_discount_percent numeric;
  v_sku text;
  v_name text;
  v_description text;
  v_qty numeric;
  v_unit_price numeric;
  v_sort_order integer := 0;
BEGIN
  -- This check is intentionally in addition to table RLS. SECURITY INVOKER
  -- keeps every table write subject to the existing authenticated/admin grants
  -- and policies, while giving RPC callers a clear authorization failure.
  IF auth.uid() IS NULL OR NOT coalesce(public.is_admin(), false) THEN
    RAISE EXCEPTION 'Admin authorization required' USING ERRCODE = '42501';
  END IF;

  IF jsonb_typeof(p_header) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'p_header must be a JSON object' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'p_items must be a JSON array' USING ERRCODE = '22023';
  END IF;

  v_client_meta := CASE
    WHEN p_header ? 'client_meta' THEN p_header -> 'client_meta'
    ELSE '{}'::jsonb
  END;
  IF jsonb_typeof(v_client_meta) <> 'object' THEN
    RAISE EXCEPTION 'client_meta must be a JSON object' USING ERRCODE = '22023';
  END IF;

  v_invoice_date := NULLIF(p_header ->> 'invoice_date', '')::date;
  v_due_date := NULLIF(p_header ->> 'due_date', '')::date;
  v_discount_percent := coalesce(NULLIF(p_header ->> 'discount_percent', '')::numeric, 0);
  IF v_discount_percent = 'NaN'::numeric OR v_discount_percent < 0 OR v_discount_percent > 100 THEN
    RAISE EXCEPTION 'discount_percent must be between 0 and 100' USING ERRCODE = '23514';
  END IF;

  IF p_invoice_id IS NULL THEN
    -- Match the H44 Jakarta-local invoice date default when the client omits it.
    INSERT INTO public.invoices (
      client_name, client_meta, work_title, work_description, invoice_date,
      due_date, note, discount_percent, status
    ) VALUES (
      coalesce(p_header ->> 'client_name', ''), v_client_meta,
      coalesce(p_header ->> 'work_title', ''), coalesce(p_header ->> 'work_description', ''),
      coalesce(v_invoice_date, (statement_timestamp() AT TIME ZONE 'Asia/Jakarta')::date),
      v_due_date, coalesce(p_header ->> 'note', ''), v_discount_percent, 'DRAFT'
    )
    RETURNING * INTO v_invoice;
  ELSE
    -- Locking the parent serializes this full replacement with normal H44 item
    -- writes, whose trigger locks the same parent before changing a row.
    SELECT * INTO v_invoice FROM public.invoices WHERE id = p_invoice_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Invoice % does not exist or is not accessible', p_invoice_id USING ERRCODE = 'P0002';
    END IF;
    IF v_invoice.status <> 'DRAFT' OR v_invoice.issued_at IS NOT NULL THEN
      RAISE EXCEPTION 'Only draft invoices can be edited' USING ERRCODE = '23514';
    END IF;

    UPDATE public.invoices
    SET client_name = coalesce(p_header ->> 'client_name', ''),
        client_meta = v_client_meta,
        work_title = coalesce(p_header ->> 'work_title', ''),
        work_description = coalesce(p_header ->> 'work_description', ''),
        invoice_date = coalesce(v_invoice_date, v_invoice.invoice_date),
        due_date = v_due_date,
        note = coalesce(p_header ->> 'note', ''),
        discount_percent = v_discount_percent
    WHERE id = v_invoice.id
    RETURNING * INTO v_invoice;
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    IF jsonb_typeof(v_item) <> 'object' THEN
      RAISE EXCEPTION 'Every invoice item must be a JSON object' USING ERRCODE = '22023';
    END IF;

    v_item_id := NULLIF(v_item ->> 'id', '')::uuid;
    v_catalog_item_id := NULLIF(v_item ->> 'catalog_item_id', '')::uuid;
    v_sku := btrim(coalesce(v_item ->> 'sku', ''));
    v_name := btrim(coalesce(v_item ->> 'name', ''));
    v_description := coalesce(v_item ->> 'description', '');
    v_qty := NULLIF(v_item ->> 'qty', '')::numeric;
    v_unit_price := NULLIF(v_item ->> 'unit_price', '')::numeric;

    IF v_sku = '' OR v_name = '' THEN
      RAISE EXCEPTION 'Every invoice item requires sku and name' USING ERRCODE = '23514';
    END IF;
    IF v_qty IS NULL OR v_qty = 'NaN'::numeric OR v_qty <= 0 THEN
      RAISE EXCEPTION 'Invoice item qty must be greater than zero' USING ERRCODE = '23514';
    END IF;
    IF v_unit_price IS NULL OR v_unit_price = 'NaN'::numeric OR v_unit_price < 0 THEN
      RAISE EXCEPTION 'Invoice item unit_price must be zero or greater' USING ERRCODE = '23514';
    END IF;

    IF v_item_id IS NULL THEN
      INSERT INTO public.invoice_items (
        invoice_id, catalog_item_id, sku, name, description, qty, unit_price, sort_order
      ) VALUES (
        v_invoice.id, v_catalog_item_id, v_sku, v_name, v_description,
        v_qty, v_unit_price, v_sort_order
      ) RETURNING id INTO v_item_id;
      v_seen_item_ids := array_append(v_seen_item_ids, v_item_id);
    ELSE
      IF v_item_id = ANY(v_seen_item_ids) THEN
        RAISE EXCEPTION 'Invoice item % was submitted more than once', v_item_id USING ERRCODE = '22023';
      END IF;
      UPDATE public.invoice_items
      SET catalog_item_id = v_catalog_item_id,
          sku = v_sku,
          name = v_name,
          description = v_description,
          qty = v_qty,
          unit_price = v_unit_price,
          sort_order = v_sort_order
      WHERE id = v_item_id AND invoice_id = v_invoice.id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Invoice item % does not belong to this invoice', v_item_id USING ERRCODE = '23514';
      END IF;
      v_seen_item_ids := array_append(v_seen_item_ids, v_item_id);
    END IF;
    v_sort_order := v_sort_order + 1;
  END LOOP;

  -- The submitted JSON array is the complete desired item set. Existing rows
  -- omitted from it are removed only after every submitted row has validated.
  DELETE FROM public.invoice_items
  WHERE invoice_id = v_invoice.id
    AND NOT (id = ANY(v_seen_item_ids));

  -- H44's ordinary item/header triggers calculate all financial values. Read
  -- after the final item statement so this RPC returns those authoritative values.
  SELECT * INTO v_invoice FROM public.invoices WHERE id = v_invoice.id;
  RETURN v_invoice;
END;
$$;

REVOKE ALL ON FUNCTION public.save_invoice_draft(uuid, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_invoice_draft(uuid, jsonb, jsonb) TO authenticated;

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

  EXECUTE format('SELECT client_id FROM public.requests WHERE id = $1::%s AND deleted_at IS NULL FOR NO KEY UPDATE', v_request_id_type)
    INTO v_client_user_id USING p_request_id;
  IF v_client_user_id IS NULL THEN
    RAISE EXCEPTION 'Request unavailable or has no client' USING ERRCODE = '23514';
  END IF;
  IF nullif(p_header ->> 'client_user_id', '') IS NOT NULL
    AND (p_header ->> 'client_user_id')::uuid IS DISTINCT FROM v_client_user_id THEN
    RAISE EXCEPTION 'Request client mismatch' USING ERRCODE = '23514';
  END IF;
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

  IF v_invoice.id IS NULL THEN
    RAISE EXCEPTION 'Invoice link could not be saved' USING ERRCODE = 'P0002';
  END IF;
  RETURN v_invoice;
END;
$$;
REVOKE ALL ON FUNCTION public.save_invoice_draft_for_request(text, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_invoice_draft_for_request(text, jsonb, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.sync_request_invoice_summary()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE n bigint;
BEGIN
  IF NEW.request_id IS NULL THEN RETURN NEW; END IF;
  -- Serialize summaries; FK key-share locks remain compatible.
  PERFORM 1 FROM public.requests WHERE id=NEW.request_id FOR NO KEY UPDATE;
  SELECT count(*) INTO n FROM public.invoices WHERE request_id=NEW.request_id;
  UPDATE public.requests SET
    harga=CASE WHEN n=1 THEN NEW.total ELSE NULL END,
    invoice_status=CASE WHEN n<>1 THEN 'NOT_CREATED'
      WHEN NEW.status IN ('DRAFT','VOID') THEN 'NOT_CREATED'
      WHEN NEW.status='PARTIALLY_PAID' THEN 'WAITING_PAYMENT'
      ELSE NEW.status END
  WHERE id=NEW.request_id AND deleted_at IS NULL;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_request_invoice_summary() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS sync_request_invoice_summary ON public.invoices;
-- UPDATE OF total misses changes made by H44's BEFORE trigger on item edits.
CREATE TRIGGER sync_request_invoice_summary AFTER INSERT OR UPDATE ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.sync_request_invoice_summary();

CREATE OR REPLACE FUNCTION public.protect_invoice_request_link()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE owner_id uuid;
BEGIN
  IF TG_OP='UPDATE' AND OLD.request_id IS NOT NULL AND NEW.request_id IS DISTINCT FROM OLD.request_id THEN
    RAISE EXCEPTION 'Existing request link cannot be changed' USING ERRCODE='23514';
  END IF;
  IF NEW.request_id IS NOT NULL AND (TG_OP='INSERT' OR NEW.request_id IS DISTINCT FROM OLD.request_id
    OR (NEW.client_user_id IS NOT NULL AND NEW.client_user_id IS DISTINCT FROM OLD.client_user_id)) THEN
    SELECT client_id INTO owner_id FROM public.requests WHERE id=NEW.request_id AND deleted_at IS NULL;
    IF NOT FOUND OR NEW.client_user_id IS DISTINCT FROM owner_id THEN
      RAISE EXCEPTION 'Request unavailable or client mismatch' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.protect_invoice_request_link() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS protect_invoice_request_link ON public.invoices;
CREATE TRIGGER protect_invoice_request_link BEFORE INSERT OR UPDATE ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.protect_invoice_request_link();

-- Status events use the SAME audit_logs table; frontend must not duplicate them.
CREATE OR REPLACE FUNCTION public.audit_invoice_status()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE event_name text;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  event_name := CASE WHEN NEW.status='VOID' THEN 'INVOICE_VOIDED'
    WHEN OLD.issued_at IS NULL AND NEW.issued_at IS NOT NULL THEN 'INVOICE_ISSUED'
    ELSE 'INVOICE_STATUS_CHANGED' END;
  BEGIN
    INSERT INTO public.audit_logs(request_id,actor_id,actor_email,actor_role,action,description,metadata)
    VALUES (NEW.request_id,auth.uid(),auth.jwt()->>'email','admin',event_name,
      'Invoice status changed',jsonb_build_object('invoice_id',NEW.id,'invoice_no',NEW.invoice_no,
        'request_id',NEW.request_id,'previous_status',OLD.status,'new_status',NEW.status,'total',NEW.total));
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Invoice status saved but audit failed (SQLSTATE %)', SQLSTATE;
  END;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.audit_invoice_status() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS audit_invoice_status ON public.invoices;
CREATE TRIGGER audit_invoice_status AFTER UPDATE ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.audit_invoice_status();
NOTIFY pgrst, 'reload schema';
COMMIT;
