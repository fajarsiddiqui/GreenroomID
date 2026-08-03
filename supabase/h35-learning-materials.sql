BEGIN;

-- =====================================================
-- GreenroomID H35 - Learning Materials
-- Materi publik dinamis untuk /ruang-belajar.
--
-- Konten disimpan sebagai Markdown mentah. Aplikasi wajib merender
-- dan menyanitasi Markdown sebelum menampilkannya sebagai HTML.
-- =====================================================

CREATE TABLE IF NOT EXISTS public.learning_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  title text NOT NULL,
  slug text NOT NULL,
  excerpt text NOT NULL DEFAULT '',
  content_markdown text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'umum',

  status text NOT NULL DEFAULT 'draft',

  meta_title text,
  meta_description text,

  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  last_deploy_triggered_at timestamptz,
  last_deploy_status text,

  CONSTRAINT learning_materials_slug_unique UNIQUE (slug),
  CONSTRAINT learning_materials_slug_format_check CHECK (
    slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  ),
  CONSTRAINT learning_materials_status_check CHECK (
    status IN ('draft', 'published', 'archived')
  ),
  CONSTRAINT learning_materials_last_deploy_status_check CHECK (
    last_deploy_status IS NULL
    OR last_deploy_status IN ('pending', 'triggered', 'failed_to_trigger')
  ),
  CONSTRAINT learning_materials_published_required_fields_check CHECK (
    status <> 'published'
    OR (
      length(trim(title)) > 0
      AND slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
      AND length(trim(excerpt)) > 0
      AND length(trim(content_markdown)) > 0
      AND published_at IS NOT NULL
    )
  )
);

CREATE INDEX IF NOT EXISTS learning_materials_public_catalog_idx
ON public.learning_materials(status, published_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS learning_materials_category_idx
ON public.learning_materials(category);

CREATE OR REPLACE FUNCTION public.set_learning_materials_published_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'published' AND NEW.published_at IS NULL THEN
    NEW.published_at = now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_learning_materials_published_at ON public.learning_materials;
CREATE TRIGGER set_learning_materials_published_at
BEFORE INSERT OR UPDATE OF status, published_at ON public.learning_materials
FOR EACH ROW
EXECUTE FUNCTION public.set_learning_materials_published_at();

DROP TRIGGER IF EXISTS set_learning_materials_updated_at ON public.learning_materials;
CREATE TRIGGER set_learning_materials_updated_at
BEFORE UPDATE ON public.learning_materials
FOR EACH ROW
EXECUTE FUNCTION public.set_learning_updated_at();

COMMENT ON TABLE public.learning_materials IS 'Materi publik dinamis Ruang Belajar. Konten Markdown mentah harus dirender dan disanitasi di aplikasi sebelum menjadi HTML.';
COMMENT ON COLUMN public.learning_materials.content_markdown IS 'Markdown mentah. Jangan tampilkan sebagai HTML tanpa proses render dan sanitasi aplikasi.';
COMMENT ON COLUMN public.learning_materials.last_deploy_triggered_at IS 'Waktu terakhir aplikasi meminta deploy ulang. Tidak diisi oleh trigger database.';
COMMENT ON COLUMN public.learning_materials.last_deploy_status IS 'Status internal trigger deploy dari aplikasi: pending, triggered, atau failed_to_trigger.';

ALTER TABLE public.learning_materials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Learning materials anon read published" ON public.learning_materials;
DROP POLICY IF EXISTS "Learning materials authenticated read published or admin" ON public.learning_materials;
DROP POLICY IF EXISTS "Learning materials admin insert" ON public.learning_materials;
DROP POLICY IF EXISTS "Learning materials admin update" ON public.learning_materials;
DROP POLICY IF EXISTS "Learning materials admin delete" ON public.learning_materials;

CREATE POLICY "Learning materials anon read published"
ON public.learning_materials
FOR SELECT
TO anon
USING (status = 'published');

CREATE POLICY "Learning materials authenticated read published or admin"
ON public.learning_materials
FOR SELECT
TO authenticated
USING (
  status = 'published'
  OR public.is_admin()
);

CREATE POLICY "Learning materials admin insert"
ON public.learning_materials
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin());

CREATE POLICY "Learning materials admin update"
ON public.learning_materials
FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "Learning materials admin delete"
ON public.learning_materials
FOR DELETE
TO authenticated
USING (public.is_admin());

GRANT SELECT ON public.learning_materials TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.learning_materials TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
