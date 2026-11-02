create function public.shop_admin_list_feedback(p_limit int, p_offset int)
returns table (id uuid, buyer_name text, account_email text, submitted_at timestamptz,
  rating text, comment text, total_count bigint)
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'unauthorized'; end if;
  return query select l.id, o.buyer_name, a.email, l.created_at,
    l.detail ->> 'rating', l.detail ->> 'comment', count(*) over ()
  from public.shop_audit_logs l
  join public.shop_orders o on o.id = l.order_id and o.delivery_link
  left join public.shop_accounts a on a.id = o.account_id
  where l.action = 'delivery_feedback_submitted'
  order by l.created_at desc, l.id desc
  limit least(greatest(coalesce(p_limit, 50), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke all on function public.shop_admin_list_feedback(int, int) from public, anon, authenticated;
grant execute on function public.shop_admin_list_feedback(int, int) to authenticated;
