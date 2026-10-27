-- Gambarin ONLY. No permanent idle cron and no browser dependency.
-- Vault must contain gambarin_worker_trigger_jwt (existing worker trigger JWT).
-- Installing this migration does NOT unpause dispatch or schedule pending work.
begin;
do $$ begin
  perform 1 from public.gambarin_dispatcher where id=1 and dispatch_paused for update;
  if not found then raise exception 'installation_requires_paused_dispatcher'; end if;
end $$;
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create function public._gambarin_worker_schedule(p_wake boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare g public.gambarin_dispatcher%rowtype; v_job bigint; v_token text;
begin
  -- Enqueue, ticks, pause/unpause and stopping all serialize on this same row.
  select * into g from public.gambarin_dispatcher where id=1 for update;
  select jobid into v_job from cron.job where jobname='gambarin-activity-worker';
  if g.dispatch_paused or g.request_state='recovery_required'
    or exists(select 1 from public.gambarin_jobs where status='submission_unknown')
    or not exists(select 1 from public.gambarin_jobs where status in ('queued','claimed','submitting','processing')) then
    if v_job is not null then perform cron.unschedule(v_job); end if;
    return;
  end if;
  select decrypted_secret into v_token from vault.decrypted_secrets where name='gambarin_worker_trigger_jwt';
  if v_token is null or length(v_token)<40 then raise exception 'worker_wakeup_secret_missing'; end if;
  if v_job is null then
    perform cron.schedule('gambarin-activity-worker','30 seconds','select public._gambarin_worker_tick()');
  end if;
  if p_wake then
    -- pg_net sends only AFTER commit. A failed HTTP request leaves the cron
    -- watchdog installed, so the next tick retries without losing the job.
    perform net.http_post(
      url:='https://qhucajoygbexzpraxzlk.supabase.co/functions/v1/gambarin-worker',
      headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||v_token),
      body:='{}'::jsonb,timeout_milliseconds:=55000);
  end if;
end;
$$;

create function public._gambarin_worker_tick()
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public._gambarin_worker_schedule(true);
end;
$$;

create function public._gambarin_worker_on_enqueue()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public._gambarin_worker_schedule(true);
  return new;
end;
$$;
create trigger gambarin_worker_enqueue after insert on public.gambarin_jobs
for each row execute function public._gambarin_worker_on_enqueue();

create function public._gambarin_worker_on_pause()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public._gambarin_worker_schedule(not new.dispatch_paused);
  return new;
end;
$$;
create trigger gambarin_worker_pause after update of dispatch_paused on public.gambarin_dispatcher
for each row when(old.dispatch_paused is distinct from new.dispatch_paused)
execute function public._gambarin_worker_on_pause();

revoke all on function public._gambarin_worker_schedule(boolean),public._gambarin_worker_tick(),
 public._gambarin_worker_on_enqueue(),public._gambarin_worker_on_pause() from public,anon,authenticated,service_role;
-- Only the migration/cron owner calls scheduler functions. Triggers run as definer.
commit;
