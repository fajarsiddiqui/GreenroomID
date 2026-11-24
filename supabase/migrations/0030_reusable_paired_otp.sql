-- New paired links are reusable. Existing links retain their original behavior.
alter table public.shop_otp_reissues add column reusable boolean not null default false,
  add column last_issued_window timestamptz;

create index shop_otp_reissue_history_idx on public.shop_audit_logs
  (order_id, created_at desc, id desc) where action = 'otp_reissue_code_delivered';


create function public.shop_admin_create_delivery_pair(p_account_id uuid, p_recipient_name text, p_otp_expires_at timestamptz)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_delivery jsonb; v_token bytea := extensions.gen_random_bytes(32); v_id uuid;
begin
  if not public.is_admin() then raise exception 'unauthorized'; end if;
  if not exists (select 1 from public.shop_accounts where id = p_account_id
    and is_active and nullif(totp_secret_enc, '') is not null) then
    raise exception 'account_not_eligible'; end if;
  if p_otp_expires_at is not null and
    (not isfinite(p_otp_expires_at) or p_otp_expires_at <= clock_timestamp()) then
    raise exception 'invalid_expiry'; end if;
  v_delivery := public.shop_admin_create_delivery_link(p_account_id, p_recipient_name);
  insert into public.shop_otp_reissues(account_id, delivery_order_id, token_hash, reusable, expires_at)
  values (p_account_id, (v_delivery->>'order_id')::uuid,
    encode(extensions.digest(v_token, 'sha256'), 'hex'), true, p_otp_expires_at) returning id into v_id;
  insert into public.shop_audit_logs(order_id, actor, action, detail) values
    ((v_delivery->>'order_id')::uuid, 'admin', 'otp_reissue_link_created',
      jsonb_build_object('reissue_id', v_id, 'account_id', p_account_id,
        'admin_id', auth.uid(), 'paired', true, 'reusable', true, 'expires_at', p_otp_expires_at));
  return v_delivery || jsonb_build_object('otp_id', v_id, 'otp_token', encode(v_token, 'hex'));
end;
$$;

