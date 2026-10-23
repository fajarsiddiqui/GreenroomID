-- !!! RUN ONLY BEFORE LAUNCH. Deletes ALL orders and audit logs;
-- proof files in Storage bucket 'proofs' must be deleted manually. !!!
-- TRUNCATE bypasses the row-level immutability trigger on shop_audit_logs.
begin;
truncate table public.shop_audit_logs, public.shop_orders restart identity;
update public.shop_accounts set used_count = 0;
commit;
