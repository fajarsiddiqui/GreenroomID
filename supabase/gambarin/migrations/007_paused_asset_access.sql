-- Gambarin project ONLY. Read access may run while generation stays PAUSED.
-- This lease uses the SAME singleton and open-request index as generation.
begin;
create function public.gambarin_acquire_asset_dispatcher(p_worker_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare g public.gambarin_dispatcher%rowtype;
begin
  perform public._gambarin_queue_backend();
  if p_worker_id is null then raise exception 'invalid_worker'; end if;
  select * into g from public.gambarin_dispatcher where id=1 for update;
  if g.request_state <> 'idle' then
    return jsonb_build_object('state',case when g.lease_expires_at <= clock_timestamp()
      then 'recovery_required' else 'request_in_flight' end);
  end if;
  if g.lease_expires_at > clock_timestamp() then return jsonb_build_object('state','busy'); end if;
  -- A generation claim remains untouched; the next generation tick recovers it.
  update public.gambarin_dispatcher set worker_id=p_worker_id,lease_id=gen_random_uuid(),
    lease_expires_at=clock_timestamp()+interval '60 seconds' where id=1
    returning * into g;
  return jsonb_build_object('state','acquired','lease_id',g.lease_id);
end;
$$;

create function public.gambarin_begin_asset_request(p_worker_id uuid,p_lease_id uuid,p_purpose text,p_job_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare g public.gambarin_dispatcher%rowtype; r uuid;
begin
  perform public._gambarin_queue_backend();
  select * into g from public.gambarin_dispatcher where id=1 for update;
  if p_worker_id is null or p_lease_id is null or g.worker_id is distinct from p_worker_id
    or g.lease_id is distinct from p_lease_id or g.lease_expires_at <= clock_timestamp() then raise exception 'stale_lease'; end if;
  if p_purpose is distinct from 'resolve' then raise exception 'invalid_purpose'; end if;
  if g.request_state <> 'idle' then raise exception 'request_not_finished'; end if;
  if clock_timestamp() < greatest(g.next_allowed_at,g.last_request_finished_at+make_interval(secs=>g.cooldown_seconds)) then
    raise exception 'global_cooldown'; end if;
  perform 1 from public.gambarin_jobs where id=p_job_id and status='succeeded' and provider_asset_id is not null for update;
  if not found then raise exception 'resolve_not_allowed'; end if;
  insert into public.gambarin_provider_requests(lease_id,worker_id,job_id,purpose)
    values(p_lease_id,p_worker_id,p_job_id,'resolve') returning id into r;
  update public.gambarin_dispatcher set request_state='in_flight',active_request_id=r where id=1;
  return jsonb_build_object('request_id',r);
end;
$$;

create function public.gambarin_release_asset_dispatcher(p_worker_id uuid,p_lease_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare g public.gambarin_dispatcher%rowtype;
begin
  perform public._gambarin_queue_backend();
  select * into g from public.gambarin_dispatcher where id=1 for update;
  if p_worker_id is null or p_lease_id is null or g.worker_id is distinct from p_worker_id
    or g.lease_id is distinct from p_lease_id then raise exception 'stale_lease'; end if;
  if g.request_state <> 'idle' then raise exception 'request_not_finished'; end if;
  update public.gambarin_dispatcher set worker_id=null,lease_id=null,lease_expires_at=null where id=1;
end;
$$;
revoke all on function public.gambarin_acquire_asset_dispatcher(uuid),
  public.gambarin_begin_asset_request(uuid,uuid,text,uuid),public.gambarin_release_asset_dispatcher(uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.gambarin_acquire_asset_dispatcher(uuid),
  public.gambarin_begin_asset_request(uuid,uuid,text,uuid),public.gambarin_release_asset_dispatcher(uuid,uuid)
  to service_role;
commit;
