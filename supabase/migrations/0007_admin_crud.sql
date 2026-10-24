alter table public.shop_products add column image_url text;
alter table public.shop_audit_logs alter column order_id drop not null;
update public.shop_accounts set is_active = false where password_enc = 'PLACEHOLDER';

grant select, insert, update, delete on public.shop_products, public.shop_variants,
  public.shop_payment_methods to authenticated;
create policy shop_admin_products_all on public.shop_products for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy shop_admin_variants_all on public.shop_variants for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy shop_admin_payment_methods_all on public.shop_payment_methods for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create function public.shop_audit_immutable() returns trigger language plpgsql
security definer set search_path = '' as $$
begin
  raise exception 'shop_audit_logs_immutable';
end;
$$;
create trigger shop_audit_immutable before update or delete on public.shop_audit_logs
  for each row execute function public.shop_audit_immutable();

create function public.shop_audit_admin_table_change() returns trigger language plpgsql
security definer set search_path = '' as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_changed text[];
  v_id uuid;
  v_entity text := case TG_TABLE_NAME
    when 'shop_products' then 'product'
    when 'shop_variants' then 'variant'
    else 'payment_method' end;
begin
  if TG_OP = 'INSERT' then
    v_new := to_jsonb(NEW);
    select coalesce(array_agg(column_name order by column_name), array[]::text[]) into v_changed
      from jsonb_object_keys(v_new) as k(column_name);
    v_id := NEW.id;
  elsif TG_OP = 'UPDATE' then
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    select coalesce(array_agg(column_name order by column_name), array[]::text[]) into v_changed
      from jsonb_object_keys(v_new) as k(column_name)
      where v_old -> column_name is distinct from v_new -> column_name;
    v_id := NEW.id;
  else
    v_old := to_jsonb(OLD);
    select coalesce(array_agg(column_name order by column_name), array[]::text[]) into v_changed
      from jsonb_object_keys(v_old) as k(column_name);
    v_id := OLD.id;
  end if;
  insert into public.shop_audit_logs (actor, action, detail)
  values ('admin', v_entity || '_' || case TG_OP
      when 'INSERT' then 'created' when 'UPDATE' then 'updated' else 'deleted' end,
    jsonb_build_object('table', TG_TABLE_NAME, 'id', v_id,
      'admin_id', auth.uid(), 'changed_columns', to_jsonb(v_changed)));
  return coalesce(NEW, OLD);
end;
$$;
create trigger shop_products_audit after insert or update or delete on public.shop_products
  for each row execute function public.shop_audit_admin_table_change();
create trigger shop_variants_audit after insert or update or delete on public.shop_variants
  for each row execute function public.shop_audit_admin_table_change();
create trigger shop_payment_methods_audit after insert or update or delete on public.shop_payment_methods
  for each row execute function public.shop_audit_admin_table_change();

create function public.shop_admin_list_accounts()
returns table (id uuid, variant_id uuid, product_name text, account_type text,
  duration_days int, email text, max_uses int, used_count int, priority int,
  is_active boolean, created_at timestamptz, has_password boolean, has_totp boolean)
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'unauthorized'; end if;
  return query select a.id, a.variant_id, p.name, v.account_type, v.duration_days,
    a.email, a.max_uses, a.used_count, a.priority, a.is_active, a.created_at,
    a.password_enc <> '' and a.password_enc <> 'PLACEHOLDER',
    coalesce(a.totp_secret_enc <> '', false)
  from public.shop_accounts a join public.shop_variants v on v.id = a.variant_id
  join public.shop_products p on p.id = v.product_id
  order by p.name, v.account_type, v.duration_days, a.priority, a.created_at;
end;
$$;

