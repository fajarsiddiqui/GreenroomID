-- KHUSUS greenroomid-gambarin; DILARANG pada proyek GreenroomID utama.
-- Job 2.4. NOT EXECUTED on Supabase. Apply only AFTER migration 004.
-- Read-only owner status with global FIFO position; persistent unresolved marker.
begin;

alter table public.gambarin_jobs add column asset_unresolved_at timestamptz;

-- Migration 004 granted table-wide SELECT for the owner's RLS policy. Keep a
-- narrow direct read path; the RPC below supplies the complete safe contract.
revoke select on public.gambarin_jobs from authenticated;
grant select (id, status, created_at, finished_at, error_code)
  on public.gambarin_jobs to authenticated;

-- One database snapshot for status and global queued position. No provider IDs,
-- prompts, internal references, signed URLs or other users' jobs are returned.
create function public.gambarin_my_job_status(p_job_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare j public.gambarin_jobs%rowtype; v_position bigint; v_message text; v_asset_state text;
begin
  if auth.role() is distinct from 'authenticated' or auth.uid() is null then
    raise exception using errcode = '42501', message = 'authenticated_only';
  end if;
  select job.* into j from public.gambarin_jobs job
  join public.gambarin_accounts account on account.id = job.account_id
  where job.id = p_job_id and account.auth_user_id = auth.uid();
  if not found then return null; end if;

  if j.status = 'queued' then
    select count(*) into v_position from public.gambarin_jobs queued
    where queued.status = 'queued' and queued.sequence_no <= j.sequence_no;
  end if;
  v_message := case j.error_code
    when 'account_inactive' then 'Akun tidak aktif.'
    when 'account_expired' then 'Masa aktif akun berakhir.'
    when 'provider_failed' then 'Pembuatan gambar gagal.'
    when 'provider_cancelled' then 'Pembuatan gambar dibatalkan penyedia.'
    when 'submission_unknown' then 'Status pengiriman sedang diperiksa.'
    when 'lease_expired' then 'Status pengiriman sedang diperiksa.'
    when 'cancelled_by_owner' then 'Permintaan dibatalkan.'
    when 'reconciled_not_accepted' then 'Permintaan tidak diterima penyedia.'
    else null end;
  v_asset_state := case
    when j.status = 'succeeded' and j.provider_asset_id is not null then 'resolvable'
    when j.status = 'processing' and j.asset_unresolved_at is not null then 'unresolved'
    else 'not_ready' end;
  return jsonb_build_object(
    'job_id', j.id, 'status', j.status,
    'queue_position', v_position,
    'created_at', j.created_at, 'finished_at', j.finished_at,
    'error', case when j.error_code is null then null
      else jsonb_build_object('code', j.error_code, 'message', v_message) end,
    'asset', jsonb_build_object('state', v_asset_state, 'url', null, 'expires_at', null)
  );
end;
$$;

-- Only a backend observing a definitive completed provider job with no proven
-- mediaGenerationId may set this marker. It does not settle or release quota.
create function public.gambarin_mark_asset_unresolved(p_job_id uuid, p_provider_job_id text)
returns void language plpgsql security definer set search_path = '' as $$
declare g public.gambarin_dispatcher%rowtype; j public.gambarin_jobs%rowtype;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'backend_only';
  end if;
  select * into g from public.gambarin_dispatcher where id = 1 for update;
  select * into j from public.gambarin_jobs where id = p_job_id for update;
  if not found or j.status <> 'processing' or j.provider_job_id is distinct from p_provider_job_id
    or g.active_job_id is distinct from p_job_id or g.request_state <> 'idle' then
    raise exception using errcode = 'P0001', message = 'asset_marker_not_allowed';
  end if;
  update public.gambarin_jobs set asset_unresolved_at = coalesce(asset_unresolved_at, clock_timestamp())
  where id = p_job_id;
end;
$$;

revoke all on function public.gambarin_my_job_status(uuid),
  public.gambarin_mark_asset_unresolved(uuid,text) from public, anon, authenticated, service_role;
grant execute on function public.gambarin_my_job_status(uuid) to authenticated;
grant execute on function public.gambarin_mark_asset_unresolved(uuid,text) to service_role;

commit;
