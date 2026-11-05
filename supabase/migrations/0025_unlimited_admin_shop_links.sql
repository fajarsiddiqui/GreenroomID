-- Unlimited admin Shop accounts and one-use links without a calendar expiry.

begin;

select cron.unschedule('shop-expire-delivery-links');

select cron.unschedule('shop-expire-otp-reissues');

insert into public.shop_audit_logs(order_id, actor, action)
  select id, 'system', 'delivery_link_expired' from public.shop_orders
  where delivery_link and status = 'verified' and credentials_viewed_at is null and expires_at <= now();
update public.shop_orders set status = 'expired' where delivery_link and status = 'verified' and credentials_viewed_at is null and expires_at <= now();

insert into public.shop_audit_logs(actor, action, detail)
  select 'system', 'otp_reissue_link_expired', jsonb_build_object('reissue_id', id)
  from public.shop_otp_reissues where taken_at is null and cancelled_at is null and expires_at <= now();
update public.shop_otp_reissues set cancelled_at = now() where taken_at is null and cancelled_at is null and expires_at <= now();

alter table public.shop_accounts alter column variant_id drop not null;

update public.shop_accounts set max_uses = null where max_uses is not null;

alter table public.shop_orders alter column expires_at drop not null;

update public.shop_orders set expires_at = null where delivery_link and status = 'verified' and credentials_viewed_at is null and delivery_cancelled_at is null;

alter table public.shop_otp_reissues alter column expires_at drop not null;

alter table public.shop_otp_reissues alter column expires_at drop default;

update public.shop_otp_reissues set expires_at = null where taken_at is null and cancelled_at is null;

update public.shop_orders set delivery_grant_expires_at = null where delivery_link and credentials_viewed_at is not null and delivery_grant_hash is not null;

