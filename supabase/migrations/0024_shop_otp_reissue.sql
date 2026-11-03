-- A separate, one-use OTP link never reserves another account slot.
create table public.shop_otp_reissues (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references public.shop_accounts(id) on delete set null,
  token_hash text not null,
  claim_hash text,
  buyer_name text,
  buyer_phone text,
  buyer_device text,
  buyer_city text,
  bound_at timestamptz,
  window_start timestamptz,
  taken_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days')
);
create index shop_otp_reissues_account_idx on public.shop_otp_reissues(account_id);
alter table public.shop_otp_reissues enable row level security;
revoke all on public.shop_otp_reissues from anon, authenticated;

create function public.shop_admin_otp_eligible_accounts()
returns table (id uuid, email text)
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'unauthorized'; end if;
  return query select a.id, a.email from public.shop_accounts a
  where a.totp_secret_enc is not null and a.totp_secret_enc <> ''
    and exists (select 1 from public.shop_orders o where o.account_id = a.id
      and o.delivery_link and o.credentials_viewed_at is not null)
  order by a.email;
end;
$$;

create function public.shop_admin_create_otp_reissue(p_account_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_token bytea := extensions.gen_random_bytes(32); v_id uuid;
begin
  if not public.is_admin() then raise exception 'unauthorized'; end if;
  if not exists (select 1 from public.shop_accounts a where a.id = p_account_id
    and a.totp_secret_enc is not null and a.totp_secret_enc <> ''
    and exists (select 1 from public.shop_orders o where o.account_id = a.id
      and o.delivery_link and o.credentials_viewed_at is not null)) then
    raise exception 'account_not_eligible';
  end if;
  insert into public.shop_otp_reissues(account_id, token_hash)
    values (p_account_id, encode(extensions.digest(v_token, 'sha256'), 'hex')) returning id into v_id;
  insert into public.shop_audit_logs(actor, action, detail) values
    ('admin', 'otp_reissue_link_created', jsonb_build_object('reissue_id', v_id,
      'account_id', p_account_id, 'admin_id', auth.uid()));
  return jsonb_build_object('id', v_id, 'token', encode(v_token, 'hex'));
end;
$$;

create function public.shop_admin_list_otp_reissues()
returns table (id uuid, account_email text, created_at timestamptz, expires_at timestamptz,
  bound_at timestamptz, taken_at timestamptz, cancelled_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'unauthorized'; end if;
  return query select r.id, a.email, r.created_at, r.expires_at, r.bound_at,
    r.taken_at, r.cancelled_at from public.shop_otp_reissues r
    left join public.shop_accounts a on a.id = r.account_id
    order by r.created_at desc limit 100;
end;
$$;

create function public.shop_admin_cancel_otp_reissue(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'unauthorized'; end if;
  update public.shop_otp_reissues set cancelled_at = now() where id = p_id
    and cancelled_at is null and taken_at is null and expires_at > now();
  if not found then raise exception 'not_cancellable'; end if;
  insert into public.shop_audit_logs(actor, action, detail) values
    ('admin', 'otp_reissue_link_cancelled', jsonb_build_object('reissue_id', p_id, 'admin_id', auth.uid()));
end;
$$;

create function public.shop_otp_reissue_status(p_id uuid, p_token_hash text)
returns text language plpgsql security definer set search_path = '' as $$
declare v public.shop_otp_reissues%rowtype;
begin
  select * into v from public.shop_otp_reissues where id = p_id and token_hash = p_token_hash;
  if not found or v.cancelled_at is not null or v.taken_at is not null or
    v.expires_at <= now() or v.account_id is null then return 'unavailable'; end if;
  if v.bound_at is not null then return 'bound'; end if;
  return 'ready';
end;
$$;

create function public.shop_otp_reissue_bind(p_id uuid, p_token_hash text,
  p_buyer_name text, p_buyer_phone text, p_buyer_device text, p_buyer_city text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v public.shop_otp_reissues%rowtype; v_claim bytea := extensions.gen_random_bytes(32);
  v_phone text := nullif(btrim(p_buyer_phone), '');
begin
  if nullif(btrim(p_buyer_name), '') is null or length(btrim(p_buyer_name)) > 100 or
    nullif(btrim(p_buyer_device), '') is null or length(btrim(p_buyer_device)) > 200 or
    nullif(btrim(p_buyer_city), '') is null or length(btrim(p_buyer_city)) > 100 then
    raise exception 'invalid_identity'; end if;
  if v_phone is not null then
    if v_phone ~ '^08[0-9]{7,11}$' then v_phone := '62' || substr(v_phone, 2); end if;
    if v_phone !~ '^62[0-9]{8,12}$' then raise exception 'invalid_phone'; end if;
  end if;
  select * into v from public.shop_otp_reissues where id = p_id and token_hash = p_token_hash for update;
  if not found or v.cancelled_at is not null or v.taken_at is not null or
    v.expires_at <= now() or v.account_id is null then return jsonb_build_object('state', 'unavailable'); end if;
  if v.bound_at is not null then return jsonb_build_object('state', 'bound'); end if;
  update public.shop_otp_reissues set buyer_name = btrim(p_buyer_name), buyer_phone = v_phone,
    buyer_device = btrim(p_buyer_device), buyer_city = btrim(p_buyer_city), bound_at = now(),
    claim_hash = encode(extensions.digest(v_claim, 'sha256'), 'hex') where id = p_id;
  insert into public.shop_audit_logs(actor, action, detail) values
    ('system', 'otp_reissue_identity_bound', jsonb_build_object('reissue_id', p_id));
  return jsonb_build_object('state', 'bound', 'claim', encode(v_claim, 'hex'));
end;
$$;

-- Service-only RPCs perform each state transition under a row lock.
create function public.shop_otp_reissue_start(p_id uuid, p_token_hash text, p_claim_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v public.shop_otp_reissues%rowtype; v_start timestamptz;
begin
  if auth.role() <> 'service_role' then raise exception 'unauthorized'; end if;
  select * into v from public.shop_otp_reissues where id = p_id and token_hash = p_token_hash
    and claim_hash = p_claim_hash for update;
  if not found or v.bound_at is null or v.cancelled_at is not null or v.taken_at is not null or
    v.expires_at <= now() or v.account_id is null then return jsonb_build_object('state', 'unavailable'); end if;
  if v.window_start is null then
    v_start := to_timestamp((floor(extract(epoch from clock_timestamp()) / 30) + 1) * 30);
    update public.shop_otp_reissues set window_start = v_start where id = p_id;
  else v_start := v.window_start; end if;
  if v_start + interval '30 seconds' <= clock_timestamp() then return jsonb_build_object('state', 'expired'); end if;
  return jsonb_build_object('state', 'ready', 'account_id', v.account_id,
    'window_start_ms', floor(extract(epoch from v_start) * 1000)::bigint);
end;
$$;

create function public.shop_otp_reissue_finish(p_id uuid, p_token_hash text, p_claim_hash text,
  p_window_start_ms bigint)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v public.shop_otp_reissues%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'unauthorized'; end if;
  select * into v from public.shop_otp_reissues where id = p_id and token_hash = p_token_hash
    and claim_hash = p_claim_hash for update;
  if not found or v.cancelled_at is not null or v.taken_at is not null or v.account_id is null or
    v.window_start is null or floor(extract(epoch from v.window_start) * 1000)::bigint <> p_window_start_ms or
    clock_timestamp() >= v.window_start + interval '30 seconds' then return false; end if;
  update public.shop_otp_reissues set taken_at = clock_timestamp() where id = p_id;
  insert into public.shop_audit_logs(actor, action, detail) values
    ('system', 'otp_reissue_code_delivered', jsonb_build_object('reissue_id', p_id,
      'account_id', v.account_id, 'window_start_ms', p_window_start_ms,
      'buyer_name', v.buyer_name, 'buyer_phone', v.buyer_phone,
      'buyer_device', v.buyer_device, 'buyer_city', v.buyer_city));
  return true;
end;
$$;

create function public.shop_expire_otp_reissues()
returns void language plpgsql security definer set search_path = '' as $$
declare v record;
begin
  for v in select id from public.shop_otp_reissues where expires_at <= now()
    and taken_at is null and cancelled_at is null for update skip locked loop
    insert into public.shop_audit_logs(actor, action, detail) values
      ('system', 'otp_reissue_link_expired', jsonb_build_object('reissue_id', v.id));
    update public.shop_otp_reissues set cancelled_at = now() where id = v.id;
  end loop;
end;
$$;
select cron.schedule('shop-expire-otp-reissues', '* * * * *',
  $$select public.shop_expire_otp_reissues()$$);

create function public.shop_admin_otp_reissue_log(p_limit int, p_offset int)
returns table (id uuid, account_email text, buyer_name text, buyer_phone text,
  buyer_device text, buyer_city text, taken_at timestamptz, total_count bigint)
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'unauthorized'; end if;
  return query select r.id, a.email, r.buyer_name, r.buyer_phone, r.buyer_device,
    r.buyer_city, l.created_at, count(*) over () from public.shop_otp_reissues r
    join public.shop_audit_logs l on l.action = 'otp_reissue_code_delivered'
      and l.detail->>'reissue_id' = r.id::text
    left join public.shop_accounts a on a.id = r.account_id
    order by l.created_at desc, r.id desc
    limit least(greatest(coalesce(p_limit, 50), 1), 100) offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke all on function public.shop_admin_otp_eligible_accounts(),
  public.shop_admin_create_otp_reissue(uuid), public.shop_admin_list_otp_reissues(),
  public.shop_admin_cancel_otp_reissue(uuid), public.shop_otp_reissue_status(uuid, text),
  public.shop_otp_reissue_bind(uuid, text, text, text, text, text),
  public.shop_otp_reissue_start(uuid, text, text),
  public.shop_otp_reissue_finish(uuid, text, text, bigint),
  public.shop_expire_otp_reissues(), public.shop_admin_otp_reissue_log(int, int)
  from public, anon, authenticated;
grant execute on function public.shop_admin_otp_eligible_accounts(),
  public.shop_admin_create_otp_reissue(uuid), public.shop_admin_list_otp_reissues(),
  public.shop_admin_cancel_otp_reissue(uuid), public.shop_admin_otp_reissue_log(int, int) to authenticated;
grant execute on function public.shop_otp_reissue_status(uuid, text),
  public.shop_otp_reissue_bind(uuid, text, text, text, text, text) to anon, authenticated;
grant execute on function public.shop_otp_reissue_start(uuid, text, text),
  public.shop_otp_reissue_finish(uuid, text, text, bigint),
  public.shop_expire_otp_reissues() to service_role;
