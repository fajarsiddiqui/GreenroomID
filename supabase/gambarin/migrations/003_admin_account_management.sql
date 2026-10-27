-- KHUSUS proyek Supabase `greenroomid-gambarin`.
-- DILARANG dijalankan pada Supabase GreenroomID utama.
-- Setelah migration 001/002. NOT EXECUTED pada Job 1.6C.
begin;

create or replace function public.gambarin_admin_manage_account(
  p_account_id uuid,
  p_operation text,
  p_amount integer,
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
  v_package public.gambarin_packages%rowtype;
  v_now timestamptz;
  v_expires_at timestamptz;
  v_action text;
  v_metadata jsonb;
begin
  if p_account_id is null or p_main_admin_user_id is null then
    raise exception using errcode = '22023', message = 'invalid_actor';
  end if;
  if p_operation is null or p_operation not in ('add_quota', 'extend', 'reactivate') then
    raise exception using errcode = '22023', message = 'invalid_operation';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception using errcode = '22023', message = 'invalid_amount';
  end if;
  if p_operation = 'extend' and p_amount > 365 then
    raise exception using errcode = '22023', message = 'invalid_amount';
  end if;
  if p_operation = 'reactivate' and p_amount not in (1, 3, 7, 14, 30) then
    raise exception using errcode = '22023', message = 'invalid_package';
  end if;

  -- Serialisasi operasi pada akun yang sama; snapshot diambil sesudah lock.
  select * into v_before
  from public.gambarin_accounts where id = p_account_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'account_not_found';
  end if;
  v_now := pg_catalog.clock_timestamp();

  if p_operation = 'add_quota' then
    -- Cegah integer overflow; counter used/reserved tidak diubah.
    if v_before.quota_granted::bigint + p_amount::bigint > 2147483647
      or v_before.quota_used::bigint + v_before.quota_reserved::bigint
        > v_before.quota_granted::bigint + p_amount::bigint then
      raise exception using errcode = '23514', message = 'quota_conflict';
    end if;
    update public.gambarin_accounts
    set quota_granted = quota_granted + p_amount
    where id = p_account_id returning * into v_after;
    v_action := 'quota_adjusted';
    v_metadata := pg_catalog.jsonb_build_object(
      'additional_images', p_amount, 'quota_granted_before', v_before.quota_granted,
      'quota_granted_after', v_after.quota_granted
    );
  elsif p_operation = 'extend' then
    -- Akun yang belum pernah diaktifkan tidak diberi aktivasi implisit.
    if v_before.activated_at is null or v_before.expires_at is null then
      raise exception using errcode = 'P0001', message = 'account_not_activated';
    end if;
    v_expires_at := greatest(v_before.expires_at, v_now) + p_amount * interval '24 hours';
    update public.gambarin_accounts set expires_at = v_expires_at
    where id = p_account_id returning * into v_after;
    v_action := 'extended';
    v_metadata := pg_catalog.jsonb_build_object(
      'additional_days', p_amount, 'expires_at_before', v_before.expires_at,
      'expires_at_after', v_after.expires_at, 'status', v_after.status
    );
  else
    if v_before.status <> 'disabled' then
      raise exception using errcode = 'P0001', message = 'invalid_status';
    end if;
    select * into v_package from public.gambarin_packages
    where duration_days = p_amount and is_active = true
    for share;
    if not found then
      raise exception using errcode = '22023', message = 'invalid_package';
    end if;
    -- Reaktivasi hanya mengganti status/paket/periode. Semua kuota dipertahankan.
    update public.gambarin_accounts
    set status = 'active', package_id = v_package.id,
        activated_at = v_now, expires_at = v_now + p_amount * interval '24 hours'
    where id = p_account_id returning * into v_after;
    v_action := 'reactivated';
    v_metadata := pg_catalog.jsonb_build_object(
      'duration_days', p_amount, 'status_before', v_before.status, 'status_after', v_after.status,
      'package_id_before', v_before.package_id, 'package_id_after', v_after.package_id,
      'activated_at_before', v_before.activated_at, 'activated_at_after', v_after.activated_at,
      'expires_at_before', v_before.expires_at, 'expires_at_after', v_after.expires_at,
      'quota_granted', v_after.quota_granted,
      'quota_used', v_after.quota_used, 'quota_reserved', v_after.quota_reserved
    );
  end if;

  -- Tidak ada exception handler yang menelan kegagalan audit: seluruh RPC rollback.
  insert into public.gambarin_account_events (account_id, action, main_admin_user_id, metadata)
  values (v_after.id, v_action, p_main_admin_user_id, v_metadata);

  return pg_catalog.jsonb_build_object(
    'id', v_after.id, 'username', v_after.username, 'package_id', v_after.package_id,
    'status', v_after.status, 'activated_at', v_after.activated_at, 'expires_at', v_after.expires_at,
    'quota_granted', v_after.quota_granted, 'quota_used', v_after.quota_used,
    'quota_reserved', v_after.quota_reserved
  );
end;
$$;

revoke all on function public.gambarin_admin_manage_account(uuid, text, integer, uuid)
  from public, anon, authenticated;
grant execute on function public.gambarin_admin_manage_account(uuid, text, integer, uuid)
  to service_role;

commit;
