create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

create function public.create_order(
  p_variant_id uuid,
  p_buyer_name text,
  p_buyer_phone text,
  p_buyer_device text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phone text := btrim(p_buyer_phone);
  v_product_id uuid;
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

  select v.product_id into v_product_id
  from public.variants v
  join public.products p on p.id = v.product_id
  where v.id = p_variant_id and v.is_active and p.is_active;
  if not found then
    raise exception 'invalid_variant';
  end if;

  select a.id into v_account_id
  from public.accounts a
  where a.product_id = v_product_id and a.is_available
  order by a.is_unlimited asc, a.priority asc, a.created_at asc
  limit 1 for update skip locked;
  if not found then
    raise exception 'no_stock';
  end if;
  update public.accounts set is_available = false where id = v_account_id;

  -- A collision rolls back only this insert; the account lock remains held.
  for v_attempt in 1..5 loop
    v_order_code := 'GR-';
    v_random := extensions.gen_random_bytes(5);
    for v_character in 0..4 loop
      v_order_code := v_order_code || substr(v_alphabet,
        1 + get_byte(v_random, v_character) % char_length(v_alphabet), 1);
    end loop;
    begin
      insert into public.orders (
        order_code, token_hash, variant_id, account_id,
        buyer_name, buyer_phone, buyer_device, status, expires_at
      ) values (
        v_order_code, encode(extensions.digest(v_token, 'sha256'), 'hex'),
        p_variant_id, v_account_id, btrim(p_buyer_name), v_phone,
        btrim(p_buyer_device), 'draft', v_expires_at
      ) returning id into v_order_id;
      exit;
    exception when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint <> 'orders_order_code_key' or v_attempt = 5 then
        raise;
      end if;
    end;
  end loop;

  insert into public.audit_logs (order_id, actor, action, detail)
  values (v_order_id, 'system', 'order_created', jsonb_build_object(
    'order_code', v_order_code, 'variant_id', p_variant_id, 'account_id', v_account_id
  ));
  return jsonb_build_object(
    'order_id', v_order_id, 'order_code', v_order_code,
    'token', encode(v_token, 'hex'), 'expires_at', v_expires_at
  );
end;
$$;

-- Callers hash the decoded 32 token bytes, rather than the token's hex text.
create function public.get_order_status(p_order_id uuid, p_token_hash text)
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
    'expires_at', o.expires_at, 'access_expires_at', o.access_expires_at
  ) into v_result
  from public.orders o
  where o.id = p_order_id and o.token_hash = p_token_hash;
  if not found then
    raise exception 'unauthorized';
  end if;
  return v_result;
end;
$$;

create function public.submit_payment(
  p_order_id uuid, p_token_hash text, p_paid_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
begin
  select o.* into v_order from public.orders o
  where o.id = p_order_id and o.token_hash = p_token_hash
  for update;
  if not found then
    raise exception 'unauthorized';
  end if;
  if v_order.status <> 'draft' or v_order.expires_at <= now() then
    raise exception 'order_expired';
  end if;
  if p_paid_at is null then
    raise exception 'invalid_paid_at';
  end if;

  update public.orders
  set status = 'waiting_verification', paid_at = p_paid_at
  where id = p_order_id;
  insert into public.audit_logs (order_id, actor, action)
  values (p_order_id, 'system', 'payment_submitted');
end;
$$;

create function public.retry_payment(p_order_id uuid, p_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_product_id uuid;
  v_account_id uuid;
  v_token bytea;
  v_expires_at timestamptz;
begin
  select o.* into v_order from public.orders o
  where o.id = p_order_id and o.token_hash = p_token_hash
  for update;
  if not found then
    raise exception 'unauthorized';
  end if;
  if v_order.status <> 'rejected' then
    raise exception 'not_rejected';
  end if;

  select v.product_id into v_product_id
  from public.variants v where v.id = v_order.variant_id;
  select a.id into v_account_id
  from public.accounts a
  where a.product_id = v_product_id and a.is_available
  order by a.is_unlimited asc, a.priority asc, a.created_at asc
  limit 1 for update skip locked;
  if not found then
    raise exception 'no_stock';
  end if;
  update public.accounts set is_available = false where id = v_account_id;

  v_token := extensions.gen_random_bytes(32);
  v_expires_at := now() + interval '30 minutes';
  update public.orders
  set status = 'draft', account_id = v_account_id,
    token_hash = encode(extensions.digest(v_token, 'sha256'), 'hex'),
    expires_at = v_expires_at, admin_note = null
  where id = p_order_id;
  insert into public.audit_logs (order_id, actor, action)
  values (p_order_id, 'system', 'payment_retried');
  return jsonb_build_object(
    'order_id', p_order_id, 'order_code', v_order.order_code,
    'token', encode(v_token, 'hex'), 'expires_at', v_expires_at
  );
end;
$$;

create function public.release_account(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
begin
  select o.* into v_order from public.orders o
  where o.id = p_order_id for update;
  if not found then
    return;
  end if;
  if v_order.status = 'draft' and v_order.expires_at <= now() then
    update public.orders set status = 'expired' where id = p_order_id;
    update public.accounts set is_available = true where id = v_order.account_id;
    insert into public.audit_logs (order_id, actor, action)
    values (p_order_id, 'system', 'order_expired');
  end if;
end;
$$;

-- Functions default to PUBLIC EXECUTE in Postgres; remove that implicit access.
revoke all on function public.create_order(uuid, text, text, text),
  public.get_order_status(uuid, text), public.submit_payment(uuid, text, timestamptz),
  public.retry_payment(uuid, text), public.release_account(uuid)
  from public, anon, authenticated;
grant execute on function public.create_order(uuid, text, text, text),
  public.get_order_status(uuid, text), public.submit_payment(uuid, text, timestamptz),
  public.retry_payment(uuid, text) to anon, service_role;
grant execute on function public.release_account(uuid) to service_role;

select cron.schedule(
  'expire-draft-orders', '* * * * *',
  $cron$
    select public.release_account(id)
    from public.orders
    where status = 'draft' and expires_at <= now();
  $cron$
);
