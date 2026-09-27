-- GreenroomID H44 - Invoice Milestone 1: Database Foundation
-- Run in Supabase SQL Editor after the existing RLS and RB01 patches.
-- Uses existing public.is_admin() and public.set_learning_updated_at().
-- Payment configuration stays in public.admin_payment_settings (H5/H36).
BEGIN;

-- H44-local templates: PostgreSQL parses the expected definitions once. On a
-- rerun we compare actual catalogs against these, rather than trusting names.
-- No permanent migration registry, schema, or unrelated table is introduced.
DO $$
BEGIN
  IF to_regprocedure('public.is_admin()') IS NULL
    OR to_regprocedure('public.set_learning_updated_at()') IS NULL THEN
    RAISE EXCEPTION 'H44 requires existing is_admin() and set_learning_updated_at() helpers';
  END IF;
  IF (SELECT prorettype FROM pg_proc WHERE oid = 'public.is_admin()'::regprocedure) <> 'boolean'::regtype
    OR (SELECT prorettype FROM pg_proc WHERE oid = 'public.set_learning_updated_at()'::regprocedure) <> 'trigger'::regtype THEN
    RAISE EXCEPTION 'H44 helper return types are incompatible';
  END IF;
END;
$$;

CREATE TEMP TABLE h44_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku text NOT NULL UNIQUE,
  category text NOT NULL DEFAULT 'umum',
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  base_price numeric(18,2) NOT NULL DEFAULT 0,
  unit text NOT NULL DEFAULT 'pekerjaan',
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invoice_catalog_sku_check CHECK (sku = btrim(sku) AND length(sku) > 0),
  CONSTRAINT invoice_catalog_name_check CHECK (length(btrim(name)) > 0),
  CONSTRAINT invoice_catalog_category_check CHECK (length(btrim(category)) > 0),
  CONSTRAINT invoice_catalog_unit_check CHECK (length(btrim(unit)) > 0),
  CONSTRAINT invoice_catalog_price_check CHECK (base_price >= 0 AND base_price <> 'NaN'::numeric),
  CONSTRAINT invoice_catalog_sort_check CHECK (sort_order >= 0)
) ON COMMIT DROP;

CREATE TEMP TABLE h44_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_no text NOT NULL UNIQUE,
  client_user_id uuid,
  client_name text NOT NULL DEFAULT '',
  client_meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  work_title text NOT NULL DEFAULT '',
  work_description text NOT NULL DEFAULT '',
  invoice_date date NOT NULL DEFAULT (statement_timestamp() AT TIME ZONE 'Asia/Jakarta')::date,
  due_date date,
  status text NOT NULL DEFAULT 'DRAFT',
  subtotal numeric(18,2) NOT NULL DEFAULT 0,
  discount_percent numeric(5,2) NOT NULL DEFAULT 0,
  discount_amount numeric(18,2) NOT NULL DEFAULT 0,
  total numeric(18,2) NOT NULL DEFAULT 0,
  note text NOT NULL DEFAULT '',
  created_by uuid DEFAULT auth.uid(),
  issued_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invoices_number_format_check CHECK (invoice_no ~ '^GR-INV-[0-9]{8}-[0-9]{3,}$'),
  CONSTRAINT invoices_status_check CHECK (status IN (
    'DRAFT', 'WAITING_PAYMENT', 'PARTIALLY_PAID', 'PAID', 'EXPIRED', 'VOID'
  )),
  CONSTRAINT invoices_client_meta_check CHECK (jsonb_typeof(client_meta) = 'object'),
  CONSTRAINT invoices_due_date_check CHECK (due_date IS NULL OR due_date >= invoice_date),
  CONSTRAINT invoices_subtotal_check CHECK (subtotal >= 0 AND subtotal <> 'NaN'::numeric),
  CONSTRAINT invoices_discount_percent_check CHECK (discount_percent BETWEEN 0 AND 100),
  CONSTRAINT invoices_discount_amount_check CHECK (discount_amount >= 0 AND discount_amount <= subtotal),
  CONSTRAINT invoices_total_check CHECK (total >= 0 AND total <> 'NaN'::numeric),
  CONSTRAINT invoices_discount_calculation_check CHECK (discount_amount = round(subtotal * discount_percent / 100, 2)),
  CONSTRAINT invoices_total_calculation_check CHECK (total = subtotal - discount_amount),
  CONSTRAINT invoices_issued_history_check CHECK (
    (issued_at IS NULL AND status IN ('DRAFT', 'VOID'))
    OR (issued_at IS NOT NULL AND status <> 'DRAFT')
  )
) ON COMMIT DROP;

