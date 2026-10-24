-- Owner/test runner only, AFTER 0012. Creates temporary fixtures and rolls back
-- every database change. Does not upload files or invoke deployed Edge Functions.
begin;

do $$
declare
  v_product uuid;
  v_variant uuid;
  v_account uuid;
  v_method uuid;
  v_order jsonb;
  v_first jsonb;
  v_hash text;
  v_phone text;
  v_phone_base bigint := 8100000000 + floor(random() * 800000000)::bigint;
  v_index int;
begin
  -- Fixed documentation-only addresses; refuse to interfere with another run.
  if exists (select 1 from public.shop_orders where ip_hash in (
    encode(extensions.digest('203.0.113.9', 'sha256'), 'hex'),
    encode(extensions.digest('203.0.113.10', 'sha256'), 'hex'),
    encode(extensions.digest('203.0.113.11', 'sha256'), 'hex'),
    encode(extensions.digest('203.0.113.12', 'sha256'), 'hex'),
    encode(extensions.digest('203.0.113.13', 'sha256'), 'hex'),
    encode(extensions.digest('203.0.113.14', 'sha256'), 'hex')))
    or exists (select 1 from public.shop_rate_limits where key in (
      'ip:' || encode(extensions.digest('203.0.113.9', 'sha256'), 'hex'),
      'ip:' || encode(extensions.digest('203.0.113.10', 'sha256'), 'hex'),
      'ip:' || encode(extensions.digest('203.0.113.11', 'sha256'), 'hex'),
      'ip:' || encode(extensions.digest('203.0.113.12', 'sha256'), 'hex'),
      'ip:' || encode(extensions.digest('203.0.113.13', 'sha256'), 'hex'),
      'ip:' || encode(extensions.digest('203.0.113.14', 'sha256'), 'hex'))) then
    raise exception 'Fixture address already used: run in an isolated test project';
  end if;
  insert into public.shop_products(name) values ('Abuse tests rollback only') returning id into v_product;
  insert into public.shop_variants(product_id, account_type, duration_days, price)
    values (v_product, 'sharing', 1, 1000) returning id into v_variant;
  insert into public.shop_accounts(variant_id, email, password_enc, max_uses)
    values (v_variant, 'fixture@example.invalid', 'TEST_ONLY_INVALID_CIPHERTEXT', null) returning id into v_account;
  insert into public.shop_payment_methods(name, kind, account_number, account_name)
    values ('Abuse test bank', 'bank', '123456789', 'Fixture') returning id into v_method;

  perform set_config('request.headers', '{"cf-connecting-ip":"203.0.113.9"}', true);
  for v_index in 1..6 loop
    v_phone := '0' || (v_phone_base + v_index)::text;
    v_order := public.create_order(v_variant, 'Fixture', v_phone, 'HP', 'Fixture');
    v_hash := encode(extensions.digest(decode(v_order->>'token', 'hex'), 'sha256'), 'hex');
    perform public.shop_record_proof_upload((v_order->>'order_id')::uuid, v_hash,
      (v_order->>'order_id') || '/fixture.png', v_method);
    if (select status is distinct from 'waiting_verification' or proof_path is null or method_id is distinct from v_method
      or method_name is distinct from 'Abuse test bank' or paid_at is null from public.shop_orders
      where id = (v_order->>'order_id')::uuid) then raise exception 'Proof transition failed'; end if;
    if v_index = 1 then v_first := v_order; end if;
  end loop;
  begin
    perform public.create_order(v_variant, 'Fixture', '0' || (v_phone_base + 7)::text, 'HP', 'Fixture');
    raise exception 'FAIL seventh IP call was accepted';
  exception when raise_exception then if sqlerrm <> 'rate_limited_ip' then raise; end if; end;
  raise notice 'PASS seventh creation from one IP is rate_limited_ip';
  if (select ip_hash is distinct from encode(extensions.digest('203.0.113.9', 'sha256'), 'hex')
    from public.shop_orders where id = (v_first->>'order_id')::uuid) then raise exception 'IP hash not stored'; end if;
  raise notice 'PASS only hashed IP is stored';

  begin
    perform public.shop_record_proof_upload((v_first->>'order_id')::uuid,
      encode(extensions.digest(decode(v_first->>'token', 'hex'), 'sha256'), 'hex'),
      (v_first->>'order_id') || '/second.png', v_method);
    raise exception 'FAIL second proof was accepted';
  exception when raise_exception then if sqlerrm <> 'invalid_status' then raise; end if; end;
  if (select count(*) from public.shop_audit_logs where order_id = (v_first->>'order_id')::uuid
    and action = 'proof_uploaded') <> 1 then raise exception 'Duplicate proof audit'; end if;
  raise notice 'PASS proof transition and audit happen exactly once';

  update public.shop_orders set status = 'rejected' where id = (v_first->>'order_id')::uuid;
  perform public.shop_release_slot(v_account);
  begin
    perform public.retry_payment((v_first->>'order_id')::uuid,
      encode(extensions.digest(decode(v_first->>'token', 'hex'), 'sha256'), 'hex'));
    raise exception 'FAIL retry did not share IP quota';
  exception when raise_exception then if sqlerrm <> 'rate_limited_ip' then raise; end if; end;
  raise notice 'PASS retry shares creation IP quota';

  perform set_config('request.headers', '{"cf-connecting-ip":"203.0.113.10"}', true);
  v_phone := '0' || (v_phone_base + 10)::text;
  perform public.create_order(v_variant, 'Fixture', v_phone, 'HP', 'Fixture');
  perform public.create_order(v_variant, 'Fixture', '62' || substr(v_phone, 2), 'HP', 'Fixture');
  perform set_config('request.headers', '{"cf-connecting-ip":"203.0.113.11"}', true);
  begin
    perform public.create_order(v_variant, 'Fixture', v_phone, 'HP', 'Fixture');
    raise exception 'FAIL third phone draft was accepted';
  exception when raise_exception then if sqlerrm <> 'rate_limited_drafts' then raise; end if; end;
  raise notice 'PASS normalized phone cannot hold a third draft across IPs';
  v_order := public.create_order(v_variant, 'Fixture', '0' || (v_phone_base + 11)::text, 'HP', 'Fixture');
  raise notice 'PASS a different IP and phone remain unaffected';
  update public.shop_orders set expires_at = now() - interval '1 second' where id = (v_order->>'order_id')::uuid;
  begin
    perform public.shop_record_proof_upload((v_order->>'order_id')::uuid,
      encode(extensions.digest(decode(v_order->>'token', 'hex'), 'sha256'), 'hex'),
      (v_order->>'order_id') || '/expired.png', v_method);
    raise exception 'FAIL expired proof was accepted';
  exception when raise_exception then if sqlerrm <> 'order_expired' then raise; end if; end;
  raise notice 'PASS expired draft rejects proof';

  perform set_config('request.headers', '{"x-forwarded-for":"198.51.100.1, 203.0.113.12"}', true);
  for v_index in 20..23 loop
    perform public.create_order(v_variant, 'Fixture', '0' || (v_phone_base + v_index)::text, 'HP', 'Fixture');
  end loop;
  begin
    perform public.create_order(v_variant, 'Fixture', '0' || (v_phone_base + 24)::text, 'HP', 'Fixture');
    raise exception 'FAIL fifth IP draft was accepted';
  exception when raise_exception then if sqlerrm <> 'rate_limited_drafts' then raise; end if; end;
  if (select count(*) from public.shop_orders where ip_hash = encode(extensions.digest('203.0.113.12', 'sha256'), 'hex')) <> 4 then
    raise exception 'Last forwarded IP was not used'; end if;
  raise notice 'PASS four active drafts per IP and last forwarded address';

  for v_index in 1..10 loop
    perform set_config('request.headers', case when v_index <= 5 then '{"cf-connecting-ip":"203.0.113.13"}' else '{"cf-connecting-ip":"203.0.113.14"}' end, true);
    v_order := public.create_order(v_variant, 'Fixture', '0' || (v_phone_base + 30)::text, 'HP', 'Fixture');
    perform public.shop_record_proof_upload((v_order->>'order_id')::uuid,
      encode(extensions.digest(decode(v_order->>'token', 'hex'), 'sha256'), 'hex'),
      (v_order->>'order_id') || '/fixture.png', v_method);
  end loop;
  begin
    perform public.create_order(v_variant, 'Fixture', '0' || (v_phone_base + 30)::text, 'HP', 'Fixture');
    raise exception 'FAIL eleventh phone order was accepted';
  exception when raise_exception then if sqlerrm <> 'rate_limited_phone_daily' then raise; end if; end;
  raise notice 'PASS ten orders per phone per day across IPs';
end;
$$;
rollback;
