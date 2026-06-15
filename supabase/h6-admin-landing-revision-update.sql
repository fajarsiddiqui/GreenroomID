-- =====================================================
-- GreenroomID H6 - Admin Landing Editor + Revision Window
-- Jalankan file ini di Supabase SQL Editor sebelum deploy kode H6.
-- Fitur:
-- 1. Admin bisa mengubah teks landing page.
-- 2. Admin bisa mengatur default dan override waktu/kuota free revisi.
-- 3. Client bisa mengajukan revisi hanya selama window revisi masih aktif.
-- =====================================================

-- =====================================================
-- 1. LANDING PAGE CONTENT
-- =====================================================

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
  ('brand_name', 'GreenroomID', 'Nama Brand', 'Header', 1),
  ('brand_tagline', 'Platform Freelance Terkelola', 'Tagline Header', 'Header', 2),
  ('login_button', 'Masuk', 'Tombol Masuk', 'Header', 3),
  ('hero_badge', 'Request kerja lebih rapi dan terpantau', 'Badge Hero', 'Hero Section', 4),
  ('hero_title', 'Kelola request desain, video, penulisan, dan programming dalam satu tempat.', 'Judul Utama', 'Hero Section', 5),
  ('hero_description', 'GreenroomID membantu client mengirim request, melampirkan file, berdiskusi dengan admin, melihat invoice, upload bukti pembayaran, dan menerima hasil kerja secara lebih terstruktur.', 'Deskripsi Hero', 'Hero Section', 6),
  ('primary_cta', 'Mulai Request Sekarang', 'Tombol CTA Utama', 'Hero Section', 7),
  ('secondary_cta', 'Lihat Cara Kerja', 'Tombol CTA Kedua', 'Hero Section', 8),
  ('contact_label', 'Kontak Person', 'Label Kontak', 'Kontak', 9),
  ('contact_text', 'WhatsApp Business', 'Teks Link Kontak', 'Kontak', 10),
  ('contact_url', 'https://wa.me/62882006446617', 'URL Kontak', 'Kontak', 11),
  ('stats_title', 'Statistik Platform', 'Judul Statistik', 'Statistik', 12),
  ('stats_subtitle', 'Ringkasan aktivitas GreenroomID', 'Subtitle Statistik', 'Statistik', 13),
  ('stats_total_views', 'Total Kunjungan', 'Label Total Kunjungan', 'Statistik', 14),
  ('stats_total_requests', 'Total Request', 'Label Total Request', 'Statistik', 15),
  ('stats_completed_requests', 'Request Selesai', 'Label Request Selesai', 'Statistik', 16),
  ('stats_active_services', 'Layanan Aktif', 'Label Layanan Aktif', 'Statistik', 17),
  ('stats_services_hint', 'Klik untuk lihat layanan →', 'Hint Layanan Aktif', 'Statistik', 18),
  ('sample_request_title', 'Request Saya', 'Judul Card Request', 'Preview Card Landing', 19),
  ('sample_request_status', 'PENDING', 'Status Card Request', 'Preview Card Landing', 20),
  ('sample_request_description', 'Desain logo, edit video, revisi dokumen, atau kebutuhan digital lainnya.', 'Deskripsi Card Request', 'Preview Card Landing', 21),
  ('sample_request_category', 'Kategori: Desain', 'Info Kategori', 'Preview Card Landing', 22),
  ('sample_request_file', 'File: 3 lampiran', 'Info File', 'Preview Card Landing', 23),
  ('discussion_title', 'Diskusi Admin', 'Judul Diskusi', 'Preview Card Landing', 24),
  ('discussion_description', 'Semua komunikasi terkait request tersimpan dalam satu halaman detail.', 'Deskripsi Diskusi', 'Preview Card Landing', 25),
  ('result_title', 'File Hasil', 'Judul File Hasil', 'Preview Card Landing', 26),
  ('result_description', 'Client dapat mengunduh hasil setelah proses pembayaran dan verifikasi selesai.', 'Deskripsi File Hasil', 'Preview Card Landing', 27),
  ('bottom_cta_title', 'Siap membuat request pertama?', 'Judul CTA Bawah', 'CTA Bawah & Footer', 28),
  ('bottom_cta_description', 'Masuk dengan akun Google untuk mulai menggunakan GreenroomID.', 'Deskripsi CTA Bawah', 'CTA Bawah & Footer', 29),
  ('bottom_cta_button', 'Masuk dengan Google', 'Tombol CTA Bawah', 'CTA Bawah & Footer', 30),
  ('footer_text', 'GreenroomID. Platform Freelance Terkelola.', 'Teks Footer', 'CTA Bawah & Footer', 31)
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
-- 2. REVISION SETTINGS
-- =====================================================

