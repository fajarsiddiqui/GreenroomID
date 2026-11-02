-- Admin-issued, single-view deliveries reuse the existing encrypted account and TOTP flow.
alter table public.shop_orders
  alter column buyer_name drop not null,
  alter column buyer_phone drop not null,
  alter column buyer_device drop not null;

alter table public.shop_orders
  add column delivery_link boolean not null default false,
  add column delivery_bound_at timestamptz,
  add column delivery_claim_hash text,
  add column delivery_cancelled_at timestamptz,
  add column delivery_grant_hash text,
  add column delivery_grant_expires_at timestamptz;

create function public.shop_admin_create_delivery_link(p_account_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_account public.shop_accounts%rowtype;
  v_variant public.shop_variants%rowtype;
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
  if not found or not v_account.is_active or
    (v_account.max_uses is not null and v_account.used_count >= v_account.max_uses) then
    raise exception 'no_stock';
  end if;
  select * into v_variant from public.shop_variants where id = v_account.variant_id and is_active;
  if not found then raise exception 'invalid_variant'; end if;
  update public.shop_accounts set used_count = used_count + 1 where id = p_account_id;
  for v_attempt in 1..5 loop
    v_code := 'GR-';
    v_random := extensions.gen_random_bytes(5);
    for v_index in 0..4 loop
      v_code := v_code || substr(v_alphabet, 1 + get_byte(v_random, v_index) % length(v_alphabet), 1);
    end loop;
    begin
      insert into public.shop_orders(order_code, token_hash, variant_id, account_id,
        price, status, expires_at, delivery_link, verified_at)
      values (v_code, encode(extensions.digest(v_token, 'sha256'), 'hex'), v_variant.id,
        p_account_id, v_variant.price, 'verified', now() + interval '30 days', true, now())
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

create function public.shop_admin_cancel_delivery_link(p_order_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_order public.shop_orders%rowtype;
begin
  if not public.is_admin() then raise exception 'unauthorized'; end if;
  select * into v_order from public.shop_orders where id = p_order_id and delivery_link for update;
  if not found or v_order.status <> 'verified' or v_order.delivery_cancelled_at is not null or
    v_order.credentials_viewed_at is not null then raise exception 'not_cancellable'; end if;
  update public.shop_orders set delivery_cancelled_at = now(), status = 'expired'
    where id = p_order_id;
  perform public.shop_release_slot(v_order.account_id);
  insert into public.shop_audit_logs(order_id, actor, action, detail)
    values (p_order_id, 'admin', 'delivery_link_cancelled', jsonb_build_object('admin_id', auth.uid()));
end;
$$;

create function public.shop_delivery_status(p_order_id uuid, p_token_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_order public.shop_orders%rowtype;
begin
  select * into v_order from public.shop_orders where id = p_order_id and token_hash = p_token_hash
    and delivery_link;
  if not found then return jsonb_build_object('state', 'invalid'); end if;
  if v_order.delivery_cancelled_at is not null or v_order.status <> 'verified' or
    v_order.account_revoked_at is not null or v_order.credentials_viewed_at is not null or
    v_order.expires_at <= now() then
    return jsonb_build_object('state', 'unavailable');
  end if;
  return jsonb_build_object('state', case when v_order.delivery_bound_at is null then 'ready' else 'bound' end);
end;
$$;

create function public.shop_delivery_bind(p_order_id uuid, p_token_hash text,
  p_buyer_name text, p_buyer_phone text, p_buyer_device text, p_buyer_city text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_order public.shop_orders%rowtype; v_phone text := btrim(p_buyer_phone);
  v_claim bytea := extensions.gen_random_bytes(32);
begin
  if nullif(btrim(p_buyer_name), '') is null or length(btrim(p_buyer_name)) > 100 or
    nullif(btrim(p_buyer_device), '') is null or length(btrim(p_buyer_device)) > 200 or
    nullif(btrim(p_buyer_city), '') is null or length(btrim(p_buyer_city)) > 100 then
    raise exception 'invalid_identity';
  end if;
  if v_phone ~ '^08[0-9]{7,11}$' then v_phone := '62' || substr(v_phone, 2); end if;
  if v_phone !~ '^62[0-9]{8,12}$' then raise exception 'invalid_phone'; end if;
  select * into v_order from public.shop_orders where id = p_order_id and token_hash = p_token_hash
    and delivery_link for update;
  if not found then return jsonb_build_object('state', 'invalid'); end if;
  if v_order.delivery_cancelled_at is not null or v_order.status <> 'verified' or
    v_order.account_revoked_at is not null or v_order.credentials_viewed_at is not null or
    v_order.expires_at <= now() then return jsonb_build_object('state', 'unavailable'); end if;
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

revoke all on function public.shop_admin_create_delivery_link(uuid),
  public.shop_admin_cancel_delivery_link(uuid), public.shop_delivery_status(uuid, text),
  public.shop_delivery_bind(uuid, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.shop_admin_create_delivery_link(uuid),
  public.shop_admin_cancel_delivery_link(uuid) to authenticated;
grant execute on function public.shop_delivery_status(uuid, text),
  public.shop_delivery_bind(uuid, text, text, text, text, text) to anon, authenticated;

create function public.shop_admin_list_delivery_links()
returns table (id uuid, order_code text, account_email text, created_at timestamptz,
  expires_at timestamptz, buyer_name text, credentials_viewed_at timestamptz,
  delivery_cancelled_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'unauthorized'; end if;
  return query select o.id, o.order_code, a.email, o.created_at, o.expires_at,
    o.buyer_name, o.credentials_viewed_at, o.delivery_cancelled_at
  from public.shop_orders o left join public.shop_accounts a on a.id = o.account_id
  where o.delivery_link order by o.created_at desc limit 100;
end;
$$;
revoke all on function public.shop_admin_list_delivery_links() from public, anon, authenticated;
grant execute on function public.shop_admin_list_delivery_links() to authenticated;

create function public.shop_expire_delivery_links()
returns void language plpgsql security definer set search_path = '' as $$
declare v_order record;
begin
  for v_order in select id, account_id from public.shop_orders
    where delivery_link and credentials_viewed_at is null
      and delivery_cancelled_at is null and status = 'verified' and expires_at <= now()
    for update skip locked loop
    update public.shop_orders set status = 'expired' where id = v_order.id;
    perform public.shop_release_slot(v_order.account_id);
    insert into public.shop_audit_logs(order_id, actor, action)
      values (v_order.id, 'system', 'delivery_link_expired');
  end loop;
end;
$$;
revoke all on function public.shop_expire_delivery_links() from public, anon, authenticated;
grant execute on function public.shop_expire_delivery_links() to service_role;
select cron.schedule('shop-expire-delivery-links', '* * * * *',
  $$select public.shop_expire_delivery_links()$$);

-- Public checkout is retired; only the admin-issued delivery flow may reserve stock.
revoke execute on function public.create_order(uuid, text, text, text, text),
  public.retry_payment(uuid, text)
  from anon, authenticated;
