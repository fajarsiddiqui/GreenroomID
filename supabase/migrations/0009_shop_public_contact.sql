create function public.shop_public_contact()
returns table (admin_name text, whatsapp text)
language sql stable security definer set search_path = public as $$
  with contact as (
    select p.admin_name, regexp_replace(coalesce(p.admin_phone, ''), '[^0-9]', '', 'g') as digits
    from public.admin_payment_settings p where p.id = 'default'
  )
  select c.admin_name,
    nullif(case when left(c.digits, 1) = '0' then '62' || substr(c.digits, 2) else c.digits end, '')
  from contact c;
$$;
revoke all on function public.shop_public_contact() from public;
grant execute on function public.shop_public_contact() to anon, authenticated;
