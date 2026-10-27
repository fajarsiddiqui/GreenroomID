-- KHUSUS proyek Supabase greenroomid-gambarin; jangan jalankan di MAIN.
-- Nonaktifkan akun lewat RPC service_role dengan audit dalam transaksi yang sama.
begin;

create or replace function public.gambarin_admin_disable_account(
  p_account_id uuid,
  p_main_admin_user_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_before public.gambarin_accounts%rowtype;
  v_after public.gambarin_accounts%rowtype;
begin
  if p_account_id is null or p_main_admin_user_id is null then
    raise exception using errcode = '22023', message = 'invalid_actor';
  end if;

  select * into v_before from public.gambarin_accounts
  where id = p_account_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'account_not_found';
  end if;
  if v_before.status <> 'active' then
    raise exception using errcode = 'P0001', message = 'invalid_status';
  end if;

  update public.gambarin_accounts set status = 'disabled'
  where id = p_account_id returning * into v_after;
  insert into public.gambarin_account_events (account_id, action, main_admin_user_id, metadata)
  values (v_after.id, 'disabled', p_main_admin_user_id,
    pg_catalog.jsonb_build_object('status_before', v_before.status, 'status_after', v_after.status));

  return pg_catalog.jsonb_build_object(
    'id', v_after.id, 'username', v_after.username, 'package_id', v_after.package_id,
    'status', v_after.status, 'activated_at', v_after.activated_at, 'expires_at', v_after.expires_at,
    'quota_granted', v_after.quota_granted, 'quota_used', v_after.quota_used,
    'quota_reserved', v_after.quota_reserved
  );
end;
$$;

revoke all on function public.gambarin_admin_disable_account(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.gambarin_admin_disable_account(uuid, uuid) to service_role;

commit;
