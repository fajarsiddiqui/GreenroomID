-- KHUSUS proyek Supabase `greenroomid-gambarin`.
-- DILARANG dijalankan pada Supabase GreenroomID utama.
-- Jalankan setelah 001. Status persiapan: NOT EXECUTED.
-- Auth dibuat melalui Admin API oleh backend, bukan lewat SQL ini.
begin;

create or replace function public.gambarin_admin_create_account(
  p_auth_user_id uuid,
  p_username text,
  p_duration_days integer,
  p_main_admin_user_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_package public.gambarin_packages%rowtype;
  v_account public.gambarin_accounts%rowtype;
  v_activated_at timestamptz;
  v_constraint text;
begin
  -- Hanya service_role boleh memanggil; actor telah diverifikasi di proyek utama.
  if p_auth_user_id is null or p_main_admin_user_id is null then
    raise exception using errcode = '22023', message = 'invalid_actor';
  end if;
  if p_username is null or p_username <> pg_catalog.lower(p_username)
    or p_username !~ '^[a-z0-9][a-z0-9_.-]{0,63}$' then
    raise exception using errcode = '22023', message = 'invalid_username';
  end if;
  if p_duration_days is null or p_duration_days not in (1, 3, 7, 14, 30) then
    raise exception using errcode = '22023', message = 'invalid_package';
  end if;

  -- Kunci paket sampai commit agar snapshot kuota tidak berubah di tengah transaksi.
  select * into v_package
  from public.gambarin_packages
  where duration_days = p_duration_days and is_active = true
  for share;
  if not found then
    raise exception using errcode = '22023', message = 'invalid_package';
  end if;

  v_activated_at := pg_catalog.clock_timestamp();
  insert into public.gambarin_accounts (
    auth_user_id, username, package_id, status, activated_at, expires_at,
    quota_granted, quota_used, quota_reserved
  ) values (
    p_auth_user_id, p_username, v_package.id, 'active', v_activated_at,
    v_activated_at + p_duration_days * interval '24 hours',
    v_package.default_image_quota, 0, 0
  ) returning * into v_account;

  -- Kedua audit dan akun commit/rollback bersama; tidak menerima metadata bebas.
  insert into public.gambarin_account_events (
    account_id, action, main_admin_user_id, metadata
  ) values (
    v_account.id, 'account_created', p_main_admin_user_id,
    pg_catalog.jsonb_build_object('package_id', v_package.id, 'duration_days', p_duration_days)
  ), (
    v_account.id, 'activated', p_main_admin_user_id,
    pg_catalog.jsonb_build_object(
      'quota_granted', v_account.quota_granted,
      'activated_at', v_account.activated_at, 'expires_at', v_account.expires_at
    )
  );

  return pg_catalog.jsonb_build_object(
    'id', v_account.id, 'username', v_account.username, 'package_id', v_account.package_id,
    'status', v_account.status, 'activated_at', v_account.activated_at,
    'expires_at', v_account.expires_at, 'quota_granted', v_account.quota_granted,
    'quota_used', v_account.quota_used, 'quota_reserved', v_account.quota_reserved
  );
exception when unique_violation then
  get stacked diagnostics v_constraint = constraint_name;
  if v_constraint = 'gambarin_accounts_username_lower_key' then
    raise exception using errcode = '23505', message = 'username_taken';
  end if;
  raise;
end;
$$;

revoke all on function public.gambarin_admin_create_account(uuid, text, integer, uuid)
  from public, anon, authenticated;
grant execute on function public.gambarin_admin_create_account(uuid, text, integer, uuid)
  to service_role;

commit;
