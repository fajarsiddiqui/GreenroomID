-- This Shop Supabase project contains admin Auth users only; public sign-up is disabled.
grant select on public.orders, public.variants, public.products to authenticated;
create policy shop_admin_orders_select on public.orders
  for select to authenticated using (true);
create policy shop_admin_variants_select on public.variants
  for select to authenticated using (true);
create policy shop_admin_products_select on public.products
  for select to authenticated using (true);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'orders'
  ) then
    alter publication supabase_realtime add table public.orders;
  end if;
end;
$$;

create function public.admin_verify_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
begin
  if (select auth.role()) <> 'authenticated' or (select auth.uid()) is null then
    raise exception 'unauthorized';
  end if;
  select o.* into v_order from public.orders o where o.id = p_order_id for update;
  if not found or v_order.status <> 'waiting_verification' then
    raise exception 'invalid_status';
  end if;
  update public.orders set status = 'verified' where id = p_order_id;
  insert into public.audit_logs (order_id, actor, action, detail)
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
  v_order public.orders%rowtype;
  v_reason text;
begin
  if (select auth.role()) <> 'authenticated' or (select auth.uid()) is null then
    raise exception 'unauthorized';
  end if;
  v_reason := btrim(coalesce(p_reason, ''));
  if v_reason = '' then
    raise exception 'reason_required';
  end if;
  select o.* into v_order from public.orders o where o.id = p_order_id for update;
  if not found or v_order.status <> 'waiting_verification' then
    raise exception 'invalid_status';
  end if;
  update public.orders set status = 'rejected', admin_note = v_reason where id = p_order_id;
  update public.accounts set is_available = true where id = v_order.account_id;
  insert into public.audit_logs (order_id, actor, action, detail)
  values (p_order_id, 'admin', 'order_rejected',
    jsonb_build_object('order_id', p_order_id, 'reason', v_reason, 'admin_id', auth.uid()));
end;
$$;

revoke all on function public.admin_verify_order(uuid), public.admin_reject_order(uuid, text)
  from public, anon, authenticated;
grant execute on function public.admin_verify_order(uuid), public.admin_reject_order(uuid)
  to authenticated;