CREATE TABLE IF NOT EXISTS public.revision_settings (
  id text PRIMARY KEY DEFAULT 'default',
  free_revision_count integer NOT NULL DEFAULT 2,
  revision_window_days integer NOT NULL DEFAULT 14,
  policy_text text NOT NULL DEFAULT 'Free revisi setelah file diterima adalah 2 kali dalam waktu 2 minggu. Jika tidak ada revisi selama waktu tersebut, file dianggap selesai dikerjakan dan diterima dengan baik oleh client.',
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.revision_settings (id, free_revision_count, revision_window_days, policy_text)
VALUES (
  'default',
  2,
  14,
  'Free revisi setelah file diterima adalah 2 kali dalam waktu 2 minggu. Jika tidak ada revisi selama waktu tersebut, file dianggap selesai dikerjakan dan diterima dengan baik oleh client.'
)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.revision_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Revision settings select authenticated" ON public.revision_settings;
DROP POLICY IF EXISTS "Revision settings insert admin only" ON public.revision_settings;
DROP POLICY IF EXISTS "Revision settings update admin only" ON public.revision_settings;

CREATE POLICY "Revision settings select authenticated"
ON public.revision_settings
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Revision settings insert admin only"
ON public.revision_settings
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin());

CREATE POLICY "Revision settings update admin only"
ON public.revision_settings
FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

GRANT SELECT, INSERT, UPDATE ON public.revision_settings TO authenticated;

-- =====================================================
-- 3. REQUEST REVISION COLUMNS
-- =====================================================

ALTER TABLE public.requests
ADD COLUMN IF NOT EXISTS revision_started_at timestamptz,
ADD COLUMN IF NOT EXISTS revision_deadline_at timestamptz,
ADD COLUMN IF NOT EXISTS revision_limit integer DEFAULT 2,
ADD COLUMN IF NOT EXISTS revision_used_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS revision_window_days integer DEFAULT 14,
ADD COLUMN IF NOT EXISTS revision_policy_note text;

CREATE INDEX IF NOT EXISTS requests_revision_deadline_idx
ON public.requests (revision_deadline_at)
WHERE revision_started_at IS NOT NULL AND deleted_at IS NULL;

-- =====================================================
-- 4. CLIENT REVISION RPC
-- =====================================================

