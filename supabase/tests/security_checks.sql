-- GreenroomID Shop: LIVE READ-ONLY SECURITY CHECKS (run manually in SQL Editor).
-- Run catalog queries as postgres/owner. No keys, token hashes, credentials,
-- proof paths, request bodies, or account data are selected by this file.
-- Run EACH negative-test transaction separately. If an expected error aborts
-- execution, execute ROLLBACK before the next block. Do not remove READ ONLY.
-- These checks inspect the deployed DB; migration files alone cannot certify it.

-- (a) Healthy: every existing public.shop_* table has rowsecurity=true.
-- shop_accounts, shop_orders, shop_audit_logs (and shop_notifications if present)
-- must have no permissive public/non-admin read policy.
select schemaname, tablename, tableowner, rowsecurity
from pg_tables where schemaname = 'public' and tablename like 'shop\_%' escape '\'
order by tablename;

-- 10c: each query below is empty when the deployed shop ACL/RLS is healthy.
-- Unexpected browser EXECUTE, including inherited PUBLIC grants. Buyer RPCs
-- and authenticated admin RPCs are intentionally excluded; admin bodies are
-- checked separately for is_admin() below.
select p.oid::regprocedure as unexpected_browser_execute,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef
  and (p.proname like 'shop\_%' escape '\' or p.proname = 'release_account')
  and p.proname not in ('shop_public_contact', 'shop_variant_stock',
    'shop_admin_list_orders', 'shop_admin_list_accounts',
    'shop_admin_set_account_status', 'shop_admin_update_account_meta',
    'shop_admin_stock_summary', 'shop_admin_list_audit')
  and (has_function_privilege('anon', p.oid, 'EXECUTE')
    or has_function_privilege('authenticated', p.oid, 'EXECUTE'));

-- Admin RPCs must never be callable by anon and must check is_admin().
select p.oid::regprocedure as unsafe_admin_rpc
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef
  and (p.proname like 'shop_admin\_%' escape '\'
    or p.proname in ('admin_verify_order', 'admin_reject_order'))
  and p.proname <> 'shop_admin_save_account_tx'
  and (has_function_privilege('anon', p.oid, 'EXECUTE')
    or pg_get_functiondef(p.oid) not ilike '%public.is_admin()%');

select schemaname, tablename as shop_table_without_rls
from pg_tables where schemaname = 'public'
  and tablename like 'shop\_%' escape '\' and not rowsecurity;

select schemaname, tablename, policyname as anon_sensitive_policy, cmd, qual
from pg_policies where schemaname = 'public'
  and tablename in ('shop_orders', 'shop_accounts')
  and permissive = 'PERMISSIVE' and cmd in ('SELECT', 'ALL')
  and roles && array['public', 'anon']::name[]
  and coalesce(btrim(qual), '') not in ('false', '(false)');

select p.oid::regprocedure as shop_definer_without_fixed_path
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef
  and (p.proname like 'shop\_%' escape '\'
    or p.proname in ('create_order', 'retry_payment', 'get_order_status',
      'release_account', 'admin_verify_order', 'admin_reject_order'))
  and not ('search_path=public' = any(coalesce(p.proconfig, array[]::text[])));

-- Healthy: catalog reads restricted to active rows; writes require is_admin().
-- Sensitive tables normally have no anon/authenticated policies at all.
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies where schemaname = 'public' and tablename like 'shop\_%' escape '\'
order by tablename, policyname;

-- (b) Healthy: anon SELECT only catalog tables; authenticated CRUD only catalog
-- tables behind admin RLS. No direct grants on accounts/orders/audit/notifications.
select table_schema, table_name, grantor, grantee, privilege_type, is_grantable
from information_schema.role_table_grants
where table_schema = 'public' and table_name like 'shop\_%' escape '\'
  and grantee in ('anon', 'authenticated', 'PUBLIC')
order by table_name, grantee, privilege_type;

-- Healthy: inherited/PUBLIC privileges agree with the direct-grant report.
-- This additionally detects table TRUNCATE grants (RLS does not guard TRUNCATE).
select t.tablename, r.role_name, p.privilege,
  has_table_privilege(r.role_name, format('%I.%I', t.schemaname, t.tablename), p.privilege) as allowed
from pg_tables t
cross join (values ('anon'), ('authenticated')) r(role_name)
cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) p(privilege)
where t.schemaname = 'public' and t.tablename like 'shop\_%' escape '\'
order by t.tablename, r.role_name, p.privilege;

-- Healthy: public catalog columns contain only publishable data. Column-specific
-- grants must not expose a sensitive column omitted from a table-level grant.
select table_name, column_name, grantee, privilege_type
from information_schema.column_privileges
where table_schema = 'public' and table_name like 'shop\_%' escape '\'
  and grantee in ('anon', 'authenticated', 'PUBLIC')
