-- KHUSUS greenroomid-gambarin; DILARANG pada Supabase GreenroomID utama.
-- Foundation only. NOT EXECUTED on Supabase. No provider/network dispatch.
-- Lock order for every mutation: dispatcher -> job -> account.
begin;

create sequence public.gambarin_job_sequence;
create table public.gambarin_jobs (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.gambarin_accounts(id) on delete restrict,
  idempotency_key uuid not null,
  request_fingerprint text not null,
  sequence_no bigint not null default nextval('public.gambarin_job_sequence') unique,
  prompt text check (prompt is null or length(btrim(prompt)) between 1 and 4000),
  parameters jsonb not null default '{"count":1}'::jsonb check (parameters = '{"count":1}'::jsonb),
  status text not null default 'queued' check (status in (
    'queued', 'claimed', 'submitting', 'processing', 'submission_unknown', 'succeeded', 'failed', 'cancelled'
  )),
  provider_job_id text unique check (provider_job_id is null or length(provider_job_id) between 1 and 200),
  provider_asset_id text check (provider_asset_id is null or length(provider_asset_id) between 1 and 200),
  error_code text check (error_code in (
    'account_inactive', 'account_expired', 'provider_failed', 'provider_cancelled',
    'submission_unknown', 'lease_expired', 'cancelled_by_owner', 'reconciled_not_accepted'
  )),
  created_at timestamptz not null default clock_timestamp(),
  claimed_at timestamptz,
  submission_started_at timestamptz,
  submitted_at timestamptz,
  finished_at timestamptz,
  next_attempt_at timestamptz not null default clock_timestamp(),
  next_poll_at timestamptz not null default clock_timestamp(),
  reconciled_at timestamptz,
  reconciliation_reference text,
  unique (account_id, idempotency_key),
  unique (id, account_id),
  check (status in ('succeeded', 'failed', 'cancelled') or prompt is not null),
  check ((status in ('succeeded', 'failed', 'cancelled')) = (finished_at is not null)),
  check (status <> 'processing' or provider_job_id is not null)
);
create index gambarin_jobs_fifo_idx on public.gambarin_jobs(sequence_no) where status = 'queued';
create index gambarin_jobs_owner_time_idx on public.gambarin_jobs(account_id, created_at desc);
create unique index gambarin_jobs_one_active_idx on public.gambarin_jobs ((true))
  where status in ('claimed', 'submitting', 'processing', 'submission_unknown');

create table public.gambarin_quota_ledger (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null,
  account_id uuid not null,
  event text not null check (event in ('reserve', 'consume', 'release')),
  reserved_delta integer not null,
  used_delta integer not null,
  reserved_before integer not null check (reserved_before >= 0),
  reserved_after integer not null check (reserved_after >= 0),
  used_before integer not null check (used_before >= 0),
  used_after integer not null check (used_after >= 0),
  quota_granted integer not null check (quota_granted >= 0),
  reason text not null check (reason in (
    'enqueue', 'succeeded', 'provider_failed', 'provider_cancelled', 'account_inactive',
    'account_expired', 'cancelled_by_owner', 'reconciled_not_accepted'
  )),
  created_at timestamptz not null default clock_timestamp(),
  foreign key (job_id, account_id) references public.gambarin_jobs(id, account_id) on delete restrict,
  unique (job_id, event),
  check ((event = 'reserve' and reserved_delta = 1 and used_delta = 0)
    or (event = 'consume' and reserved_delta = -1 and used_delta = 1)
    or (event = 'release' and reserved_delta = -1 and used_delta = 0)),
  check (reserved_after::bigint = reserved_before::bigint + reserved_delta),
  check (used_after::bigint = used_before::bigint + used_delta),
  check (reserved_after::bigint + used_after::bigint <= quota_granted::bigint)
);
create unique index gambarin_quota_ledger_one_final_idx on public.gambarin_quota_ledger(job_id)
  where event in ('consume', 'release');
create index gambarin_quota_ledger_account_time_idx on public.gambarin_quota_ledger(account_id, created_at);

