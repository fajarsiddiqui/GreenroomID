-- =====================================================
-- GreenroomID H10 - SEO Logo + Free Image to Table
-- Jalankan file ini jika database sudah memakai update H7/H9.
-- Frontend tetap punya fallback, tetapi SQL ini menambahkan key logo khusus untuk menu Admin > Branding & SEO.
-- =====================================================

INSERT INTO public.landing_content (content_key, content_value, label, group_name, sort_order)
VALUES
  ('site_logo_url', '', 'URL Logo Website / Header Landing', 'Branding & SEO', 105)
ON CONFLICT (content_key) DO UPDATE
SET
  label = EXCLUDED.label,
  group_name = EXCLUDED.group_name,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

-- Catatan:
-- Upload logo bisa dilakukan dari Admin > Branding & SEO.
-- Landing akan memakai site_logo_url. Jika kosong, landing otomatis memakai site_favicon_url.
