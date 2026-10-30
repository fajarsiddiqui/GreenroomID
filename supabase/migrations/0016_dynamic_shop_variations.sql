-- Names and choices shown to buyers are independent of the account access settings.
alter table public.shop_products
  add column variation_axes jsonb not null default '[]'::jsonb;

alter table public.shop_variants
  add column option_values text[] not null default array[]::text[];

update public.shop_products
set variation_axes = '[{"name":"Jenis akun","options":["Sharing","Private"]},{"name":"Masa aktif","options":["1 hari","3 hari","7 hari","14 hari","30 hari"]}]'::jsonb;

update public.shop_variants
set option_values = array[
  case account_type when 'private' then 'Private' else 'Sharing' end,
  duration_days::text || ' hari'
];

alter table public.shop_variants
  drop constraint shop_variants_product_id_account_type_duration_days_key;

create unique index shop_variants_product_options_key
  on public.shop_variants (product_id, option_values);

alter table public.shop_products add constraint shop_variation_axes_valid check (
  jsonb_typeof(variation_axes) = 'array'
  and jsonb_array_length(variation_axes) between 0 and 2
);

alter table public.shop_variants add constraint shop_option_values_valid check (
  cardinality(option_values) between 1 and 2
  and array_position(option_values, null) is null
);

drop function public.shop_admin_list_orders(text);
create function public.shop_admin_list_orders(p_status text)
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
    p.name, v.account_type, v.duration_days, v.option_values, o.price, o.buyer_city, o.method_name
  from public.shop_orders o
  left join public.shop_variants v on v.id = o.variant_id
  left join public.shop_products p on p.id = v.product_id
  where o.status = p_status order by o.created_at desc;
end;
$$;
revoke all on function public.shop_admin_list_orders(text) from public, anon, authenticated;
grant execute on function public.shop_admin_list_orders(text) to authenticated;