create table public.gambarin_provider_requests (
  id uuid primary key default gen_random_uuid(),
  lease_id uuid not null,
  worker_id uuid not null,
  job_id uuid references public.gambarin_jobs(id) on delete restrict,
  purpose text not null check (purpose in ('submit', 'status', 'sync', 'resolve', 'metadata')),
  outcome text check (outcome in ('accepted', 'rejected', 'unknown', 'observed', 'transport_error', 'recovered_unknown')),
  provider_job_id text,
  started_at timestamptz not null default clock_timestamp(),
  finished_at timestamptz,
  recovery_reference text,
  check ((finished_at is null) = (outcome is null))
);
create unique index gambarin_provider_requests_one_open_idx on public.gambarin_provider_requests ((true))
  where finished_at is null;

create table public.gambarin_dispatcher (
  id smallint primary key check (id = 1),
  dispatch_paused boolean not null default true,
  cooldown_seconds integer not null default 5 check (cooldown_seconds between 5 and 3600),
  active_job_id uuid references public.gambarin_jobs(id) on delete restrict,
  lease_id uuid,
  worker_id uuid,
  lease_expires_at timestamptz,
  request_state text not null default 'idle' check (request_state in ('idle', 'in_flight', 'recovery_required')),
  active_request_id uuid references public.gambarin_provider_requests(id) on delete restrict,
  last_request_finished_at timestamptz,
  next_allowed_at timestamptz not null default '-infinity',
  check ((lease_id is null and worker_id is null and lease_expires_at is null)
    or (lease_id is not null and worker_id is not null and lease_expires_at is not null)),
  check ((request_state = 'idle') = (active_request_id is null)),
  check (last_request_finished_at is null or next_allowed_at >= last_request_finished_at + interval '5 seconds')
);
-- Deliberately paused: provider gates are NOT approved and there is no worker yet.
insert into public.gambarin_dispatcher(id) values (1);

alter table public.gambarin_jobs enable row level security;
alter table public.gambarin_quota_ledger enable row level security;
alter table public.gambarin_provider_requests enable row level security;
alter table public.gambarin_dispatcher enable row level security;
revoke all on public.gambarin_jobs, public.gambarin_quota_ledger,
  public.gambarin_provider_requests, public.gambarin_dispatcher from public, anon, authenticated, service_role;
revoke all on sequence public.gambarin_job_sequence from public, anon, authenticated, service_role;
grant select on public.gambarin_jobs to authenticated;
grant select on public.gambarin_jobs, public.gambarin_quota_ledger,
  public.gambarin_provider_requests, public.gambarin_dispatcher to service_role;
create policy gambarin_jobs_read_own on public.gambarin_jobs for select to authenticated
using (exists (select 1 from public.gambarin_accounts a
  where a.id = account_id and a.auth_user_id = (select auth.uid())));

create function public.gambarin_reject_ledger_changes() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception using errcode = '42501', message = 'immutable_quota_ledger';
end;
$$;
create trigger gambarin_quota_ledger_immutable before update or delete on public.gambarin_quota_ledger
for each row execute function public.gambarin_reject_ledger_changes();

-- Private helpers. None are callable by application roles, including service_role.
create function public._gambarin_queue_backend() returns void
language plpgsql set search_path = '' as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'backend_only';
  end if;
end;
$$;
create function public._gambarin_queue_view(p_id uuid) returns jsonb
language sql set search_path = '' as $$
  select to_jsonb(j) - 'request_fingerprint' from public.gambarin_jobs j where j.id = p_id;
$$;
create function public._gambarin_queue_lease(p_worker uuid, p_lease uuid) returns void
language plpgsql set search_path = '' as $$
declare g public.gambarin_dispatcher%rowtype;
begin
  select * into g from public.gambarin_dispatcher where id = 1;
  if p_worker is null or p_lease is null or g.worker_id is distinct from p_worker
    or g.lease_id is distinct from p_lease or g.lease_expires_at <= clock_timestamp() then
    raise exception using errcode = 'P0001', message = 'stale_lease';
  end if;
  if g.dispatch_paused then
    raise exception using errcode = 'P0001', message = 'dispatch_paused';
  end if;
end;
$$;

