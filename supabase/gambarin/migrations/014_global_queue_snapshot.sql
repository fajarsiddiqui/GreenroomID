-- Gambarin project only. Read-only snapshot of the existing single FIFO dispatcher.
-- Apply after 013. Never returns another customer's job or account identity.
begin;

create function public.gambarin_global_queue_snapshot()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_account_id uuid; v_snapshot jsonb;
begin
  if auth.role() is distinct from 'authenticated' or auth.uid() is null then
    raise exception using errcode = '42501', message = 'authenticated_only';
  end if;
  select a.id into v_account_id from public.gambarin_accounts a
  where a.auth_user_id = auth.uid();
  if v_account_id is null then
    raise exception using errcode = '42501', message = 'gambarin_account_required';
  end if;

  -- The unique active-job index allows at most one non-queued active job.
  -- Dispatcher always serves that job before the queued sequence_no head.
  -- submission_unknown occupies the active slot but may need reconciliation.
  with ordered as (
    select j.account_id, j.status,
      row_number() over (order by case when j.status = 'queued' then 1 else 0 end,
        j.sequence_no) as position
    from public.gambarin_jobs j
    where j.status in ('queued','claimed','submitting','processing','submission_unknown')
  )
  select jsonb_build_object(
    'total', count(*),
    'active_count', count(*) filter (where status in ('claimed','submitting','processing')),
    'waiting_count', count(*) filter (where status = 'queued'),
    'reconciliation_count', count(*) filter (where status = 'submission_unknown'),
    'own_position', (select position from ordered where account_id = v_account_id
      order by position limit 1),
    'own_status', (select status from ordered where account_id = v_account_id
      order by position limit 1),
    'snapshot_at', statement_timestamp()
  ) into v_snapshot from ordered;
  return v_snapshot;
end;
$$;

revoke all on function public.gambarin_global_queue_snapshot()
  from public, anon, authenticated, service_role;
grant execute on function public.gambarin_global_queue_snapshot() to authenticated;

commit;
