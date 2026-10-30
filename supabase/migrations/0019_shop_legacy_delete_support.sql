-- Existing admin UI issues direct DELETEs. Preserve terminal order history
-- before the foreign key checks run, including deletes cascaded from products.
create function public.shop_snapshot_product_on_delete()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'unauthorized'; end if;
  update public.shop_orders o set product_name_snapshot = old.name
  from public.shop_variants v
  where o.variant_id = v.id and v.product_id = old.id;
  return old;
end;
$$;
create trigger shop_snapshot_product_on_delete before delete on public.shop_products
  for each row execute function public.shop_snapshot_product_on_delete();
revoke execute on function public.shop_snapshot_product_on_delete() from public, anon, authenticated;

create function public.shop_detach_variant_on_delete()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_product_name text;
begin
  if not public.is_admin() then raise exception 'unauthorized'; end if;
  if exists (select 1 from public.shop_accounts where variant_id = old.id) then
    raise exception 'account_exists';
  end if;
  if exists (select 1 from public.shop_orders where variant_id = old.id
    and status not in ('expired', 'rejected') and account_revoked_at is null) then
    raise exception 'active_order';
  end if;
  select name into v_product_name from public.shop_products where id = old.product_id;
  update public.shop_orders set
    product_name_snapshot = coalesce(v_product_name, product_name_snapshot),
    option_values_snapshot = old.option_values,
    account_type_snapshot = old.account_type,
    duration_days_snapshot = old.duration_days,
    variant_id = null
  where variant_id = old.id;
  return old;
end;
$$;
create trigger shop_detach_variant_on_delete before delete on public.shop_variants
  for each row execute function public.shop_detach_variant_on_delete();
revoke execute on function public.shop_detach_variant_on_delete() from public, anon, authenticated;
