-- GreenroomID Landing V5
-- Jalankan satu kali di Supabase SQL Editor.
-- Membuat bucket public untuk background landing dan membatasi upload ke admin.

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'landing-assets',
  'landing-assets',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Public dapat membaca background karena landing page dibuka tanpa login.
drop policy if exists "Public read landing assets" on storage.objects;
create policy "Public read landing assets"
on storage.objects
for select
to public
using (bucket_id = 'landing-assets');

-- Upload hanya untuk akun admin aktif atau email admin utama.
drop policy if exists "Admin insert landing assets" on storage.objects;
create policy "Admin insert landing assets"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'landing-assets'
  and (
    lower(coalesce(auth.jwt() ->> 'email', '')) = 'fajarsiddiqui00@gmail.com'
    or exists (
      select 1
      from public.user_profiles as profile
      where profile.id = auth.uid()
        and profile.role = 'admin'
        and coalesce(profile.is_active, true) = true
    )
  )
);

-- Disediakan untuk penggantian atau penghapusan asset melalui dashboard Supabase.
drop policy if exists "Admin update landing assets" on storage.objects;
create policy "Admin update landing assets"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'landing-assets'
  and (
    lower(coalesce(auth.jwt() ->> 'email', '')) = 'fajarsiddiqui00@gmail.com'
    or exists (
      select 1
      from public.user_profiles as profile
      where profile.id = auth.uid()
        and profile.role = 'admin'
        and coalesce(profile.is_active, true) = true
    )
  )
)
with check (
  bucket_id = 'landing-assets'
  and (
    lower(coalesce(auth.jwt() ->> 'email', '')) = 'fajarsiddiqui00@gmail.com'
    or exists (
      select 1
      from public.user_profiles as profile
      where profile.id = auth.uid()
        and profile.role = 'admin'
        and coalesce(profile.is_active, true) = true
    )
  )
);

drop policy if exists "Admin delete landing assets" on storage.objects;
create policy "Admin delete landing assets"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'landing-assets'
  and (
    lower(coalesce(auth.jwt() ->> 'email', '')) = 'fajarsiddiqui00@gmail.com'
    or exists (
      select 1
      from public.user_profiles as profile
      where profile.id = auth.uid()
        and profile.role = 'admin'
        and coalesce(profile.is_active, true) = true
    )
  )
);
