-- Read-only inventory for the main GreenroomID project.
-- Review results before any deletion; names alone do not prove an account is disposable.
select 'auth.users' as source, id::text, email, created_at
from auth.users
where email ~* '(^test[+._-]|[+._-]test@|@example\.(com|org|net)$|@test\.)'
order by created_at;

select 'shop_products' as source, id::text, name, created_at
from public.shop_products
where name ~* '(dummy|test|sample|contoh)'
order by created_at;

select 'shop_orders' as source, id::text, buyer_name, created_at
from public.shop_orders
where buyer_name ~* '(dummy|test|sample|contoh)'
order by created_at;

select id, name, public from storage.buckets order by id;
