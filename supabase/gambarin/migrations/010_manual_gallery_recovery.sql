-- Gambarin ONLY. One owner-attested Gallery reconciliation path for an
-- ambiguous submit with no provider JobResponse. Never creates a provider ID.
begin;
do $$ begin
  perform 1 from public.gambarin_dispatcher where id=1 and dispatch_paused for update;
  if not found then raise exception 'installation_requires_paused_dispatcher'; end if;
end $$;

alter table public.gambarin_jobs add column gallery_item_id uuid unique;

create table public.gambarin_manual_gallery_audit (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null unique references public.gambarin_jobs(id) on delete restrict,
  request_id uuid not null unique references public.gambarin_provider_requests(id) on delete restrict,
  gallery_item_id uuid not null unique,
  media_generation_id text not null unique,
  probe_request_id bigint not null,
  owner_reference text not null,
  evidence jsonb not null check (jsonb_typeof(evidence)='object'),
  created_at timestamptz not null default clock_timestamp()
);
create function public.gambarin_reject_manual_gallery_audit_changes()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'gambarin_manual_gallery_audit is append-only';
end;
$$;
create trigger gambarin_manual_gallery_audit_immutable
before update or delete on public.gambarin_manual_gallery_audit
for each row execute function public.gambarin_reject_manual_gallery_audit_changes();
alter table public.gambarin_manual_gallery_audit enable row level security;
revoke all on public.gambarin_manual_gallery_audit from public,anon,authenticated,service_role;
grant select on public.gambarin_manual_gallery_audit to service_role;

create function public.gambarin_admin_reconcile_gallery_success(
  p_job_id uuid, p_request_id uuid, p_gallery_item_id uuid,
  p_media_generation_id text, p_probe_request_id bigint,
  p_expected_username text, p_owner_reference text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  g public.gambarin_dispatcher%rowtype;
  j public.gambarin_jobs%rowtype;
  r public.gambarin_provider_requests%rowtype;
  a public.gambarin_accounts%rowtype;
  prior public.gambarin_manual_gallery_audit%rowtype;
  probe_status integer;
  probe jsonb;
  gallery_created timestamptz;
  settled jsonb;
  finished timestamptz;
begin
  perform public._gambarin_queue_backend();
  if p_job_id is null or p_request_id is null or p_gallery_item_id is null
    or p_probe_request_id is null or p_media_generation_id is null
    or length(p_media_generation_id) not between 1 and 200
    or p_expected_username is null or length(p_expected_username) not between 1 and 64
    or p_owner_reference is null or p_owner_reference !~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$' then
    raise exception 'manual_gallery_evidence_required';
  end if;
  select * into g from public.gambarin_dispatcher where id=1 for update;
  select * into j from public.gambarin_jobs where id=p_job_id for update;
  if not found then raise exception 'job_not_found'; end if;
  select * into prior from public.gambarin_manual_gallery_audit where job_id=p_job_id;
  if found then
    if j.status='succeeded' and j.provider_job_id is null
      and j.provider_asset_id=p_media_generation_id and j.gallery_item_id=p_gallery_item_id
      and prior.request_id=p_request_id and prior.gallery_item_id=p_gallery_item_id
      and prior.media_generation_id=p_media_generation_id
      and prior.probe_request_id=p_probe_request_id and prior.owner_reference=p_owner_reference then
      return public._gambarin_queue_view(j.id);
    end if;
    raise exception 'manual_gallery_reconciliation_conflict';
  end if;
  select * into r from public.gambarin_provider_requests where id=p_request_id for update;
  select * into a from public.gambarin_accounts where id=j.account_id for update;
  if not g.dispatch_paused or g.request_state<>'recovery_required'
    or g.active_job_id is distinct from p_job_id or g.active_request_id is distinct from p_request_id
    or g.lease_expires_at>=clock_timestamp() or j.status<>'submission_unknown'
    or j.provider_job_id is not null or j.provider_asset_id is not null or j.gallery_item_id is not null
    or j.prompt is null or a.username is distinct from p_expected_username
    or r.job_id is distinct from p_job_id or r.purpose<>'submit'
    or r.finished_at is not null or r.provider_job_id is not null
    or exists(select 1 from cron.job where jobname='gambarin-activity-worker')
    or (select count(*) from public.gambarin_jobs where status='submission_unknown')<>1
    or exists(select 1 from public.gambarin_jobs where provider_asset_id=p_media_generation_id
      or gallery_item_id=p_gallery_item_id) then
    raise exception 'manual_gallery_state_conflict';
  end if;
  select status_code, content::jsonb into probe_status, probe
    from net._http_response where id=p_probe_request_id;
  if not found or probe_status is distinct from 200
    or probe->>'job_id' is distinct from p_job_id::text
    or probe->>'gallery_item_id' is distinct from p_gallery_item_id::text
    or probe->>'media_generation_id' is distinct from p_media_generation_id
    or probe->>'prompt_matches' is distinct from 'true'
    or probe->>'has_url' is distinct from 'true'
    or (probe->>'submission_started_at')::timestamptz is distinct from j.submission_started_at then
    raise exception 'gallery_probe_mismatch';
  end if;
  gallery_created := (probe->>'created_at')::timestamptz;
  if gallery_created is null or gallery_created<j.submission_started_at
    or gallery_created>j.submission_started_at+interval '10 minutes'
    or gallery_created>clock_timestamp() then raise exception 'gallery_time_mismatch'; end if;

  finished := clock_timestamp();
  update public.gambarin_provider_requests set finished_at=finished,
    outcome='recovered_unknown', recovery_reference=p_owner_reference where id=r.id;
  update public.gambarin_dispatcher set request_state='idle', active_request_id=null,
    worker_id=null, lease_id=null, lease_expires_at=null,
    last_request_finished_at=finished,
    next_allowed_at=finished+make_interval(secs=>g.cooldown_seconds) where id=1;
  update public.gambarin_jobs set gallery_item_id=p_gallery_item_id,
    reconciliation_reference=p_owner_reference, reconciled_at=finished where id=j.id;
  settled := public._gambarin_queue_settle(j.id,'succeeded',null,p_media_generation_id);
  insert into public.gambarin_manual_gallery_audit(
    job_id,request_id,gallery_item_id,media_generation_id,probe_request_id,owner_reference,evidence)
  values (j.id,r.id,p_gallery_item_id,p_media_generation_id,p_probe_request_id,p_owner_reference,
    jsonb_build_object('method','owner_attested_gallery_match','provider_job_id_verified',false,
      'prompt_match',true,'gallery_created_at',gallery_created,'gallery_model',probe->>'model',
      'gallery_aspect_ratio',probe->>'aspect_ratio','provider_url_stored',false));
  return settled;
end;
$$;
revoke all on function public.gambarin_reject_manual_gallery_audit_changes(),
  public.gambarin_admin_reconcile_gallery_success(uuid,uuid,uuid,text,bigint,text,text)
  from public,anon,authenticated,service_role;
grant execute on function public.gambarin_admin_reconcile_gallery_success(uuid,uuid,uuid,text,bigint,text,text)
  to service_role;
commit;
