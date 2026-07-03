-- =====================================================
-- GreenroomID RB-01 — Ruang Belajar
-- Hasil Pembelajaran Artikel (admin publishing)
--
-- Tujuan:
-- - Menyimpan metadata artikel sumber dan teks hasil pembelajaran.
-- - Tidak menyimpan PDF, gambar, tabel, screenshot, data responden,
--   file Word/Excel/SPSS, atau hasil PDF download.
-- - Satu artikel sumber dapat dipakai banyak hasil pembelajaran.
-- - Hanya admin yang dapat membuat/mengubah/menghapus pada RB-01.
-- - Publik hanya dapat membaca hasil pembelajaran berstatus published.
--
-- Prasyarat: account-management-update.sql / public.is_admin() sudah aktif.
-- Jalankan di Supabase Dashboard > SQL Editor.
-- =====================================================

-- =====================================================
-- 1. Artikel sumber: metadata ringan, tanpa file.
-- =====================================================
CREATE TABLE IF NOT EXISTS public.learning_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_title text NOT NULL,
  source_authors text,
  source_year integer CHECK (source_year IS NULL OR source_year BETWEEN 1000 AND 9999),
  source_journal text,
  source_volume_issue text,
  source_url text NOT NULL CHECK (source_url ~* '^https?://'),
  doi_url text CHECK (doi_url IS NULL OR doi_url ~* '^https?://'),
  discipline text NOT NULL DEFAULT 'Pendidikan',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS learning_sources_discipline_idx
ON public.learning_sources(discipline);

CREATE INDEX IF NOT EXISTS learning_sources_year_idx
ON public.learning_sources(source_year DESC NULLS LAST);

-- =====================================================
-- 2. Hasil pembelajaran: satu baris = satu pembelajar
-- terhadap satu artikel sumber.
-- =====================================================
CREATE TABLE IF NOT EXISTS public.learning_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES public.learning_sources(id) ON DELETE RESTRICT,
  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  title text NOT NULL,
  slug text NOT NULL,
  short_code text NOT NULL UNIQUE CHECK (short_code ~* '^[a-z0-9]{6,12}$'),
  excerpt text NOT NULL DEFAULT '',
  discipline text NOT NULL DEFAULT 'Pendidikan',
  method_tags text[] NOT NULL DEFAULT ARRAY[]::text[],
  analysis_tags text[] NOT NULL DEFAULT ARRAY[]::text[],
  studied_by_name text NOT NULL DEFAULT 'GreenroomID',
  studied_at date NOT NULL DEFAULT current_date,
  summary_own_words text NOT NULL,
  research_purpose text,
  research_design text,
  participants text,
  variables_focus text,
  instruments text,
  data_analysis text,
  analysis_flow text,
  reported_findings text,
  learning_points text,
  critical_notes text,
  references_text text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT learning_entries_published_timestamp_check CHECK (
    (status = 'published' AND published_at IS NOT NULL)
    OR status IN ('draft', 'archived')
  )
);

