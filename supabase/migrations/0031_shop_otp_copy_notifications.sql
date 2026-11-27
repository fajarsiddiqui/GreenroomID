create unique index shop_otp_copy_event_idx on public.shop_audit_logs
  ((detail->>'copy_event_id')) where action = 'otp_copy_reported';

create index shop_otp_reissue_delivered_window_idx on public.shop_audit_logs
  ((detail->>'reissue_id'), (detail->>'window_start_ms')) where action = 'otp_reissue_code_delivered';

create function public.shop_record_otp_copy(
  p_source text, p_id uuid, p_token_hash text, p_access_hash text,
  p_window_start_ms bigint, p_copy_event_id uuid
) returns jsonb language plpgsql set search_path = '' as $$
declare
  v_received_at timestamptz := statement_timestamp();
  v_received_ms bigint := floor(extract(epoch from v_received_at) * 1000)::bigint;
  v_order_id uuid;
  v_buyer_name text;
  v_account_email text;
  v_recorded_id uuid;
begin
  -- Allow a short transport delay after the 30-second code window closes.
  if p_window_start_ms is null or p_copy_event_id is null or p_token_hash is null
    or p_window_start_ms > v_received_ms or p_window_start_ms < v_received_ms - 60000 then
    return jsonb_build_object('state', 'unavailable');
  end if;

  if p_source = 'order' then
    select o.id, o.buyer_name, a.email into v_order_id, v_buyer_name, v_account_email
    from public.shop_orders o join public.shop_accounts a on a.id = o.account_id
    where o.id = p_id and o.token_hash = p_token_hash and o.status = 'verified'
      and o.account_revoked_at is null
      and floor(extract(epoch from o.totp_window_start) * 1000)::bigint = p_window_start_ms
      and (not o.delivery_link or (o.delivery_grant_hash = p_access_hash
        and o.credentials_viewed_at is not null and o.delivery_cancelled_at is null))
      and exists (select 1 from public.shop_audit_logs l where l.order_id = o.id
        and l.action = 'totp_code_delivered' and l.detail->>'window_start_ms' = p_window_start_ms::text);
  elsif p_source = 'reissue' then
    select r.delivery_order_id, r.buyer_name, a.email into v_order_id, v_buyer_name, v_account_email
    from public.shop_otp_reissues r join public.shop_accounts a on a.id = r.account_id
    where r.id = p_id and r.token_hash = p_token_hash and r.bound_at is not null and r.cancelled_at is null
      and ((r.reusable and p_access_hash = p_token_hash) or (not r.reusable and r.claim_hash = p_access_hash))
      and (r.delivery_order_id is null or exists (select 1 from public.shop_orders o
        where o.id = r.delivery_order_id and o.account_id = r.account_id and o.status = 'verified'
          and o.account_revoked_at is null and o.delivery_cancelled_at is null and o.credentials_viewed_at is not null))
      and exists (select 1 from public.shop_audit_logs l where l.action = 'otp_reissue_code_delivered'
        and l.detail->>'reissue_id' = r.id::text and l.detail->>'account_id' = r.account_id::text
        and l.detail->>'window_start_ms' = p_window_start_ms::text);
  end if;
  if v_account_email is null then return jsonb_build_object('state', 'unavailable'); end if;

  -- Bound an authorized client's ability to generate notifications within a live window.
  if exists (select 1 from public.shop_audit_logs l where l.action = 'otp_copy_reported'
    and l.detail->>'copy_event_id' = p_copy_event_id::text) then
    return jsonb_build_object('state', 'duplicate');
  end if;
  if not public.shop_rate_check('otp-copy:' || p_source || ':' || p_id::text, 60, 60) then
    return jsonb_build_object('state', 'rate_limited');
  end if;

  insert into public.shop_audit_logs (order_id, actor, action, created_at, detail)
  values (v_order_id, 'system', 'otp_copy_reported', v_received_at, jsonb_build_object(
    'copy_event_id', p_copy_event_id, 'source', p_source, 'source_id', p_id,
    'window_start_ms', p_window_start_ms))
  on conflict ((detail->>'copy_event_id')) where action = 'otp_copy_reported' do nothing
  returning id into v_recorded_id;
  if v_recorded_id is null then return jsonb_build_object('state', 'duplicate'); end if;

  return jsonb_build_object('state', 'recorded', 'buyer_name', coalesce(nullif(btrim(v_buyer_name), ''), 'Pembeli'),
    'account_email', v_account_email, 'received_at', v_received_at);
end;
$$;

revoke all on function public.shop_record_otp_copy(text, uuid, text, text, bigint, uuid) from public, anon, authenticated;
grant execute on function public.shop_record_otp_copy(text, uuid, text, text, bigint, uuid) to service_role;
