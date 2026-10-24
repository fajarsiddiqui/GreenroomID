begin;
alter table public.shop_payment_methods add column kind text not null default 'bank'
  check (kind in ('bank', 'ewallet', 'qris'));
alter table public.shop_payment_methods add column qris_image_path text;
alter table public.shop_payment_methods alter column account_number drop not null;
alter table public.shop_payment_methods add constraint shop_payment_methods_details_check
  check ((kind = 'qris' and qris_image_path is not null) or
    (kind <> 'qris' and account_number is not null and length(trim(account_number)) > 0));
alter table public.shop_orders add column method_id uuid references public.shop_payment_methods(id);
alter table public.shop_orders add column method_name text;

drop function public.submit_payment(uuid, text, timestamptz);
create function public.submit_payment(p_order_id uuid, p_token_hash text,
  p_paid_at timestamptz, p_method_id uuid) returns void language plpgsql
security definer set search_path = '' as $$
declare
  v_order public.shop_orders%rowtype;
  v_method_name text;
begin
  select o.* into v_order from public.shop_orders o
  where o.id = p_order_id and o.token_hash = p_token_hash for update;
  if not found then raise exception 'unauthorized'; end if;
  if v_order.status <> 'draft' or v_order.expires_at <= now() then
    raise exception 'order_expired';
  end if;
  if p_paid_at is null then raise exception 'invalid_paid_at'; end if;
  select m.name into v_method_name from public.shop_payment_methods m
    where m.id = p_method_id and m.is_active;
  if not found then raise exception 'invalid_method'; end if;
  update public.shop_orders set status = 'waiting_verification', paid_at = p_paid_at,
    method_id = p_method_id, method_name = v_method_name where id = p_order_id;
  insert into public.shop_audit_logs (order_id, actor, action, detail)
    values (p_order_id, 'system', 'payment_submitted', jsonb_build_object('method_name', v_method_name));
end;
$$;
revoke all on function public.submit_payment(uuid, text, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.submit_payment(uuid, text, timestamptz, uuid) to anon, authenticated, service_role;

drop function public.shop_admin_list_orders(text);
create function public.shop_admin_list_orders(p_status text)
returns table (order_id uuid, order_code text, buyer_name text, buyer_phone text,
  created_at timestamptz, paid_at timestamptz, status text, proof_path text,
  product_name text, account_type text, duration_days int, price int,
  buyer_city text, method_name text)
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'unauthorized'; end if;
  if p_status not in ('waiting_verification', 'verified', 'rejected') then
    raise exception 'invalid_status';
  end if;
  return query select o.id, o.order_code, o.buyer_name, o.buyer_phone,
    o.created_at, o.paid_at, o.status, o.proof_path,
    p.name, v.account_type, v.duration_days, o.price, o.buyer_city, o.method_name
  from public.shop_orders o
  left join public.shop_variants v on v.id = o.variant_id
  left join public.shop_products p on p.id = v.product_id
  where o.status = p_status order by o.created_at desc;
end;
$$;
revoke all on function public.shop_admin_list_orders(text) from public, anon, authenticated;
grant execute on function public.shop_admin_list_orders(text) to authenticated;
commit;