-- The baseline DDL for these two existing tables is not in the repository.
-- Copy the actual referenced ID types instead of assuming uuid/bigint/text.
-- Missing tables/IDs or non-unique referenced IDs fail the transaction safely.
DO $$
DECLARE
  link record;
  id_type text;
BEGIN
  FOR link IN SELECT * FROM (VALUES
    ('h44_catalog', 'service_item_id', 'service_items'),
    ('h44_invoices', 'request_id', 'requests')
  ) AS links(target_table, target_column, source_table)
  LOOP
    SELECT pg_catalog.format_type(a.atttypid, a.atttypmod) INTO id_type
    FROM pg_catalog.pg_attribute a
    WHERE a.attrelid = pg_catalog.to_regclass('public.' || link.source_table)
      AND a.attname = 'id' AND a.attnum > 0 AND NOT a.attisdropped;
    IF id_type IS NULL THEN
      RAISE EXCEPTION 'Required public.%.id is missing', link.source_table;
    END IF;
    EXECUTE format(
      'ALTER TABLE pg_temp.%I ADD COLUMN %I %s',
      link.target_table, link.target_column, id_type
    );
  END LOOP;
END;
$$;

CREATE TEMP TABLE h44_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL,
  catalog_item_id uuid,
  -- Historical snapshots. Catalog updates never rewrite these values.
  -- Custom items use catalog_item_id = NULL, with their own sku/name/price.
  sku text NOT NULL,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  qty numeric(12,3) NOT NULL DEFAULT 1,
  unit_price numeric(18,2) NOT NULL DEFAULT 0,
  subtotal numeric(18,2) GENERATED ALWAYS AS (round(qty * unit_price, 2)) STORED,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invoice_items_sku_check CHECK (length(btrim(sku)) > 0),
  CONSTRAINT invoice_items_name_check CHECK (length(btrim(name)) > 0),
  CONSTRAINT invoice_items_qty_check CHECK (qty > 0 AND qty <> 'NaN'::numeric),
  CONSTRAINT invoice_items_price_check CHECK (unit_price >= 0 AND unit_price <> 'NaN'::numeric),
  CONSTRAINT invoice_items_subtotal_check CHECK (subtotal >= 0 AND subtotal <> 'NaN'::numeric),
  CONSTRAINT invoice_items_sort_check CHECK (sort_order >= 0)
) ON COMMIT DROP;

