create function public.admin_verify_order(p_order_id uuid)
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
  update public.shop_orders set status = 'verified' where id = p_order_id;
  insert into public.shop_audit_logs (order_id, actor, action, detail)
  values (p_order_id, 'admin', 'order_verified',
    jsonb_build_object('order_id', p_order_id, 'admin_id', auth.uid()));
end;
$$;

create function public.admin_reject_order(p_order_id uuid, p_reason text)
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
  update public.shop_accounts set is_available = true where id = v_order.account_id;
  insert into public.shop_audit_logs (order_id, actor, action, detail)
  values (p_order_id, 'admin', 'order_rejected',
    jsonb_build_object('order_id', p_order_id, 'reason', v_reason, 'admin_id', auth.uid()));
end;
$$;

create function public.shop_admin_list_orders(p_status text)
returns table (
  order_id uuid, order_code text, buyer_name text, buyer_phone text,
  created_at timestamptz, paid_at timestamptz, status text, proof_path text,
  product_name text, account_type text, duration_days int, price int
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
    p.name, v.account_type, v.duration_days, v.price
  from public.shop_orders o
  left join public.shop_variants v on v.id = o.variant_id
  left join public.shop_products p on p.id = v.product_id
  where o.status = p_status
  order by o.created_at desc;
end;
$$;

revoke all on function public.admin_verify_order(uuid), public.admin_reject_order(uuid, text),
  public.shop_admin_list_orders(text)
  from public, anon, authenticated;
grant execute on function public.admin_verify_order(uuid), public.admin_reject_order(uuid, text),
  public.shop_admin_list_orders(text)
  to authenticated;
