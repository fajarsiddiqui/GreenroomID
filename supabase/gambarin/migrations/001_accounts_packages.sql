-- KHUSUS proyek Supabase `greenroomid-gambarin`.
-- DILARANG menjalankan migration ini pada Supabase GreenroomID utama.
-- Fondasi akun, paket, masa aktif, kuota, dan audit Gambarin AI.
-- Tidak membuat auth.users; provisioning Auth dilakukan backend pada job berikutnya.

begin;

create table if not exists public.gambarin_packages (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 100),
  duration_days integer not null unique
    check (duration_days in (1, 3, 7, 14, 30)),
  default_image_quota integer not null check (default_image_quota >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.gambarin_accounts (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete restrict,
  username text not null
    check (username = btrim(username) and length(username) between 1 and 64),
  package_id uuid references public.gambarin_packages(id) on delete restrict,
  status text not null default 'pending'
    check (status in ('pending', 'active', 'disabled')),
  activated_at timestamptz,
  expires_at timestamptz,
  quota_granted integer not null default 0 check (quota_granted >= 0),
  quota_used integer not null default 0 check (quota_used >= 0),
  quota_reserved integer not null default 0 check (quota_reserved >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint gambarin_accounts_valid_period check (
    (activated_at is null and expires_at is null)
    or (activated_at is not null and expires_at is not null and expires_at > activated_at)
  ),
  constraint gambarin_accounts_active_requires_package check (
    status <> 'active'
    or (package_id is not null and activated_at is not null and expires_at is not null)
  ),
  constraint gambarin_accounts_quota_within_grant check (
    quota_used::bigint + quota_reserved::bigint <= quota_granted::bigint
  )
);

-- Username lookup dan keunikan tidak membedakan huruf besar/kecil.
create unique index if not exists gambarin_accounts_username_lower_key
  on public.gambarin_accounts (lower(username));
create index if not exists gambarin_accounts_package_id_idx
  on public.gambarin_accounts (package_id);
create index if not exists gambarin_accounts_status_expires_at_idx
  on public.gambarin_accounts (status, expires_at);

create table if not exists public.gambarin_account_events (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.gambarin_accounts(id) on delete restrict,
  action text not null check (action in (
    'account_created',
    'activated',
    'package_changed',
    'quota_adjusted',
    'extended',
    'disabled',
    'reactivated',
    'password_reset'
  )),
  -- UUID admin berasal dari proyek GreenroomID utama: tidak ada FK lintas proyek.
  main_admin_user_id uuid,
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

comment on column public.gambarin_account_events.metadata is
  'Metadata aman saja; jangan simpan password, token, atau credential.';
create index if not exists gambarin_account_events_account_time_idx
  on public.gambarin_account_events (account_id, created_at desc);

-- Backend kelak mengubah akun dan mencatat event dalam satu transaksi.
-- Counter kuota + constraint mendukung reservasi/pemakaian atomik pada job berikutnya.
create or replace function public.gambarin_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists gambarin_packages_set_updated_at on public.gambarin_packages;
create trigger gambarin_packages_set_updated_at
before update on public.gambarin_packages
for each row execute function public.gambarin_set_updated_at();

drop trigger if exists gambarin_accounts_set_updated_at on public.gambarin_accounts;
create trigger gambarin_accounts_set_updated_at
before update on public.gambarin_accounts
for each row execute function public.gambarin_set_updated_at();

-- Event bersifat append-only, termasuk untuk backend berhak tinggi.
create or replace function public.gambarin_reject_event_changes()
returns trigger
language plpgsql
as $$
begin
  raise exception 'gambarin_account_events is append-only';
end;
$$;

drop trigger if exists gambarin_account_events_immutable on public.gambarin_account_events;
create trigger gambarin_account_events_immutable
before update or delete on public.gambarin_account_events
for each row execute function public.gambarin_reject_event_changes();

revoke all on function public.gambarin_set_updated_at() from public, anon, authenticated;
revoke all on function public.gambarin_reject_event_changes() from public, anon, authenticated;

alter table public.gambarin_packages enable row level security;
alter table public.gambarin_accounts enable row level security;
alter table public.gambarin_account_events enable row level security;

revoke all on table public.gambarin_packages,
  public.gambarin_accounts,
  public.gambarin_account_events
  from public, anon, authenticated, service_role;

-- Hanya data akun sendiri yang bisa dibaca oleh pengguna Gambarin.
-- Tidak ada grant/policy tulis untuk anon atau authenticated.
grant select on table public.gambarin_accounts to authenticated;
drop policy if exists gambarin_accounts_read_own on public.gambarin_accounts;
create policy gambarin_accounts_read_own
  on public.gambarin_accounts
  for select to authenticated
  using (auth_user_id = (select auth.uid()));

-- Data paket dan event hanya untuk backend tepercaya; service_role tidak dipakai frontend.
grant select, insert, update on table
  public.gambarin_packages,
  public.gambarin_accounts
  to service_role;
grant select, insert on table public.gambarin_account_events to service_role;

-- Konflik durasi tidak mengubah nilai yang kelak diedit admin.
insert into public.gambarin_packages (name, duration_days, default_image_quota)
values
  ('1 Hari', 1, 4),
  ('3 Hari', 3, 8),
  ('7 Hari', 7, 14),
  ('14 Hari', 14, 20),
  ('30 Hari', 30, 35)
on conflict (duration_days) do nothing;

commit;