-- Caller holds dispatcher + job locks. Account and ledger change together.
create function public._gambarin_queue_settle(p_id uuid, p_status text, p_error text, p_asset text default null)
returns jsonb language plpgsql set search_path = '' as $$
declare j public.gambarin_jobs%rowtype; a public.gambarin_accounts%rowtype; v_event text; v_used integer;
begin
  select * into j from public.gambarin_jobs where id = p_id for update;
  if j.status in ('succeeded', 'failed', 'cancelled') then
    if j.status <> p_status then raise exception 'finalization_conflict'; end if;
    return public._gambarin_queue_view(j.id);
  end if;
  if p_status is null or p_status not in ('succeeded', 'failed', 'cancelled') then raise exception 'invalid_terminal_status'; end if;
  select * into a from public.gambarin_accounts where id = j.account_id for update;
  if a.quota_reserved < 1 then raise exception 'quota_reservation_conflict'; end if;
  v_used := case when p_status = 'succeeded' then 1 else 0 end;
  v_event := case when v_used = 1 then 'consume' else 'release' end;
  update public.gambarin_accounts set quota_reserved = quota_reserved - 1, quota_used = quota_used + v_used
  where id = a.id;
  insert into public.gambarin_quota_ledger(job_id, account_id, event, reserved_delta, used_delta,
    reserved_before, reserved_after, used_before, used_after, quota_granted, reason)
  values (j.id, a.id, v_event, -1, v_used, a.quota_reserved, a.quota_reserved - 1,
    a.quota_used, a.quota_used + v_used, a.quota_granted, coalesce(p_error, 'succeeded'));
  update public.gambarin_jobs set status = p_status, finished_at = clock_timestamp(),
    error_code = p_error, prompt = null, provider_asset_id = p_asset where id = j.id;
  update public.gambarin_dispatcher set active_job_id = null where id = 1 and active_job_id = j.id;
  return public._gambarin_queue_view(j.id);
end;
$$;