order by table_name, column_name, grantee, privilege_type;

-- (c) Healthy: PUBLIC=false for RPCs/private helpers. Buyers may execute only
-- create_order, get_order_status, submit_payment, retry_payment,
-- shop_variant_stock, shop_public_contact. Admin RPCs: authenticated=true but
-- body must enforce is_admin(). Private helpers: anon/authenticated=false.
-- Trigger functions may currently inherit PUBLIC EXECUTE; they cannot be called
-- directly as ordinary functions, but revoke it for least privilege.
-- ACL expansion is needed because PUBLIC is not an ordinary pg_roles role.
select n.nspname as schema_name, p.proname,
  pg_get_function_identity_arguments(p.oid) as arguments,
  pg_get_function_result(p.oid) as result_type, p.prosecdef as security_definer,
  (select string_agg(setting, ', ') from unnest(coalesce(p.proconfig, array[]::text[])) setting
    where setting like 'search_path=%') as configured_search_path,
  exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where a.grantee = 0 and a.privilege_type = 'EXECUTE') as public_execute,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
  has_function_privilege('service_role', p.oid, 'EXECUTE') as service_execute
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and (p.proname like 'shop\_%' escape '\'
  or p.proname in ('create_order', 'retry_payment', 'submit_payment', 'get_order_status',
    'release_account', 'admin_verify_order', 'admin_reject_order'))
order by p.proname, arguments;

-- Healthy: future default function ACLs do not silently grant private helpers.
-- Existing explicit REVOKEs remain necessary even when defaults are tightened.
select pg_get_userbyid(d.defaclrole) as creator,
  coalesce(n.nspname, '(all schemas)') as schema_name, d.defaclobjtype,
  case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end as grantee,
  a.privilege_type
from pg_default_acl d left join pg_namespace n on n.oid = d.defaclnamespace
cross join lateral aclexplode(d.defaclacl) a
where d.defaclobjtype in ('f', 'r') and (n.nspname = 'public' or d.defaclnamespace = 0)
order by creator, schema_name, d.defaclobjtype, grantee;

-- Healthy: pgcrypto is installed in extensions, matching qualified calls;
-- public CREATE is not available to untrusted roles. No secret values selected.
select e.extname, n.nspname as extension_schema from pg_extension e
join pg_namespace n on n.oid = e.extnamespace where e.extname in ('pgcrypto', 'pg_cron');
select r.role_name, has_schema_privilege(r.role_name, 'public', 'CREATE') as public_create
from (values ('anon'), ('authenticated')) r(role_name);

-- (d) Healthy: proofs.public=false; shop-images.public=true, size=2097152,
-- allowed MIME types image/jpeg,image/png,image/webp. proofs should be size/MIME
-- restricted too. A public bucket's existing settings are not fixed by ON CONFLICT DO NOTHING.
select id, name, public, file_size_limit, allowed_mime_types
from storage.buckets where id in ('proofs', 'shop-images') order by id;

-- Healthy: no broad host policy permits non-admin writes to either bucket;
-- proofs client SELECT/INSERT/UPDATE/DELETE all denied. Inspect ALL policies:
-- policy predicates without a literal bucket name may still apply to these buckets.
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies where schemaname = 'storage' and tablename = 'objects'
order by policyname;

-- (e) Negative anon tests. Healthy: permission denied (preferred), or zero rows.
begin;
set transaction read only;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select 1 from public.shop_orders limit 1;
rollback;

-- EXPECTED: permission denied or zero rows; never account data.
begin;
set transaction read only;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select 1 from public.shop_accounts limit 1;
rollback;

-- EXPECTED: permission denied or zero rows.
begin;
set transaction read only;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select 1 from public.shop_audit_logs limit 1;
rollback;

-- EXPECTED: permission denied for shop_take_slot (not no_stock or read-only error).
begin;
set transaction read only;
set local role anon;
select public.shop_take_slot('00000000-0000-0000-0000-000000000000'::uuid);
rollback;

-- EXPECTED: permission denied for shop_release_slot (not successful execution).
begin;
set transaction read only;
set local role anon;
select public.shop_release_slot('00000000-0000-0000-0000-000000000000'::uuid);
rollback;

-- EXPECTED: permission denied for release_account (not successful execution).
begin;
set transaction read only;
set local role anon;
select public.release_account('00000000-0000-0000-0000-000000000000'::uuid);
rollback;

-- EXPECTED: permission denied for shop_record_proof_upload, before its body runs.
-- Fixed dummy values below are not a real order, token hash, or Storage object.
begin;
set transaction read only;
set local role anon;
select public.shop_record_proof_upload('00000000-0000-0000-0000-000000000000'::uuid,
  repeat('0', 64), '00000000-0000-0000-0000-000000000000/security-check',
  '00000000-0000-0000-0000-000000000000'::uuid);
