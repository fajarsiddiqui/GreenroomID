-- Gambarin project ONLY. Prepare locally; do not run without Owner deployment.
-- Thumbnail processing is independent of the generate dispatcher and ledger.
begin;

create index gambarin_jobs_owner_page_idx on public.gambarin_jobs
  (account_id, created_at desc, id desc);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('gambarin-thumbnails', 'gambarin-thumbnails', false, 1048576, array['image/webp'])
on conflict (id) do update set public = false, file_size_limit = 1048576,
  allowed_mime_types = array['image/webp'];

create table public.gambarin_thumbnails (
  job_id uuid primary key references public.gambarin_jobs(id) on delete restrict,
  account_id uuid not null references public.gambarin_accounts(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending','processing','ready','failed')),
  attempts smallint not null default 0 check (attempts between 0 and 5),
  next_attempt_at timestamptz not null default clock_timestamp(),
  lease_until timestamptz,
  storage_path text not null unique,
  bytes integer check (bytes between 1 and 1048576),
  width smallint check (width between 1 and 480),
  height smallint check (height between 1 and 480),
  error_code text,
  processed_ms integer,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  check ((status = 'processing') = (lease_until is not null)),
  check (status <> 'ready' or (bytes is not null and width is not null and height is not null))
);
create index gambarin_thumbnails_due_idx on public.gambarin_thumbnails(next_attempt_at)
  where status in ('pending','processing') or (status='failed' and attempts<5);
alter table public.gambarin_thumbnails enable row level security;
revoke all on public.gambarin_thumbnails from public, anon, authenticated, service_role;
grant select (job_id, status) on public.gambarin_thumbnails to authenticated;
grant select, insert, update on public.gambarin_thumbnails to service_role;
create policy gambarin_thumbnails_read_own on public.gambarin_thumbnails for select to authenticated
using (exists (select 1 from public.gambarin_accounts a
  where a.id = account_id and a.auth_user_id = (select auth.uid())));
-- No storage.objects policy for customers: only the owner-checking Edge endpoint
-- uses service_role to download, so there are no reusable signed URLs.

create function public._gambarin_thumbnail_schedule(p_wake boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare v_cron bigint; v_token text;
begin
  perform pg_advisory_xact_lock(hashtext('gambarin-thumbnail-schedule'));
  select jobid into v_cron from cron.job where jobname='gambarin-thumbnail-worker';
  if not exists (select 1 from public.gambarin_thumbnails
      where status in ('pending','processing') or (status='failed' and attempts<5)) then
    if v_cron is not null then perform cron.unschedule(v_cron); end if;
    return;
  end if;
  select decrypted_secret into v_token from vault.decrypted_secrets
    where name='gambarin_worker_trigger_jwt';
  -- Missing Vault configuration leaves work pending without rolling back the
  -- already successful generate transaction.
  if v_token is null or length(v_token)<40 then return; end if;
  if v_cron is null then
    perform cron.schedule('gambarin-thumbnail-worker','* * * * *',
      'select public._gambarin_thumbnail_tick()');
  end if;
  if p_wake then
    perform net.http_post(
      url:='https://qhucajoygbexzpraxzlk.supabase.co/functions/v1/gambarin-thumbnail-worker',
      headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||v_token),
      body:='{}'::jsonb, timeout_milliseconds:=2000);
  end if;
end;
$$;

create function public._gambarin_thumbnail_tick()
returns void language plpgsql security definer set search_path = '' as $$
begin
  -- The cron is only a temporary watchdog while work exists.
  perform public._gambarin_thumbnail_schedule(exists (
    select 1 from public.gambarin_thumbnails where
      (status in ('pending','failed') and attempts<5 and next_attempt_at<=clock_timestamp())
      or (status='processing' and lease_until<=clock_timestamp())));
end;
$$;

create function public._gambarin_thumbnail_on_success()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status='succeeded' and old.status is distinct from new.status
    and new.provider_asset_id is not null then
    insert into public.gambarin_thumbnails(job_id,account_id,storage_path)
    values (new.id,new.account_id,new.account_id::text||'/'||new.id::text||'.webp')
    on conflict (job_id) do nothing;
    begin
      perform public._gambarin_thumbnail_schedule(true);
    exception when others then
      -- Thumbnail infrastructure must never roll back quota/job finalization.
      raise warning 'gambarin_thumbnail_wakeup_failed';
    end;
  end if;
  return new;
end;
$$;
create trigger gambarin_thumbnail_success after update of status on public.gambarin_jobs
for each row execute function public._gambarin_thumbnail_on_success();

create function public.gambarin_thumbnail_claim()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare t public.gambarin_thumbnails%rowtype;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode='42501', message='backend_only';
  end if;
  perform pg_advisory_xact_lock(hashtext('gambarin-thumbnail-claim'));
  if exists (select 1 from public.gambarin_thumbnails
    where status='processing' and lease_until>clock_timestamp()) then return null; end if;
  select * into t from public.gambarin_thumbnails
  where (status in ('pending','failed') and attempts<5 and next_attempt_at<=clock_timestamp())
    or (status='processing' and lease_until<=clock_timestamp())
  order by next_attempt_at,created_at limit 1 for update skip locked;
  if not found then return null; end if;
  update public.gambarin_thumbnails set status='processing', attempts=attempts+1,
    lease_until=clock_timestamp()+interval '3 minutes', updated_at=clock_timestamp()
    where job_id=t.job_id;
  return jsonb_build_object('job_id',t.job_id,'account_id',t.account_id,
    'storage_path',t.storage_path,'attempt',t.attempts+1);
end;
$$;

create function public.gambarin_thumbnail_finish(p_job_id uuid,p_attempt integer,
  p_ready boolean,p_bytes integer default null,p_width integer default null,
  p_height integer default null,p_processed_ms integer default null,p_error_code text default null,
  p_permanent boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare t public.gambarin_thumbnails%rowtype;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode='42501', message='backend_only';
  end if;
  select * into t from public.gambarin_thumbnails where job_id=p_job_id for update;
  if not found or t.status='ready' then return; end if;
  if t.status<>'processing' or t.attempts<>p_attempt then
    raise exception 'stale_thumbnail_attempt';
  end if;
  if p_ready and (p_bytes not between 1 and 1048576 or p_width not between 1 and 480
    or p_height not between 1 and 480) then raise exception 'invalid_thumbnail_metadata'; end if;
  update public.gambarin_thumbnails set status=case when p_ready then 'ready' else 'failed' end,
    attempts=case when p_permanent then 5 else attempts end,
    lease_until=null, bytes=case when p_ready then p_bytes else null end,
    width=case when p_ready then p_width else null end,
    height=case when p_ready then p_height else null end,
    processed_ms=p_processed_ms,
    error_code=case when p_ready then null else left(coalesce(p_error_code,'unavailable'),60) end,
    next_attempt_at=case when p_ready then next_attempt_at
      else clock_timestamp()+make_interval(secs=>case t.attempts
        when 1 then 60 when 2 then 300 else 1800 end) end,
    updated_at=clock_timestamp() where job_id=p_job_id;
  perform public._gambarin_thumbnail_schedule(false);
end;
$$;

create function public.gambarin_thumbnail_budget(p_new_bytes integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_used bigint;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode='42501', message='backend_only';
  end if;
  select coalesce(sum(bytes),0) into v_used from public.gambarin_thumbnails where status='ready';
  return p_new_bytes between 1 and 1048576 and v_used+p_new_bytes<=83886080;
end;
$$;

-- Admin-only, explicit batches. Never called by page load or migration.
create function public.gambarin_thumbnail_backfill(p_limit integer default 5)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode='42501', message='backend_only';
  end if;
  if p_limit not between 1 and 10 then raise exception 'invalid_backfill_limit'; end if;
  with candidates as (
    select j.id,j.account_id from public.gambarin_jobs j
    where j.status='succeeded' and j.provider_asset_id is not null
      and not exists(select 1 from public.gambarin_thumbnails t where t.job_id=j.id)
    order by j.finished_at,j.id limit p_limit
  ) insert into public.gambarin_thumbnails(job_id,account_id,storage_path)
    select id,account_id,account_id::text||'/'||id::text||'.webp' from candidates
    on conflict(job_id) do nothing;
  get diagnostics v_count=row_count;
  if v_count>0 then perform public._gambarin_thumbnail_schedule(true); end if;
  return v_count;
end;
$$;

revoke all on function public._gambarin_thumbnail_schedule(boolean),
  public._gambarin_thumbnail_tick(), public._gambarin_thumbnail_on_success()
  from public,anon,authenticated,service_role;
revoke all on function public.gambarin_thumbnail_claim(),
  public.gambarin_thumbnail_finish(uuid,integer,boolean,integer,integer,integer,integer,text,boolean),
  public.gambarin_thumbnail_budget(integer),public.gambarin_thumbnail_backfill(integer)
  from public,anon,authenticated,service_role;
grant execute on function public.gambarin_thumbnail_claim(),
  public.gambarin_thumbnail_finish(uuid,integer,boolean,integer,integer,integer,integer,text,boolean),
  public.gambarin_thumbnail_budget(integer),public.gambarin_thumbnail_backfill(integer)
  to service_role;
commit;
