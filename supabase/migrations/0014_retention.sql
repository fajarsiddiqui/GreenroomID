-- Shop retention: safe to re-run after 0013. D16 supersedes D15's assumption.
begin;

alter table public.shop_orders
  add column if not exists proof_deleted_at timestamptz,
  add column if not exists anonymized_at timestamptz,
  add column if not exists updated_at timestamptz default now();

-- Existing rejected/expired rows receive the migration time as their first
-- known status-change time. This conservatively starts their 90-day clock now.
alter table public.shop_orders
  alter column buyer_name drop not null,
  alter column buyer_phone drop not null,
  alter column buyer_city drop not null;

create or replace function public.shop_orders_touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists shop_orders_status_updated_at on public.shop_orders;
create trigger shop_orders_status_updated_at before update of status on public.shop_orders
  for each row when (old.status is distinct from new.status)
  execute function public.shop_orders_touch_updated_at();
revoke execute on function public.shop_orders_touch_updated_at() from public, anon, authenticated;

create or replace function public.shop_retention_anonymize()
returns void language plpgsql security definer set search_path = public as $$
declare
  v_cutoff timestamptz := now() - interval '90 days';
  v_orders integer := 0;
  v_totp_secrets integer := 0;
begin
  update public.shop_orders o set buyer_name = null, buyer_phone = null,
    buyer_city = null, anonymized_at = now()
  where o.status in ('verified', 'rejected', 'expired')
    and coalesce(o.verified_at, o.updated_at, o.created_at) < v_cutoff
    and o.anonymized_at is null;
  get diagnostics v_orders = row_count;

  -- password_enc is NOT NULL in the applied schema: do not alter that
  -- contract. Clear only the nullable TOTP ciphertext on consumed private
  -- accounts with at least one order and no active/recent order.
  update public.shop_accounts a set totp_secret_enc = null
  where a.totp_secret_enc is not null
    and a.max_uses is not null and a.used_count >= a.max_uses
    and exists (select 1 from public.shop_variants v
      where v.id = a.variant_id and v.account_type = 'private')
    and exists (select 1 from public.shop_orders o where o.account_id = a.id)
    and not exists (select 1 from public.shop_orders o where o.account_id = a.id
      and (o.status not in ('verified', 'rejected', 'expired')
        or coalesce(o.verified_at, o.updated_at, o.created_at) is null
        or coalesce(o.verified_at, o.updated_at, o.created_at) >= v_cutoff));
  get diagnostics v_totp_secrets = row_count;

  insert into public.shop_audit_logs(actor, action, detail)
  values ('system', 'retention_anonymized',
    jsonb_build_object('orders', v_orders, 'totp_secrets', v_totp_secrets));
end;
$$;
revoke execute on function public.shop_retention_anonymize() from public, anon, authenticated;
grant execute on function public.shop_retention_anonymize() to service_role;

-- Named pg_cron jobs are updated in place when this migration is re-run.
select cron.schedule('shop-retention-anonymize', '0 20 * * *',
  $cron$select public.shop_retention_anonymize();$cron$);

commit;

-- Schedule the Edge Function separately after deployment (not executed here).
-- Enable pg_net and add a Vault secret named SHOP_CRON_SECRET with the same
-- value configured for the Edge Function. Never paste the value into cron.job.
-- create extension if not exists pg_net with schema extensions;
-- Replace <PROJECT_REF> with the public Supabase project reference:
-- select cron.schedule('shop-retention-cleanup', '10 20 * * *', $$
--   select net.http_post(
--     url := 'https://<PROJECT_REF>.supabase.co/functions/v1/shop-retention-cleanup',
--     headers := jsonb_build_object('Content-Type', 'application/json',
--       'x-internal-secret', (select decrypted_secret from vault.decrypted_secrets
--         where name = 'SHOP_CRON_SECRET')),
--     body := '{}'::jsonb
--   );
-- $$);