-- Internal allocator: never grant browser roles access to this table.
CREATE TEMP TABLE h44_counters (
  counter_date date PRIMARY KEY,
  last_value bigint NOT NULL CHECK (last_value > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
) ON COMMIT DROP;

CREATE TEMP TABLE h44_relations (target text PRIMARY KEY, template text, is_new boolean) ON COMMIT DROP;
INSERT INTO h44_relations VALUES
  ('invoice_catalog_items', 'h44_catalog', to_regclass('public.invoice_catalog_items') IS NULL),
  ('invoices', 'h44_invoices', to_regclass('public.invoices') IS NULL),
  ('invoice_items', 'h44_items', to_regclass('public.invoice_items') IS NULL),
  ('invoice_number_counters', 'h44_counters', to_regclass('public.invoice_number_counters') IS NULL);

DO $$
DECLARE
  r record;
  actual oid;
  expected oid;
  actual_columns jsonb;
  expected_columns jsonb;
  actual_constraints jsonb;
  expected_constraints jsonb;
BEGIN
  FOR r IN SELECT * FROM h44_relations ORDER BY target LOOP
    IF NOT r.is_new THEN
      -- Prevent concurrent writes/DDL during compatibility checks and replacement.
      EXECUTE format('LOCK TABLE public.%I IN ACCESS EXCLUSIVE MODE', r.target);
      actual := to_regclass('public.' || r.target);
      IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid = actual AND relkind = 'r' AND relrowsecurity) THEN
        RAISE EXCEPTION 'H44 incompatible public.%: expected ordinary table with RLS enabled', r.target;
      END IF;
      -- Fail on unknown policies, including unknown restrictive ones. Known
      -- names are replaced below with the exact H44 admin policies.
      IF EXISTS (
        SELECT 1 FROM pg_policy WHERE polrelid = actual
        AND NOT (
          (r.target <> 'invoice_number_counters' AND polname IN (
            r.target || ' admin select', r.target || ' admin insert', r.target || ' admin update'
          )) OR (r.target = 'invoice_items' AND polname = 'invoice_items admin delete')
        )
      ) THEN
        RAISE EXCEPTION 'H44 unexpected policy on public.%; inspect pg_policies before retrying', r.target;
      END IF;
      IF EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgrelid = actual AND NOT tgisinternal
        AND NOT (
          (r.target <> 'invoice_number_counters' AND tgname = 'set_' || r.target || '_updated_at')
          OR (r.target = 'invoices' AND tgname IN (
            'set_invoice_number', 'normalize_invoice_header', 'prevent_issued_invoice_delete'
          )) OR (r.target = 'invoice_items' AND tgname IN (
            'lock_invoice_item_parents', 'sync_invoice_items_insert',
            'sync_invoice_items_update', 'sync_invoice_items_delete'
          ))
        )
      ) THEN
        RAISE EXCEPTION 'H44 unexpected trigger on public.%; inspect it before retrying', r.target;
      END IF;
    ELSE
      EXECUTE format('CREATE TABLE public.%I (LIKE pg_temp.%I INCLUDING ALL)', r.target, r.template);
    END IF;
    actual := to_regclass('public.' || r.target);
    expected := to_regclass('pg_temp.' || r.template);
    -- Includes ALL column types/typmods, nullability, defaults, collations and
    -- generated expressions (especially invoice_items.subtotal and issued_at).
    SELECT jsonb_agg(jsonb_build_array(a.attname, a.atttypid, a.atttypmod,
      a.attnotnull, a.attgenerated, a.attidentity, a.attcollation,
      pg_get_expr(d.adbin, d.adrelid)) ORDER BY a.attname)
    INTO actual_columns FROM pg_attribute a LEFT JOIN pg_attrdef d
      ON d.adrelid = a.attrelid AND d.adnum = a.attnum
    WHERE a.attrelid = actual AND a.attnum > 0 AND NOT a.attisdropped;
    SELECT jsonb_agg(jsonb_build_array(a.attname, a.atttypid, a.atttypmod,
      a.attnotnull, a.attgenerated, a.attidentity, a.attcollation,
      pg_get_expr(d.adbin, d.adrelid)) ORDER BY a.attname)
    INTO expected_columns FROM pg_attribute a LEFT JOIN pg_attrdef d
      ON d.adrelid = a.attrelid AND d.adnum = a.attnum
    WHERE a.attrelid = expected AND a.attnum > 0 AND NOT a.attisdropped;
    IF actual_columns IS DISTINCT FROM expected_columns THEN
      RAISE EXCEPTION 'H44 incompatible columns/defaults/generated expressions on public.%', r.target;
    END IF;
    -- Compare parsed definitions, not just constraint names. FK checks follow.
    SELECT jsonb_agg(pg_get_constraintdef(oid) ORDER BY pg_get_constraintdef(oid))
    INTO actual_constraints FROM pg_constraint WHERE conrelid = actual AND contype IN ('p','u','c','x');
    SELECT jsonb_agg(pg_get_constraintdef(oid) ORDER BY pg_get_constraintdef(oid))
    INTO expected_constraints FROM pg_constraint WHERE conrelid = expected AND contype IN ('p','u','c','x');
    IF actual_constraints IS DISTINCT FROM expected_constraints OR EXISTS (
      SELECT 1 FROM pg_constraint c LEFT JOIN pg_index i ON i.indexrelid = c.conindid
      WHERE c.conrelid = actual AND (NOT c.convalidated
        OR (c.contype IN ('p','u') AND (NOT i.indisvalid OR NOT i.indisready)))
    ) THEN
      RAISE EXCEPTION 'H44 incompatible/missing/unvalidated constraints on public.%', r.target;
    END IF;
  END LOOP;
