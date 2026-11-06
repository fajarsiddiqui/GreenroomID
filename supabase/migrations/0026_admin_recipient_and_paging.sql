alter table public.shop_orders add column recipient_name text
  check (recipient_name is null or (length(recipient_name) between 1 and 100 and recipient_name = btrim(recipient_name)));

drop function public.shop_admin_create_delivery_link(uuid);
create function public.shop_admin_create_delivery_link(p_account_id uuid, p_recipient_name text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_account public.shop_accounts%rowtype;
  v_token bytea := extensions.gen_random_bytes(32);
  v_code text;
  v_name text := btrim(p_recipient_name);
  v_alphabet text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  v_random bytea;
  v_order_id uuid;
  v_attempt int;
  v_index int;
begin
  if not public.is_admin() then raise exception 'unauthorized'; end if;
  if v_name is null or length(v_name) < 1 or length(v_name) > 100 then
    raise exception 'invalid_recipient_name';
  end if;
  select * into v_account from public.shop_accounts where id = p_account_id for update;
  if not found or not v_account.is_active then raise exception 'no_stock'; end if;
  for v_attempt in 1..5 loop
    v_code := 'GR-';
    v_random := extensions.gen_random_bytes(5);
    for v_index in 0..4 loop
      v_code := v_code || substr(v_alphabet, 1 + get_byte(v_random, v_index) % length(v_alphabet), 1);
    end loop;
    begin
      insert into public.shop_orders(order_code, token_hash, variant_id, account_id,
        price, status, expires_at, delivery_link, verified_at, recipient_name)
      values (v_code, encode(extensions.digest(v_token, 'sha256'), 'hex'), v_account.variant_id,
        p_account_id, 0, 'verified', null, true, now(), v_name)
      returning id into v_order_id;
      exit;
    exception when unique_violation then
      if v_attempt = 5 then raise; end if;
    end;
  end loop;
  insert into public.shop_audit_logs(order_id, actor, action, detail)
    values (v_order_id, 'admin', 'delivery_link_created',
      jsonb_build_object('admin_id', auth.uid(), 'account_id', p_account_id,
        'recipient_name', v_name));
  return jsonb_build_object('order_id', v_order_id, 'code', v_code,
    'token', encode(v_token, 'hex'));
end;
$$;
revoke all on function public.shop_admin_create_delivery_link(uuid, text) from public, anon, authenticated;
grant execute on function public.shop_admin_create_delivery_link(uuid, text) to authenticated;

create function public.shop_admin_page_accounts(p_limit int, p_offset int)
returns table (id uuid, variant_id uuid, email text, priority int, is_active boolean,
  created_at timestamptz, has_password boolean, has_totp boolean, total_count bigint)
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'unauthorized'; end if;
  return query select a.id, a.variant_id, a.email, a.priority, a.is_active, a.created_at,
    a.password_enc <> '' and a.password_enc <> 'PLACEHOLDER',
    coalesce(a.totp_secret_enc <> '', false), count(*) over ()
  from public.shop_accounts a order by a.priority, a.created_at, a.id
  limit least(greatest(coalesce(p_limit, 10), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

create function public.shop_admin_page_delivery_links(p_limit int, p_offset int)
returns table (id uuid, order_code text, account_email text, created_at timestamptz,
  expires_at timestamptz, buyer_name text, credentials_viewed_at timestamptz,
  delivery_cancelled_at timestamptz, recipient_name text, total_count bigint)
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'unauthorized'; end if;
  return query select o.id, o.order_code, a.email, o.created_at, o.expires_at,
    o.buyer_name, o.credentials_viewed_at, o.delivery_cancelled_at, o.recipient_name,
    count(*) over ()
  from public.shop_orders o left join public.shop_accounts a on a.id = o.account_id
  where o.delivery_link order by o.created_at desc, o.id desc
  limit least(greatest(coalesce(p_limit, 10), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

create function public.shop_admin_page_otp_reissues(p_limit int, p_offset int)
returns table (id uuid, account_email text, created_at timestamptz, expires_at timestamptz,
  bound_at timestamptz, taken_at timestamptz, cancelled_at timestamptz, total_count bigint)
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'unauthorized'; end if;
  return query select r.id, a.email, r.created_at, r.expires_at, r.bound_at,
    r.taken_at, r.cancelled_at, count(*) over ()
  from public.shop_otp_reissues r left join public.shop_accounts a on a.id = r.account_id
  order by r.created_at desc, r.id desc
  limit least(greatest(coalesce(p_limit, 10), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke all on function public.shop_admin_page_accounts(int, int),
  public.shop_admin_page_delivery_links(int, int),
  public.shop_admin_page_otp_reissues(int, int) from public, anon, authenticated;
grant execute on function public.shop_admin_page_accounts(int, int),
  public.shop_admin_page_delivery_links(int, int),
  public.shop_admin_page_otp_reissues(int, int) to authenticated;
