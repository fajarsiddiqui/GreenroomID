-- Run after seed.sql. Placeholder secrets must be replaced before real sales.
insert into public.shop_accounts
  (variant_id, email, password_enc, totp_secret_enc, max_uses, priority)
select v.id, seeds.email, 'PLACEHOLDER', 'PLACEHOLDER', seeds.max_uses, seeds.priority
from (values
  ('A PLACEHOLDER', 'sharing', 20, 1),
  ('C PLACEHOLDER', 'sharing', 20, 2),
  ('B PLACEHOLDER', 'private', null::int, 1)
) as seeds(email, account_type, max_uses, priority)
join lateral (
  select sv.id from public.shop_variants sv
  join public.shop_products p on p.id = sv.product_id
  where sv.account_type = seeds.account_type and sv.duration_days = 30
    and p.name = 'OpenAI ChatGPT'
  order by p.created_at, sv.id limit 1
) v on true
where not exists (select 1 from public.shop_accounts);
