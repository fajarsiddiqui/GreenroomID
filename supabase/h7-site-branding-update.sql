-- =====================================================
-- GreenroomID H7 - Branding & SEO Admin Update
-- Jalankan file ini di Supabase SQL Editor sebelum memakai menu:
-- Admin > Branding & SEO
--
-- Fitur:
-- 1. Menambahkan data default nama situs, title, description, canonical URL,
--    favicon, dan Open Graph image ke tabel landing_content.
-- 2. Membuat bucket public "site-assets" untuk upload favicon dan gambar preview.
-- 3. Membatasi upload/update/delete file di bucket tersebut hanya untuk admin.
-- =====================================================

-- Pastikan tabel landing_content sudah ada.
CREATE TABLE IF NOT EXISTS public.landing_content (
  content_key text PRIMARY KEY,
  content_value text NOT NULL DEFAULT '',
  label text,
  group_name text,
  sort_order integer DEFAULT 0,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.landing_content (content_key, content_value, label, group_name, sort_order)
VALUES
  ('site_name', 'GreenroomID', 'Nama Situs', 'Branding & SEO', 101),
  ('site_title', 'GreenroomID - Platform Freelance Terkelola', 'Judul Google / Browser', 'Branding & SEO', 102),
  ('site_description', 'GreenroomID adalah platform freelance terkelola untuk submit request desain, video, penulisan, programming, diskusi, invoice, pembayaran, dan pengiriman hasil kerja.', 'Deskripsi Google', 'Branding & SEO', 103),
  ('site_canonical_url', 'https://www.greenroomid.com', 'Domain Utama / Canonical URL', 'Branding & SEO', 104),
  ('site_favicon_url', '/favicon.svg', 'URL Favicon / Ikon Pencarian Google', 'Branding & SEO', 105),
  ('site_og_image_url', '', 'URL Gambar Preview Share', 'Branding & SEO', 106)
ON CONFLICT (content_key) DO NOTHING;

ALTER TABLE public.landing_content ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Landing content public select" ON public.landing_content;
DROP POLICY IF EXISTS "Landing content admin insert" ON public.landing_content;
DROP POLICY IF EXISTS "Landing content admin update" ON public.landing_content;

CREATE POLICY "Landing content public select"
ON public.landing_content
FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "Landing content admin insert"
ON public.landing_content
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin());

CREATE POLICY "Landing content admin update"
ON public.landing_content
FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

GRANT SELECT ON public.landing_content TO anon, authenticated;
GRANT INSERT, UPDATE ON public.landing_content TO authenticated;

-- =====================================================
-- Supabase Storage: site-assets
-- =====================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'site-assets',
  'site-assets',
  true,
  2097152,
  ARRAY[
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/svg+xml',
    'image/x-icon',
    'image/vnd.microsoft.icon'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Site assets public read" ON storage.objects;
DROP POLICY IF EXISTS "Site assets admin insert" ON storage.objects;
DROP POLICY IF EXISTS "Site assets admin update" ON storage.objects;
DROP POLICY IF EXISTS "Site assets admin delete" ON storage.objects;

CREATE POLICY "Site assets public read"
ON storage.objects
FOR SELECT
TO anon, authenticated
USING (bucket_id = 'site-assets');

CREATE POLICY "Site assets admin insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'site-assets' AND public.is_admin());

CREATE POLICY "Site assets admin update"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'site-assets' AND public.is_admin())
WITH CHECK (bucket_id = 'site-assets' AND public.is_admin());

CREATE POLICY "Site assets admin delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'site-assets' AND public.is_admin());
