-- =====================================================
-- GreenroomID H43 - Landing Navigation Taxonomy
--
-- NAV-01A
-- Sinkronisasi data landing untuk struktur kategori:
--   Scene Layanan:
--     1. Layanan
--     2. Tools Gratis
--     3. Ruang Belajar
--
--   Scene Ruang & Alat:
--     1. Studio Artikel
--     2. AI Tools
--
-- Migration ini hanya mengubah data landing_content.
-- Tidak mengubah schema dan tidak menghapus row.
-- =====================================================

INSERT INTO public.landing_content (
  content_key,
  content_value,
  label,
  group_name,
  sort_order
)
VALUES
  (
    'menu_services_label',
    'Layanan',
    'Nama Layanan',
    'Scene 2 — Layanan',
    22
  ),
  (
    'menu_services_description',
    'Lihat {count} layanan aktif.',
    'Deskripsi Layanan',
    'Scene 2 — Layanan',
    23
  ),
  (
    'menu_free_label',
    'Tools Gratis',
    'Nama Tools Gratis',
    'Scene 2 — Layanan',
    24
  ),
  (
    'menu_free_description',
    'Gunakan alat digital gratis yang tersedia.',
    'Deskripsi Tools Gratis',
    'Scene 2 — Layanan',
    25
  ),
  (
    'menu_learning_label',
    'Ruang Belajar',
    'Nama Ruang Belajar',
    'Scene 2 — Layanan',
    26
  ),
  (
    'menu_learning_description',
    'Baca panduan praktis GreenroomID untuk dokumen dan pekerjaan digital.',
    'Deskripsi Ruang Belajar',
    'Scene 2 — Layanan',
    27
  ),
  (
    'workspace_description',
    'Buka Studio Artikel dan AI Tools melalui ruang yang terpisah sesuai kebutuhan.',
    'Deskripsi Scene',
    'Scene 3 — Ruang & Alat',
    31
  ),
  (
    'menu_studio_label',
    'Studio Artikel',
    'Nama Studio Artikel',
    'Scene 3 — Ruang & Alat',
    32
  ),
  (
    'menu_studio_description',
    'Baca Studio Artikel ilmiah yang dipublikasikan.',
    'Deskripsi Studio Artikel',
    'Scene 3 — Ruang & Alat',
    33
  ),
  (
    'menu_ai_tools_label',
    'AI Tools',
    'Nama AI Tools',
    'Scene 3 — Ruang & Alat',
    34
  ),
  (
    'menu_ai_tools_description',
    'Isi formulir terstruktur dan dapatkan prompt siap pakai.',
    'Deskripsi AI Tools',
    'Scene 3 — Ruang & Alat',
    35
  )
ON CONFLICT (content_key) DO UPDATE
SET
  content_value = EXCLUDED.content_value,
  label = EXCLUDED.label,
  group_name = EXCLUDED.group_name,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();