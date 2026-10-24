create table public.shop_products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  terms text,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz default now()
);

create table public.shop_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.shop_products(id) on delete cascade,
  account_type text not null check (account_type in ('sharing', 'private')),
  duration_days int not null check (duration_days in (1, 3, 7, 14, 30)),
  price int not null,
  is_active boolean not null default true,
  unique (product_id, account_type, duration_days)
);

create table public.shop_accounts (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.shop_products(id),
  email text not null,
  password_enc text not null,
  totp_secret_enc text,
  is_unlimited boolean not null default false,
  priority int not null default 0,
  is_available boolean not null default true,
  created_at timestamptz default now()
);

create table public.shop_orders (
  id uuid primary key default gen_random_uuid(),
  order_code text unique not null
    check (order_code ~ '^GR-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}$'),
  token_hash text not null,
  variant_id uuid references public.shop_variants(id),
  account_id uuid references public.shop_accounts(id),
  buyer_name text not null,
  buyer_phone text not null check (buyer_phone ~ '^62[0-9]+$'),
  buyer_device text not null,
  status text not null default 'draft'
    check (status in ('draft', 'waiting_verification', 'verified', 'rejected', 'expired')),
  proof_path text,
  paid_at timestamptz,
  admin_note text,
  credentials_viewed_at timestamptz,
  totp_issued_at timestamptz,
  access_started_at timestamptz,
  access_expires_at timestamptz,
  created_at timestamptz default now(),
  expires_at timestamptz not null default (now() + interval '30 minutes')
);

create table public.shop_payment_methods (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  account_number text not null,
  account_name text not null,
  logo_url text,
  is_active boolean not null default true,
  sort_order int not null default 0
);

create table public.shop_audit_logs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.shop_orders(id),
  actor text not null check (actor in ('admin', 'system')),
  action text not null,
  detail jsonb,
  created_at timestamptz default now()
);

create index shop_orders_status_idx on public.shop_orders(status);
create index shop_orders_account_id_idx on public.shop_orders(account_id);
create index shop_accounts_available_priority_created_idx
  on public.shop_accounts(is_available, priority, created_at);

alter table public.shop_products enable row level security;
alter table public.shop_variants enable row level security;
alter table public.shop_accounts enable row level security;
alter table public.shop_orders enable row level security;
alter table public.shop_payment_methods enable row level security;
alter table public.shop_audit_logs enable row level security;

revoke all on public.shop_products, public.shop_variants, public.shop_accounts,
  public.shop_orders, public.shop_payment_methods, public.shop_audit_logs from anon, authenticated;
grant select on public.shop_products, public.shop_variants, public.shop_payment_methods to anon, authenticated;

create policy shop_active_products on public.shop_products
  for select to anon, authenticated using (is_active);
create policy shop_active_variants on public.shop_variants
  for select to anon, authenticated using (is_active);
create policy shop_active_payment_methods on public.shop_payment_methods
  for select to anon, authenticated using (is_active);

insert into storage.buckets (id, name, public)
values ('proofs', 'proofs', false)
on conflict (id) do update set public = false;

create policy shop_proofs_no_client_select on storage.objects
  as restrictive for select to anon, authenticated
  using (bucket_id <> 'proofs');
create policy shop_proofs_no_client_insert on storage.objects
  as restrictive for insert to anon, authenticated
  with check (bucket_id <> 'proofs');