create function public.shop_admin_set_account_status(p_account_id uuid, p_is_active bool)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'unauthorized'; end if;
  if p_is_active is null then raise exception 'invalid_input'; end if;
  update public.shop_accounts set is_active = p_is_active where id = p_account_id
    and is_active is distinct from p_is_active;
  if not found then raise exception 'not_found_or_unchanged'; end if;
  insert into public.shop_audit_logs (actor, action, detail) values
    ('admin', case when p_is_active then 'account_activated' else 'account_deactivated' end,
    jsonb_build_object('account_id', p_account_id, 'admin_id', auth.uid(),
      'changed_columns', jsonb_build_array('is_active')));
end;
$$;

create function public.shop_admin_update_account_meta(p_account_id uuid, p_email text,
  p_max_uses int, p_priority int)
returns void language plpgsql security definer set search_path = '' as $$
declare v_account public.shop_accounts%rowtype;
begin
  if not public.is_admin() then raise exception 'unauthorized'; end if;
  select * into v_account from public.shop_accounts where id = p_account_id for update;
  if not found then raise exception 'not_found'; end if;
  if p_email is null or btrim(p_email) !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or p_priority is null or p_priority not between 0 and 9999
    or (p_max_uses is not null and (p_max_uses <= 0 or p_max_uses < v_account.used_count))
  then raise exception 'invalid_input'; end if;
  update public.shop_accounts set email = btrim(p_email), max_uses = p_max_uses,
    priority = p_priority where id = p_account_id;
  insert into public.shop_audit_logs (actor, action, detail) values
    ('admin', 'account_meta_updated', jsonb_build_object('account_id', p_account_id,
      'admin_id', auth.uid(), 'changed_columns', jsonb_build_array('email', 'max_uses', 'priority')));
end;
$$;

create function public.shop_admin_stock_summary()
returns table (variant_id uuid, product_name text, account_type text, duration_days int,
  has_unlimited boolean, remaining bigint, low boolean, sold_out boolean)
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'unauthorized'; end if;
  return query select v.id, p.name, v.account_type, v.duration_days,
    coalesce(bool_or(a.max_uses is null) filter (where a.id is not null), false),
    coalesce(sum(greatest(a.max_uses - a.used_count, 0)) filter (where a.max_uses is not null), 0)::bigint,
    not coalesce(bool_or(a.max_uses is null) filter (where a.id is not null), false)
      and coalesce(sum(greatest(a.max_uses - a.used_count, 0)) filter (where a.max_uses is not null), 0) < 5,
    not coalesce(bool_or(a.max_uses is null) filter (where a.id is not null), false)
      and coalesce(sum(greatest(a.max_uses - a.used_count, 0)) filter (where a.max_uses is not null), 0) = 0
  from public.shop_variants v join public.shop_products p on p.id = v.product_id
  left join public.shop_accounts a on a.variant_id = v.id and a.is_active
  where v.is_active and p.is_active group by v.id, p.name, v.account_type, v.duration_days
  order by p.name, v.account_type, v.duration_days;
end;
$$;

create function public.shop_admin_list_audit(p_limit int, p_offset int)
returns table (id uuid, order_id uuid, order_code text, actor text, action text,
  detail jsonb, created_at timestamptz, total_count bigint)
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'unauthorized'; end if;
  return query select a.id, a.order_id, o.order_code, a.actor, a.action,
    a.detail, a.created_at, count(*) over ()
  from public.shop_audit_logs a left join public.shop_orders o on o.id = a.order_id
  order by a.created_at desc, a.id desc
  limit least(greatest(coalesce(p_limit, 50), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke execute on function public.shop_admin_list_accounts(),
  public.shop_admin_set_account_status(uuid, bool),
  public.shop_admin_update_account_meta(uuid, text, int, int),
  public.shop_admin_stock_summary(), public.shop_admin_list_audit(int, int)
  from public, anon;
grant execute on function public.shop_admin_list_accounts(),
  public.shop_admin_set_account_status(uuid, bool),
  public.shop_admin_update_account_meta(uuid, text, int, int),
  public.shop_admin_stock_summary(), public.shop_admin_list_audit(int, int)
  to authenticated;
