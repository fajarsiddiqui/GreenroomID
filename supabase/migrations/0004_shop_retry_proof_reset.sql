-- A rejected payment starts a fresh attempt with a new token and no old proof.
create or replace function public.retry_payment(p_order_id uuid, p_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.shop_orders%rowtype;
  v_product_id uuid;
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

  select v.product_id into v_product_id
  from public.shop_variants v where v.id = v_order.variant_id;
  select a.id into v_account_id
  from public.shop_accounts a
  where a.product_id = v_product_id and a.is_available
  order by a.is_unlimited asc, a.priority asc, a.created_at asc
  limit 1 for update skip locked;
  if not found then
    raise exception 'no_stock';
  end if;
  update public.shop_accounts set is_available = false where id = v_account_id;

  v_token := extensions.gen_random_bytes(32);
  v_expires_at := now() + interval '30 minutes';
  update public.shop_orders
  set status = 'draft', account_id = v_account_id,
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
