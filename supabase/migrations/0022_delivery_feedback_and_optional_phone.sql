create or replace function public.shop_delivery_bind(p_order_id uuid, p_token_hash text,
  p_buyer_name text, p_buyer_phone text, p_buyer_device text, p_buyer_city text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_order public.shop_orders%rowtype;
  v_phone text := nullif(btrim(p_buyer_phone), '');
  v_claim bytea := extensions.gen_random_bytes(32);
begin
  if nullif(btrim(p_buyer_name), '') is null or length(btrim(p_buyer_name)) > 100 or
    nullif(btrim(p_buyer_device), '') is null or length(btrim(p_buyer_device)) > 200 or
    nullif(btrim(p_buyer_city), '') is null or length(btrim(p_buyer_city)) > 100 then
    raise exception 'invalid_identity';
  end if;
  if v_phone is not null then
    if v_phone ~ '^08[0-9]{7,11}$' then v_phone := '62' || substr(v_phone, 2); end if;
    if v_phone !~ '^62[0-9]{8,12}$' then raise exception 'invalid_phone'; end if;
  end if;
  select * into v_order from public.shop_orders where id = p_order_id and token_hash = p_token_hash
    and delivery_link for update;
  if not found then return jsonb_build_object('state', 'invalid'); end if;
  if v_order.delivery_cancelled_at is not null or v_order.status <> 'verified' or
    v_order.account_revoked_at is not null or v_order.credentials_viewed_at is not null or
    v_order.expires_at <= now() then return jsonb_build_object('state', 'unavailable'); end if;
  if v_order.delivery_bound_at is not null then return jsonb_build_object('state', 'bound'); end if;
  update public.shop_orders set buyer_name = btrim(p_buyer_name), buyer_phone = v_phone,
    buyer_device = btrim(p_buyer_device), buyer_city = btrim(p_buyer_city), delivery_bound_at = now(),
    delivery_claim_hash = encode(extensions.digest(v_claim, 'sha256'), 'hex')
    where id = p_order_id;
  insert into public.shop_audit_logs(order_id, actor, action)
    values (p_order_id, 'system', 'delivery_identity_bound');
  return jsonb_build_object('state', 'bound', 'claim', encode(v_claim, 'hex'));
end;
$$;

create unique index shop_delivery_feedback_once_idx on public.shop_audit_logs(order_id)
  where action = 'delivery_feedback_submitted';

create function public.shop_delivery_submit_feedback(p_order_id uuid, p_token_hash text,
  p_grant_hash text, p_rating text, p_comment text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_order public.shop_orders%rowtype;
begin
  if p_rating not in ('keren', 'bagus', 'biasa aja', 'cukup', 'kurang') or
    length(coalesce(p_comment, '')) > 2000 then raise exception 'invalid_feedback'; end if;
  select * into v_order from public.shop_orders where id = p_order_id and delivery_link
    and token_hash = p_token_hash and delivery_grant_hash = p_grant_hash;
  if not found or v_order.credentials_viewed_at is null or v_order.delivery_cancelled_at is not null or
    v_order.delivery_grant_expires_at <= now() then return 'unavailable'; end if;
  insert into public.shop_audit_logs(order_id, actor, action, detail)
    values (p_order_id, 'system', 'delivery_feedback_submitted',
      jsonb_build_object('rating', p_rating, 'comment', nullif(btrim(p_comment), '')))
    on conflict (order_id) where action = 'delivery_feedback_submitted' do nothing;
  if not found then return 'already_submitted'; end if;
  return 'saved';
end;
$$;

revoke all on function public.shop_delivery_submit_feedback(uuid, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.shop_delivery_submit_feedback(uuid, text, text, text, text)
  to anon, authenticated;