END;
$$;

-- FK definitions are explicit because LIKE does not copy foreign keys.
DO $$
DECLARE
  f record;
  actual oid;
  source_att smallint;
  referenced_att smallint;
BEGIN
  FOR f IN SELECT * FROM (VALUES
    ('invoice_catalog_items','service_item_id','public.service_items','r','RESTRICT'),
    ('invoices','request_id','public.requests','r','RESTRICT'),
    ('invoices','client_user_id','auth.users','n','SET NULL'),
    ('invoices','created_by','auth.users','n','SET NULL'),
    ('invoice_items','invoice_id','public.invoices','r','RESTRICT'),
    ('invoice_items','catalog_item_id','public.invoice_catalog_items','r','RESTRICT')
  ) AS fks(target, col, referenced_table, delete_code, delete_sql) LOOP
    actual := to_regclass('public.' || f.target);
    IF (SELECT is_new FROM h44_relations WHERE target = f.target) THEN
      EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %s(id) ON DELETE %s',
        f.target, f.target || '_' || f.col || '_fkey', f.col, f.referenced_table, f.delete_sql);
    END IF;
    SELECT attnum INTO source_att FROM pg_attribute WHERE attrelid = actual AND attname = f.col AND NOT attisdropped;
    SELECT attnum INTO referenced_att FROM pg_attribute
      WHERE attrelid = to_regclass(f.referenced_table) AND attname = 'id' AND NOT attisdropped;
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conrelid = actual AND contype = 'f'
        AND conkey = ARRAY[source_att] AND confkey = ARRAY[referenced_att]
        AND confrelid = to_regclass(f.referenced_table) AND confdeltype::text = f.delete_code
        AND confupdtype = 'a' AND confmatchtype = 's' AND convalidated AND NOT condeferrable
    ) THEN
      RAISE EXCEPTION 'H44 incompatible/missing FK public.%.% -> %.id', f.target, f.col, f.referenced_table;
    END IF;
  END LOOP;
  IF (SELECT count(*) FROM pg_constraint WHERE contype = 'f'
      AND conrelid IN (SELECT to_regclass('public.' || target) FROM h44_relations)) <> 6 THEN
    RAISE EXCEPTION 'H44 unexpected foreign keys on invoice tables';
  END IF;
END;
$$;

ALTER TABLE public.invoice_number_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.invoice_number_counters FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.generate_invoice_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  number_date date := (statement_timestamp() AT TIME ZONE 'Asia/Jakarta')::date;
  next_value bigint;
BEGIN
  IF NOT coalesce(public.is_admin(), false) THEN
    RAISE EXCEPTION 'Admin authorization required' USING ERRCODE = '42501';
  END IF;
  -- ON CONFLICT locks the one daily row. Concurrent transactions serialize
  -- here; rollback also rolls back allocation. Never reset or delete counters.
  INSERT INTO public.invoice_number_counters AS counters (counter_date, last_value)
  VALUES (number_date, 1)
  ON CONFLICT (counter_date) DO UPDATE
    SET last_value = counters.last_value + 1, updated_at = now()
  RETURNING last_value INTO next_value;

  -- Minimum three digits; 1000 stays 1000 (lpad alone would truncate it).
  RETURN 'GR-INV-' || to_char(number_date, 'YYYYMMDD') || '-'
    || lpad(next_value::text, greatest(3, length(next_value::text)), '0');
