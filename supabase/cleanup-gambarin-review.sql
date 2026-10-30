-- REVIEW ONLY: run in the former, separate GambarinAI Supabase project.
-- First remove objects in gambarin-thumbnails through the Storage API.
-- This script deliberately leaves auth.users, secrets and any unknown bucket untouched.
begin;

do $$
declare
  item record;
begin
  if to_regclass('public.shop_products') is not null
    or to_regclass('public.service_categories') is not null
    or to_regclass('public.totp_accounts') is not null then
    raise exception 'Refusing to run on the main GreenroomID project';
  end if;
  if exists (select 1 from storage.objects where bucket_id = 'gambarin-thumbnails') then
    raise exception 'Empty gambarin-thumbnails with the Storage API first';
  end if;

  if to_regclass('cron.job') is not null then
    for item in select jobid from cron.job where jobname like 'gambarin-%' loop
      perform cron.unschedule(item.jobid);
    end loop;
  end if;

  for item in
    select format('%I.%I', schemaname, tablename) as object_name
    from pg_tables where schemaname = 'public' and tablename like 'gambarin_%'
  loop
    execute 'drop table ' || item.object_name || ' cascade';
  end loop;

  for item in
    select p.oid::regprocedure as signature
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like '%gambarin%'
  loop
    execute 'drop function ' || item.signature || ' cascade';
  end loop;

  delete from storage.buckets where id = 'gambarin-thumbnails';
end $$;

commit;
