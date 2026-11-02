create function public.shop_admin_delivery_usage()
returns table (account_id uuid, links_created bigint, links_opened bigint)
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'unauthorized'; end if;
  return query select a.id, count(o.id), count(o.credentials_viewed_at)
  from public.shop_accounts a left join public.shop_orders o
    on o.account_id = a.id and o.delivery_link
  group by a.id;
end;
$$;

create function public.shop_admin_totp_log(p_limit int, p_offset int)
returns table (id uuid, order_code text, account_email text, buyer_name text,
  buyer_phone text, buyer_device text, buyer_city text, taken_at timestamptz,
  total_count bigint)
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'unauthorized'; end if;
  return query select l.id, o.order_code, a.email, o.buyer_name,
    o.buyer_phone, o.buyer_device, o.buyer_city, l.created_at,
    count(*) over ()
  from public.shop_audit_logs l
  join public.shop_orders o on o.id = l.order_id and o.delivery_link
  left join public.shop_accounts a on a.id = o.account_id
  where l.action = 'totp_code_delivered'
  order by l.created_at desc, l.id desc
  limit least(greatest(coalesce(p_limit, 50), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke all on function public.shop_admin_delivery_usage(),
  public.shop_admin_totp_log(int, int) from public, anon, authenticated;
grant execute on function public.shop_admin_delivery_usage(),
  public.shop_admin_totp_log(int, int) to authenticated;
