begin;

drop function if exists public.submit_payment(uuid, text, timestamptz);
drop function if exists public.submit_payment(uuid, text, timestamptz, uuid);
drop function if exists public.shop_record_proof_upload(uuid, text, text);

create function public.shop_record_proof_upload(
  p_order_id uuid, p_token_hash text, p_proof_path text, p_method_id uuid
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_order public.shop_orders%rowtype;
  v_method_name text;
begin
  select o.* into v_order from public.shop_orders o
    where o.id = p_order_id and o.token_hash = p_token_hash for update;
  if not found then raise exception 'unauthorized'; end if;
  if v_order.status = 'expired' or (v_order.status = 'draft' and v_order.expires_at <= now()) then
    raise exception 'order_expired';
  end if;
  if v_order.status <> 'draft' or v_order.proof_path is not null then raise exception 'invalid_status'; end if;
  select m.name into v_method_name from public.shop_payment_methods m
    where m.id = p_method_id and m.is_active for share;
  if not found then raise exception 'invalid_method'; end if;
  if p_proof_path is null or p_proof_path not like p_order_id::text || '/%'
    or length(p_proof_path) <= length(p_order_id::text) + 1
    or position('..' in p_proof_path) > 0 then raise exception 'invalid_path'; end if;
  update public.shop_orders set proof_path = p_proof_path, status = 'waiting_verification',
    paid_at = now(), method_id = p_method_id, method_name = v_method_name where id = p_order_id;
  insert into public.shop_audit_logs(order_id, actor, action, detail)
    values (p_order_id, 'system', 'proof_uploaded',
      jsonb_build_object('path', p_proof_path, 'method_name', v_method_name));
end;
$$;
revoke all on function public.shop_record_proof_upload(uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.shop_record_proof_upload(uuid, text, text, uuid) to service_role;

create table public.shop_rate_limits (
  key text primary key,
  window_start timestamptz not null,
  count int not null
);
alter table public.shop_rate_limits enable row level security;
revoke all on public.shop_rate_limits from public, anon, authenticated;

create function public.shop_rate_check(p_key text, p_limit int, p_window_seconds int)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_count int;
begin
  if p_key is null or length(p_key) > 200 or p_limit not between 1 and 1000000
    or p_window_seconds not between 1 and 86400 or p_limit is null or p_window_seconds is null then
    raise exception 'invalid_rate_limit';
  end if;
  insert into public.shop_rate_limits as r(key, window_start, count) values (p_key, now(), 1)
  on conflict (key) do update set
    count = case when r.window_start <= now() - make_interval(secs => p_window_seconds)
      then 1 else least(r.count + 1, p_limit + 1) end,
    window_start = case when r.window_start <= now() - make_interval(secs => p_window_seconds)
      then now() else r.window_start end
  returning count into v_count;
  return v_count <= p_limit;
end;
$$;
revoke all on function public.shop_rate_check(text, int, int) from public, anon, authenticated;
grant execute on function public.shop_rate_check(text, int, int) to service_role;
select cron.schedule('purge-rate-limits', '0 3 * * *',
  $cron$delete from public.shop_rate_limits where window_start < now() - interval '1 day';$cron$);

alter table public.shop_orders add column ip_hash text;
create index shop_orders_draft_ip_idx on public.shop_orders(ip_hash, expires_at) where status = 'draft';
create index shop_orders_phone_created_idx on public.shop_orders(buyer_phone, created_at);

create or replace function public.create_order(
  p_variant_id uuid, p_buyer_name text, p_buyer_phone text, p_buyer_device text, p_buyer_city text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_phone text := btrim(p_buyer_phone);
  v_headers jsonb := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb;
  v_ip text;
  v_ip_hash text;
  v_price int;
  v_account_id uuid;
  v_order_id uuid;
  v_order_code text;
  v_token bytea := extensions.gen_random_bytes(32);
  v_expires_at timestamptz := now() + interval '30 minutes';
  v_alphabet constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  v_random bytea;
  v_attempt int;
  v_character int;
  v_constraint text;
begin
  -- Trust only gateway-supplied headers; never persist or audit the raw address.
  v_ip := nullif(btrim(v_headers->>'cf-connecting-ip'), '');
  if v_ip is null then
    v_ip := nullif(btrim((string_to_array(v_headers->>'x-forwarded-for', ','))[array_length(string_to_array(v_headers->>'x-forwarded-for', ','), 1)]), '');
  end if;
  v_ip_hash := case when v_ip is null then 'unknown' else encode(extensions.digest(v_ip, 'sha256'), 'hex') end;
  -- The counter/locks are transactional: failed RPC calls roll back their increment.
  if not public.shop_rate_check('ip:' || v_ip_hash, case when v_ip is null then 40 else 6 end, 600) then
    raise exception 'rate_limited';
  end if;
  if v_phone is null or char_length(v_phone) not between 9 and 13 or v_phone !~ '^(08|62)[0-9]+$' then
    raise exception 'invalid_phone';
  end if;
  if left(v_phone, 1) = '0' then v_phone := '62' || substr(v_phone, 2); end if;
  if nullif(btrim(p_buyer_name), '') is null or char_length(btrim(p_buyer_name)) > 100 then raise exception 'invalid_buyer_name'; end if;
  if nullif(btrim(p_buyer_device), '') is null or char_length(btrim(p_buyer_device)) > 200 then raise exception 'invalid_buyer_device'; end if;
  if nullif(btrim(p_buyer_city), '') is null or char_length(btrim(p_buyer_city)) > 100 then raise exception 'invalid_buyer_city'; end if;
  -- IP counter upsert serializes one IP. This lock also serializes a phone across IPs.
  perform pg_advisory_xact_lock(hashtextextended('shop:phone:' || v_phone, 0));
  if (select count(*) from public.shop_orders o where o.ip_hash = v_ip_hash and o.status = 'draft' and o.expires_at > now()) >= 4
    or (select count(*) from public.shop_orders o where o.buyer_phone = v_phone and o.status = 'draft' and o.expires_at > now()) >= 2
    or (select count(*) from public.shop_orders o where o.buyer_phone = v_phone and o.created_at > now() - interval '24 hours') >= 6 then
    raise exception 'rate_limited';
  end if;
  select v.price into v_price from public.shop_variants v join public.shop_products p on p.id = v.product_id
    where v.id = p_variant_id and v.is_active and p.is_active;
  if not found then raise exception 'invalid_variant'; end if;
  v_account_id := public.shop_take_slot(p_variant_id);
  for v_attempt in 1..5 loop
    v_order_code := 'GR-';
    v_random := extensions.gen_random_bytes(5);
    for v_character in 0..4 loop
      v_order_code := v_order_code || substr(v_alphabet, 1 + get_byte(v_random, v_character) % char_length(v_alphabet), 1);
    end loop;
    begin
      insert into public.shop_orders(order_code, token_hash, variant_id, account_id,
        buyer_name, buyer_phone, buyer_device, buyer_city, price, status, expires_at, ip_hash)
      values (v_order_code, encode(extensions.digest(v_token, 'sha256'), 'hex'), p_variant_id,
        v_account_id, btrim(p_buyer_name), v_phone, btrim(p_buyer_device), btrim(p_buyer_city), v_price, 'draft', v_expires_at, v_ip_hash)
      returning id into v_order_id;
      exit;
    exception when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint <> 'shop_orders_order_code_key' or v_attempt = 5 then raise; end if;
    end;
  end loop;
  insert into public.shop_audit_logs(order_id, actor, action, detail)
    values (v_order_id, 'system', 'order_created', jsonb_build_object('order_code', v_order_code,
      'variant_id', p_variant_id, 'account_id', v_account_id, 'ip_hash', left(v_ip_hash, 12)));
  return jsonb_build_object('order_id', v_order_id, 'order_code', v_order_code,
    'token', encode(v_token, 'hex'), 'expires_at', v_expires_at);
end;
$$;
revoke all on function public.create_order(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.create_order(uuid, text, text, text, text) to anon, authenticated, service_role;

create or replace function public.retry_payment(p_order_id uuid, p_token_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_order public.shop_orders%rowtype;
  v_headers jsonb := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb;
  v_ip text;
  v_ip_hash text;
  v_price int;
  v_account_id uuid;
  v_token bytea;
  v_expires_at timestamptz;
begin
  v_ip := nullif(btrim(v_headers->>'cf-connecting-ip'), '');
  if v_ip is null then
    v_ip := nullif(btrim((string_to_array(v_headers->>'x-forwarded-for', ','))[array_length(string_to_array(v_headers->>'x-forwarded-for', ','), 1)]), '');
  end if;
  v_ip_hash := case when v_ip is null then 'unknown' else encode(extensions.digest(v_ip, 'sha256'), 'hex') end;
  if not public.shop_rate_check('ip:' || v_ip_hash, case when v_ip is null then 40 else 6 end, 600) then raise exception 'rate_limited'; end if;
  select o.* into v_order from public.shop_orders o where o.id = p_order_id and o.token_hash = p_token_hash for update;
  if not found then raise exception 'unauthorized'; end if;
  if v_order.status <> 'rejected' then raise exception 'not_rejected'; end if;
  perform pg_advisory_xact_lock(hashtextextended('shop:phone:' || v_order.buyer_phone, 0));
  if (select count(*) from public.shop_orders o where o.ip_hash = v_ip_hash and o.status = 'draft' and o.expires_at > now()) >= 4
    or (select count(*) from public.shop_orders o where o.buyer_phone = v_order.buyer_phone and o.status = 'draft' and o.expires_at > now()) >= 2 then raise exception 'rate_limited'; end if;
  select v.price into v_price from public.shop_variants v join public.shop_products p on p.id = v.product_id
    where v.id = v_order.variant_id and v.is_active and p.is_active;
  if not found then raise exception 'invalid_variant'; end if;
  v_account_id := public.shop_take_slot(v_order.variant_id);
  v_token := extensions.gen_random_bytes(32);
  v_expires_at := now() + interval '30 minutes';
  update public.shop_orders set status = 'draft', account_id = v_account_id, price = v_price,
    token_hash = encode(extensions.digest(v_token, 'sha256'), 'hex'), expires_at = v_expires_at,
    admin_note = null, proof_path = null, paid_at = null, method_id = null, method_name = null, ip_hash = v_ip_hash
    where id = p_order_id;
  insert into public.shop_audit_logs(order_id, actor, action) values (p_order_id, 'system', 'payment_retried');
  return jsonb_build_object('order_id', p_order_id, 'order_code', v_order.order_code,
    'token', encode(v_token, 'hex'), 'expires_at', v_expires_at);
end;
$$;
revoke all on function public.retry_payment(uuid, text) from public, anon, authenticated;
grant execute on function public.retry_payment(uuid, text) to anon, authenticated, service_role;

-- NULL historical windows are excluded; new deliveries are unique even under concurrency.
create unique index shop_audit_totp_delivery_window_key
  on public.shop_audit_logs(order_id, (detail->>'window_start_ms'))
  where action = 'totp_code_delivered' and detail->>'window_start_ms' is not null;

create function public.shop_admin_save_account_tx(
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
    perform 1 from public.shop_variants v join public.shop_products p on p.id = v.product_id
      where v.id = p_variant_id and v.is_active and p.is_active for share of v, p;
    if not found then raise exception 'invalid_variant'; end if;
    insert into public.shop_accounts(variant_id, email, password_enc, totp_secret_enc, max_uses, priority)
      values (p_variant_id, btrim(p_email), p_password_enc, p_totp_enc, p_max_uses, p_priority) returning id into v_id;
  else
    select a.* into v_account from public.shop_accounts a where a.id = p_account_id for update;
    if not found then raise exception 'not_found'; end if;
    if p_variant_id is distinct from v_account.variant_id then raise exception 'variant_locked'; end if;
    if p_max_uses is not null and p_max_uses < v_account.used_count then raise exception 'stock_below_used'; end if;
    update public.shop_accounts set email = btrim(p_email), max_uses = p_max_uses, priority = p_priority,
      password_enc = coalesce(p_password_enc, password_enc), totp_secret_enc = coalesce(p_totp_enc, totp_secret_enc)
      where id = p_account_id returning id into v_id;
  end if;
  insert into public.shop_audit_logs(actor, action, detail) values ('admin',
    case when p_account_id is null then 'account_created' else 'account_credentials_updated' end,
    jsonb_build_object('account_id', v_id, 'admin_id', p_admin_id, 'changed_fields', to_jsonb(p_changed_fields)));
  return v_id;
end;
$$;
revoke all on function public.shop_admin_save_account_tx(uuid, uuid, uuid, text, text, text, int, int, text[])
  from public, anon, authenticated;
grant execute on function public.shop_admin_save_account_tx(uuid, uuid, uuid, text, text, text, int, int, text[]) to service_role;

commit;
