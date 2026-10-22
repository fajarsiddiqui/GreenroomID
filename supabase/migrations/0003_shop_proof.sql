create or replace function public.get_order_status(p_order_id uuid, p_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  select jsonb_build_object(
    'status', o.status, 'order_code', o.order_code, 'buyer_name', o.buyer_name,
    'variant_id', o.variant_id, 'paid_at', o.paid_at, 'admin_note', o.admin_note,
    'expires_at', o.expires_at, 'access_expires_at', o.access_expires_at,
    'proof_path', o.proof_path
  ) into v_result
  from public.orders o
  where o.id = p_order_id and o.token_hash = p_token_hash;
  if not found then
    raise exception 'unauthorized';
  end if;
  return v_result;
end;
$$;

-- The Edge Function uses this service-only transaction after uploading the file.
create function public.shop_record_proof_upload(
  p_order_id uuid, p_token_hash text, p_proof_path text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
begin
  if p_proof_path is null or
    left(p_proof_path, char_length(p_order_id::text) + 1) <> p_order_id::text || '/' then
    raise exception 'invalid_proof_path';
  end if;
  select o.* into v_order from public.orders o
  where o.id = p_order_id and o.token_hash = p_token_hash
  for update;
  if not found or v_order.status <> 'waiting_verification' or v_order.proof_path is not null then
    raise exception 'invalid_order_state';
  end if;
  update public.orders set proof_path = p_proof_path where id = p_order_id;
  insert into public.audit_logs (order_id, actor, action, detail)
  values (p_order_id, 'system', 'proof_uploaded', jsonb_build_object('path', p_proof_path));
end;
$$;

revoke all on function public.shop_record_proof_upload(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.shop_record_proof_upload(uuid, text, text)
  to service_role;
