-- H45 - Atomic invoice draft save RPC
-- Apply after H44. This is a focused Milestone 3 persistence hardening patch.
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
      );
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

NOTIFY pgrst, 'reload schema';
COMMIT;