END;
$$;
REVOKE ALL ON FUNCTION public.generate_invoice_number() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.set_invoice_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.invoice_no IS NOT NULL THEN
      RAISE EXCEPTION 'Omit invoice_no; the database assigns it' USING ERRCODE = '23514';
    END IF;
    NEW.invoice_no := public.generate_invoice_number();
  ELSIF NEW.invoice_no IS DISTINCT FROM OLD.invoice_no THEN
    RAISE EXCEPTION 'Invoice number cannot be changed' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.set_invoice_number() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS set_invoice_number ON public.invoices;
CREATE TRIGGER set_invoice_number
BEFORE INSERT OR UPDATE ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.set_invoice_number();

-- This is deliberately VOLATILE: after waiting for a parent row lock, SQL inside
-- the trigger must get a fresh READ COMMITTED snapshot. REPEATABLE READ / SERIALIZABLE
-- writers can receive 40001 and must retry the entire transaction.
CREATE OR REPLACE FUNCTION public.normalize_invoice_header()
RETURNS trigger
LANGUAGE plpgsql VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  item_count bigint;
BEGIN
  -- Table RLS authorizes browser writes. Do not require an admin JWT here:
  -- auth.users ON DELETE SET NULL also invokes this trigger during legitimate
  -- privileged account maintenance. SECURITY DEFINER ensures an unfiltered sum.
  IF TG_OP = 'INSERT' THEN
    IF NEW.issued_at IS NOT NULL THEN
      RAISE EXCEPTION 'issued_at is database-managed' USING ERRCODE = '23514';
    END IF;
  ELSE
    -- UPDATE already holds the parent tuple lock. Item writers take the same
    -- lock before mutation, so a direct header edit and item edit serialize.
    IF NEW.id IS DISTINCT FROM OLD.id THEN
      RAISE EXCEPTION 'Invoice identity cannot be changed' USING ERRCODE = '23514';
    END IF;
    IF NEW.issued_at IS DISTINCT FROM OLD.issued_at THEN
      RAISE EXCEPTION 'issued_at cannot be supplied, changed or cleared' USING ERRCODE = '23514';
    END IF;
    IF OLD.issued_at IS NOT NULL AND NEW.status = 'DRAFT' THEN
      RAISE EXCEPTION 'Issued invoices cannot return to DRAFT; use VOID' USING ERRCODE = '23514';
    END IF;
  END IF;

  SELECT coalesce(sum(i.subtotal), 0), count(*) INTO NEW.subtotal, item_count
  FROM public.invoice_items i WHERE i.invoice_id = NEW.id;
  NEW.discount_amount := round(NEW.subtotal * NEW.discount_percent / 100, 2);
  NEW.total := NEW.subtotal - NEW.discount_amount;

  -- Validate every lifecycle update, including edits to items/fields after
  -- issuance. VOID of an issued invoice retains the same completeness checks.
  IF NEW.issued_at IS NOT NULL OR NEW.status IN (
    'WAITING_PAYMENT', 'PARTIALLY_PAID', 'PAID', 'EXPIRED'
  ) THEN
    IF NEW.client_name IS NULL OR length(btrim(NEW.client_name)) = 0
      OR NEW.invoice_date IS NULL OR NEW.due_date IS NULL
      OR NOT isfinite(NEW.invoice_date) OR NOT isfinite(NEW.due_date)
      OR NEW.due_date < NEW.invoice_date OR item_count = 0 THEN
      RAISE EXCEPTION 'Issuance requires client, finite invoice/due dates, valid due date and at least one item'
        USING ERRCODE = '23514';
    END IF;
    IF NEW.issued_at IS NULL THEN NEW.issued_at := statement_timestamp(); END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.normalize_invoice_header() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS normalize_invoice_header ON public.invoices;
