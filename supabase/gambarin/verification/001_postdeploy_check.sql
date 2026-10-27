-- KHUSUS SQL Editor proyek Supabase `greenroomid-gambarin`.
-- Jalankan setelah migrations/001_accounts_packages.sql selesai.
-- Semua pernyataan di file ini READ-ONLY. Simpan hasil setiap query untuk review.
-- Pemeriksaan katalog tidak membuktikan isolasi data antarpengguna.
-- Uji RLS dengan dua identitas authenticated berbeda sebelum fitur dipakai pelanggan.

-- 1. Tiga tabel harus ada dan RLS masing-masing aktif.
with expected(table_name) as (
  values ('gambarin_packages'), ('gambarin_accounts'), ('gambarin_account_events')
)
select e.table_name,
       c.oid is not null as table_exists,
       c.relrowsecurity as rls_enabled
from expected e
left join pg_catalog.pg_class c
  on c.oid = pg_catalog.to_regclass(format('public.%I', e.table_name))
 and c.relkind in ('r', 'p')
order by e.table_name;

-- 2. Expected: hanya gambarin_accounts_read_own untuk SELECT authenticated.
-- Tabel packages dan account_events sengaja tidak memiliki policy client.
select tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_catalog.pg_policies
where schemaname = 'public'
  and tablename in ('gambarin_packages', 'gambarin_accounts', 'gambarin_account_events')
order by tablename, policyname;

-- 3. Hak efektif per role/tabel. Expected: anon tidak punya hak tabel;
-- authenticated hanya SELECT accounts; service_role SELECT/INSERT/UPDATE
-- packages dan accounts, SELECT/INSERT events; semua role tanpa TRUNCATE.
with target(table_name) as (
  values ('gambarin_packages'), ('gambarin_accounts'), ('gambarin_account_events')
), roles(role_name) as (
  values ('anon'), ('authenticated'), ('service_role')
)
select t.table_name, r.role_name,
       pg_catalog.has_table_privilege(r.role_name, c.oid, 'SELECT') as can_select,
       pg_catalog.has_table_privilege(r.role_name, c.oid, 'INSERT') as can_insert,
       pg_catalog.has_table_privilege(r.role_name, c.oid, 'UPDATE') as can_update,
       pg_catalog.has_table_privilege(r.role_name, c.oid, 'DELETE') as can_delete,
       pg_catalog.has_table_privilege(r.role_name, c.oid, 'TRUNCATE') as can_truncate
from target t
cross join roles r
left join pg_catalog.pg_class c
  on c.oid = pg_catalog.to_regclass(format('public.%I', t.table_name))
order by t.table_name, r.role_name;

-- 4. Paket awal: harus tepat lima durasi 1/3/7/14/30 hari,
-- dengan kuota default 4/8/14/20/35 dan is_active = true.
select name, duration_days, default_image_quota, is_active
from public.gambarin_packages
order by duration_days;

-- 5. FK accounts.auth_user_id harus menuju auth.users(id).
select con.conname as constraint_name,
       pg_catalog.pg_get_constraintdef(con.oid) as definition,
       ref_ns.nspname as referenced_schema,
       ref.relname as referenced_table
from pg_catalog.pg_constraint con
join pg_catalog.pg_class rel on rel.oid = con.conrelid
join pg_catalog.pg_namespace ns on ns.oid = rel.relnamespace
join pg_catalog.pg_class ref on ref.oid = con.confrelid
join pg_catalog.pg_namespace ref_ns on ref_ns.oid = ref.relnamespace
where ns.nspname = 'public'
  and rel.relname = 'gambarin_accounts'
  and con.contype = 'f'
order by con.conname;

-- 6. Constraint kuota: nilai >= 0 dan used + reserved <= granted.
select rel.relname as table_name, con.conname as constraint_name,
       pg_catalog.pg_get_constraintdef(con.oid) as definition
from pg_catalog.pg_constraint con
join pg_catalog.pg_class rel on rel.oid = con.conrelid
join pg_catalog.pg_namespace ns on ns.oid = rel.relnamespace
where ns.nspname = 'public'
  and rel.relname in ('gambarin_packages', 'gambarin_accounts')
  and con.contype = 'c'
  and (con.conname like '%quota%' or pg_catalog.pg_get_constraintdef(con.oid) like '%quota%')
order by rel.relname, con.conname;

-- 7. Username harus memakai indeks UNIQUE pada lower(username).
select idx.relname as index_name, ind.indisunique as is_unique,
       pg_catalog.pg_get_indexdef(idx.oid) as definition
from pg_catalog.pg_index ind
join pg_catalog.pg_class idx on idx.oid = ind.indexrelid
join pg_catalog.pg_class tbl on tbl.oid = ind.indrelid
join pg_catalog.pg_namespace ns on ns.oid = tbl.relnamespace
where ns.nspname = 'public'
  and tbl.relname = 'gambarin_accounts'
  and idx.relname = 'gambarin_accounts_username_lower_key';

-- 8. Indeks penting: username_lower, package_id, status_expires_at,
-- account_events_account_time, serta indeks PK/UNIQUE bawaan.
select tablename, indexname, indexdef
from pg_catalog.pg_indexes
where schemaname = 'public'
  and tablename in ('gambarin_packages', 'gambarin_accounts', 'gambarin_account_events')
order by tablename, indexname;

-- 9. Dua fungsi trigger migration harus ada dan tidak SECURITY DEFINER.
select p.proname as function_name, p.prosecdef as security_definer,
       pg_catalog.pg_get_function_identity_arguments(p.oid) as arguments,
       pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_execute,
       pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace ns on ns.oid = p.pronamespace
where ns.nspname = 'public'
  and p.proname in ('gambarin_set_updated_at', 'gambarin_reject_event_changes')
order by p.proname;

-- 10. Expected: updated_at pada packages/accounts dan immutable pada events;
-- semua trigger aktif (enabled = O) dan terkait fungsi di atas.
select tbl.relname as table_name, trg.tgname as trigger_name,
       trg.tgenabled as enabled, proc.proname as function_name,
       pg_catalog.pg_get_triggerdef(trg.oid) as definition
from pg_catalog.pg_trigger trg
join pg_catalog.pg_class tbl on tbl.oid = trg.tgrelid
join pg_catalog.pg_namespace ns on ns.oid = tbl.relnamespace
join pg_catalog.pg_proc proc on proc.oid = trg.tgfoid
where ns.nspname = 'public'
  and tbl.relname in ('gambarin_packages', 'gambarin_accounts', 'gambarin_account_events')
  and not trg.tgisinternal
order by tbl.relname, trg.tgname;