-- Backend must derive p_auth_user_id from a verified Gambarin JWT, never a body claim.
create function public.gambarin_enqueue_job(p_auth_user_id uuid, p_idempotency_key uuid, p_prompt text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a public.gambarin_accounts%rowtype; j public.gambarin_jobs%rowtype; fingerprint text;
begin
  perform public._gambarin_queue_backend();
  if p_auth_user_id is null or p_idempotency_key is null or p_prompt is null
    or length(btrim(p_prompt)) not between 1 and 4000 then raise exception 'invalid_enqueue_input'; end if;
  fingerprint := encode(sha256(convert_to(btrim(p_prompt), 'UTF8')), 'hex');
  perform 1 from public.gambarin_dispatcher where id = 1 for update;
  select * into a from public.gambarin_accounts where auth_user_id = p_auth_user_id for update;
  if not found then raise exception 'account_not_found'; end if;
  select * into j from public.gambarin_jobs where account_id = a.id and idempotency_key = p_idempotency_key;
  if found then
    if j.request_fingerprint <> fingerprint then raise exception 'idempotency_conflict'; end if;
    return public._gambarin_queue_view(j.id);
  end if;
  if a.status <> 'active' then raise exception 'account_inactive'; end if;
  if a.activated_at is null or a.activated_at > clock_timestamp()
    or a.expires_at is null or a.expires_at <= clock_timestamp() then raise exception 'account_expired'; end if;
  if a.quota_used::bigint + a.quota_reserved::bigint >= a.quota_granted::bigint then raise exception 'quota_unavailable'; end if;
  if (select count(*) from public.gambarin_jobs where status not in ('succeeded','failed','cancelled')) >= 20 then
    raise exception 'queue_full';
  end if;
  insert into public.gambarin_jobs(account_id, idempotency_key, request_fingerprint, prompt)
  values (a.id, p_idempotency_key, fingerprint, btrim(p_prompt)) returning * into j;
  update public.gambarin_accounts set quota_reserved = quota_reserved + 1 where id = a.id;
  insert into public.gambarin_quota_ledger(job_id, account_id, event, reserved_delta, used_delta,
    reserved_before, reserved_after, used_before, used_after, quota_granted, reason)
  values (j.id, a.id, 'reserve', 1, 0, a.quota_reserved, a.quota_reserved + 1,
    a.quota_used, a.quota_used, a.quota_granted, 'enqueue');
  return public._gambarin_queue_view(j.id);
end;
$$;

create function public.gambarin_cancel_queued_job(p_auth_user_id uuid, p_job_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare j public.gambarin_jobs%rowtype;
begin
  perform public._gambarin_queue_backend();
  perform 1 from public.gambarin_dispatcher where id = 1 for update;
  select * into j from public.gambarin_jobs where id = p_job_id for update;
  if not found or not exists (select 1 from public.gambarin_accounts
    where id = j.account_id and auth_user_id = p_auth_user_id) then raise exception 'job_not_found'; end if;
  if j.status = 'cancelled' then return public._gambarin_queue_view(j.id); end if;
  if j.status <> 'queued' then raise exception 'job_not_cancellable'; end if;
  return public._gambarin_queue_settle(j.id, 'cancelled', 'cancelled_by_owner');
end;
$$;

create function public.gambarin_acquire_dispatcher(p_worker_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare g public.gambarin_dispatcher%rowtype; v_now timestamptz;
begin
  perform public._gambarin_queue_backend();
  if p_worker_id is null then raise exception 'invalid_worker'; end if;
  select * into g from public.gambarin_dispatcher where id = 1 for update;
  v_now := clock_timestamp();
  if g.request_state <> 'idle' then
    if g.lease_expires_at <= v_now then
      update public.gambarin_dispatcher set request_state = 'recovery_required' where id = 1;
      update public.gambarin_jobs set status = 'submission_unknown', error_code = 'lease_expired'
      where id = g.active_job_id and status = 'submitting';
      return jsonb_build_object('state', 'recovery_required');
    end if;
    return jsonb_build_object('state', 'request_in_flight');
  end if;
  if g.dispatch_paused then return jsonb_build_object('state', 'paused'); end if;
  if g.lease_expires_at > v_now and g.worker_id is distinct from p_worker_id then
    return jsonb_build_object('state', 'busy');
  end if;
  if g.lease_expires_at is null or g.lease_expires_at <= v_now then
    -- A claim with no begun request can safely return to the SAME FIFO position.
    update public.gambarin_jobs set status = 'queued', claimed_at = null
    where id = g.active_job_id and status = 'claimed';
    if found then g.active_job_id := null; end if;
    g.lease_id := gen_random_uuid();
  end if;
  update public.gambarin_dispatcher set active_job_id = g.active_job_id,
    worker_id = p_worker_id, lease_id = g.lease_id, lease_expires_at = v_now + interval '60 seconds' where id = 1;
  return jsonb_build_object('state', 'acquired', 'lease_id', g.lease_id, 'active_job_id', g.active_job_id);
end;
$$;

create function public.gambarin_release_dispatcher(p_worker_id uuid, p_lease_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare g public.gambarin_dispatcher%rowtype;
begin
  perform public._gambarin_queue_backend();
  select * into g from public.gambarin_dispatcher where id = 1 for update;
  perform public._gambarin_queue_lease(p_worker_id, p_lease_id);
  if g.request_state <> 'idle' then raise exception 'request_not_finished'; end if;
  update public.gambarin_dispatcher set worker_id = null, lease_id = null, lease_expires_at = null where id = 1;
end;
$$;

create function public.gambarin_claim_next_job(p_worker_id uuid, p_lease_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare g public.gambarin_dispatcher%rowtype; j public.gambarin_jobs%rowtype; a public.gambarin_accounts%rowtype;
begin
  perform public._gambarin_queue_backend();
  select * into g from public.gambarin_dispatcher where id = 1 for update;
  perform public._gambarin_queue_lease(p_worker_id, p_lease_id);
  if g.request_state <> 'idle' or g.active_job_id is not null
    or clock_timestamp() < greatest(g.next_allowed_at,
      g.last_request_finished_at + make_interval(secs => g.cooldown_seconds)) then return null; end if;
  -- No SKIP LOCKED: never skip a delayed/locked head to dispatch a later user.
  select * into j from public.gambarin_jobs where status = 'queued' order by sequence_no limit 1 for update;
  if not found or j.next_attempt_at > clock_timestamp() then return null; end if;
  select * into a from public.gambarin_accounts where id = j.account_id for update;
  if a.status <> 'active' then return public._gambarin_queue_settle(j.id, 'failed', 'account_inactive'); end if;
  if a.activated_at > clock_timestamp() or a.expires_at <= clock_timestamp() then
    return public._gambarin_queue_settle(j.id, 'failed', 'account_expired');
  end if;
  update public.gambarin_jobs set status = 'claimed', claimed_at = clock_timestamp() where id = j.id;
  update public.gambarin_dispatcher set active_job_id = j.id where id = 1;
  return public._gambarin_queue_view(j.id);
end;
$$;

create function public.gambarin_begin_provider_request(p_worker_id uuid, p_lease_id uuid, p_purpose text, p_job_id uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare g public.gambarin_dispatcher%rowtype; j public.gambarin_jobs%rowtype; r public.gambarin_provider_requests%rowtype;
begin
  perform public._gambarin_queue_backend();
  select * into g from public.gambarin_dispatcher where id = 1 for update;
  perform public._gambarin_queue_lease(p_worker_id, p_lease_id);
  if p_purpose is null or p_purpose not in ('submit','status','sync','resolve','metadata') then raise exception 'invalid_purpose'; end if;
  if g.request_state <> 'idle' then raise exception 'request_not_finished'; end if;
  if clock_timestamp() < greatest(g.next_allowed_at,
    g.last_request_finished_at + make_interval(secs => g.cooldown_seconds)) then raise exception 'global_cooldown'; end if;
  if p_job_id is not null then
    select * into j from public.gambarin_jobs where id = p_job_id for update;
    if not found then raise exception 'job_not_found'; end if;
  end if;
  if p_purpose = 'submit' then
    if p_job_id is null or g.active_job_id is distinct from p_job_id or j.status <> 'claimed' then raise exception 'submit_not_allowed'; end if;
    update public.gambarin_jobs set status = 'submitting', submission_started_at = clock_timestamp() where id = j.id;
  elsif p_purpose in ('status','sync') then
    if p_job_id is null or g.active_job_id is distinct from p_job_id
      or j.status not in ('processing','submission_unknown') or j.provider_job_id is null then raise exception 'poll_not_allowed'; end if;
    if j.next_poll_at > clock_timestamp() then raise exception 'poll_backoff'; end if;
  elsif p_purpose = 'resolve' then
    if p_job_id is null or j.status <> 'succeeded' or j.provider_asset_id is null then raise exception 'resolve_not_allowed'; end if;
  end if;
  insert into public.gambarin_provider_requests(lease_id, worker_id, job_id, purpose)
  values (p_lease_id, p_worker_id, p_job_id, p_purpose) returning * into r;
  update public.gambarin_dispatcher set request_state = 'in_flight', active_request_id = r.id where id = 1;
  return jsonb_build_object('request_id', r.id, 'purpose', r.purpose, 'job_id', r.job_id);
end;
$$;

-- Call ONLY AFTER response/transport completion has been handled, never before fetch.
create function public.gambarin_finish_provider_request(p_worker_id uuid, p_lease_id uuid, p_request_id uuid,
  p_outcome text, p_provider_job_id text default null, p_retry_after_seconds integer default 10)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare g public.gambarin_dispatcher%rowtype; r public.gambarin_provider_requests%rowtype; v_now timestamptz;
begin
  perform public._gambarin_queue_backend();
  select * into g from public.gambarin_dispatcher where id = 1 for update;
  select * into r from public.gambarin_provider_requests where id = p_request_id for update;
  if not found or p_worker_id is null or p_lease_id is null or r.worker_id is distinct from p_worker_id
    or r.lease_id is distinct from p_lease_id then raise exception 'stale_request'; end if;
  if r.finished_at is not null then
    if r.outcome is distinct from p_outcome or r.provider_job_id is distinct from p_provider_job_id then raise exception 'request_result_conflict'; end if;
    return jsonb_build_object('request_id', r.id, 'finished_at', r.finished_at);
  end if;
  -- An expired lease may ACK its own still-blocking request; no takeover occurred.
  if g.active_request_id is distinct from r.id or g.lease_id is distinct from p_lease_id then raise exception 'stale_request'; end if;
  if p_retry_after_seconds is null or p_retry_after_seconds not between 10 and 3600 then raise exception 'invalid_backoff'; end if;
  if r.purpose = 'submit' then
    if p_outcome is null or p_outcome not in ('accepted','rejected','unknown','transport_error') then raise exception 'invalid_outcome'; end if;
    if p_outcome <> 'accepted' and p_provider_job_id is not null then raise exception 'invalid_outcome'; end if;
    if p_outcome = 'accepted' then
      if p_provider_job_id is null or length(p_provider_job_id) not between 1 and 200 then raise exception 'missing_provider_job_id'; end if;
      update public.gambarin_jobs set status = 'processing', provider_job_id = p_provider_job_id,
        submitted_at = clock_timestamp(), error_code = null,
        next_poll_at = clock_timestamp() + make_interval(secs => p_retry_after_seconds) where id = r.job_id;
    elsif p_outcome = 'rejected' then
      -- Only a DEFINITIVE rejection before acceptance (slot/queue busy), not a timeout.
      update public.gambarin_jobs set status = 'queued',
        next_attempt_at = clock_timestamp() + make_interval(secs => p_retry_after_seconds) where id = r.job_id;
      update public.gambarin_dispatcher set active_job_id = null where id = 1;
    else
      update public.gambarin_jobs set status = 'submission_unknown', error_code = 'submission_unknown' where id = r.job_id;
    end if;
  else
    if p_outcome is null or p_outcome not in ('observed','transport_error') or p_provider_job_id is not null then raise exception 'invalid_outcome'; end if;
    if r.purpose in ('status','sync') then
      update public.gambarin_jobs set next_poll_at = clock_timestamp() + make_interval(secs => p_retry_after_seconds) where id = r.job_id;
    end if;
  end if;
  v_now := clock_timestamp();
  update public.gambarin_provider_requests set finished_at = v_now, outcome = p_outcome, provider_job_id = p_provider_job_id where id = r.id;
  update public.gambarin_dispatcher set request_state = 'idle', active_request_id = null,
    last_request_finished_at = v_now, next_allowed_at = v_now + make_interval(secs => g.cooldown_seconds) where id = 1;
  return jsonb_build_object('request_id', r.id, 'finished_at', v_now);
end;
$$;

-- Operator-only attestation: first terminate/confirm the old worker AND transport.
-- Expiry alone is NOT evidence; this RPC must never be an automatic timeout sweep.
create function public.gambarin_recover_provider_request(p_request_id uuid, p_transport_finished boolean, p_reference text)
returns void language plpgsql security definer set search_path = '' as $$
declare g public.gambarin_dispatcher%rowtype; r public.gambarin_provider_requests%rowtype; v_now timestamptz;
begin
  perform public._gambarin_queue_backend();
  select * into g from public.gambarin_dispatcher where id = 1 for update;
  select * into r from public.gambarin_provider_requests where id = p_request_id for update;
  if not found or g.active_request_id is distinct from p_request_id then raise exception 'stale_request'; end if;
  if g.lease_expires_at > clock_timestamp() or p_transport_finished is distinct from true
    or p_reference is null or p_reference !~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$' then raise exception 'recovery_evidence_required'; end if;
  if r.purpose = 'submit' then
    update public.gambarin_jobs set status = 'submission_unknown', error_code = 'lease_expired' where id = r.job_id;
  end if;
  v_now := clock_timestamp();
  update public.gambarin_provider_requests set finished_at = v_now, outcome = 'recovered_unknown', recovery_reference = p_reference where id = r.id;
  update public.gambarin_dispatcher set request_state = 'idle', active_request_id = null,
    worker_id = null, lease_id = null, lease_expires_at = null,
    last_request_finished_at = v_now, next_allowed_at = v_now + make_interval(secs => g.cooldown_seconds) where id = 1;
end;
$$;

create function public.gambarin_reconcile_submission(p_job_id uuid, p_resolution text, p_reference text, p_provider_job_id text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare g public.gambarin_dispatcher%rowtype; j public.gambarin_jobs%rowtype;
begin
  perform public._gambarin_queue_backend();
  if p_reference is null or p_reference !~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$'
    or p_resolution is null or p_resolution not in ('accepted','not_accepted') then raise exception 'reconciliation_evidence_required'; end if;
  select * into g from public.gambarin_dispatcher where id = 1 for update;
  if g.request_state <> 'idle' then raise exception 'request_not_finished'; end if;
  select * into j from public.gambarin_jobs where id = p_job_id for update;
  if not found then raise exception 'job_not_found'; end if;
  if j.reconciliation_reference = p_reference and (
    (p_resolution = 'accepted' and j.provider_job_id = p_provider_job_id and j.status = 'processing')
    or (p_resolution = 'not_accepted' and j.status = 'failed' and j.error_code = 'reconciled_not_accepted')
  ) then return public._gambarin_queue_view(j.id); end if;
  if j.status <> 'submission_unknown' or g.active_job_id is distinct from j.id then raise exception 'reconciliation_not_allowed'; end if;
  update public.gambarin_jobs set reconciliation_reference = p_reference, reconciled_at = clock_timestamp() where id = j.id;
  if p_resolution = 'accepted' then
    if p_provider_job_id is null or length(p_provider_job_id) not between 1 and 200 then raise exception 'missing_provider_job_id'; end if;
    update public.gambarin_jobs set status = 'processing', provider_job_id = p_provider_job_id,
      submitted_at = clock_timestamp(), error_code = null, next_poll_at = clock_timestamp() + interval '10 seconds' where id = j.id;
    return public._gambarin_queue_view(j.id);
  end if;
  if p_provider_job_id is not null then raise exception 'invalid_resolution'; end if;
  return public._gambarin_queue_settle(j.id, 'failed', 'reconciled_not_accepted');
end;
$$;

create function public.gambarin_finalize_job(p_job_id uuid, p_provider_job_id text, p_status text,
  p_error_code text default null, p_provider_asset_id text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare g public.gambarin_dispatcher%rowtype; j public.gambarin_jobs%rowtype;
begin
  perform public._gambarin_queue_backend();
  if p_status is null or p_status not in ('succeeded','failed')
    or (p_status = 'succeeded' and p_error_code is not null)
    or (p_status = 'failed' and (p_error_code is null or p_error_code not in ('provider_failed','provider_cancelled'))) then
    raise exception 'terminal_evidence_required';
  end if;
  if p_provider_asset_id is not null and length(p_provider_asset_id) not between 1 and 200 then raise exception 'invalid_asset_id'; end if;
  select * into g from public.gambarin_dispatcher where id = 1 for update;
  select * into j from public.gambarin_jobs where id = p_job_id for update;
  if not found then raise exception 'job_not_found'; end if;
  if p_provider_job_id is null or j.provider_job_id is distinct from p_provider_job_id then raise exception 'provider_identity_mismatch'; end if;
  if j.status in ('succeeded','failed','cancelled') then
    if j.status <> p_status or j.error_code is distinct from p_error_code
      or j.provider_asset_id is distinct from p_provider_asset_id then raise exception 'finalization_conflict'; end if;
    return public._gambarin_queue_view(j.id);
  end if;
  if j.status <> 'processing' or g.active_job_id is distinct from j.id or g.request_state <> 'idle' then raise exception 'job_not_finalizable'; end if;
  return public._gambarin_queue_settle(j.id, p_status, p_error_code, p_provider_asset_id);
end;
$$;

-- Revoke defaults, including helper EXECUTE and all table TRUNCATE privileges.
revoke all on function public.gambarin_reject_ledger_changes(), public._gambarin_queue_backend(),
  public._gambarin_queue_view(uuid), public._gambarin_queue_lease(uuid,uuid),
  public._gambarin_queue_settle(uuid,text,text,text) from public, anon, authenticated, service_role;
revoke all on function public.gambarin_enqueue_job(uuid,uuid,text), public.gambarin_cancel_queued_job(uuid,uuid),
  public.gambarin_acquire_dispatcher(uuid), public.gambarin_release_dispatcher(uuid,uuid),
  public.gambarin_claim_next_job(uuid,uuid), public.gambarin_begin_provider_request(uuid,uuid,text,uuid),
  public.gambarin_finish_provider_request(uuid,uuid,uuid,text,text,integer),
  public.gambarin_recover_provider_request(uuid,boolean,text), public.gambarin_reconcile_submission(uuid,text,text,text),
  public.gambarin_finalize_job(uuid,text,text,text,text) from public, anon, authenticated, service_role;
grant execute on function public.gambarin_enqueue_job(uuid,uuid,text), public.gambarin_cancel_queued_job(uuid,uuid),
  public.gambarin_acquire_dispatcher(uuid), public.gambarin_release_dispatcher(uuid,uuid),
  public.gambarin_claim_next_job(uuid,uuid), public.gambarin_begin_provider_request(uuid,uuid,text,uuid),
  public.gambarin_finish_provider_request(uuid,uuid,uuid,text,text,integer),
  public.gambarin_recover_provider_request(uuid,boolean,text), public.gambarin_reconcile_submission(uuid,text,text,text),
  public.gambarin_finalize_job(uuid,text,text,text,text) to service_role;

commit;