CREATE TRIGGER normalize_invoice_header BEFORE INSERT OR UPDATE ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.normalize_invoice_header();

CREATE OR REPLACE FUNCTION public.lock_invoice_item_parents()
RETURNS trigger
LANGUAGE plpgsql VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  old_parent uuid;
  new_parent uuid;
  parent_id uuid;
BEGIN
  IF NOT coalesce(public.is_admin(), false) THEN
    RAISE EXCEPTION 'Admin authorization required' USING ERRCODE = '42501';
  END IF;
  IF TG_OP <> 'INSERT' THEN old_parent := OLD.invoice_id; END IF;
  IF TG_OP <> 'DELETE' THEN new_parent := NEW.invoice_id; END IF;
  -- Fixed ordering for both sides of a move. NO KEY UPDATE is sufficient and
  -- compatible with the FK's KEY SHARE lock (avoids a lock-upgrade deadlock).
  FOR parent_id IN SELECT DISTINCT id FROM unnest(ARRAY[old_parent, new_parent]) AS ids(id)
    WHERE id IS NOT NULL ORDER BY id
  LOOP
    PERFORM 1 FROM public.invoices WHERE id = parent_id FOR NO KEY UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Invoice % does not exist', parent_id USING ERRCODE = '23503';
    END IF;
  END LOOP;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.lock_invoice_item_parents() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS lock_invoice_item_parents ON public.invoice_items;
CREATE TRIGGER lock_invoice_item_parents BEFORE INSERT OR UPDATE OR DELETE ON public.invoice_items
FOR EACH ROW EXECUTE FUNCTION public.lock_invoice_item_parents();

CREATE OR REPLACE FUNCTION public.sync_invoice_item_totals()
RETURNS trigger
LANGUAGE plpgsql VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  affected uuid[];
  parent_id uuid;
BEGIN
  -- Transition tables contain every row affected by the statement. Recalculate
  -- once per parent after ALL changes, not once per item during a bulk edit.
  IF TG_OP = 'INSERT' THEN
    SELECT array_agg(DISTINCT invoice_id ORDER BY invoice_id) INTO affected FROM new_items;
  ELSIF TG_OP = 'DELETE' THEN
    SELECT array_agg(DISTINCT invoice_id ORDER BY invoice_id) INTO affected FROM old_items;
  ELSE
    SELECT array_agg(invoice_id ORDER BY invoice_id) INTO affected FROM (
      SELECT invoice_id FROM old_items UNION SELECT invoice_id FROM new_items
    ) AS changed;
  END IF;
  FOREACH parent_id IN ARRAY coalesce(affected, ARRAY[]::uuid[]) LOOP
    -- The BEFORE row trigger already owns these locks. Header normalization is
    -- the single calculation path, including discount and issuance validation.
    UPDATE public.invoices SET subtotal = subtotal WHERE id = parent_id;
  END LOOP;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_invoice_item_totals() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS sync_invoice_items_insert ON public.invoice_items;
CREATE TRIGGER sync_invoice_items_insert AFTER INSERT ON public.invoice_items
REFERENCING NEW TABLE AS new_items FOR EACH STATEMENT EXECUTE FUNCTION public.sync_invoice_item_totals();
DROP TRIGGER IF EXISTS sync_invoice_items_update ON public.invoice_items;
CREATE TRIGGER sync_invoice_items_update AFTER UPDATE ON public.invoice_items
REFERENCING OLD TABLE AS old_items NEW TABLE AS new_items
FOR EACH STATEMENT EXECUTE FUNCTION public.sync_invoice_item_totals();
DROP TRIGGER IF EXISTS sync_invoice_items_delete ON public.invoice_items;
CREATE TRIGGER sync_invoice_items_delete AFTER DELETE ON public.invoice_items
REFERENCING OLD TABLE AS old_items FOR EACH STATEMENT EXECUTE FUNCTION public.sync_invoice_item_totals();

