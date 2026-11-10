-- Filters run before pagination. Existing unfiltered RPCs remain available to older clients.
create function public.shop_admin_page_accounts_filtered(p_limit int, p_offset int, p_filters jsonb)
returns table (id uuid, variant_id uuid, email text, priority int, is_active boolean,
  created_at timestamptz, has_password boolean, has_totp boolean, total_count bigint)
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'unauthorized'; end if;
  return query select a.id, a.variant_id, a.email, a.priority, a.is_active, a.created_at,
    a.password_enc <> '' and a.password_enc <> 'PLACEHOLDER', coalesce(a.totp_secret_enc <> '', false), count(*) over ()
  from public.shop_accounts a
  left join (select o.account_id, count(*) as created, count(o.credentials_viewed_at) as opened
    from public.shop_orders o where o.delivery_link group by o.account_id) u on u.account_id = a.id
  where a.email ilike '%' || coalesce(p_filters->>'email', '') || '%'
    and (coalesce(p_filters->>'created', '') = '' or coalesce(u.created, 0)::text = p_filters->>'created')
    and (coalesce(p_filters->>'opened', '') = '' or coalesce(u.opened, 0)::text = p_filters->>'opened')
    and (coalesce(p_filters->>'status', '') = '' or (case when a.is_active then 'Aktif' else 'Nonaktif' end) = p_filters->>'status')
    and (coalesce(p_filters->>'password', '') = '' or (case when a.password_enc <> '' and a.password_enc <> 'PLACEHOLDER' then 'Tersedia' else 'Tidak tersedia' end) = p_filters->>'password')
    and (coalesce(p_filters->>'totp', '') = '' or (case when coalesce(a.totp_secret_enc <> '', false) then 'Tersedia' else 'Tidak tersedia' end) = p_filters->>'totp')
  order by a.priority, a.created_at, a.id
  limit least(greatest(coalesce(p_limit, 10), 1), 100) offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

create function public.shop_admin_page_delivery_links_filtered(p_limit int, p_offset int, p_filters jsonb)
returns table (id uuid, order_code text, account_email text, created_at timestamptz,
  expires_at timestamptz, buyer_name text, credentials_viewed_at timestamptz,
  delivery_cancelled_at timestamptz, recipient_name text, total_count bigint)
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'unauthorized'; end if;
  return query select o.id, o.order_code, a.email, o.created_at, o.expires_at,
    o.buyer_name, o.credentials_viewed_at, o.delivery_cancelled_at, o.recipient_name, count(*) over ()
  from public.shop_orders o left join public.shop_accounts a on a.id = o.account_id
  where o.delivery_link
    and o.order_code ilike '%' || coalesce(p_filters->>'code', '') || '%'
    and coalesce(a.email, 'Akun dihapus') ilike '%' || coalesce(p_filters->>'email', '') || '%'
    and coalesce(o.recipient_name, '') ilike '%' || coalesce(p_filters->>'recipient', '') || '%'
    and (coalesce(p_filters->>'date', '') = '' or (o.created_at at time zone 'Asia/Jakarta')::date::text >= p_filters->>'date')
    and (coalesce(p_filters->>'date_to', '') = '' or (o.created_at at time zone 'Asia/Jakarta')::date::text <= p_filters->>'date_to')
    and (coalesce(p_filters->>'status', '') = '' or
      case when o.delivery_cancelled_at is not null then 'Dibatalkan'
        when o.credentials_viewed_at is not null then 'Sudah dibuka'
        when o.expires_at <= now() then 'Kedaluwarsa'
        when o.buyer_name is not null then 'Identitas terisi' else 'Belum dipakai' end = p_filters->>'status')
  order by o.created_at desc, o.id desc
  limit least(greatest(coalesce(p_limit, 10), 1), 100) offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

create function public.shop_admin_page_otp_reissues_filtered(p_limit int, p_offset int, p_filters jsonb)
returns table (id uuid, account_email text, created_at timestamptz, expires_at timestamptz,
  bound_at timestamptz, taken_at timestamptz, cancelled_at timestamptz, total_count bigint)
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'unauthorized'; end if;
  return query select r.id, a.email, r.created_at, r.expires_at, r.bound_at,
    r.taken_at, r.cancelled_at, count(*) over ()
  from public.shop_otp_reissues r left join public.shop_accounts a on a.id = r.account_id
  where coalesce(a.email, 'Akun dihapus') ilike '%' || coalesce(p_filters->>'email', '') || '%'
    and (coalesce(p_filters->>'date', '') = '' or (r.created_at at time zone 'Asia/Jakarta')::date::text >= p_filters->>'date')
    and (coalesce(p_filters->>'date_to', '') = '' or (r.created_at at time zone 'Asia/Jakarta')::date::text <= p_filters->>'date_to')
    and (coalesce(p_filters->>'status', '') = '' or
      case when r.taken_at is not null then 'Diambil'
        when r.expires_at <= now() then 'Kedaluwarsa'
        when r.cancelled_at is not null then 'Dibatalkan'
        when r.bound_at is not null then 'Identitas terisi' else 'Belum dipakai' end = p_filters->>'status')
  order by r.created_at desc, r.id desc
  limit least(greatest(coalesce(p_limit, 10), 1), 100) offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

