-- H44 validation: STAGING ONLY; run entire file as postgres in one session.
-- Requires existing admin and real non-admin auth users; creates neither.
-- All fixtures and the optional counter adjustment roll back. Review SKIP notices.
BEGIN;
CREATE FUNCTION pg_temp.expect_error(statement text, expected_state text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE statement;
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = expected_state THEN RETURN; END IF;
    RAISE;
  END;
  RAISE EXCEPTION 'Expected SQLSTATE % for %', expected_state, statement;
END;
$$;
GRANT EXECUTE ON FUNCTION pg_temp.expect_error(text,text) TO authenticated, anon;

CREATE TEMP TABLE h44_admin_fixtures (path text, claims jsonb) ON COMMIT DROP;
INSERT INTO h44_admin_fixtures
SELECT 'admin_users', jsonb_build_object('sub',u.id,'email',u.email,'role','authenticated')
FROM auth.users u JOIN public.admin_users a ON lower(a.email)=lower(u.email)
ORDER BY u.id LIMIT 1;
-- Exclude legacy members so this independently exercises profile authorization.
INSERT INTO h44_admin_fixtures
SELECT 'active user_profiles', jsonb_build_object('sub',u.id,'email',u.email,'role','authenticated')
FROM auth.users u JOIN public.user_profiles p ON p.id=u.id
WHERE p.role='admin' AND p.is_active
  AND NOT EXISTS (SELECT 1 FROM public.admin_users a WHERE lower(a.email)=lower(u.email))
ORDER BY u.id LIMIT 1;
GRANT SELECT ON h44_admin_fixtures TO authenticated;
DO $$
DECLARE client_claims jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM h44_admin_fixtures) THEN RAISE EXCEPTION 'Existing admin auth user required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM h44_admin_fixtures WHERE path='admin_users') THEN
    RAISE NOTICE 'SKIP legacy admin path: no matching auth user';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM h44_admin_fixtures WHERE path='active user_profiles') THEN
    RAISE NOTICE 'SKIP profile-only admin path: no independent matching auth user';
  END IF;
  SELECT jsonb_build_object('sub',u.id,'email',u.email,'role','authenticated') INTO client_claims
  FROM auth.users u WHERE NOT EXISTS (
    SELECT 1 FROM public.admin_users a WHERE lower(a.email)=lower(u.email)
  ) AND NOT EXISTS (
    SELECT 1 FROM public.user_profiles p WHERE p.id=u.id AND p.role='admin' AND p.is_active
  ) ORDER BY u.id LIMIT 1;
  IF client_claims IS NULL THEN RAISE EXCEPTION 'Existing real non-admin auth user required'; END IF;
  PERFORM set_config('h44.client_claims',client_claims::text,true);
END;
$$;

-- Missing reference IDs use deployed column types, not assumptions about IDs.
CREATE TEMP TABLE h44_fk_fixtures (target text, col text, missing_id text, existing_id text) ON COMMIT DROP;
DO $$
DECLARE
  f record;
  category "char";
  base_type text;
  candidate text;
  existing_id text;
  collision boolean;
  attempt integer;
BEGIN
  FOR f IN SELECT * FROM (VALUES
    ('invoice_catalog_items','service_item_id','service_items'),
    ('invoices','request_id','requests')
  ) AS refs(target,col,parent_table) LOOP
    SELECT t.typcategory,t.typname INTO category,base_type
    FROM pg_attribute a JOIN pg_type t ON t.oid=a.atttypid
    WHERE a.attrelid=to_regclass('public.'||f.parent_table) AND a.attname='id';
    IF category NOT IN ('N','S') AND base_type<>'uuid' THEN
      RAISE EXCEPTION 'Adapt FK fixture generator for %.id type %',f.parent_table,base_type;
    END IF;
    attempt:=0;
    LOOP
      attempt:=attempt+1;
      IF attempt>1000 THEN RAISE EXCEPTION 'Could not find absent FK test ID'; END IF;
      candidate:=CASE WHEN category='N' THEN (-attempt)::text ELSE gen_random_uuid()::text END;
      EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I WHERE id=%L)',f.parent_table,candidate) INTO collision;
      EXIT WHEN NOT collision;
    END LOOP;
    EXECUTE format('SELECT id::text FROM public.%I LIMIT 1',f.parent_table) INTO existing_id;
    INSERT INTO h44_fk_fixtures VALUES (f.target,f.col,candidate,existing_id);
  END LOOP;