-- Block physical deletion even for privileged maintenance roles using normal
-- DELETE. Issued invoices retain history; use VOID. Draft deletion is also
-- unavailable to browser roles (no DELETE grant or policy).
CREATE OR REPLACE FUNCTION public.prevent_issued_invoice_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD.issued_at IS NOT NULL OR OLD.status <> 'DRAFT' THEN
    RAISE EXCEPTION 'Use VOID instead of deleting an issued invoice' USING ERRCODE = '23514';
  END IF;
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION public.prevent_issued_invoice_delete() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS prevent_issued_invoice_delete ON public.invoices;
CREATE TRIGGER prevent_issued_invoice_delete
BEFORE DELETE ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.prevent_issued_invoice_delete();

CREATE INDEX IF NOT EXISTS invoice_catalog_service_item_idx ON public.invoice_catalog_items(service_item_id);
CREATE INDEX IF NOT EXISTS invoice_catalog_active_category_sort_idx ON public.invoice_catalog_items(is_active, category, sort_order);
CREATE INDEX IF NOT EXISTS invoices_request_idx ON public.invoices(request_id);
CREATE INDEX IF NOT EXISTS invoices_client_user_idx ON public.invoices(client_user_id);
CREATE INDEX IF NOT EXISTS invoices_created_by_idx ON public.invoices(created_by);
CREATE INDEX IF NOT EXISTS invoices_status_date_idx ON public.invoices(status, invoice_date DESC);
CREATE INDEX IF NOT EXISTS invoices_date_idx ON public.invoices(invoice_date DESC);
CREATE INDEX IF NOT EXISTS invoice_items_invoice_sort_idx ON public.invoice_items(invoice_id, sort_order);
CREATE INDEX IF NOT EXISTS invoice_items_catalog_idx ON public.invoice_items(catalog_item_id);
CREATE INDEX IF NOT EXISTS invoice_items_sku_idx ON public.invoice_items(sku);
-- UNIQUE constraints already index catalog sku and invoice_no.

-- Same timestamp helper and per-operation admin RLS convention as H37.
DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['invoice_catalog_items', 'invoices', 'invoice_items'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', 'set_' || table_name || '_updated_at', table_name);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_learning_updated_at()',
      'set_' || table_name || '_updated_at', table_name);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', table_name);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON public.%I TO authenticated', table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', table_name || ' admin select', table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', table_name || ' admin insert', table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', table_name || ' admin update', table_name);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_admin())',
      table_name || ' admin select', table_name);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.is_admin())',
      table_name || ' admin insert', table_name);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin())',
      table_name || ' admin update', table_name);
  END LOOP;
END;
$$;

-- Removing a draft line is an item operation, not deleting invoice history.
-- For issued invoices the header trigger prevents deleting/moving the last line.
DROP POLICY IF EXISTS "invoice_items admin delete" ON public.invoice_items;
CREATE POLICY "invoice_items admin delete" ON public.invoice_items
FOR DELETE TO authenticated USING (public.is_admin());
GRANT DELETE ON public.invoice_items TO authenticated;

-- Reruns validate existing data; never silently rewrite historical totals.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.invoices v LEFT JOIN (
      SELECT invoice_id, sum(subtotal) AS amount, count(*) AS item_count
      FROM public.invoice_items GROUP BY invoice_id
    ) i ON i.invoice_id = v.id
    WHERE v.subtotal <> coalesce(i.amount, 0)
      OR v.discount_amount <> round(v.subtotal * v.discount_percent / 100, 2)
      OR v.total <> v.subtotal - v.discount_amount
      OR (v.issued_at IS NOT NULL AND (
        length(btrim(v.client_name)) = 0 OR v.due_date IS NULL
        OR NOT isfinite(v.invoice_date) OR NOT isfinite(v.due_date)
        OR coalesce(i.item_count, 0) = 0
      ))
  ) THEN
    RAISE EXCEPTION 'H44 incompatible existing invoice totals/issued data; reconcile separately before retrying';
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
COMMIT;