create function public.shop_admin_totp_log_filtered(p_limit int, p_offset int, p_filters jsonb)
returns table (id uuid, order_code text, account_email text, buyer_name text,
  buyer_phone text, buyer_device text, buyer_city text, taken_at timestamptz, total_count bigint)
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'unauthorized'; end if;
  return query select l.id, o.order_code, a.email, o.buyer_name, o.buyer_phone,
    o.buyer_device, o.buyer_city, l.created_at, count(*) over ()
  from public.shop_audit_logs l join public.shop_orders o on o.id = l.order_id and o.delivery_link
    left join public.shop_accounts a on a.id = o.account_id
  where l.action = 'totp_code_delivered'
    and (coalesce(p_filters->>'date', '') = '' or (l.created_at at time zone 'Asia/Jakarta')::date::text >= p_filters->>'date')
    and (coalesce(p_filters->>'date_to', '') = '' or (l.created_at at time zone 'Asia/Jakarta')::date::text <= p_filters->>'date_to')
    and o.order_code ilike '%' || coalesce(p_filters->>'code', '') || '%'
    and coalesce(a.email, '') ilike '%' || coalesce(p_filters->>'email', '') || '%'
    and coalesce(o.buyer_name, '') ilike '%' || coalesce(p_filters->>'name', '') || '%'
    and coalesce(o.buyer_phone, '') ilike '%' || coalesce(p_filters->>'phone', '') || '%'
    and coalesce(o.buyer_device, '') ilike '%' || coalesce(p_filters->>'device', '') || '%'
    and coalesce(o.buyer_city, '') ilike '%' || coalesce(p_filters->>'city', '') || '%'
  order by l.created_at desc, l.id desc
  limit least(greatest(coalesce(p_limit, 10), 1), 100) offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

create function public.shop_admin_otp_reissue_log_filtered(p_limit int, p_offset int, p_filters jsonb)
returns table (id uuid, account_email text, buyer_name text, buyer_phone text,
  buyer_device text, buyer_city text, taken_at timestamptz, total_count bigint)
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'unauthorized'; end if;
  return query select r.id, a.email, r.buyer_name, r.buyer_phone, r.buyer_device,
    r.buyer_city, l.created_at, count(*) over ()
  from public.shop_otp_reissues r join public.shop_audit_logs l
    on l.action = 'otp_reissue_code_delivered' and l.detail->>'reissue_id' = r.id::text
    left join public.shop_accounts a on a.id = r.account_id
  where (coalesce(p_filters->>'date', '') = '' or (l.created_at at time zone 'Asia/Jakarta')::date::text >= p_filters->>'date')
    and (coalesce(p_filters->>'date_to', '') = '' or (l.created_at at time zone 'Asia/Jakarta')::date::text <= p_filters->>'date_to')
    and coalesce(a.email, 'Akun dihapus') ilike '%' || coalesce(p_filters->>'email', '') || '%'
    and coalesce(r.buyer_name, '') ilike '%' || coalesce(p_filters->>'name', '') || '%'
    and coalesce(r.buyer_phone, '') ilike '%' || coalesce(p_filters->>'phone', '') || '%'
    and coalesce(r.buyer_device, '') ilike '%' || coalesce(p_filters->>'device', '') || '%'
    and coalesce(r.buyer_city, '') ilike '%' || coalesce(p_filters->>'city', '') || '%'
  order by l.created_at desc, r.id desc
  limit least(greatest(coalesce(p_limit, 10), 1), 100) offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

create function public.shop_admin_list_feedback_filtered(p_limit int, p_offset int, p_filters jsonb)
returns table (id uuid, buyer_name text, account_email text, submitted_at timestamptz,
  rating text, comment text, total_count bigint)
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'unauthorized'; end if;
  return query select l.id, o.buyer_name, a.email, l.created_at,
    l.detail->>'rating', l.detail->>'comment', count(*) over ()
  from public.shop_audit_logs l join public.shop_orders o on o.id = l.order_id and o.delivery_link
    left join public.shop_accounts a on a.id = o.account_id
  where l.action = 'delivery_feedback_submitted'
    and coalesce(o.buyer_name, '') ilike '%' || coalesce(p_filters->>'name', '') || '%'
    and coalesce(a.email, 'Akun dihapus') ilike '%' || coalesce(p_filters->>'email', '') || '%'
    and (coalesce(p_filters->>'date', '') = '' or (l.created_at at time zone 'Asia/Jakarta')::date::text >= p_filters->>'date')
    and (coalesce(p_filters->>'date_to', '') = '' or (l.created_at at time zone 'Asia/Jakarta')::date::text <= p_filters->>'date_to')
    and (coalesce(p_filters->>'rating', '') = '' or l.detail->>'rating' = p_filters->>'rating')
    and coalesce(l.detail->>'comment', '') ilike '%' || coalesce(p_filters->>'comment', '') || '%'
  order by l.created_at desc, l.id desc
  limit least(greatest(coalesce(p_limit, 10), 1), 100) offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke all on function public.shop_admin_page_accounts_filtered(int, int, jsonb),
  public.shop_admin_page_delivery_links_filtered(int, int, jsonb),
  public.shop_admin_page_otp_reissues_filtered(int, int, jsonb),
  public.shop_admin_totp_log_filtered(int, int, jsonb),
  public.shop_admin_otp_reissue_log_filtered(int, int, jsonb),
  public.shop_admin_list_feedback_filtered(int, int, jsonb) from public, anon, authenticated;
grant execute on function public.shop_admin_page_accounts_filtered(int, int, jsonb),
  public.shop_admin_page_delivery_links_filtered(int, int, jsonb),
  public.shop_admin_page_otp_reissues_filtered(int, int, jsonb),
  public.shop_admin_totp_log_filtered(int, int, jsonb),
  public.shop_admin_otp_reissue_log_filtered(int, int, jsonb),
  public.shop_admin_list_feedback_filtered(int, int, jsonb) to authenticated;
