-- Pair a single-use backup OTP with one specific delivery, never with an account alone.
alter table public.shop_otp_reissues add column delivery_order_id uuid
  references public.shop_orders(id) on delete set null;
create unique index shop_otp_reissues_delivery_order_idx
  on public.shop_otp_reissues(delivery_order_id) where delivery_order_id is not null;

create function public.shop_admin_create_delivery_pair(p_account_id uuid, p_recipient_name text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_delivery jsonb; v_token bytea := extensions.gen_random_bytes(32); v_id uuid;
begin
  if not public.is_admin() then raise exception 'unauthorized'; end if;
  if not exists (select 1 from public.shop_accounts where id = p_account_id
    and is_active and nullif(totp_secret_enc, '') is not null) then
    raise exception 'account_not_eligible'; end if;
  v_delivery := public.shop_admin_create_delivery_link(p_account_id, p_recipient_name);
  insert into public.shop_otp_reissues(account_id, delivery_order_id, token_hash)
  values (p_account_id, (v_delivery->>'order_id')::uuid,
    encode(extensions.digest(v_token, 'sha256'), 'hex')) returning id into v_id;
  insert into public.shop_audit_logs(order_id, actor, action, detail) values
    ((v_delivery->>'order_id')::uuid, 'admin', 'otp_reissue_link_created',
      jsonb_build_object('reissue_id', v_id, 'account_id', p_account_id,
        'admin_id', auth.uid(), 'paired', true));
  return v_delivery || jsonb_build_object('otp_id', v_id, 'otp_token', encode(v_token, 'hex'));
end;
$$;

create function public.shop_otp_reissue_bind_paired(p_id uuid, p_token_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v public.shop_otp_reissues%rowtype; v_order public.shop_orders%rowtype;
  v_claim bytea := extensions.gen_random_bytes(32);
begin
  select * into v from public.shop_otp_reissues where id = p_id
    and token_hash = p_token_hash for update;
  if not found or v.delivery_order_id is null or v.cancelled_at is not null
    or v.taken_at is not null or (v.expires_at is not null and v.expires_at <= now()) then
    return jsonb_build_object('state', 'unavailable'); end if;
  select * into v_order from public.shop_orders where id = v.delivery_order_id;
  if not found or v_order.account_id is distinct from v.account_id
    or v_order.delivery_cancelled_at is not null or v_order.status <> 'verified'
    or v_order.delivery_bound_at is null or v_order.credentials_viewed_at is null then
    return jsonb_build_object('state', 'unavailable'); end if;
  if v.bound_at is not null then return jsonb_build_object('state', 'bound'); end if;
  update public.shop_otp_reissues set buyer_name = v_order.buyer_name,
    buyer_phone = v_order.buyer_phone, buyer_device = v_order.buyer_device,
    buyer_city = v_order.buyer_city, bound_at = now(),
    claim_hash = encode(extensions.digest(v_claim, 'sha256'), 'hex') where id = p_id;
  insert into public.shop_audit_logs(order_id, actor, action, detail) values
    (v_order.id, 'system', 'otp_reissue_identity_bound',
      jsonb_build_object('reissue_id', p_id, 'paired', true));
  return jsonb_build_object('state', 'bound', 'claim', encode(v_claim, 'hex'));
end;
$$;

create or replace function public.shop_otp_reissue_status(p_id uuid, p_token_hash text)
returns text language plpgsql security definer set search_path = '' as $$
declare v public.shop_otp_reissues%rowtype;
begin
  select * into v from public.shop_otp_reissues where id = p_id and token_hash = p_token_hash;
  if not found or v.cancelled_at is not null or v.taken_at is not null or
    (v.expires_at is not null and v.expires_at <= now()) or v.account_id is null then
    return 'unavailable'; end if;
  if v.delivery_order_id is not null then
    if not exists (select 1 from public.shop_orders o where o.id = v.delivery_order_id
      and o.account_id = v.account_id and o.status = 'verified'
      and o.delivery_cancelled_at is null) then return 'unavailable'; end if;
    if not exists (select 1 from public.shop_orders o where o.id = v.delivery_order_id
      and o.delivery_bound_at is not null and o.credentials_viewed_at is not null) then
      return 'pending'; end if;
    if v.bound_at is null then return 'paired_ready'; end if;
  end if;
  if v.bound_at is not null then return 'bound'; end if;
  return 'ready';
end;
$$;

-- Preserve historical standalone links, but prevent them from changing paired identities.
create or replace function public.shop_otp_reissue_bind(p_id uuid, p_token_hash text,
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
  if not found or v.delivery_order_id is not null or v.cancelled_at is not null or
    v.taken_at is not null or v.account_id is null or
    (v.expires_at is not null and v.expires_at <= now()) then
    return jsonb_build_object('state', 'unavailable'); end if;
  if v.bound_at is not null then return jsonb_build_object('state', 'bound'); end if;
  update public.shop_otp_reissues set buyer_name = btrim(p_buyer_name), buyer_phone = v_phone,
    buyer_device = btrim(p_buyer_device), buyer_city = btrim(p_buyer_city), bound_at = now(),
    claim_hash = encode(extensions.digest(v_claim, 'sha256'), 'hex') where id = p_id;
  insert into public.shop_audit_logs(actor, action, detail) values
    ('system', 'otp_reissue_identity_bound', jsonb_build_object('reissue_id', p_id));
  return jsonb_build_object('state', 'bound', 'claim', encode(v_claim, 'hex'));
end;
$$;

-- The code request and delivery also verify that the parent delivery remains valid.
create or replace function public.shop_otp_reissue_start(p_id uuid, p_token_hash text, p_claim_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v public.shop_otp_reissues%rowtype; v_start timestamptz;
begin
  if auth.role() <> 'service_role' then raise exception 'unauthorized'; end if;
  select * into v from public.shop_otp_reissues where id = p_id and token_hash = p_token_hash
    and claim_hash = p_claim_hash for update;
  if not found or v.bound_at is null or v.cancelled_at is not null or v.taken_at is not null or
    (v.expires_at is not null and v.expires_at <= now()) or v.account_id is null then
    return jsonb_build_object('state', 'unavailable'); end if;
  if v.delivery_order_id is not null and not exists (
    select 1 from public.shop_orders o where o.id = v.delivery_order_id
      and o.account_id = v.account_id and o.delivery_cancelled_at is null
      and o.status = 'verified' and o.credentials_viewed_at is not null) then
    return jsonb_build_object('state', 'unavailable'); end if;
  if v.window_start is null then
    v_start := to_timestamp((floor(extract(epoch from clock_timestamp()) / 30) + 1) * 30);
    update public.shop_otp_reissues set window_start = v_start where id = p_id;
  else v_start := v.window_start; end if;
  if v_start + interval '30 seconds' <= clock_timestamp() then
    return jsonb_build_object('state', 'expired'); end if;
  return jsonb_build_object('state', 'ready', 'account_id', v.account_id,
    'window_start_ms', floor(extract(epoch from v_start) * 1000)::bigint);
end;
$$;

create or replace function public.shop_otp_reissue_finish(p_id uuid, p_token_hash text,
  p_claim_hash text, p_window_start_ms bigint)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v public.shop_otp_reissues%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'unauthorized'; end if;
  select * into v from public.shop_otp_reissues where id = p_id and token_hash = p_token_hash
    and claim_hash = p_claim_hash for update;
  if not found or v.cancelled_at is not null or v.taken_at is not null or v.account_id is null or
    v.window_start is null or floor(extract(epoch from v.window_start) * 1000)::bigint <> p_window_start_ms or
    clock_timestamp() >= v.window_start + interval '30 seconds' or
    (v.expires_at is not null and v.expires_at <= now()) then return false; end if;
  if v.delivery_order_id is not null and not exists (
    select 1 from public.shop_orders o where o.id = v.delivery_order_id
      and o.account_id = v.account_id and o.delivery_cancelled_at is null
      and o.status = 'verified' and o.credentials_viewed_at is not null) then return false; end if;
  update public.shop_otp_reissues set taken_at = clock_timestamp() where id = p_id;
  insert into public.shop_audit_logs(order_id, actor, action, detail) values
    (v.delivery_order_id, 'system', 'otp_reissue_code_delivered',
      jsonb_build_object('reissue_id', p_id, 'account_id', v.account_id,
        'window_start_ms', p_window_start_ms, 'buyer_name', v.buyer_name,
        'buyer_phone', v.buyer_phone, 'buyer_device', v.buyer_device,
        'buyer_city', v.buyer_city));
  return true;
end;
$$;

revoke all on function public.shop_admin_create_delivery_pair(uuid, text),
  public.shop_otp_reissue_bind_paired(uuid, text) from public, anon, authenticated;
grant execute on function public.shop_admin_create_delivery_pair(uuid, text) to authenticated;
grant execute on function public.shop_otp_reissue_bind_paired(uuid, text) to anon, authenticated;
