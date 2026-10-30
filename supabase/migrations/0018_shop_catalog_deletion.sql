-- Preserve historical order labels before removing catalog rows.
alter table public.shop_orders
  add column product_name_snapshot text,
  add column option_values_snapshot text[],
  add column account_type_snapshot text,
  add column duration_days_snapshot int;

create function public.shop_admin_delete_variant(p_variant_id uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare
  v_variant public.shop_variants%rowtype;
  v_product_name text;
  v_orders int;
begin
  if not public.is_admin() then raise exception 'unauthorized'; end if;
  select * into v_variant from public.shop_variants where id = p_variant_id for update;
  if not found then raise exception 'not_found'; end if;
  if exists (select 1 from public.shop_accounts where variant_id = p_variant_id) then
    raise exception 'account_exists';
  end if;
  if exists (select 1 from public.shop_orders where variant_id = p_variant_id
    and status not in ('expired', 'rejected') and account_revoked_at is null) then
    raise exception 'active_order';
  end if;
  select name into v_product_name from public.shop_products where id = v_variant.product_id;
  update public.shop_orders set
    product_name_snapshot = v_product_name,
    option_values_snapshot = v_variant.option_values,
    account_type_snapshot = v_variant.account_type,
    duration_days_snapshot = v_variant.duration_days,
    variant_id = null
  where variant_id = p_variant_id;
  get diagnostics v_orders = row_count;
  delete from public.shop_variants where id = p_variant_id;
  insert into public.shop_audit_logs(actor, action, detail)
    values ('admin', 'variant_deleted', jsonb_build_object(
      'variant_id', p_variant_id, 'product_id', v_variant.product_id,
      'detached_orders', v_orders, 'admin_id', auth.uid()));
  return v_orders;
end;
$$;

create function public.shop_admin_delete_product(p_product_id uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare
  v_product_name text;
  v_orders int;
begin
  if not public.is_admin() then raise exception 'unauthorized'; end if;
  select name into v_product_name from public.shop_products where id = p_product_id for update;
  if not found then raise exception 'not_found'; end if;
  perform 1 from public.shop_variants where product_id = p_product_id for update;
  if exists (select 1 from public.shop_accounts a join public.shop_variants v
    on v.id = a.variant_id where v.product_id = p_product_id) then
    raise exception 'account_exists';
  end if;
  if exists (select 1 from public.shop_orders o join public.shop_variants v
    on v.id = o.variant_id where v.product_id = p_product_id
    and o.status not in ('expired', 'rejected') and o.account_revoked_at is null) then
    raise exception 'active_order';
  end if;
  update public.shop_orders o set
    product_name_snapshot = v_product_name,
    option_values_snapshot = v.option_values,
    account_type_snapshot = v.account_type,
    duration_days_snapshot = v.duration_days,
    variant_id = null
  from public.shop_variants v
  where o.variant_id = v.id and v.product_id = p_product_id;
  get diagnostics v_orders = row_count;
  delete from public.shop_products where id = p_product_id;
  insert into public.shop_audit_logs(actor, action, detail)
    values ('admin', 'product_deleted', jsonb_build_object(
      'product_id', p_product_id, 'detached_orders', v_orders, 'admin_id', auth.uid()));
  return v_orders;
end;
$$;

revoke all on function public.shop_admin_delete_variant(uuid),
  public.shop_admin_delete_product(uuid) from public, anon, authenticated;
grant execute on function public.shop_admin_delete_variant(uuid),
  public.shop_admin_delete_product(uuid) to authenticated;

create or replace function public.shop_admin_list_orders(p_status text)
returns table (order_id uuid, order_code text, buyer_name text, buyer_phone text,
  created_at timestamptz, paid_at timestamptz, status text, proof_path text,
  product_name text, account_type text, duration_days int, option_values text[], price int,
  buyer_city text, method_name text)
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'unauthorized'; end if;
  if p_status not in ('waiting_verification', 'verified', 'rejected') then
    raise exception 'invalid_status';
  end if;
  return query select o.id, o.order_code, o.buyer_name, o.buyer_phone,
    o.created_at, o.paid_at, o.status, o.proof_path,
    coalesce(p.name, o.product_name_snapshot),
    coalesce(v.account_type, o.account_type_snapshot),
    coalesce(v.duration_days, o.duration_days_snapshot),
    coalesce(v.option_values, o.option_values_snapshot),
    o.price, o.buyer_city, o.method_name
  from public.shop_orders o
  left join public.shop_variants v on v.id = o.variant_id
  left join public.shop_products p on p.id = v.product_id
  where o.status = p_status order by o.created_at desc;
end;
$$;