END;
$$;
GRANT SELECT ON h44_fk_fixtures TO authenticated;

SET LOCAL ROLE authenticated;
DO $$
DECLARE
  actor record;
  fk_case record;
  v_catalog uuid;
  v_invoice uuid;
  v_other uuid;
  v_empty uuid;
  v_item uuid;
  v_sku text;
  v_first text;
  v_second text;
  v_issued timestamptz;
  v_status text;
  v_target uuid;
BEGIN
  FOR actor IN SELECT * FROM h44_admin_fixtures ORDER BY path LOOP
    PERFORM set_config('request.jwt.claims',actor.claims::text,true);
    IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admin path failed: %',actor.path; END IF;
    v_sku:='H44-'||gen_random_uuid()::text;
    INSERT INTO public.invoice_catalog_items(sku,name,base_price)
    VALUES (v_sku,'H44 validation',75000) RETURNING id INTO v_catalog;
    PERFORM pg_temp.expect_error(format(
      'INSERT INTO public.invoice_catalog_items(sku,name) VALUES (%L,''duplicate'')',v_sku),'23505');
    PERFORM pg_temp.expect_error(format(
      'UPDATE public.invoice_catalog_items SET base_price=-1 WHERE id=%L',v_catalog),'23514');
    INSERT INTO public.invoices DEFAULT VALUES RETURNING id,invoice_no INTO v_invoice,v_first;
    INSERT INTO public.invoices DEFAULT VALUES RETURNING id,invoice_no INTO v_other,v_second;
    INSERT INTO public.invoices DEFAULT VALUES RETURNING id INTO v_empty;
    IF v_first=v_second OR v_first NOT LIKE
      'GR-INV-'||to_char(statement_timestamp() AT TIME ZONE 'Asia/Jakarta','YYYYMMDD')||'-%' THEN
      RAISE EXCEPTION 'Sequential numbering or Jakarta date failed (not a concurrency test)';
    END IF;
    PERFORM pg_temp.expect_error('INSERT INTO public.invoices(invoice_no) VALUES (''GR-INV-20000101-001'')','23514');
    PERFORM pg_temp.expect_error(format('UPDATE public.invoices SET invoice_no=%L WHERE id=%L',v_second,v_invoice),'23514');
    PERFORM pg_temp.expect_error(format('UPDATE public.invoices SET status=''INVALID'' WHERE id=%L',v_invoice),'23514');
    INSERT INTO public.invoice_items(invoice_id,catalog_item_id,sku,name,qty,unit_price)
    VALUES (v_invoice,v_catalog,v_sku,'Historical item',2,75000) RETURNING id INTO v_item;
    IF (SELECT subtotal FROM public.invoice_items WHERE id=v_item)<>150000
      OR (SELECT subtotal FROM public.invoices WHERE id=v_invoice)<>150000 THEN
      RAISE EXCEPTION 'Item or header subtotal failed';
    END IF;
    UPDATE public.invoice_catalog_items SET base_price=90000 WHERE id=v_catalog;
    IF (SELECT unit_price FROM public.invoice_items WHERE id=v_item)<>75000 THEN
      RAISE EXCEPTION 'Historical snapshot changed with catalog';
    END IF;
    PERFORM pg_temp.expect_error(format('UPDATE public.invoice_items SET qty=0 WHERE id=%L',v_item),'23514');
    PERFORM pg_temp.expect_error(format('UPDATE public.invoice_items SET unit_price=-1 WHERE id=%L',v_item),'23514');
    UPDATE public.invoices SET discount_percent=10 WHERE id=v_invoice;
    IF NOT EXISTS (SELECT 1 FROM public.invoices WHERE id=v_invoice AND subtotal=150000 AND discount_amount=15000 AND total=135000) THEN
      RAISE EXCEPTION 'Discount synchronization failed';
    END IF;
    UPDATE public.invoices SET subtotal=-1,discount_amount=999,total=1 WHERE id=v_invoice;
    IF NOT EXISTS (SELECT 1 FROM public.invoices WHERE id=v_invoice AND subtotal=150000 AND discount_amount=15000 AND total=135000) THEN
      RAISE EXCEPTION 'Direct header edits bypassed normalization';
    END IF;
    UPDATE public.invoice_items SET qty=3 WHERE id=v_item;
    IF NOT EXISTS (SELECT 1 FROM public.invoices WHERE id=v_invoice AND subtotal=225000 AND discount_amount=22500 AND total=202500) THEN
      RAISE EXCEPTION 'Item UPDATE failed to synchronize header';
    END IF;
    UPDATE public.invoice_items SET invoice_id=v_other WHERE id=v_item;
    IF (SELECT total FROM public.invoices WHERE id=v_invoice)<>0 OR (SELECT total FROM public.invoices WHERE id=v_other)<>225000 THEN
      RAISE EXCEPTION 'Moving item failed to recalculate both parents';
    END IF;
    DELETE FROM public.invoice_items WHERE id=v_item;
    IF (SELECT subtotal FROM public.invoices WHERE id=v_other)<>0 THEN RAISE EXCEPTION 'Deleting item failed to synchronize'; END IF;
    INSERT INTO public.invoice_items(invoice_id,sku,name,qty,unit_price) VALUES
      (v_other,'CUSTOM','A',1.5,10.01),(v_other,'CUSTOM','B',2,20);
    IF (SELECT subtotal FROM public.invoices WHERE id=v_other)<>55.02 THEN RAISE EXCEPTION 'Bulk insert or rounding failed'; END IF;
    DELETE FROM public.invoice_items WHERE invoice_id=v_other;
    IF (SELECT total FROM public.invoices WHERE id=v_other)<>0 THEN RAISE EXCEPTION 'Bulk delete failed'; END IF;
    FOR fk_case IN SELECT * FROM h44_fk_fixtures LOOP
      v_target:=CASE WHEN fk_case.target='invoices' THEN v_invoice ELSE v_catalog END;
      PERFORM pg_temp.expect_error(format('UPDATE public.%I SET %I=%L WHERE id=%L',
        fk_case.target,fk_case.col,fk_case.missing_id,v_target),'23503');
      IF fk_case.existing_id IS NOT NULL THEN
        EXECUTE format('UPDATE public.%I SET %I=%L WHERE id=%L',fk_case.target,fk_case.col,fk_case.existing_id,v_target);
        EXECUTE format('UPDATE public.%I SET %I=NULL WHERE id=%L',fk_case.target,fk_case.col,v_target);
      ELSE
        RAISE NOTICE 'SKIP positive FK link for %: parent table empty',fk_case.col;
      END IF;
    END LOOP;
    UPDATE public.invoices SET client_name='Validation',due_date=invoice_date WHERE id=v_empty;
    FOREACH v_status IN ARRAY ARRAY['WAITING_PAYMENT','PARTIALLY_PAID','PAID','EXPIRED'] LOOP
      PERFORM pg_temp.expect_error(format('UPDATE public.invoices SET status=%L WHERE id=%L',v_status,v_empty),'23514');
    END LOOP;
    PERFORM pg_temp.expect_error('INSERT INTO public.invoices(status,client_name,due_date) VALUES (''PAID'',''Invalid direct issue'',CURRENT_DATE)','23514');
    INSERT INTO public.invoice_items(invoice_id,sku,name,unit_price)
    VALUES (v_invoice,'CUSTOM','Issuance test',100) RETURNING id INTO v_item;
    UPDATE public.invoices SET due_date=invoice_date WHERE id=v_invoice;
    PERFORM pg_temp.expect_error(format('UPDATE public.invoices SET status=''WAITING_PAYMENT'' WHERE id=%L',v_invoice),'23514');
    UPDATE public.invoices SET client_name='Validation',due_date=NULL WHERE id=v_invoice;
    PERFORM pg_temp.expect_error(format('UPDATE public.invoices SET status=''WAITING_PAYMENT'' WHERE id=%L',v_invoice),'23514');
    PERFORM pg_temp.expect_error(format('UPDATE public.invoices SET due_date=invoice_date-1 WHERE id=%L',v_invoice),'23514');
    UPDATE public.invoices SET due_date=invoice_date,status='WAITING_PAYMENT' WHERE id=v_invoice RETURNING issued_at INTO v_issued;
    IF v_issued IS NULL THEN RAISE EXCEPTION 'Issuance marker missing'; END IF;
    FOREACH v_status IN ARRAY ARRAY['PARTIALLY_PAID','PAID','EXPIRED','VOID'] LOOP
      UPDATE public.invoices SET status=v_status WHERE id=v_invoice;
      IF (SELECT issued_at FROM public.invoices WHERE id=v_invoice) IS DISTINCT FROM v_issued THEN RAISE EXCEPTION 'Marker changed'; END IF;
    END LOOP;
    PERFORM pg_temp.expect_error(format('UPDATE public.invoices SET issued_at=NULL WHERE id=%L',v_invoice),'23514');
    PERFORM pg_temp.expect_error(format('UPDATE public.invoices SET issued_at=issued_at+interval ''1 day'' WHERE id=%L',v_invoice),'23514');
    PERFORM pg_temp.expect_error(format('UPDATE public.invoices SET status=''DRAFT'' WHERE id=%L',v_invoice),'23514');
    PERFORM pg_temp.expect_error(format('UPDATE public.invoices SET client_name='''' WHERE id=%L',v_invoice),'23514');
    PERFORM pg_temp.expect_error(format('DELETE FROM public.invoice_items WHERE id=%L',v_item),'23514');
    PERFORM pg_temp.expect_error(format('UPDATE public.invoice_items SET invoice_id=%L WHERE id=%L',v_other,v_item),'23514');
    PERFORM pg_temp.expect_error(format('DELETE FROM public.invoices WHERE id=%L',v_invoice),'42501');
    UPDATE public.invoices SET updated_at='2000-01-01' WHERE id=v_invoice;
    IF (SELECT updated_at FROM public.invoices WHERE id=v_invoice)<>now() THEN RAISE EXCEPTION 'Timestamp helper failed'; END IF;
    PERFORM pg_temp.expect_error('SELECT * FROM public.invoice_number_counters','42501');
    PERFORM pg_temp.expect_error('SELECT public.generate_invoice_number()','42501');
    PERFORM set_config('h44.invoice_id',v_invoice::text,true);
    PERFORM set_config('h44.item_id',v_item::text,true);
    PERFORM set_config('h44.catalog_id',v_catalog::text,true);
    RAISE NOTICE 'PASS admin path: %',actor.path;
  END LOOP;
END;
$$;
RESET ROLE;
-- Normal privileged DELETE must also preserve issued history.
SELECT pg_temp.expect_error(format('DELETE FROM public.invoices WHERE id=%L',current_setting('h44.invoice_id')),'23514');

-- STAGING ONLY: never rewind counters or remove invoices. Adjustment rolls back.
DO $$
DECLARE
  v_day date:=(statement_timestamp() AT TIME ZONE 'Asia/Jakarta')::date;
  v_last bigint;
  v_number text;
BEGIN
  SELECT last_value INTO v_last FROM public.invoice_number_counters WHERE counter_date=v_day FOR UPDATE;
  IF v_last IS NOT NULL AND v_last<1000 AND NOT EXISTS (
    SELECT 1 FROM public.invoices WHERE invoice_no='GR-INV-'||to_char(v_day,'YYYYMMDD')||'-1000'
  ) THEN
    UPDATE public.invoice_number_counters SET last_value=999 WHERE counter_date=v_day;
    INSERT INTO public.invoices DEFAULT VALUES RETURNING invoice_no INTO v_number;
    IF v_number<>'GR-INV-'||to_char(v_day,'YYYYMMDD')||'-1000' THEN RAISE EXCEPTION '999 -> 1000 failed'; END IF;
    RAISE NOTICE 'PASS 999 -> 1000 (counter adjustment rolls back)';
  ELSE
    RAISE NOTICE 'SKIP 999 -> 1000: requires unused boundary on disposable staging';
  END IF;
END;
$$;
SELECT set_config('request.jwt.claims',current_setting('h44.client_claims'),true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE touched integer;
BEGIN
  IF public.is_admin() THEN RAISE EXCEPTION 'Client fixture unexpectedly authorized'; END IF;
  IF EXISTS (SELECT 1 FROM public.invoices) OR EXISTS (SELECT 1 FROM public.invoice_items)
    OR EXISTS (SELECT 1 FROM public.invoice_catalog_items) THEN RAISE EXCEPTION 'Non-admin SELECT leaked rows'; END IF;
  PERFORM pg_temp.expect_error('INSERT INTO public.invoices DEFAULT VALUES','42501');
  PERFORM pg_temp.expect_error('INSERT INTO public.invoice_catalog_items(sku,name) VALUES (''unauthorized'',''unauthorized'')','42501');
  PERFORM pg_temp.expect_error(format('INSERT INTO public.invoice_items(invoice_id,sku,name) VALUES (%L,''CUSTOM'',''unauthorized'')',current_setting('h44.invoice_id')),'42501');
  UPDATE public.invoices SET note='unauthorized' WHERE id=current_setting('h44.invoice_id')::uuid;
  GET DIAGNOSTICS touched=ROW_COUNT;
  IF touched<>0 THEN RAISE EXCEPTION 'Non-admin updated invoice'; END IF;
  UPDATE public.invoice_items SET unit_price=1 WHERE id=current_setting('h44.item_id')::uuid;
  GET DIAGNOSTICS touched=ROW_COUNT;
  IF touched<>0 THEN RAISE EXCEPTION 'Non-admin updated item'; END IF;
  UPDATE public.invoice_catalog_items SET base_price=1 WHERE id=current_setting('h44.catalog_id')::uuid;
  GET DIAGNOSTICS touched=ROW_COUNT;
  IF touched<>0 THEN RAISE EXCEPTION 'Non-admin updated catalog'; END IF;
  DELETE FROM public.invoice_items WHERE id=current_setting('h44.item_id')::uuid;
  GET DIAGNOSTICS touched=ROW_COUNT;
  IF touched<>0 THEN RAISE EXCEPTION 'Non-admin deleted item'; END IF;
  PERFORM pg_temp.expect_error('SELECT * FROM public.invoice_number_counters','42501');
  PERFORM pg_temp.expect_error('SELECT public.generate_invoice_number()','42501');
END;
$$;
RESET ROLE;
SELECT set_config('request.jwt.claims','{"role":"anon"}',true);
SET LOCAL ROLE anon;
SELECT pg_temp.expect_error('SELECT * FROM public.invoices','42501');
SELECT pg_temp.expect_error('SELECT * FROM public.invoice_items','42501');
SELECT pg_temp.expect_error('SELECT * FROM public.invoice_catalog_items','42501');
SELECT pg_temp.expect_error('INSERT INTO public.invoices DEFAULT VALUES','42501');
RESET ROLE;
DO $$
BEGIN
  IF (timestamptz '2026-09-27 16:59:59+00' AT TIME ZONE 'Asia/Jakarta')::date<>date '2026-09-27'
    OR (timestamptz '2026-09-27 17:00:00+00' AT TIME ZONE 'Asia/Jakarta')::date<>date '2026-09-28' THEN
    RAISE EXCEPTION 'Jakarta midnight conversion failed';
  END IF;
END;
$$;
ROLLBACK;
-- Success requires no exceptions, final ROLLBACK and review of SKIP notices.
-- True concurrency and reruns require separate executions/sessions. Follow
-- update-notes/H44_INVOICE_DATABASE_FOUNDATION.md for the exact staging procedure.
