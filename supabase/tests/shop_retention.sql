-- Run only on an isolated/staging project after 0014. This transaction rolls
-- back fixture rows, anonymization changes, and the audit entry.
begin;

do $$
declare
  v_old uuid;
  v_recent uuid;
  v_waiting uuid;
  v_inserted uuid;
  v_code text;
  v_index int;
begin
  for v_index in 1..3 loop
    v_code := 'GR-' || translate(upper(substr(md5(gen_random_uuid()::text), 1, 5)), '01', '23');
    insert into public.shop_orders(order_code, token_hash, buyer_name,
      buyer_phone, buyer_device, buyer_city, price, status,
      created_at, updated_at, verified_at)
    values (v_code, repeat('0', 64), 'Fixture', '628123456789',
      'HP', 'Fixture', 10000,
      case when v_index = 3 then 'waiting_verification' else 'verified' end,
      now() - interval '100 days',
      case when v_index = 3 then now() - interval '95 days' else now() end,
      case when v_index = 1 then now() - interval '95 days'
        when v_index = 2 then now() - interval '5 days' else null end)
    returning id into v_inserted;
    if v_index = 1 then v_old := v_inserted; end if;
    if v_index = 2 then v_recent := v_inserted; end if;
    if v_index = 3 then v_waiting := v_inserted; end if;
  end loop;

  perform public.shop_retention_anonymize();

  if not exists (select 1 from public.shop_orders where id = v_old
    and buyer_name is null and buyer_phone is null and buyer_city is null
    and anonymized_at is not null) then
    raise exception 'Old verified order was not anonymized';
  end if;
  if exists (select 1 from public.shop_orders where id in (v_recent, v_waiting)
    and (buyer_name is null or buyer_phone is null or buyer_city is null
      or anonymized_at is not null)) then
    raise exception 'Recent or waiting order changed';
  end if;
  if not exists (select 1 from public.shop_audit_logs
    where action = 'retention_anonymized' and (detail->>'orders')::int >= 1) then
    raise exception 'Retention audit count missing';
  end if;
  raise notice 'PASS: old verified anonymized; recent and waiting untouched';
end;
$$;

rollback;
