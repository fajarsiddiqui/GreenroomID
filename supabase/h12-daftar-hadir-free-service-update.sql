-- =====================================================
-- GreenroomID H12 - Daftar Hadir as Free Service
-- Menambahkan tool Daftar Hadir ke Layanan Gratis.
-- File, gambar, isi daftar hadir, Word, Excel, dan PDF client TIDAK disimpan ke database/storage.
-- Database hanya menyimpan statistik event penggunaan: slug layanan, action, visitor_id, user_id, dan waktu.
-- =====================================================

-- 1. Pastikan master layanan gratis tersedia.
CREATE TABLE IF NOT EXISTS public.free_services (
  slug text PRIMARY KEY,
  title text NOT NULL,
  description text DEFAULT '',
  route_path text DEFAULT '/',
  icon text DEFAULT '🎁',
  sort_order integer DEFAULT 100,
  status text NOT NULL DEFAULT 'active',
  status_message text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT free_services_status_check CHECK (status IN ('active', 'maintenance', 'inactive'))
);

CREATE INDEX IF NOT EXISTS free_services_status_idx ON public.free_services(status);
CREATE INDEX IF NOT EXISTS free_services_sort_order_idx ON public.free_services(sort_order);

-- 2. Pastikan tabel event hanya menyimpan hitungan/pemakaian, bukan file client.
CREATE TABLE IF NOT EXISTS public.free_service_usage_events (
  id bigserial PRIMARY KEY,
  service_slug text NOT NULL REFERENCES public.free_services(slug) ON DELETE CASCADE,
  action text NOT NULL DEFAULT 'use',
  visitor_id text,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.free_service_usage_events
  DROP CONSTRAINT IF EXISTS free_service_usage_action_check;

ALTER TABLE public.free_service_usage_events
  ADD CONSTRAINT free_service_usage_action_check
  CHECK (action IN ('use', 'download_pdf', 'download_excel', 'download_word', 'print'));

CREATE INDEX IF NOT EXISTS free_service_usage_service_idx ON public.free_service_usage_events(service_slug);
CREATE INDEX IF NOT EXISTS free_service_usage_action_idx ON public.free_service_usage_events(action);
CREATE INDEX IF NOT EXISTS free_service_usage_created_idx ON public.free_service_usage_events(created_at DESC);

-- 3. Tambahkan/rapikan daftar layanan gratis.
INSERT INTO public.free_services (slug, title, description, route_path, icon, sort_order, status, status_message)
VALUES
  (
    'image_to_table',
    'Image to Table',
    'Susun banyak gambar ke tabel rapi, atur ukuran kertas, caption, layout, lalu download hasilnya ke PDF.',
    '/image-to-table',
    '🖼️',
    10,
    'active',
    'Layanan bisa digunakan.'
  ),
  (
    'daftar_hadir',
    'Daftar Hadir',
    'Buat daftar hadir rapor dengan kolom, baris, data, tanda tangan, dan export dokumen dari browser.',
    '/daftar-hadir',
    '📋',
    20,
    'active',
    'Layanan bisa digunakan.'
  )
ON CONFLICT (slug) DO UPDATE
SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  route_path = EXCLUDED.route_path,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

-- 4. RLS tetap aktif. Akses browser memakai RPC security definer.
ALTER TABLE public.free_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.free_service_usage_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Free services public read" ON public.free_services;
CREATE POLICY "Free services public read"
ON public.free_services
FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "Free service usage no direct public read" ON public.free_service_usage_events;
CREATE POLICY "Free service usage no direct public read"
ON public.free_service_usage_events
FOR SELECT
TO authenticated
USING (public.is_admin());

-- 5. Public data untuk halaman layanan gratis.
CREATE OR REPLACE FUNCTION public.get_public_free_services()
RETURNS TABLE (
  slug text,
  title text,
  description text,
  route_path text,
  icon text,
  status text,
  status_message text,
  sort_order integer
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    fs.slug,
    fs.title,
    fs.description,
    fs.route_path,
    fs.icon,
    fs.status,
    fs.status_message,
    fs.sort_order
  FROM public.free_services fs
  ORDER BY fs.sort_order ASC, fs.title ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_free_services() TO anon, authenticated;

-- 6. Tracking statistik penggunaan. Hanya menyimpan slug layanan, action, visitor_id, user_id, dan waktu.
CREATE OR REPLACE FUNCTION public.track_free_service_usage(
  p_service_slug text,
  p_action text DEFAULT 'use',
  p_visitor_id text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_action text;
BEGIN
  SELECT status INTO v_status
  FROM public.free_services
  WHERE slug = p_service_slug;

  IF v_status IS NULL THEN
    RETURN;
  END IF;

  IF v_status <> 'active' THEN
    RETURN;
  END IF;

  v_action := CASE
    WHEN p_action IN ('use', 'download_pdf', 'download_excel', 'download_word', 'print') THEN p_action
    ELSE 'use'
  END;

  INSERT INTO public.free_service_usage_events (service_slug, action, visitor_id, user_id)
  VALUES (p_service_slug, v_action, NULLIF(p_visitor_id, ''), auth.uid());
END;
$$;

GRANT EXECUTE ON FUNCTION public.track_free_service_usage(text, text, text) TO anon, authenticated;

-- 7. Total penggunaan untuk statistik landing.
CREATE OR REPLACE FUNCTION public.get_free_service_usage_total()
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::bigint
  FROM public.free_service_usage_events;
$$;

GRANT EXECUTE ON FUNCTION public.get_free_service_usage_total() TO anon, authenticated;

-- 8. Statistik admin per layanan gratis.
DROP FUNCTION IF EXISTS public.get_free_service_admin_stats();

CREATE OR REPLACE FUNCTION public.get_free_service_admin_stats()
RETURNS TABLE (
  slug text,
  title text,
  description text,
  route_path text,
  icon text,
  sort_order integer,
  status text,
  status_message text,
  total_usage bigint,
  download_pdf_count bigint,
  print_count bigint,
  updated_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    fs.slug,
    fs.title,
    fs.description,
    fs.route_path,
    fs.icon,
    fs.sort_order,
    fs.status,
    fs.status_message,
    count(e.id)::bigint AS total_usage,
    count(e.id) FILTER (WHERE e.action IN ('download_pdf', 'download_excel', 'download_word'))::bigint AS download_pdf_count,
    count(e.id) FILTER (WHERE e.action = 'print')::bigint AS print_count,
    fs.updated_at
  FROM public.free_services fs
  LEFT JOIN public.free_service_usage_events e ON e.service_slug = fs.slug
  WHERE public.is_admin()
  GROUP BY fs.slug, fs.title, fs.description, fs.route_path, fs.icon, fs.sort_order, fs.status, fs.status_message, fs.updated_at
  ORDER BY fs.sort_order ASC, fs.title ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_free_service_admin_stats() TO authenticated;

-- 9. Admin mengubah status layanan gratis.
CREATE OR REPLACE FUNCTION public.update_free_service_status(
  p_slug text,
  p_status text,
  p_status_message text DEFAULT ''
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Tidak diizinkan mengubah layanan gratis';
  END IF;

  IF p_status NOT IN ('active', 'maintenance', 'inactive') THEN
    RAISE EXCEPTION 'Status layanan gratis tidak valid';
  END IF;

  UPDATE public.free_services
  SET
    status = p_status,
    status_message = coalesce(p_status_message, ''),
    updated_at = now()
  WHERE slug = p_slug;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_free_service_status(text, text, text) TO authenticated;
