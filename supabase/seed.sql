with seeded_product as (
  insert into public.products (name, description, terms)
  values ('OpenAI ChatGPT', 'Akun OpenAI ChatGPT.', 'Batas pengguna sharing mengikuti ketentuan produk.')
  returning id
), seeded_variants as (
  insert into public.variants (product_id, account_type, duration_days, price)
  select seeded_product.id, choices.account_type, choices.duration_days, choices.price
  from seeded_product
  cross join (values
    ('sharing', 7, 25000),
    ('sharing', 14, 45000),
    ('sharing', 30, 79000),
    ('private', 1, 15000),
    ('private', 3, 35000),
    ('private', 7, 65000),
    ('private', 14, 120000),
    ('private', 30, 200000)
  ) as choices(account_type, duration_days, price)
  returning product_id
)
insert into public.accounts
  (product_id, email, password_enc, totp_secret_enc, is_unlimited, priority)
select seeded_product.id, 'PLACEHOLDER', 'PLACEHOLDER', 'PLACEHOLDER',
  accounts.is_unlimited, accounts.priority
from seeded_product
cross join (values
  (false, 1),
  (false, 2),
  (true, 99)
) as accounts(is_unlimited, priority);

insert into public.payment_methods (name, account_number, account_name)
values ('DANA', '081234567890', 'GreenroomID');