create or replace function public.shop_admin_save_account_tx(
  p_admin_id uuid, p_account_id uuid, p_variant_id uuid, p_email text,
  p_password_enc text, p_totp_enc text, p_max_uses int, p_priority int, p_changed_fields text[]
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_account public.shop_accounts%rowtype;
begin
  if p_admin_id is null or nullif(btrim(p_email), '') is null
    or p_changed_fields is null or not (p_changed_fields <@ array['email', 'max_uses', 'priority', 'password_enc', 'totp_secret_enc']::text[]) then raise exception 'invalid_input'; end if;
  if p_account_id is null then
    if nullif(p_password_enc, '') is null then raise exception 'invalid_input'; end if;
    insert into public.shop_accounts(variant_id, email, password_enc, totp_secret_enc, max_uses, priority)
      values (null, btrim(p_email), p_password_enc, p_totp_enc, null, p_priority) returning id into v_id;
  else
    select a.* into v_account from public.shop_accounts a where a.id = p_account_id for update;
    if not found then raise exception 'not_found'; end if;
    if p_variant_id is distinct from v_account.variant_id then raise exception 'variant_locked'; end if;
    update public.shop_accounts set email = btrim(p_email), max_uses = null, priority = p_priority,
      password_enc = coalesce(p_password_enc, password_enc), totp_secret_enc = coalesce(p_totp_enc, totp_secret_enc)
      where id = p_account_id returning id into v_id;
  end if;
  insert into public.shop_audit_logs(actor, action, detail) values ('admin',
    case when p_account_id is null then 'account_created' else 'account_credentials_updated' end,
    jsonb_build_object('account_id', v_id, 'admin_id', p_admin_id, 'changed_fields', to_jsonb(p_changed_fields)));
  return v_id;
end;
$$;

create or replace function public.shop_admin_update_account_meta(p_account_id uuid, p_email text,
  p_max_uses int, p_priority int)
returns void language plpgsql security definer set search_path = '' as $$
declare v_account public.shop_accounts%rowtype;
begin
  if not public.is_admin() then raise exception 'unauthorized'; end if;
  select * into v_account from public.shop_accounts where id = p_account_id for update;
  if not found then raise exception 'not_found'; end if;
  if p_email is null or btrim(p_email) !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or p_priority is null or p_priority not between 0 and 9999
  then raise exception 'invalid_input'; end if;
  update public.shop_accounts set email = btrim(p_email), max_uses = null,
    priority = p_priority where id = p_account_id;
  insert into public.shop_audit_logs (actor, action, detail) values
    ('admin', 'account_meta_updated', jsonb_build_object('account_id', p_account_id,
      'admin_id', auth.uid(), 'changed_columns', jsonb_build_array('email', 'max_uses', 'priority')));
end;
$$;

create or replace function public.shop_admin_list_accounts()
returns table (id uuid, variant_id uuid, product_name text, account_type text,
  duration_days int, email text, max_uses int, used_count int, priority int,
  is_active boolean, created_at timestamptz, has_password boolean, has_totp boolean)
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'unauthorized'; end if;
  return query select a.id, a.variant_id, p.name, v.account_type, v.duration_days,
    a.email, a.max_uses, a.used_count, a.priority, a.is_active, a.created_at,
    a.password_enc <> '' and a.password_enc <> 'PLACEHOLDER',
    coalesce(a.totp_secret_enc <> '', false)
  from public.shop_accounts a left join public.shop_variants v on v.id = a.variant_id
  left join public.shop_products p on p.id = v.product_id
  order by a.priority, a.created_at;
end;
$$;

create or replace function public.shop_admin_create_delivery_link(p_account_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_account public.shop_accounts%rowtype;
  v_token bytea := extensions.gen_random_bytes(32);
  v_code text;
  v_alphabet text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  v_random bytea;
  v_order_id uuid;
  v_attempt int;
  v_index int;
begin
  if not public.is_admin() then raise exception 'unauthorized'; end if;
  select * into v_account from public.shop_accounts where id = p_account_id for update;
  if not found or not v_account.is_active then
    raise exception 'no_stock';
  end if;
  for v_attempt in 1..5 loop
    v_code := 'GR-';
    v_random := extensions.gen_random_bytes(5);
    for v_index in 0..4 loop
      v_code := v_code || substr(v_alphabet, 1 + get_byte(v_random, v_index) % length(v_alphabet), 1);
    end loop;
    begin
      insert into public.shop_orders(order_code, token_hash, variant_id, account_id,
        price, status, expires_at, delivery_link, verified_at)
      values (v_code, encode(extensions.digest(v_token, 'sha256'), 'hex'), v_account.variant_id,
        p_account_id, 0, 'verified', null, true, now())
      returning id into v_order_id;
      exit;
    exception when unique_violation then
      if v_attempt = 5 then raise; end if;
    end;
  end loop;
  insert into public.shop_audit_logs(order_id, actor, action, detail)
    values (v_order_id, 'admin', 'delivery_link_created',
      jsonb_build_object('admin_id', auth.uid(), 'account_id', p_account_id));
  return jsonb_build_object('order_id', v_order_id, 'code', v_code,
    'token', encode(v_token, 'hex'));
end;
$$;

create or replace function public.shop_admin_cancel_delivery_link(p_order_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_order public.shop_orders%rowtype;
begin
  if not public.is_admin() then raise exception 'unauthorized'; end if;
  select * into v_order from public.shop_orders where id = p_order_id and delivery_link for update;
  if not found or v_order.status <> 'verified' or v_order.delivery_cancelled_at is not null or
    v_order.credentials_viewed_at is not null then raise exception 'not_cancellable'; end if;
  update public.shop_orders set delivery_cancelled_at = now(), status = 'expired'
    where id = p_order_id;
  insert into public.shop_audit_logs(order_id, actor, action, detail)
    values (p_order_id, 'admin', 'delivery_link_cancelled', jsonb_build_object('admin_id', auth.uid()));
end;
$$;

create or replace function public.shop_delivery_status(p_order_id uuid, p_token_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_order public.shop_orders%rowtype;
begin
  select * into v_order from public.shop_orders where id = p_order_id and token_hash = p_token_hash
    and delivery_link;
  if not found then return jsonb_build_object('state', 'invalid'); end if;
  if v_order.delivery_cancelled_at is not null or v_order.status <> 'verified' or
    v_order.account_revoked_at is not null or v_order.credentials_viewed_at is not null then
    return jsonb_build_object('state', 'unavailable');
  end if;
  return jsonb_build_object('state', case when v_order.delivery_bound_at is null then 'ready' else 'bound' end);
end;
$$;

create or replace function public.shop_delivery_bind(p_order_id uuid, p_token_hash text,
  p_buyer_name text, p_buyer_phone text, p_buyer_device text, p_buyer_city text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_order public.shop_orders%rowtype;
  v_phone text := nullif(btrim(p_buyer_phone), '');
  v_claim bytea := extensions.gen_random_bytes(32);
begin
  if nullif(btrim(p_buyer_name), '') is null or length(btrim(p_buyer_name)) > 100 or
    nullif(btrim(p_buyer_device), '') is null or length(btrim(p_buyer_device)) > 200 or
    nullif(btrim(p_buyer_city), '') is null or length(btrim(p_buyer_city)) > 100 then
    raise exception 'invalid_identity';
  end if;
  if v_phone is not null then
    if v_phone ~ '^08[0-9]{7,11}$' then v_phone := '62' || substr(v_phone, 2); end if;
    if v_phone !~ '^62[0-9]{8,12}$' then raise exception 'invalid_phone'; end if;
  end if;
  select * into v_order from public.shop_orders where id = p_order_id and token_hash = p_token_hash
    and delivery_link for update;
  if not found then return jsonb_build_object('state', 'invalid'); end if;
  if v_order.delivery_cancelled_at is not null or v_order.status <> 'verified' or
    v_order.account_revoked_at is not null or v_order.credentials_viewed_at is not null then return jsonb_build_object('state', 'unavailable'); end if;
  if v_order.delivery_bound_at is not null then return jsonb_build_object('state', 'bound'); end if;
  update public.shop_orders set buyer_name = btrim(p_buyer_name), buyer_phone = v_phone,
    buyer_device = btrim(p_buyer_device), buyer_city = btrim(p_buyer_city), delivery_bound_at = now(),
    delivery_claim_hash = encode(extensions.digest(v_claim, 'sha256'), 'hex')
    where id = p_order_id;
  insert into public.shop_audit_logs(order_id, actor, action)
    values (p_order_id, 'system', 'delivery_identity_bound');
  return jsonb_build_object('state', 'bound', 'claim', encode(v_claim, 'hex'));
end;
$$;

create or replace function public.shop_delivery_submit_feedback(p_order_id uuid, p_token_hash text,
  p_grant_hash text, p_rating text, p_comment text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_order public.shop_orders%rowtype;
begin
  if p_rating not in ('keren', 'bagus', 'biasa aja', 'cukup', 'kurang') or
    length(coalesce(p_comment, '')) > 2000 then raise exception 'invalid_feedback'; end if;
  select * into v_order from public.shop_orders where id = p_order_id and delivery_link
    and token_hash = p_token_hash and delivery_grant_hash = p_grant_hash;
  if not found or v_order.credentials_viewed_at is null or v_order.delivery_cancelled_at is not null then return 'unavailable'; end if;
  insert into public.shop_audit_logs(order_id, actor, action, detail)
    values (p_order_id, 'system', 'delivery_feedback_submitted',
      jsonb_build_object('rating', p_rating, 'comment', nullif(btrim(p_comment), '')))
    on conflict (order_id) where action = 'delivery_feedback_submitted' do nothing;
  if not found then return 'already_submitted'; end if;
  return 'saved';
end;
$$;

create or replace function public.shop_admin_cancel_otp_reissue(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'unauthorized'; end if;
  update public.shop_otp_reissues set cancelled_at = now() where id = p_id
    and cancelled_at is null and taken_at is null;
  if not found then raise exception 'not_cancellable'; end if;
  insert into public.shop_audit_logs(actor, action, detail) values
    ('admin', 'otp_reissue_link_cancelled', jsonb_build_object('reissue_id', p_id, 'admin_id', auth.uid()));
end;
$$;

create or replace function public.shop_otp_reissue_status(p_id uuid, p_token_hash text)
returns text language plpgsql security definer set search_path = '' as $$
declare v public.shop_otp_reissues%rowtype;
begin
  select * into v from public.shop_otp_reissues where id = p_id and token_hash = p_token_hash;
  if not found or v.cancelled_at is not null or v.taken_at is not null or
    v.account_id is null then return 'unavailable'; end if;
  if v.bound_at is not null then return 'bound'; end if;
  return 'ready';
end;
$$;

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
  if not found or v.cancelled_at is not null or v.taken_at is not null or
    v.account_id is null then return jsonb_build_object('state', 'unavailable'); end if;
  if v.bound_at is not null then return jsonb_build_object('state', 'bound'); end if;
  update public.shop_otp_reissues set buyer_name = btrim(p_buyer_name), buyer_phone = v_phone,
    buyer_device = btrim(p_buyer_device), buyer_city = btrim(p_buyer_city), bound_at = now(),
    claim_hash = encode(extensions.digest(v_claim, 'sha256'), 'hex') where id = p_id;
  insert into public.shop_audit_logs(actor, action, detail) values
    ('system', 'otp_reissue_identity_bound', jsonb_build_object('reissue_id', p_id));
  return jsonb_build_object('state', 'bound', 'claim', encode(v_claim, 'hex'));
end;
$$;

create or replace function public.shop_otp_reissue_start(p_id uuid, p_token_hash text, p_claim_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v public.shop_otp_reissues%rowtype; v_start timestamptz;
begin
  if auth.role() <> 'service_role' then raise exception 'unauthorized'; end if;
  select * into v from public.shop_otp_reissues where id = p_id and token_hash = p_token_hash
    and claim_hash = p_claim_hash for update;
  if not found or v.bound_at is null or v.cancelled_at is not null or v.taken_at is not null or
    v.account_id is null then return jsonb_build_object('state', 'unavailable'); end if;
  if v.window_start is null then
    v_start := to_timestamp((floor(extract(epoch from clock_timestamp()) / 30) + 1) * 30);
    update public.shop_otp_reissues set window_start = v_start where id = p_id;
  else v_start := v.window_start; end if;
  if v_start + interval '30 seconds' <= clock_timestamp() then return jsonb_build_object('state', 'expired'); end if;
  return jsonb_build_object('state', 'ready', 'account_id', v.account_id,
    'window_start_ms', floor(extract(epoch from v_start) * 1000)::bigint);
end;
$$;

commit;
