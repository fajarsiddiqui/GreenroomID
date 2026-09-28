-- STAGING ONLY, after H47. Run as postgres with an existing admin auth user.
BEGIN;
CREATE TEMP TABLE qa_actor AS
SELECT u.id,u.email FROM auth.users u
WHERE EXISTS (SELECT 1 FROM public.admin_users a WHERE lower(a.email)=lower(u.email))
   OR EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id=u.id AND p.role='admin' AND p.is_active)
LIMIT 1;
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',id,'email',email,'role','authenticated')::text,true) FROM qa_actor;
SET LOCAL ROLE authenticated;
DO $$
DECLARE v public.invoices; original_items jsonb; original_header jsonb;
BEGIN
 IF NOT coalesce(public.is_admin(),false) THEN RAISE EXCEPTION 'Existing admin fixture required'; END IF;
 v:=public.save_invoice_draft(NULL,'{"client_name":"QA"}',
   '[{"sku":"CUSTOM","name":"A","qty":2,"unit_price":10},{"sku":"CUSTOM","name":"B","qty":1,"unit_price":5}]');
 IF v.total<>25 OR (SELECT count(*) FROM public.invoice_items WHERE invoice_id=v.id)<>2 THEN
   RAISE EXCEPTION 'New items lost or totals wrong'; END IF;
 SELECT jsonb_agg(to_jsonb(i) ORDER BY id) INTO original_items FROM public.invoice_items i WHERE invoice_id=v.id;
 SELECT to_jsonb(i) INTO original_header FROM public.invoices i WHERE id=v.id;
 BEGIN
   PERFORM public.save_invoice_draft(v.id,'{"client_name":"Must rollback"}',
     '[{"sku":"CUSTOM","name":"Inserted then rollback","qty":1,"unit_price":100},{"sku":"CUSTOM","name":"Invalid","qty":0,"unit_price":1}]');
   RAISE EXCEPTION 'Expected constraint failure';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
 IF (SELECT to_jsonb(i) FROM public.invoices i WHERE id=v.id) IS DISTINCT FROM original_header
 OR (SELECT jsonb_agg(to_jsonb(i) ORDER BY id) FROM public.invoice_items i WHERE invoice_id=v.id) IS DISTINCT FROM original_items THEN
   RAISE EXCEPTION 'Atomic rollback failed'; END IF;
 v:=public.save_invoice_draft(v.id,'{}','[]');
 IF v.total<>0 OR EXISTS(SELECT 1 FROM public.invoice_items WHERE invoice_id=v.id) THEN RAISE EXCEPTION 'Empty replacement failed'; END IF;
END;
$$;
RESET ROLE;
ROLLBACK;
