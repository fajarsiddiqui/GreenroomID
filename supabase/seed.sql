with seeded_product as (
  insert into public.shop_products (name, description, terms)
  values ('OpenAI ChatGPT', 'Akun OpenAI ChatGPT.', 'Batas pengguna sharing mengikuti ketentuan produk.')
  returning id
)
  insert into public.shop_variants (product_id, account_type, duration_days, price)
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
;

insert into public.shop_payment_methods (name, account_number, account_name)
values ('DANA', '081234567890', 'GreenroomID');