CREATE INDEX IF NOT EXISTS learning_entries_public_catalog_idx
ON public.learning_entries(status, published_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS learning_entries_discipline_idx
ON public.learning_entries(discipline);

CREATE INDEX IF NOT EXISTS learning_entries_method_tags_gin_idx
ON public.learning_entries USING gin(method_tags);

CREATE INDEX IF NOT EXISTS learning_entries_analysis_tags_gin_idx
ON public.learning_entries USING gin(analysis_tags);

CREATE INDEX IF NOT EXISTS learning_entries_source_idx
ON public.learning_entries(source_id);

-- Trigger updated_at agar catatan admin tetap konsisten.
CREATE OR REPLACE FUNCTION public.set_learning_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_learning_sources_updated_at ON public.learning_sources;
CREATE TRIGGER set_learning_sources_updated_at
BEFORE UPDATE ON public.learning_sources
FOR EACH ROW
EXECUTE FUNCTION public.set_learning_updated_at();

DROP TRIGGER IF EXISTS set_learning_entries_updated_at ON public.learning_entries;
CREATE TRIGGER set_learning_entries_updated_at
BEFORE UPDATE ON public.learning_entries
FOR EACH ROW
EXECUTE FUNCTION public.set_learning_updated_at();

COMMENT ON TABLE public.learning_sources IS 'Metadata artikel sumber untuk Ruang Belajar. Tidak menyimpan file artikel.';
COMMENT ON TABLE public.learning_entries IS 'Hasil pembelajaran artikel dengan kata-kata sendiri. Satu source dapat memiliki banyak entry.';
COMMENT ON COLUMN public.learning_entries.summary_own_words IS 'Ringkasan hasil pemahaman pembelajar, bukan salinan artikel.';

-- =====================================================
-- 3. Row Level Security.
-- =====================================================
ALTER TABLE public.learning_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_entries ENABLE ROW LEVEL SECURITY;

-- Bersihkan jika script dijalankan ulang.
DROP POLICY IF EXISTS "Learning sources public read when published entry exists" ON public.learning_sources;
DROP POLICY IF EXISTS "Learning sources authenticated read published or admin" ON public.learning_sources;
DROP POLICY IF EXISTS "Learning sources admin insert" ON public.learning_sources;
DROP POLICY IF EXISTS "Learning sources admin update" ON public.learning_sources;
DROP POLICY IF EXISTS "Learning sources admin delete" ON public.learning_sources;

DROP POLICY IF EXISTS "Learning entries public read published" ON public.learning_entries;
DROP POLICY IF EXISTS "Learning entries authenticated read published or admin" ON public.learning_entries;
DROP POLICY IF EXISTS "Learning entries admin insert" ON public.learning_entries;
DROP POLICY IF EXISTS "Learning entries admin update" ON public.learning_entries;
DROP POLICY IF EXISTS "Learning entries admin delete" ON public.learning_entries;

-- Metadata sumber hanya publik jika minimal ada hasil pembelajaran terbit
-- yang memakai sumber tersebut. Admin selalu dapat membaca semua metadata.
CREATE POLICY "Learning sources public read when published entry exists"
ON public.learning_sources
FOR SELECT
TO anon
USING (
  EXISTS (
    SELECT 1
    FROM public.learning_entries le
    WHERE le.source_id = learning_sources.id
      AND le.status = 'published'
  )
);

CREATE POLICY "Learning sources authenticated read published or admin"
ON public.learning_sources
FOR SELECT
TO authenticated
USING (
  public.is_admin()
  OR EXISTS (
    SELECT 1
    FROM public.learning_entries le
    WHERE le.source_id = learning_sources.id
      AND le.status = 'published'
  )
);

CREATE POLICY "Learning sources admin insert"
ON public.learning_sources
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin());

CREATE POLICY "Learning sources admin update"
ON public.learning_sources
FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "Learning sources admin delete"
ON public.learning_sources
FOR DELETE
TO authenticated
USING (public.is_admin());

-- Katalog publik hanya menerima entry published.
CREATE POLICY "Learning entries public read published"
ON public.learning_entries
FOR SELECT
TO anon
USING (status = 'published');

CREATE POLICY "Learning entries authenticated read published or admin"
ON public.learning_entries
FOR SELECT
TO authenticated
USING (status = 'published' OR public.is_admin());

CREATE POLICY "Learning entries admin insert"
ON public.learning_entries
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin());

CREATE POLICY "Learning entries admin update"
ON public.learning_entries
FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "Learning entries admin delete"
ON public.learning_entries
FOR DELETE
TO authenticated
USING (public.is_admin());

REVOKE ALL ON public.learning_sources FROM anon;
REVOKE ALL ON public.learning_entries FROM anon;

GRANT SELECT ON public.learning_sources, public.learning_entries TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.learning_sources, public.learning_entries TO authenticated;

-- =====================================================
-- 4. Default teks menu landing. Frontend juga punya fallback,
-- jadi website tetap aman bila bagian ini dilewati.
-- =====================================================
INSERT INTO public.landing_content (content_key, content_value, label, group_name, sort_order)
VALUES
  ('menu_learning_label', 'Ruang Belajar', 'Card 3 - Ruang Belajar', 'Menu Landing', 8),
  ('menu_learning_description', 'Baca hasil pembelajaran artikel ilmiah yang dipublikasikan.', 'Deskripsi Ruang Belajar', 'Menu Landing', 9)
ON CONFLICT (content_key) DO NOTHING;

NOTIFY pgrst, 'reload schema';

-- =====================================================
-- 5. Cek hasil: seharusnya dua tabel muncul dengan RLS aktif.
-- =====================================================
SELECT
  tablename,
  rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('learning_sources', 'learning_entries')
ORDER BY tablename;
