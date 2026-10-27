-- Gambarin project only. Give a single already-recorded submit attempt enough
-- time to capture a late provider JobResponse in a bounded Edge background task.
-- No new attempt, queue rule, or quota change is made here.
begin;
do $$ begin
  perform 1 from public.gambarin_dispatcher where id=1 and dispatch_paused for update;
  if not found then raise exception 'installation_requires_paused_dispatcher'; end if;
end $$;
create function public.gambarin_extend_submit_lease(
  p_worker_id uuid, p_lease_id uuid, p_request_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare g public.gambarin_dispatcher%rowtype; r public.gambarin_provider_requests%rowtype;
begin
  perform public._gambarin_queue_backend();
  select * into g from public.gambarin_dispatcher where id=1 for update;
  select * into r from public.gambarin_provider_requests where id=p_request_id for update;
  if p_worker_id is null or p_lease_id is null or p_request_id is null
    or g.worker_id is distinct from p_worker_id or g.lease_id is distinct from p_lease_id
    or g.lease_expires_at <= clock_timestamp() or g.request_state <> 'in_flight'
    or g.active_request_id is distinct from p_request_id or g.active_job_id is distinct from r.job_id
    or r.worker_id is distinct from p_worker_id or r.lease_id is distinct from p_lease_id
    or r.purpose <> 'submit' or r.finished_at is not null then
    raise exception 'submit_lease_not_extendable';
  end if;
  update public.gambarin_dispatcher
    set lease_expires_at=clock_timestamp()+interval '120 seconds' where id=1;
end;
$$;
revoke all on function public.gambarin_extend_submit_lease(uuid,uuid,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.gambarin_extend_submit_lease(uuid,uuid,uuid) to service_role;
commit;
