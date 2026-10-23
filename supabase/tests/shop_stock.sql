begin;
do $$
declare
  product_id uuid; variant_id uuid; empty_variant_id uuid; other_variant_id uuid;
  account_a uuid; account_b uuid; other_account uuid;
  order_one jsonb; order_two jsonb; order_three jsonb;
begin
  insert into public.shop_products(name) values ('Stock test') returning id into product_id;
  insert into public.shop_variants(product_id, account_type, duration_days, price)
    values (product_id, 'sharing', 30, 100) returning id into variant_id;
  insert into public.shop_variants(product_id, account_type, duration_days, price)
    values (product_id, 'private', 30, 200) returning id into empty_variant_id;
  insert into public.shop_variants(product_id, account_type, duration_days, price)
    values (product_id, 'sharing', 7, 50) returning id into other_variant_id;
  insert into public.shop_accounts(variant_id, email, password_enc, max_uses, priority)
    values (variant_id, 'A', 'PLACEHOLDER', 1, 10) returning id into account_a;
  insert into public.shop_accounts(variant_id, email, password_enc, max_uses, priority)
    values (variant_id, 'B', 'PLACEHOLDER', null, 1) returning id into account_b;
  insert into public.shop_accounts(variant_id, email, password_enc, max_uses)
    values (other_variant_id, 'Other', 'PLACEHOLDER', 5) returning id into other_account;
  order_one := public.create_order(variant_id, 'Test', '08123456789', 'HP', 'Test City');
  order_two := public.create_order(variant_id, 'Test', '08123456789', 'HP', 'Test City');
  if (select account_id from public.shop_orders where id = (order_one->>'order_id')::uuid) <> account_a
    or (select account_id from public.shop_orders where id = (order_two->>'order_id')::uuid) <> account_b then
    raise exception 'Limited-before-unlimited allocation failed';
  end if;
  raise notice 'PASS limited A then unlimited B despite lower B priority';
  begin
    perform public.create_order(empty_variant_id, 'Test', '08123456789', 'HP', 'Test City');
    raise exception 'Expected no_stock';
  exception when raise_exception then
    if sqlerrm <> 'no_stock' then raise; end if;
  end;
  if (select used_count from public.shop_accounts where id = other_account) <> 0 then
    raise exception 'Another variant was consumed';
  end if;
  raise notice 'PASS no_stock and no fallback to another variant';
  -- Simulate rejection with the private helper: admin RPC requires a real is_admin() session.
  update public.shop_orders set status = 'rejected' where id = (order_one->>'order_id')::uuid;
  perform public.shop_release_slot(account_a);
  order_three := public.create_order(variant_id, 'Test', '08123456789', 'HP', 'Test City');
  if (select account_id from public.shop_orders where id = (order_three->>'order_id')::uuid) <> account_a then
    raise exception 'Released A was not reused';
  end if;
  raise notice 'PASS rejection release makes limited A reusable';
  begin
    update public.shop_accounts set used_count = 2 where id = account_a;
    raise exception 'Expected upper stock constraint';
  exception when check_violation then null;
  end;
  begin
    update public.shop_accounts set used_count = -1 where id = account_a;
    raise exception 'Expected lower stock constraint';
  exception when check_violation then null;
  end;
  perform public.shop_release_slot(account_a);
  perform public.shop_release_slot(account_a);
  if (select used_count from public.shop_accounts where id = account_a) <> 0 then
    raise exception 'Release went negative';
  end if;
  raise notice 'PASS used_count constrained to zero through max_uses';
end;
$$;
rollback;
