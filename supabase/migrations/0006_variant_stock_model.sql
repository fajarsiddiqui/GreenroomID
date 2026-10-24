-- Shop test data only. Existing applied migrations remain unchanged.
begin;
truncate public.shop_audit_logs, public.shop_orders, public.shop_accounts restart identity cascade;
drop index if exists public.shop_accounts_available_priority_created_idx;
alter table public.shop_accounts
  drop column product_id, drop column is_unlimited, drop column is_available,
  add column variant_id uuid not null references public.shop_variants(id) on delete restrict,
  add column max_uses int check (max_uses is null or max_uses > 0),
  add column used_count int not null default 0 check (used_count >= 0),
  add column is_active boolean not null default true,
  add constraint shop_accounts_stock_limit check (max_uses is null or used_count <= max_uses);
create index shop_accounts_variant_priority_created_idx
  on public.shop_accounts(variant_id, is_active, priority, created_at);
revoke all on public.shop_accounts from anon, authenticated;
alter table public.shop_orders
  add column price int not null,
  add column buyer_city text not null,
  add column verified_at timestamptz,
  add column verified_by uuid;

create function public.shop_take_slot(p_variant_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_account_id uuid;
begin
  select a.id into v_account_id from public.shop_accounts a
  where a.variant_id = p_variant_id and a.is_active
    and (a.max_uses is null or a.used_count < a.max_uses)
  order by (a.max_uses is null) asc, a.priority asc, a.created_at asc
  limit 1 for update;
  if not found then raise exception 'no_stock'; end if;
  update public.shop_accounts set used_count = used_count + 1 where id = v_account_id;
  return v_account_id;
end;
$$;
create function public.shop_release_slot(p_account_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.shop_accounts set used_count = greatest(used_count - 1, 0) where id = p_account_id;
end;
$$;
revoke all on function public.shop_take_slot(uuid), public.shop_release_slot(uuid)
  from public, anon, authenticated;

drop function public.create_order(uuid, text, text, text);
create function public.create_order(
  p_variant_id uuid,
  p_buyer_name text,
  p_buyer_phone text,
  p_buyer_device text,
  p_buyer_city text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phone text := btrim(p_buyer_phone);
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
  if v_phone is null or char_length(v_phone) not between 9 and 13
    or v_phone !~ '^(08|62)[0-9]+$' then
    raise exception 'invalid_phone';
  end if;
  if left(v_phone, 1) = '0' then
    v_phone := '62' || substr(v_phone, 2);
  end if;
  if nullif(btrim(p_buyer_name), '') is null or char_length(btrim(p_buyer_name)) > 100 then
    raise exception 'invalid_buyer_name';
  end if;
  if nullif(btrim(p_buyer_device), '') is null or char_length(btrim(p_buyer_device)) > 200 then
    raise exception 'invalid_buyer_device';
  end if;

  if nullif(btrim(p_buyer_city), '') is null or char_length(btrim(p_buyer_city)) > 100 then
    raise exception 'invalid_buyer_city';
  end if;

  select v.price into v_price
  from public.shop_variants v
  join public.shop_products p on p.id = v.product_id
  where v.id = p_variant_id and v.is_active and p.is_active;
  if not found then
    raise exception 'invalid_variant';
  end if;

  v_account_id := public.shop_take_slot(p_variant_id);

  -- A collision rolls back only this insert; the account lock remains held.
  for v_attempt in 1..5 loop
    v_order_code := 'GR-';
    v_random := extensions.gen_random_bytes(5);
    for v_character in 0..4 loop
      v_order_code := v_order_code || substr(v_alphabet,
        1 + get_byte(v_random, v_character) % char_length(v_alphabet), 1);
    end loop;
    begin
      insert into public.shop_orders (
        order_code, token_hash, variant_id, account_id,
        buyer_name, buyer_phone, buyer_device, buyer_city, price, status, expires_at
      ) values (
        v_order_code, encode(extensions.digest(v_token, 'sha256'), 'hex'),
        p_variant_id, v_account_id, btrim(p_buyer_name), v_phone,
        btrim(p_buyer_device), btrim(p_buyer_city), v_price, 'draft', v_expires_at
      ) returning id into v_order_id;
      exit;
    exception when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint <> 'shop_orders_order_code_key' or v_attempt = 5 then
        raise;
      end if;
    end;
  end loop;

  insert into public.shop_audit_logs (order_id, actor, action, detail)
  values (v_order_id, 'system', 'order_created', jsonb_build_object(
    'order_code', v_order_code, 'variant_id', p_variant_id, 'account_id', v_account_id
  ));
  return jsonb_build_object(
    'order_id', v_order_id, 'order_code', v_order_code,
    'token', encode(v_token, 'hex'), 'expires_at', v_expires_at
  );
end;
$$;

create or replace function public.retry_payment(p_order_id uuid, p_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.shop_orders%rowtype;
  v_price int;
  v_account_id uuid;
  v_token bytea;
  v_expires_at timestamptz;
begin
  select o.* into v_order from public.shop_orders o
  where o.id = p_order_id and o.token_hash = p_token_hash
  for update;
  if not found then
    raise exception 'unauthorized';
  end if;
  if v_order.status <> 'rejected' then
    raise exception 'not_rejected';
  end if;

  select v.price into v_price from public.shop_variants v
  join public.shop_products p on p.id = v.product_id
  where v.id = v_order.variant_id and v.is_active and p.is_active;
  if not found then raise exception 'invalid_variant'; end if;
  v_account_id := public.shop_take_slot(v_order.variant_id);

  v_token := extensions.gen_random_bytes(32);
  v_expires_at := now() + interval '30 minutes';
  update public.shop_orders
  set status = 'draft', account_id = v_account_id, price = v_price,
    token_hash = encode(extensions.digest(v_token, 'sha256'), 'hex'),
    expires_at = v_expires_at, admin_note = null,
    proof_path = null, paid_at = null
  where id = p_order_id;
  insert into public.shop_audit_logs (order_id, actor, action)
  values (p_order_id, 'system', 'payment_retried');
  return jsonb_build_object(
    'order_id', p_order_id, 'order_code', v_order.order_code,
    'token', encode(v_token, 'hex'), 'expires_at', v_expires_at
  );
end;
$$;

create or replace function public.release_account(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.shop_orders%rowtype;
begin
  select o.* into v_order from public.shop_orders o
  where o.id = p_order_id for update;
  if not found then
    return;
  end if;
  if v_order.status = 'draft' and v_order.expires_at <= now() then
    update public.shop_orders set status = 'expired' where id = p_order_id;
    perform public.shop_release_slot(v_order.account_id);
    insert into public.shop_audit_logs (order_id, actor, action)
    values (p_order_id, 'system', 'order_expired');
  end if;
end;
$$;

create or replace function public.admin_reject_order(p_order_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.shop_orders%rowtype;
  v_reason text;
begin
  if not public.is_admin() then
    raise exception 'unauthorized';
  end if;
  v_reason := btrim(coalesce(p_reason, ''));
  if v_reason = '' then
    raise exception 'reason_required';
  end if;
  select o.* into v_order from public.shop_orders o where o.id = p_order_id for update;
  if not found or v_order.status <> 'waiting_verification' then
    raise exception 'invalid_status';
  end if;
  update public.shop_orders set status = 'rejected', admin_note = v_reason where id = p_order_id;
  perform public.shop_release_slot(v_order.account_id);
  insert into public.shop_audit_logs (order_id, actor, action, detail)
  values (p_order_id, 'admin', 'order_rejected',
    jsonb_build_object('order_id', p_order_id, 'reason', v_reason, 'admin_id', auth.uid()));
end;
$$;

create or replace function public.admin_verify_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.shop_orders%rowtype;
begin
  if not public.is_admin() then
    raise exception 'unauthorized';
  end if;
  select o.* into v_order from public.shop_orders o where o.id = p_order_id for update;
  if not found or v_order.status <> 'waiting_verification' then
    raise exception 'invalid_status';
  end if;
  update public.shop_orders set status = 'verified', verified_at = now(), verified_by = auth.uid() where id = p_order_id;
  insert into public.shop_audit_logs (order_id, actor, action, detail)
  values (p_order_id, 'admin', 'order_verified',
    jsonb_build_object('order_id', p_order_id, 'admin_id', auth.uid()));
end;
$$;

create or replace function public.get_order_status(p_order_id uuid, p_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  select jsonb_build_object(
    'status', o.status, 'order_code', o.order_code, 'buyer_name', o.buyer_name,
    'variant_id', o.variant_id, 'paid_at', o.paid_at, 'admin_note', o.admin_note,
    'expires_at', o.expires_at, 'access_expires_at', o.access_expires_at,
    'proof_path', o.proof_path, 'price', o.price
  ) into v_result
  from public.shop_orders o
  where o.id = p_order_id and o.token_hash = p_token_hash;
  if not found then
    raise exception 'unauthorized';
  end if;
  return v_result;
end;
$$;

drop function public.shop_admin_list_orders(text);
create function public.shop_admin_list_orders(p_status text)
returns table (
  order_id uuid, order_code text, buyer_name text, buyer_phone text,
  created_at timestamptz, paid_at timestamptz, status text, proof_path text,
  product_name text, account_type text, duration_days int, price int, buyer_city text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'unauthorized';
  end if;
  if p_status not in ('waiting_verification', 'verified', 'rejected') then
    raise exception 'invalid_status';
  end if;
  return query
  select o.id, o.order_code, o.buyer_name, o.buyer_phone,
    o.created_at, o.paid_at, o.status, o.proof_path,
    p.name, v.account_type, v.duration_days, o.price, o.buyer_city
  from public.shop_orders o
  left join public.shop_variants v on v.id = o.variant_id
  left join public.shop_products p on p.id = v.product_id
  where o.status = p_status
  order by o.created_at desc;
end;
$$;

create function public.shop_variant_stock()
returns table(variant_id uuid, in_stock boolean)
language sql security definer set search_path = '' as $$
  select v.id, exists (
    select 1 from public.shop_accounts a
    where a.variant_id = v.id and a.is_active
      and (a.max_uses is null or a.used_count < a.max_uses)
  ) from public.shop_variants v where v.is_active;
$$;
revoke all on function public.shop_variant_stock() from public, anon, authenticated;
grant execute on function public.shop_variant_stock() to anon, authenticated;
revoke all on function public.create_order(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.create_order(uuid, text, text, text, text) to anon, authenticated, service_role;
revoke all on function public.shop_admin_list_orders(text) from public, anon, authenticated;
grant execute on function public.shop_admin_list_orders(text) to authenticated;
commit;