CREATE OR REPLACE FUNCTION public.client_register_revision_request(target_request_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_request public.requests%ROWTYPE;
  next_revision integer;
BEGIN
  SELECT *
  INTO target_request
  FROM public.requests
  WHERE id::text = target_request_id
    AND client_id = auth.uid()
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request tidak ditemukan atau bukan milik user ini';
  END IF;

  IF target_request.revision_started_at IS NULL
     OR target_request.revision_deadline_at IS NULL
     OR COALESCE(target_request.revision_limit, 0) <= 0 THEN
    RAISE EXCEPTION 'Masa revisi belum aktif untuk request ini';
  END IF;

  IF now() > target_request.revision_deadline_at THEN
    RAISE EXCEPTION 'Masa revisi sudah berakhir';
  END IF;

  IF COALESCE(target_request.revision_used_count, 0) >= COALESCE(target_request.revision_limit, 0) THEN
    RAISE EXCEPTION 'Kuota revisi sudah habis';
  END IF;

  next_revision := COALESCE(target_request.revision_used_count, 0) + 1;

  UPDATE public.requests
  SET
    revision_used_count = next_revision,
    status = 'REVIEW'
  WHERE id::text = target_request_id;

  RETURN jsonb_build_object(
    'request_id', target_request_id,
    'revision_number', next_revision,
    'revision_limit', target_request.revision_limit,
    'revision_deadline_at', target_request.revision_deadline_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.client_register_revision_request(text) TO authenticated;

-- =====================================================
-- 5. PROTECT REQUEST ADMIN FIELDS WITH REVISION EXCEPTION
-- =====================================================

CREATE OR REPLACE FUNCTION public.protect_request_admin_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  revision_submit boolean;
BEGIN
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF OLD.client_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Tidak boleh mengubah request milik user lain';
  END IF;

  IF OLD.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Request sudah dihapus';
  END IF;

  revision_submit :=
    NEW.id IS NOT DISTINCT FROM OLD.id
    AND NEW.created_at IS NOT DISTINCT FROM OLD.created_at
    AND NEW.client_id IS NOT DISTINCT FROM OLD.client_id
    AND NEW.client_email IS NOT DISTINCT FROM OLD.client_email
    AND NEW.judul IS NOT DISTINCT FROM OLD.judul
    AND NEW.deskripsi IS NOT DISTINCT FROM OLD.deskripsi
    AND NEW.kategori IS NOT DISTINCT FROM OLD.kategori
    AND NEW.file_url IS NOT DISTINCT FROM OLD.file_url
    AND NEW.file_urls IS NOT DISTINCT FROM OLD.file_urls
    AND NEW.harga IS NOT DISTINCT FROM OLD.harga
    AND NEW.deadline_at IS NOT DISTINCT FROM OLD.deadline_at
    AND NEW.invoice_status IS NOT DISTINCT FROM OLD.invoice_status
    AND NEW.payment_status IS NOT DISTINCT FROM OLD.payment_status
    AND NEW.payment_proof_url IS NOT DISTINCT FROM OLD.payment_proof_url
    AND NEW.hasil_url IS NOT DISTINCT FROM OLD.hasil_url
    AND NEW.admin_note IS NOT DISTINCT FROM OLD.admin_note
    AND NEW.deleted_at IS NOT DISTINCT FROM OLD.deleted_at
    AND NEW.deleted_by IS NOT DISTINCT FROM OLD.deleted_by
    AND NEW.delete_reason IS NOT DISTINCT FROM OLD.delete_reason
    AND NEW.revision_started_at IS NOT DISTINCT FROM OLD.revision_started_at
    AND NEW.revision_deadline_at IS NOT DISTINCT FROM OLD.revision_deadline_at
    AND NEW.revision_limit IS NOT DISTINCT FROM OLD.revision_limit
    AND NEW.revision_window_days IS NOT DISTINCT FROM OLD.revision_window_days
    AND NEW.revision_policy_note IS NOT DISTINCT FROM OLD.revision_policy_note
    AND NEW.status = 'REVIEW'
    AND NEW.revision_used_count = COALESCE(OLD.revision_used_count, 0) + 1
    AND OLD.revision_started_at IS NOT NULL
    AND OLD.revision_deadline_at IS NOT NULL
    AND now() <= OLD.revision_deadline_at
    AND COALESCE(OLD.revision_used_count, 0) < COALESCE(OLD.revision_limit, 0);

  IF revision_submit THEN
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
    OR NEW.client_id IS DISTINCT FROM OLD.client_id
    OR NEW.client_email IS DISTINCT FROM OLD.client_email
    OR NEW.judul IS DISTINCT FROM OLD.judul
    OR NEW.deskripsi IS DISTINCT FROM OLD.deskripsi
    OR NEW.kategori IS DISTINCT FROM OLD.kategori
    OR NEW.file_url IS DISTINCT FROM OLD.file_url
    OR NEW.file_urls IS DISTINCT FROM OLD.file_urls
    OR NEW.harga IS DISTINCT FROM OLD.harga
    OR NEW.invoice_status IS DISTINCT FROM OLD.invoice_status
    OR NEW.hasil_url IS DISTINCT FROM OLD.hasil_url
    OR NEW.admin_note IS DISTINCT FROM OLD.admin_note
    OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
    OR NEW.deleted_by IS DISTINCT FROM OLD.deleted_by
    OR NEW.delete_reason IS DISTINCT FROM OLD.delete_reason
    OR NEW.revision_started_at IS DISTINCT FROM OLD.revision_started_at
    OR NEW.revision_deadline_at IS DISTINCT FROM OLD.revision_deadline_at
    OR NEW.revision_limit IS DISTINCT FROM OLD.revision_limit
    OR NEW.revision_used_count IS DISTINCT FROM OLD.revision_used_count
    OR NEW.revision_window_days IS DISTINCT FROM OLD.revision_window_days
    OR NEW.revision_policy_note IS DISTINCT FROM OLD.revision_policy_note
  THEN
    RAISE EXCEPTION 'Client tidak boleh mengubah data admin request';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
    AND NEW.status <> 'PAYMENT UPLOADED'
  THEN
    RAISE EXCEPTION 'Client hanya boleh mengubah status menjadi PAYMENT UPLOADED';
  END IF;

  IF NEW.payment_status IS DISTINCT FROM OLD.payment_status
    AND NEW.payment_status <> 'UPLOADED'
  THEN
    RAISE EXCEPTION 'Client tidak boleh mengubah status pembayaran selain UPLOADED';
  END IF;

  IF NEW.payment_proof_url IS DISTINCT FROM OLD.payment_proof_url
    AND NEW.payment_proof_url IS NULL
  THEN
    RAISE EXCEPTION 'Bukti pembayaran tidak boleh dikosongkan';
  END IF;

  -- deadline_at tetap mengikuti perilaku H4: client masih boleh memperbarui instruksi deadline.
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_request_admin_fields_trigger ON public.requests;
CREATE TRIGGER protect_request_admin_fields_trigger
BEFORE UPDATE ON public.requests
FOR EACH ROW
EXECUTE FUNCTION public.protect_request_admin_fields();

-- =====================================================
-- 6. AUDIT LOG NOTES
-- Action baru dari frontend:
-- CLIENT_REVISION_REQUESTED
-- =====================================================
