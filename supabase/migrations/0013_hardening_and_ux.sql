-- Safe to apply repeatedly after 0012. Only shop functions are changed.
begin;

-- Keep private helpers private, including trigger functions. Browser-facing
-- RPCs retain their existing grants and their own token/admin checks.
do $$
declare v_function text;
begin
  foreach v_function in array array[
    'public.shop_record_proof_upload(uuid,text,text,uuid)',
    'public.shop_rate_check(text,integer,integer)',
    'public.shop_take_slot(uuid)',
    'public.shop_release_slot(uuid)',
    'public.release_account(uuid)',
    'public.shop_admin_save_account_tx(uuid,uuid,uuid,text,text,text,integer,integer,text[])',
    'public.shop_audit_immutable()',
    'public.shop_audit_admin_table_change()'
  ] loop
    if to_regprocedure(v_function) is not null then
      execute format('revoke execute on function %s from public, anon, authenticated', v_function);
    end if;
  end loop;
end;
$$;

-- All shop SECURITY DEFINER functions use a fixed path. Do not alter host
-- functions; every function body in these migrations qualifies shop tables.
do $$
declare v_function record;
begin
  for v_function in
    select p.oid::regprocedure as signature
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
      and (p.proname like 'shop\_%' escape '\'
        or p.proname in ('create_order', 'retry_payment', 'get_order_status',
          'release_account', 'admin_verify_order', 'admin_reject_order'))
  loop
    execute format('alter function %s set search_path = public', v_function.signature);
  end loop;
end;
$$;

create or replace function public.create_order(
  p_variant_id uuid, p_buyer_name text, p_buyer_phone text, p_buyer_device text, p_buyer_city text
) returns jsonb language plpgsql security definer set search_path = public as $$
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
  v_ip := nullif(btrim(v_headers->>'cf-connecting-ip'), '');
  if v_ip is null then
    v_ip := nullif(btrim((string_to_array(v_headers->>'x-forwarded-for', ','))[array_length(string_to_array(v_headers->>'x-forwarded-for', ','), 1)]), '');
  end if;
  v_ip_hash := case when v_ip is null then 'unknown' else encode(extensions.digest(v_ip, 'sha256'), 'hex') end;
  if not public.shop_rate_check('ip:' || v_ip_hash, case when v_ip is null then 40 else 6 end, 600) then
    raise exception 'rate_limited_ip';
  end if;
  if v_phone is null or char_length(v_phone) not between 9 and 13 or v_phone !~ '^(08|62)[0-9]+$' then
    raise exception 'invalid_phone';
  end if;
  if left(v_phone, 1) = '0' then v_phone := '62' || substr(v_phone, 2); end if;
  if nullif(btrim(p_buyer_name), '') is null or char_length(btrim(p_buyer_name)) > 100 then raise exception 'invalid_buyer_name'; end if;
  if nullif(btrim(p_buyer_device), '') is null or char_length(btrim(p_buyer_device)) > 200 then raise exception 'invalid_buyer_device'; end if;
  if nullif(btrim(p_buyer_city), '') is null or char_length(btrim(p_buyer_city)) > 100 then raise exception 'invalid_buyer_city'; end if;
  perform pg_advisory_xact_lock(hashtextextended('shop:phone:' || v_phone, 0));
  if (select count(*) from public.shop_orders o where o.ip_hash = v_ip_hash and o.status = 'draft' and o.expires_at > now()) >= 4
    or (select count(*) from public.shop_orders o where o.buyer_phone = v_phone and o.status = 'draft' and o.expires_at > now()) >= 2 then
    raise exception 'rate_limited_drafts';
  end if;
  if (select count(*) from public.shop_orders o where o.buyer_phone = v_phone and o.created_at > now() - interval '24 hours') >= 10 then
    raise exception 'rate_limited_phone_daily';
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
revoke execute on function public.create_order(uuid, text, text, text, text) from public;
grant execute on function public.create_order(uuid, text, text, text, text) to anon, authenticated, service_role;

create or replace function public.retry_payment(p_order_id uuid, p_token_hash text)
returns jsonb language plpgsql security definer set search_path = public as $$
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
  if not public.shop_rate_check('ip:' || v_ip_hash, case when v_ip is null then 40 else 6 end, 600) then raise exception 'rate_limited_ip'; end if;
  select o.* into v_order from public.shop_orders o where o.id = p_order_id and o.token_hash = p_token_hash for update;
  if not found then raise exception 'unauthorized'; end if;
  if v_order.status <> 'rejected' then raise exception 'not_rejected'; end if;
  perform pg_advisory_xact_lock(hashtextextended('shop:phone:' || v_order.buyer_phone, 0));
  if (select count(*) from public.shop_orders o where o.ip_hash = v_ip_hash and o.status = 'draft' and o.expires_at > now()) >= 4
    or (select count(*) from public.shop_orders o where o.buyer_phone = v_order.buyer_phone and o.status = 'draft' and o.expires_at > now()) >= 2 then raise exception 'rate_limited_drafts'; end if;
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
revoke execute on function public.retry_payment(uuid, text) from public;
grant execute on function public.retry_payment(uuid, text) to anon, authenticated, service_role;

create or replace function public.release_account(p_order_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_order public.shop_orders%rowtype;
begin
  select o.* into v_order from public.shop_orders o where o.id = p_order_id for update;
  if not found then return; end if;
  if v_order.status = 'draft' and v_order.expires_at <= now() then
    update public.shop_orders set status = 'expired' where id = p_order_id;
    perform public.shop_release_slot(v_order.account_id);
    insert into public.shop_audit_logs(order_id, actor, action, detail)
      values (p_order_id, 'system', 'order_expired',
        jsonb_build_object('order_code', v_order.order_code, 'reason', 'draft_timeout'));
  end if;
end;
$$;
revoke execute on function public.release_account(uuid) from public, anon, authenticated;
grant execute on function public.release_account(uuid) to service_role;

commit;