create or replace function public.shop_otp_reissue_bind_paired(p_id uuid, p_token_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v public.shop_otp_reissues%rowtype; v_order public.shop_orders%rowtype;
  v_claim bytea := extensions.gen_random_bytes(32);
begin
  select * into v from public.shop_otp_reissues where id = p_id
    and token_hash = p_token_hash for update;
  if not found or v.delivery_order_id is null or v.cancelled_at is not null
    or (not v.reusable and v.taken_at is not null) or (v.expires_at is not null and v.expires_at <= now()) then
    return jsonb_build_object('state', 'unavailable'); end if;
  select * into v_order from public.shop_orders where id = v.delivery_order_id;
  if not found or v_order.account_id is distinct from v.account_id
    or v_order.delivery_cancelled_at is not null or v_order.status <> 'verified'
    or v_order.delivery_bound_at is null or v_order.credentials_viewed_at is null then
    return jsonb_build_object('state', 'unavailable'); end if;
  if v.bound_at is not null then return jsonb_build_object('state', case when v.reusable then 'reusable' else 'bound' end); end if;
  update public.shop_otp_reissues set buyer_name = v_order.buyer_name,
    buyer_phone = v_order.buyer_phone, buyer_device = v_order.buyer_device,
    buyer_city = v_order.buyer_city, bound_at = now(),
    claim_hash = encode(extensions.digest(v_claim, 'sha256'), 'hex') where id = p_id;
  insert into public.shop_audit_logs(order_id, actor, action, detail) values
    (v_order.id, 'system', 'otp_reissue_identity_bound',
      jsonb_build_object('reissue_id', p_id, 'paired', true));
  if v.reusable then return jsonb_build_object('state', 'reusable'); end if;
  return jsonb_build_object('state', 'bound', 'claim', encode(v_claim, 'hex'));
end;
$$;

create or replace function public.shop_otp_reissue_status(p_id uuid, p_token_hash text)
returns text language plpgsql security definer set search_path = '' as $$
declare v public.shop_otp_reissues%rowtype;
begin
  select * into v from public.shop_otp_reissues where id = p_id and token_hash = p_token_hash;
  if not found or v.cancelled_at is not null or (not v.reusable and v.taken_at is not null) or
    (v.expires_at is not null and v.expires_at <= now()) or v.account_id is null then
    return 'unavailable'; end if;
  if v.reusable or v.delivery_order_id is not null then
    if not exists (select 1 from public.shop_orders o where o.id = v.delivery_order_id
      and o.account_id = v.account_id and o.status = 'verified'
      and o.delivery_cancelled_at is null) then return 'unavailable'; end if;
    if not exists (select 1 from public.shop_orders o where o.id = v.delivery_order_id
      and o.delivery_bound_at is not null and o.credentials_viewed_at is not null) then
      return 'pending'; end if;
    if v.bound_at is null then return 'paired_ready'; end if;
    if v.reusable then return 'reusable'; end if;
  end if;
  if v.bound_at is not null then return 'bound'; end if;
  return 'ready';
end;
$$;

create or replace function public.shop_otp_reissue_start(p_id uuid, p_token_hash text, p_claim_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v public.shop_otp_reissues%rowtype; v_start timestamptz;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'unauthorized'; end if;
  -- For reusable links the URL token remains the bearer credential across sessions.
  select * into v from public.shop_otp_reissues where id = p_id and token_hash = p_token_hash
    and ((reusable and p_claim_hash = p_token_hash) or (not reusable and claim_hash = p_claim_hash))
    for update;
  if not found or v.bound_at is null or v.cancelled_at is not null or (not v.reusable and v.taken_at is not null) or
    (v.expires_at is not null and v.expires_at <= clock_timestamp()) or v.account_id is null then
    return jsonb_build_object('state', 'unavailable'); end if;
  if (v.reusable or v.delivery_order_id is not null) and not exists (
    select 1 from public.shop_orders o where o.id = v.delivery_order_id
      and o.account_id = v.account_id and o.delivery_cancelled_at is null
      and o.status = 'verified' and o.credentials_viewed_at is not null) then
    return jsonb_build_object('state', 'unavailable'); end if;
  if v.window_start is null or (v.reusable and
    v.window_start + interval '30 seconds' <= clock_timestamp()) then
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
  if auth.role() is distinct from 'service_role' then raise exception 'unauthorized'; end if;
  -- For reusable links the URL token remains the bearer credential across sessions.
  select * into v from public.shop_otp_reissues where id = p_id and token_hash = p_token_hash
    and ((reusable and p_claim_hash = p_token_hash) or (not reusable and claim_hash = p_claim_hash))
    for update;
  if not found or v.cancelled_at is not null or (not v.reusable and v.taken_at is not null) or v.account_id is null or
    v.window_start is null or floor(extract(epoch from v.window_start) * 1000)::bigint <> p_window_start_ms or
    (v.reusable and (clock_timestamp() < v.window_start or v.last_issued_window = v.window_start)) or
    clock_timestamp() >= v.window_start + interval '30 seconds' or
    (v.expires_at is not null and v.expires_at <= clock_timestamp()) then return false; end if;
  if (v.reusable or v.delivery_order_id is not null) and not exists (
    select 1 from public.shop_orders o where o.id = v.delivery_order_id
      and o.account_id = v.account_id and o.delivery_cancelled_at is null
      and o.status = 'verified' and o.credentials_viewed_at is not null) then return false; end if;
  if v.reusable and not exists (
    select 1 from public.shop_accounts a where a.id = v.account_id
      and a.is_active and nullif(a.totp_secret_enc, '') is not null) then return false; end if;
  if v.reusable then
    update public.shop_otp_reissues set last_issued_window = v.window_start where id = p_id;
  else
    update public.shop_otp_reissues set taken_at = clock_timestamp() where id = p_id;
  end if;
  insert into public.shop_audit_logs(order_id, actor, action, created_at, detail) values
    (v.delivery_order_id, 'system', 'otp_reissue_code_delivered', clock_timestamp(),
      jsonb_build_object('reissue_id', p_id, 'account_id', v.account_id,
        'window_start_ms', p_window_start_ms, 'buyer_name', v.buyer_name,
        'buyer_phone', v.buyer_phone, 'buyer_device', v.buyer_device,
        'buyer_city', v.buyer_city));
  return true;
end;
$$;


create function public.shop_admin_reusable_otp(p_order_id uuid, p_offset int)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v public.shop_otp_reissues%rowtype; v_history jsonb;
begin
  if not public.is_admin() then raise exception 'unauthorized'; end if;
  select * into v from public.shop_otp_reissues where delivery_order_id = p_order_id and reusable;
  if not found then return null; end if;
  select coalesce(jsonb_agg(h.created_at order by h.created_at desc, h.id desc), '[]'::jsonb)
    into v_history from (
      select l.id, l.created_at from public.shop_audit_logs l
      where l.order_id = p_order_id and l.action = 'otp_reissue_code_delivered'
        and l.detail->>'reissue_id' = v.id::text
      order by l.created_at desc, l.id desc limit 11 offset greatest(p_offset, 0)
    ) h;
  return jsonb_build_object('expires_at', v.expires_at, 'cancelled_at', v.cancelled_at,
    'history', v_history);
end;
$$;

create function public.shop_admin_update_reusable_otp(p_order_id uuid, p_expires_at timestamptz, p_cancel boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v public.shop_otp_reissues%rowtype;
begin
  if not public.is_admin() then raise exception 'unauthorized'; end if;
  if not p_cancel and p_expires_at is not null and
    (not isfinite(p_expires_at) or p_expires_at <= clock_timestamp()) then
    raise exception 'invalid_expiry'; end if;
  select * into v from public.shop_otp_reissues
    where delivery_order_id = p_order_id and reusable for update;
  if not found or v.cancelled_at is not null then raise exception 'unavailable'; end if;
  if p_cancel then
    update public.shop_otp_reissues set cancelled_at = clock_timestamp() where id = v.id;
  else
    update public.shop_otp_reissues set expires_at = p_expires_at where id = v.id;
  end if;
  insert into public.shop_audit_logs(order_id, actor, action, detail) values
    (p_order_id, 'admin', case when p_cancel then 'otp_reissue_link_cancelled' else 'otp_reissue_expiry_updated' end,
      jsonb_build_object('reissue_id', v.id, 'admin_id', auth.uid(),
        'previous_expires_at', v.expires_at, 'expires_at', case when p_cancel then v.expires_at else p_expires_at end));
end;
$$;

revoke all on function public.shop_admin_create_delivery_pair(uuid, text, timestamptz),
  public.shop_admin_reusable_otp(uuid, int),
  public.shop_admin_update_reusable_otp(uuid, timestamptz, boolean) from public, anon, authenticated;
grant execute on function public.shop_admin_create_delivery_pair(uuid, text, timestamptz),
  public.shop_admin_reusable_otp(uuid, int),
  public.shop_admin_update_reusable_otp(uuid, timestamptz, boolean) to authenticated;

-- Reusable links are managed from the paired delivery in Admin Akun.
create or replace function public.shop_admin_page_otp_reissues_filtered(p_limit int, p_offset int, p_filters jsonb)
returns table (id uuid, account_email text, created_at timestamptz, expires_at timestamptz,
  bound_at timestamptz, taken_at timestamptz, cancelled_at timestamptz, total_count bigint)
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'unauthorized'; end if;
  return query select r.id, a.email, r.created_at, r.expires_at, r.bound_at,
    r.taken_at, r.cancelled_at, count(*) over ()
  from public.shop_otp_reissues r left join public.shop_accounts a on a.id = r.account_id
  where not r.reusable
    and (coalesce(p_filters->>'email', '') = '' or lower(coalesce(a.email, 'Akun dihapus')) = lower(p_filters->>'email'))
    and (coalesce(p_filters->>'date', '') = '' or (r.created_at at time zone 'Asia/Jakarta')::date::text >= p_filters->>'date')
    and (coalesce(p_filters->>'date_to', '') = '' or (r.created_at at time zone 'Asia/Jakarta')::date::text <= p_filters->>'date_to')
    and (coalesce(p_filters->>'status', '') = '' or
      case when r.taken_at is not null then 'Diambil'
        when r.expires_at <= now() then 'Kedaluwarsa'
        when r.cancelled_at is not null then 'Dibatalkan'
        when r.bound_at is not null then 'Identitas terisi' else 'Belum dipakai' end = p_filters->>'status')
  order by r.created_at desc, r.id desc
  limit least(greatest(coalesce(p_limit, 10), 1), 100) offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

create or replace function public.shop_admin_cancel_otp_reissue(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'unauthorized'; end if;
  update public.shop_otp_reissues set cancelled_at = now() where id = p_id
    and not reusable and cancelled_at is null and taken_at is null;
  if not found then raise exception 'not_cancellable'; end if;
  insert into public.shop_audit_logs(actor, action, detail) values
    ('admin', 'otp_reissue_link_cancelled', jsonb_build_object('reissue_id', p_id, 'admin_id', auth.uid()));
end;
$$;