rollback;

-- Negative authenticated tests intentionally have no admin identity or claims.
-- EXPECTED: permission denied or zero rows; role authenticated alone is not admin.
begin;
set transaction read only;
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated"}';
select 1 from public.shop_orders limit 1;
rollback;

-- EXPECTED: permission denied or zero rows.
begin;
set transaction read only;
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated"}';
select 1 from public.shop_accounts limit 1;
rollback;

-- EXPECTED: permission denied or zero rows.
begin;
set transaction read only;
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated"}';
select 1 from public.shop_audit_logs limit 1;
rollback;

-- EXPECTED: permission denied for shop_take_slot.
begin;
set transaction read only;
set local role authenticated;
select public.shop_take_slot('00000000-0000-0000-0000-000000000000'::uuid);
rollback;

-- EXPECTED: permission denied for shop_release_slot.
begin;
set transaction read only;
set local role authenticated;
select public.shop_release_slot('00000000-0000-0000-0000-000000000000'::uuid);
rollback;

-- EXPECTED: permission denied for release_account.
begin;
set transaction read only;
set local role authenticated;
select public.release_account('00000000-0000-0000-0000-000000000000'::uuid);
rollback;

-- EXPECTED: permission denied for shop_record_proof_upload.
begin;
set transaction read only;
set local role authenticated;
select public.shop_record_proof_upload('00000000-0000-0000-0000-000000000000'::uuid,
  repeat('0', 64), '00000000-0000-0000-0000-000000000000/security-check',
  '00000000-0000-0000-0000-000000000000'::uuid);
rollback;

-- EXPECTED: unauthorized. A grant to authenticated must not authorize non-admins.
begin;
set transaction read only;
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated"}';
select * from public.shop_admin_list_orders('waiting_verification');
rollback;

-- (f) Healthy: exactly one active shop-expire-draft-orders job, every minute.
-- This selects only safe job metadata; do not paste arbitrary cron command text.
select jobid, jobname, schedule, active,
  command ~ 'release_account' as invokes_release_account
from cron.job where jobname in ('shop-expire-draft-orders', 'expire-draft-orders');

-- Healthy: recent scheduled runs succeed. No return_message (may contain payloads).
select d.jobid, d.status, d.start_time, d.end_time
from cron.job_run_details d join cron.job j on j.jobid = d.jobid
where j.jobname in ('shop-expire-draft-orders', 'expire-draft-orders')
order by d.start_time desc limit 20;

-- (g) Healthy: ONLY intended owner/admin emails; no unexpected membership.
-- Email-only output as requested; no IDs, authentication tokens, or profiles.
select email from public.admin_users order by email;
-- Healthy: ONLY intended admin emails. Review inactive admins separately in DB.
select email from public.user_profiles where role = 'admin' order by email;

-- Healthy: admin membership writes require a trusted administrator; profile
-- self-update policies plus protect trigger prohibit role/email escalation.
select tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies where schemaname = 'public' and tablename in ('admin_users', 'user_profiles')
order by tablename, policyname;

-- Healthy: inspect the actual final is_admin/protection definitions rather than
-- trusting an older SQL backup. These specific functions should contain no keys.
select p.oid::regprocedure as function_name, p.prosecdef as security_definer,
  pg_get_functiondef(p.oid) as definition
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('is_admin', 'protect_user_profile_admin_fields');

-- Healthy: enabled BEFORE UPDATE protection trigger exists on user_profiles.
select t.tgname, t.tgenabled, pg_get_triggerdef(t.oid) as definition
from pg_trigger t where t.tgrelid = 'public.user_profiles'::regclass and not t.tgisinternal;

-- Healthy: zero rows. anon may only SELECT shop_* tables; authenticated
-- must not have TRUNCATE, TRIGGER, or REFERENCES on them.
with shop_tables as (
  select schemaname, tablename
  from pg_tables
  where schemaname = 'public' and tablename like 'shop\_%' escape '\'
), requested(privilege, anon_forbidden, authenticated_forbidden) as (
  values ('INSERT', true, false), ('UPDATE', true, false), ('DELETE', true, false),
         ('TRUNCATE', true, true), ('TRIGGER', true, true), ('REFERENCES', true, true)
)
select t.tablename, r.privilege, role_name as grantee
from shop_tables t
cross join requested r
cross join (values ('anon'::text, true), ('authenticated'::text, false)) roles(role_name, is_anon)
where (roles.is_anon and r.anon_forbidden or not roles.is_anon and r.authenticated_forbidden)
  and has_table_privilege(roles.role_name, format('%I.%I', t.schemaname, t.tablename), r.privilege)
order by t.tablename, role_name, r.privilege;
