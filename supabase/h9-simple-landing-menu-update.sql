-- =====================================================
-- GreenroomID H9 - Simple Landing Header + Menu Cards
-- Jalankan jika ingin nilai default landing baru tersimpan di tabel landing_content.
-- Kode frontend tetap bisa berjalan tanpa SQL ini karena sudah memiliki fallback default.
-- =====================================================

INSERT INTO public.landing_content (content_key, content_value, label, group_name, sort_order)
VALUES
  ('brand_name', 'GreenroomID', 'Nama Brand', 'Header Card', 1),
  ('brand_tagline', 'Tugas digital, akademik, dan kreatif.', 'Tagline Singkat', 'Header Card', 2),
  ('header_description', 'GreenroomID membantu kebutuhan tugas digital dengan harga murah, alur rapi, free revisi, dan pilihan layanan yang bisa dicek langsung di website.', 'Deskripsi Singkat Header', 'Header Card', 3),
  ('logo_url', '/favicon.svg', 'URL Logo Header', 'Header Card', 4),
  ('login_button', 'Login', 'Tombol Login', 'Header Card', 5),
  ('stats_title', 'Ringkasan GreenroomID', 'Judul Statistik', 'Ringkasan Statistik', 6),
  ('stats_subtitle', 'Data singkat aktivitas website.', 'Subtitle Statistik', 'Ringkasan Statistik', 7),
  ('stats_total_views', 'Kunjungan', 'Label Total Kunjungan', 'Ringkasan Statistik', 8),
  ('stats_total_requests', 'Request', 'Label Total Request', 'Ringkasan Statistik', 9),
  ('stats_completed_requests', 'Selesai', 'Label Request Selesai', 'Ringkasan Statistik', 10),
  ('stats_active_services', 'Layanan', 'Label Layanan Aktif', 'Ringkasan Statistik', 11),
  ('menu_title', 'Menu Utama', 'Judul Menu', 'Menu Landing', 12),
  ('menu_subtitle', 'Pilih halaman yang ingin dibuka.', 'Subtitle Menu', 'Menu Landing', 13),
  ('menu_services_label', 'Daftar Layanan', 'Card 1 - Daftar Layanan', 'Menu Landing', 14),
  ('menu_services_description', 'Lihat {count} layanan aktif.', 'Deskripsi Daftar Layanan', 'Menu Landing', 15),
  ('menu_free_label', 'Layanan Gratis', 'Card 2 - Layanan Gratis', 'Menu Landing', 16),
  ('menu_free_description', 'Program gratis akan tersedia.', 'Deskripsi Layanan Gratis', 'Menu Landing', 17),
  ('menu_donate_label', 'Donate Us', 'Card 3 - Donate Us', 'Menu Landing', 18),
  ('menu_donate_description', 'Dukung pengembangan GreenroomID.', 'Deskripsi Donate Us', 'Menu Landing', 19),
  ('menu_top_donatur_label', 'Top Donatur', 'Card 4 - Top Donatur', 'Menu Landing', 20),
  ('menu_top_donatur_description', 'Daftar pendukung terbaik.', 'Deskripsi Top Donatur', 'Menu Landing', 21),
  ('menu_feedback_label', 'Kritik dan Saran', 'Card 5 - Kritik dan Saran', 'Menu Landing', 22),
  ('menu_feedback_description', 'Kirim masukan untuk perbaikan website.', 'Deskripsi Kritik dan Saran', 'Menu Landing', 23),
  ('menu_card_hint', 'Buka halaman →', 'Hint Card', 'Menu Landing', 24),
  ('contact_label', 'Butuh bantuan cepat?', 'Label Kontak', 'Kontak', 25),
  ('contact_text', 'Hubungi WhatsApp Business', 'Teks Link Kontak', 'Kontak', 26),
  ('contact_url', 'https://wa.me/62882006446617', 'URL Kontak', 'Kontak', 27),
  ('bottom_cta_title', 'Mulai request digitalmu di GreenroomID.', 'Judul CTA Bawah', 'CTA Bawah & Footer', 28),
  ('bottom_cta_description', 'Login dengan akun Google untuk membuat request, cek harga layanan, diskusi dengan admin, dan menerima hasil kerja secara lebih teratur.', 'Deskripsi CTA Bawah', 'CTA Bawah & Footer', 29),
  ('bottom_cta_button', 'Login dengan Google', 'Tombol CTA Bawah', 'CTA Bawah & Footer', 30),
  ('footer_text', 'GreenroomID. Layanan digital dengan harga terjangkau dan free revisi.', 'Teks Footer', 'CTA Bawah & Footer', 31)
ON CONFLICT (content_key) DO UPDATE
SET
  label = EXCLUDED.label,
  group_name = EXCLUDED.group_name,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
