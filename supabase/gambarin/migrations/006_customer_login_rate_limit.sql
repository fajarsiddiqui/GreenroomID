-- KHUSUS greenroomid-gambarin; DILARANG pada proyek GreenroomID utama.
-- Job 2.6. Jalankan sesudah 005; belum dijalankan oleh Codex.
-- Global dan per-username attempt caps persist across Edge Function instances.
begin;

create table public.gambarin_login_rate_limits (
  bucket text primary key check (bucket = 'global' or bucket ~ '^user:[0-9a-f]{64}$'),
  window_started_at timestamptz not null,
  attempts integer not null check (attempts between 1 and 201)
);
alter table public.gambarin_login_rate_limits enable row level security;
revoke all on public.gambarin_login_rate_limits from public, anon, authenticated, service_role;

create function public.gambarin_login_rate_hit(p_subject_hash text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_global integer; v_subject integer; v_now timestamptz := clock_timestamp();
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'backend_only';
  end if;
  if p_subject_hash is null or p_subject_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'invalid_subject_hash';
  end if;

  -- Only hashes are persisted; expired buckets are removed opportunistically.
  delete from public.gambarin_login_rate_limits
    where window_started_at < v_now - interval '1 day';
  insert into public.gambarin_login_rate_limits(bucket, window_started_at, attempts)
  values ('global', v_now, 1)
  on conflict (bucket) do update set
    attempts = case when public.gambarin_login_rate_limits.window_started_at <= v_now - interval '15 minutes'
      then 1 else least(public.gambarin_login_rate_limits.attempts + 1, 201) end,
    window_started_at = case when public.gambarin_login_rate_limits.window_started_at <= v_now - interval '15 minutes'
      then v_now else public.gambarin_login_rate_limits.window_started_at end
  returning attempts into v_global;
  if v_global > 200 then return false; end if;
  insert into public.gambarin_login_rate_limits(bucket, window_started_at, attempts)
  values ('user:' || p_subject_hash, v_now, 1)
  on conflict (bucket) do update set
    attempts = case when public.gambarin_login_rate_limits.window_started_at <= v_now - interval '15 minutes'
      then 1 else least(public.gambarin_login_rate_limits.attempts + 1, 201) end,
    window_started_at = case when public.gambarin_login_rate_limits.window_started_at <= v_now - interval '15 minutes'
      then v_now else public.gambarin_login_rate_limits.window_started_at end
  returning attempts into v_subject;
  return v_subject <= 12;
end;
$$;

revoke all on function public.gambarin_login_rate_hit(text)
  from public, anon, authenticated, service_role;
grant execute on function public.gambarin_login_rate_hit(text) to service_role;
commit;
