alter table public.shop_orders
  add column account_revoked_at timestamptz;

create function public.shop_preserve_revoked_order()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.account_revoked_at is not null and
    (new.account_id is distinct from old.account_id or new.status is distinct from old.status) then
    raise exception 'account_revoked';
  end if;
  return new;
end;
$$;
create trigger shop_preserve_revoked_order before update on public.shop_orders
  for each row execute function public.shop_preserve_revoked_order();
revoke execute on function public.shop_preserve_revoked_order() from public, anon, authenticated;

create or replace function public.get_order_status(p_order_id uuid, p_token_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_result jsonb;
begin
  select jsonb_build_object(
    'status', o.status, 'order_code', o.order_code, 'buyer_name', o.buyer_name,
    'variant_id', o.variant_id, 'paid_at', o.paid_at, 'admin_note', o.admin_note,
    'expires_at', o.expires_at, 'access_expires_at', o.access_expires_at,
    'account_revoked_at', o.account_revoked_at,
    'proof_path', o.proof_path, 'price', o.price
  ) into v_result
  from public.shop_orders o
  where o.id = p_order_id and o.token_hash = p_token_hash;
  if not found then raise exception 'unauthorized'; end if;
  return v_result;
end;
$$;

create function public.shop_admin_account_order_count(p_account_id uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare v_count int;
begin
  if not public.is_admin() then raise exception 'unauthorized'; end if;
  if not exists (select 1 from public.shop_accounts where id = p_account_id) then
    raise exception 'not_found';
  end if;
  select count(*)::int into v_count from public.shop_orders where account_id = p_account_id;
  return v_count;
end;
$$;

create function public.shop_admin_delete_account(p_account_id uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare v_count int;
begin
  if not public.is_admin() then raise exception 'unauthorized'; end if;
  perform 1 from public.shop_accounts where id = p_account_id for update;
  if not found then raise exception 'not_found'; end if;

  update public.shop_orders
    set account_id = null, account_revoked_at = now()
    where account_id = p_account_id;
  get diagnostics v_count = row_count;

  delete from public.shop_accounts where id = p_account_id;
  insert into public.shop_audit_logs (actor, action, detail)
    values ('admin', 'account_deleted', jsonb_build_object(
      'account_id', p_account_id, 'affected_orders', v_count, 'admin_id', auth.uid()));
  return v_count;
end;
$$;

revoke all on function public.shop_admin_account_order_count(uuid),
  public.shop_admin_delete_account(uuid) from public, anon, authenticated;
grant execute on function public.shop_admin_account_order_count(uuid),
  public.shop_admin_delete_account(uuid) to authenticated;
