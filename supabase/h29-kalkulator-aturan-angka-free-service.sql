-- =====================================================
-- GreenroomID H29 - Kalkulator Aturan Angka as Free Service
-- Menambahkan tool Kalkulator Aturan Angka ke menu Layanan Gratis.
-- Aplikasi tidak menyimpan file hasil. Database hanya menyimpan statistik event penggunaan.
-- =====================================================

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

INSERT INTO public.free_services (slug, title, description, route_path, icon, sort_order, status, status_message)
VALUES (
  'kalkulator_aturan_angka',
  'Kalkulator Aturan Angka',
  'Cari angka cocok dari anggaran, rentang harga, jumlah, total, dan sisa tanpa menyimpan file hasil.',
  '/kalkulator-aturan-angka',
  '🧮',
  30,
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
