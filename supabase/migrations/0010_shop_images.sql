insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('shop-images', 'shop-images', true, 2097152,
  array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy shop_images_storage_select on storage.objects for select to authenticated
  using (bucket_id = 'shop-images' and public.is_admin());
create policy shop_images_storage_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'shop-images' and public.is_admin());
create policy shop_images_storage_update on storage.objects for update to authenticated
  using (bucket_id = 'shop-images' and public.is_admin())
  with check (bucket_id = 'shop-images' and public.is_admin());
create policy shop_images_storage_delete on storage.objects for delete to authenticated
  using (bucket_id = 'shop-images' and public.is_admin());

create table public.shop_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.shop_products(id) on delete cascade,
  variant_id uuid references public.shop_variants(id) on delete cascade,
  path text not null unique,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create unique index shop_images_one_per_variant on public.shop_images (variant_id)
  where variant_id is not null;

create function public.shop_images_validate_variant() returns trigger language plpgsql
set search_path = public as $$
begin
  if new.variant_id is not null and not exists (
    select 1 from public.shop_variants v
    where v.id = new.variant_id and v.product_id = new.product_id
  ) then raise exception 'variant_product_mismatch'; end if;
  return new;
end;
$$;
create trigger shop_images_validate_variant before insert or update of product_id, variant_id
  on public.shop_images for each row execute function public.shop_images_validate_variant();

alter table public.shop_images enable row level security;
grant select on public.shop_images to anon;
grant select, insert, update, delete on public.shop_images to authenticated;
create policy shop_images_active_read on public.shop_images for select to anon, authenticated
  using (exists (select 1 from public.shop_products p where p.id = product_id and p.is_active));
create policy shop_images_admin_all on public.shop_images for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create or replace function public.shop_audit_admin_table_change() returns trigger language plpgsql
security definer set search_path = '' as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_changed text[];
  v_id uuid;
  v_entity text := case TG_TABLE_NAME
    when 'shop_products' then 'product'
    when 'shop_variants' then 'variant'
    when 'shop_images' then 'image'
    else 'payment_method' end;
begin
  if TG_OP = 'INSERT' then
    v_new := to_jsonb(NEW);
    select coalesce(array_agg(column_name order by column_name), array[]::text[]) into v_changed
      from jsonb_object_keys(v_new) as k(column_name);
    v_id := NEW.id;
  elsif TG_OP = 'UPDATE' then
    v_old := to_jsonb(OLD); v_new := to_jsonb(NEW);
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
create trigger shop_images_audit after insert or update or delete on public.shop_images
  for each row execute function public.shop_audit_admin_table_change();
