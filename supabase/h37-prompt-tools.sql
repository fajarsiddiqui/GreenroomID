BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =====================================================
-- GreenroomID H37 - Prompt Tools
-- Schema builder untuk tool prompt dinamis tanpa menyimpan jawaban pengguna.
-- =====================================================

CREATE TABLE IF NOT EXISTS public.prompt_tools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'umum',
  status text NOT NULL DEFAULT 'draft',
  prompt_template text NOT NULL DEFAULT '',
  submit_button_label text NOT NULL DEFAULT 'Buat Prompt',
  result_title text NOT NULL DEFAULT 'Prompt Siap Pakai',
  copy_button_label text NOT NULL DEFAULT 'Salin Prompt',
  survey_url text,
  survey_cta text,
  meta_title text,
  meta_description text,
  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_deploy_triggered_at timestamptz,
  last_deploy_status text,
  CONSTRAINT prompt_tools_slug_format_check CHECK (
    slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  ),
  CONSTRAINT prompt_tools_status_check CHECK (
    status IN ('draft', 'published', 'archived')
  ),
  CONSTRAINT prompt_tools_last_deploy_status_check CHECK (
    last_deploy_status IS NULL
    OR last_deploy_status IN ('pending', 'triggered', 'failed_to_trigger')
  ),
  CONSTRAINT prompt_tools_title_not_blank CHECK (length(trim(title)) > 0),
  CONSTRAINT prompt_tools_slug_not_blank CHECK (length(trim(slug)) > 0),
  CONSTRAINT prompt_tools_category_not_blank CHECK (length(trim(category)) > 0)
);

CREATE TABLE IF NOT EXISTS public.prompt_tool_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tool_id uuid NOT NULL REFERENCES public.prompt_tools(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT prompt_tool_sections_sort_order_check CHECK (sort_order >= 0),
  CONSTRAINT prompt_tool_sections_title_not_blank CHECK (length(trim(title)) > 0)
);

CREATE TABLE IF NOT EXISTS public.prompt_tool_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tool_id uuid NOT NULL REFERENCES public.prompt_tools(id) ON DELETE CASCADE,
  section_id uuid REFERENCES public.prompt_tool_sections(id) ON DELETE SET NULL,
  variable_name text NOT NULL,
  label text NOT NULL,
  help_text text NOT NULL DEFAULT '',
  placeholder text NOT NULL DEFAULT '',
  question_type text NOT NULL DEFAULT 'short_text',
  is_required boolean NOT NULL DEFAULT false,
  validation_type text,
  validation_min numeric,
  validation_max numeric,
  sort_order integer NOT NULL DEFAULT 0,
  conditional_parent_question_id uuid REFERENCES public.prompt_tool_questions(id) ON DELETE SET NULL,
  conditional_operator text,
  conditional_value text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT prompt_tool_questions_variable_name_format CHECK (
    variable_name ~ '^[a-z][a-z0-9_]*$'
  ),
  CONSTRAINT prompt_tool_questions_unique_variable_name_per_tool UNIQUE (tool_id, variable_name),
  CONSTRAINT prompt_tool_questions_label_not_blank CHECK (length(trim(label)) > 0),
  CONSTRAINT prompt_tool_questions_sort_order_check CHECK (sort_order >= 0),
  CONSTRAINT prompt_tool_questions_validation_range_check CHECK (
    validation_min IS NULL
    OR validation_max IS NULL
    OR validation_min <= validation_max
  ),
  CONSTRAINT prompt_tool_questions_type_check CHECK (
    question_type IN ('short_text', 'paragraph', 'number', 'email', 'phone', 'date', 'single_choice', 'dropdown', 'checkbox')
  ),
  CONSTRAINT prompt_tool_questions_operator_check CHECK (
    conditional_operator IS NULL
    OR conditional_operator IN ('equals', 'not_equals', 'contains', 'not_empty')
  )
);

CREATE TABLE IF NOT EXISTS public.prompt_tool_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES public.prompt_tool_questions(id) ON DELETE CASCADE,
  option_label text NOT NULL,
  option_value text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT prompt_tool_options_sort_order_check CHECK (sort_order >= 0),
  CONSTRAINT prompt_tool_options_label_not_blank CHECK (length(trim(option_label)) > 0),
  CONSTRAINT prompt_tool_options_value_not_blank CHECK (length(trim(option_value)) > 0),
  CONSTRAINT prompt_tool_options_unique_value_per_question UNIQUE (question_id, option_value)
);

CREATE OR REPLACE FUNCTION public.set_prompt_tools_published_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'published' AND NEW.published_at IS NULL THEN
      NEW.published_at = now();
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.published_at IS NOT NULL THEN
      NEW.published_at := OLD.published_at;
    ELSIF NEW.status = 'published' AND OLD.status IS DISTINCT FROM 'published' AND NEW.published_at IS NULL THEN
      NEW.published_at = now();
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_prompt_tool_tool_id_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.tool_id IS DISTINCT FROM OLD.tool_id THEN
    IF TG_TABLE_NAME = 'prompt_tool_sections' THEN
      RAISE EXCEPTION 'Section tidak dapat dipindahkan ke tool lain.';
    ELSIF TG_TABLE_NAME = 'prompt_tool_questions' THEN
      RAISE EXCEPTION 'Pertanyaan tidak dapat dipindahkan ke tool lain.';
    ELSE
      RAISE EXCEPTION 'Tool ID tidak dapat diubah.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_prompt_tool_question_refs()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  section_tool_id uuid;
  parent_tool_id uuid;
BEGIN
  IF NEW.section_id IS NOT NULL THEN
    SELECT tool_id INTO section_tool_id
    FROM public.prompt_tool_sections
    WHERE id = NEW.section_id;

    IF section_tool_id IS NULL THEN
      RAISE EXCEPTION 'Section % tidak ditemukan', NEW.section_id;
    END IF;

    IF section_tool_id <> NEW.tool_id THEN
      RAISE EXCEPTION 'Section harus berasal dari tool yang sama';
    END IF;
  END IF;

  IF NEW.conditional_parent_question_id IS NULL THEN
    NEW.conditional_operator := NULL;
    NEW.conditional_value := NULL;
  ELSE
    IF NEW.id IS NOT NULL AND NEW.conditional_parent_question_id = NEW.id THEN
      RAISE EXCEPTION 'Conditional parent tidak boleh menunjuk dirinya sendiri';
    END IF;

    SELECT tool_id INTO parent_tool_id
    FROM public.prompt_tool_questions
    WHERE id = NEW.conditional_parent_question_id;

    IF parent_tool_id IS NULL THEN
      RAISE EXCEPTION 'Parent question % tidak ditemukan', NEW.conditional_parent_question_id;
    END IF;

    IF parent_tool_id <> NEW.tool_id THEN
      RAISE EXCEPTION 'Conditional parent question harus berasal dari tool yang sama';
    END IF;

    IF NEW.conditional_operator IS NULL THEN
      RAISE EXCEPTION 'Operator conditional wajib diisi ketika parent question dipilih';
    END IF;

    IF NEW.conditional_operator = 'not_empty' THEN
      NEW.conditional_value := NULL;
    ELSE
      NEW.conditional_value := trim(coalesce(NEW.conditional_value, ''));
      IF length(NEW.conditional_value) = 0 THEN
        RAISE EXCEPTION 'Conditional value wajib diisi untuk operator %', NEW.conditional_operator;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_prompt_tools_published_at ON public.prompt_tools;
CREATE TRIGGER set_prompt_tools_published_at
BEFORE INSERT OR UPDATE OF status, published_at ON public.prompt_tools
FOR EACH ROW
EXECUTE FUNCTION public.set_prompt_tools_published_at();

DROP TRIGGER IF EXISTS set_prompt_tools_updated_at ON public.prompt_tools;
CREATE TRIGGER set_prompt_tools_updated_at
BEFORE UPDATE ON public.prompt_tools
FOR EACH ROW
EXECUTE FUNCTION public.set_learning_updated_at();

DROP TRIGGER IF EXISTS set_prompt_tool_sections_updated_at ON public.prompt_tool_sections;
CREATE TRIGGER set_prompt_tool_sections_updated_at
BEFORE UPDATE ON public.prompt_tool_sections
FOR EACH ROW
EXECUTE FUNCTION public.set_learning_updated_at();

DROP TRIGGER IF EXISTS prevent_prompt_tool_sections_tool_id_change ON public.prompt_tool_sections;
CREATE TRIGGER prevent_prompt_tool_sections_tool_id_change
BEFORE UPDATE ON public.prompt_tool_sections
FOR EACH ROW
EXECUTE FUNCTION public.prevent_prompt_tool_tool_id_change();

DROP TRIGGER IF EXISTS set_prompt_tool_questions_updated_at ON public.prompt_tool_questions;
CREATE TRIGGER set_prompt_tool_questions_updated_at
BEFORE UPDATE ON public.prompt_tool_questions
FOR EACH ROW
EXECUTE FUNCTION public.set_learning_updated_at();

DROP TRIGGER IF EXISTS prevent_prompt_tool_questions_tool_id_change ON public.prompt_tool_questions;
CREATE TRIGGER prevent_prompt_tool_questions_tool_id_change
BEFORE UPDATE ON public.prompt_tool_questions
FOR EACH ROW
EXECUTE FUNCTION public.prevent_prompt_tool_tool_id_change();

DROP TRIGGER IF EXISTS set_prompt_tool_options_updated_at ON public.prompt_tool_options;
CREATE TRIGGER set_prompt_tool_options_updated_at
BEFORE UPDATE ON public.prompt_tool_options
FOR EACH ROW
EXECUTE FUNCTION public.set_learning_updated_at();

DROP TRIGGER IF EXISTS validate_prompt_tool_question_refs_trigger ON public.prompt_tool_questions;
CREATE TRIGGER validate_prompt_tool_question_refs_trigger
BEFORE INSERT OR UPDATE ON public.prompt_tool_questions
FOR EACH ROW
EXECUTE FUNCTION public.validate_prompt_tool_question_refs();

CREATE INDEX IF NOT EXISTS prompt_tools_status_idx ON public.prompt_tools(status);
CREATE INDEX IF NOT EXISTS prompt_tools_category_idx ON public.prompt_tools(category);
CREATE INDEX IF NOT EXISTS prompt_tools_published_at_idx ON public.prompt_tools(published_at);
CREATE INDEX IF NOT EXISTS prompt_tool_sections_tool_id_order_idx ON public.prompt_tool_sections(tool_id, sort_order);
CREATE INDEX IF NOT EXISTS prompt_tool_questions_tool_id_order_idx ON public.prompt_tool_questions(tool_id, sort_order);
CREATE INDEX IF NOT EXISTS prompt_tool_questions_section_id_order_idx ON public.prompt_tool_questions(section_id, sort_order);
CREATE INDEX IF NOT EXISTS prompt_tool_questions_conditional_parent_idx ON public.prompt_tool_questions(conditional_parent_question_id);
CREATE INDEX IF NOT EXISTS prompt_tool_options_question_id_order_idx ON public.prompt_tool_options(question_id, sort_order);

ALTER TABLE public.prompt_tools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prompt_tool_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prompt_tool_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prompt_tool_options ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Prompt tools anon read published" ON public.prompt_tools;
DROP POLICY IF EXISTS "Prompt tools authenticated read published or admin" ON public.prompt_tools;
DROP POLICY IF EXISTS "Prompt tools admin insert" ON public.prompt_tools;
DROP POLICY IF EXISTS "Prompt tools admin update" ON public.prompt_tools;
DROP POLICY IF EXISTS "Prompt tools admin delete" ON public.prompt_tools;

CREATE POLICY "Prompt tools anon read published"
ON public.prompt_tools
FOR SELECT
TO anon
USING (status = 'published');

CREATE POLICY "Prompt tools authenticated read published or admin"
ON public.prompt_tools
FOR SELECT
TO authenticated
USING (
  status = 'published'
  OR public.is_admin()
);

CREATE POLICY "Prompt tools admin insert"
ON public.prompt_tools
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin());

CREATE POLICY "Prompt tools admin update"
ON public.prompt_tools
FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "Prompt tools admin delete"
ON public.prompt_tools
FOR DELETE
TO authenticated
USING (public.is_admin());

DROP POLICY IF EXISTS "Prompt tool sections anon read published tool" ON public.prompt_tool_sections;
DROP POLICY IF EXISTS "Prompt tool sections authenticated read published tool or admin" ON public.prompt_tool_sections;
DROP POLICY IF EXISTS "Prompt tool sections admin insert" ON public.prompt_tool_sections;
DROP POLICY IF EXISTS "Prompt tool sections admin update" ON public.prompt_tool_sections;
DROP POLICY IF EXISTS "Prompt tool sections admin delete" ON public.prompt_tool_sections;

CREATE POLICY "Prompt tool sections anon read published tool"
ON public.prompt_tool_sections
FOR SELECT
TO anon
USING (
  EXISTS (
    SELECT 1
    FROM public.prompt_tools t
    WHERE t.id = tool_id
      AND t.status = 'published'
  )
);

CREATE POLICY "Prompt tool sections authenticated read published tool or admin"
ON public.prompt_tool_sections
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.prompt_tools t
    WHERE t.id = tool_id
      AND (t.status = 'published' OR public.is_admin())
  )
);

CREATE POLICY "Prompt tool sections admin insert"
ON public.prompt_tool_sections
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin());

CREATE POLICY "Prompt tool sections admin update"
ON public.prompt_tool_sections
FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "Prompt tool sections admin delete"
ON public.prompt_tool_sections
FOR DELETE
TO authenticated
USING (public.is_admin());

DROP POLICY IF EXISTS "Prompt tool questions anon read published tool" ON public.prompt_tool_questions;
DROP POLICY IF EXISTS "Prompt tool questions authenticated read published tool or admin" ON public.prompt_tool_questions;
DROP POLICY IF EXISTS "Prompt tool questions admin insert" ON public.prompt_tool_questions;
DROP POLICY IF EXISTS "Prompt tool questions admin update" ON public.prompt_tool_questions;
DROP POLICY IF EXISTS "Prompt tool questions admin delete" ON public.prompt_tool_questions;

CREATE POLICY "Prompt tool questions anon read published tool"
ON public.prompt_tool_questions
FOR SELECT
TO anon
USING (
  EXISTS (
    SELECT 1
    FROM public.prompt_tools t
    WHERE t.id = tool_id
      AND t.status = 'published'
  )
);

CREATE POLICY "Prompt tool questions authenticated read published tool or admin"
ON public.prompt_tool_questions
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.prompt_tools t
    WHERE t.id = tool_id
      AND (t.status = 'published' OR public.is_admin())
  )
);

CREATE POLICY "Prompt tool questions admin insert"
ON public.prompt_tool_questions
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin());

CREATE POLICY "Prompt tool questions admin update"
ON public.prompt_tool_questions
FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "Prompt tool questions admin delete"
ON public.prompt_tool_questions
FOR DELETE
TO authenticated
USING (public.is_admin());

DROP POLICY IF EXISTS "Prompt tool options anon read published parent tool" ON public.prompt_tool_options;
DROP POLICY IF EXISTS "Prompt tool options authenticated read published parent tool or admin" ON public.prompt_tool_options;
DROP POLICY IF EXISTS "Prompt tool options admin insert" ON public.prompt_tool_options;
DROP POLICY IF EXISTS "Prompt tool options admin update" ON public.prompt_tool_options;
DROP POLICY IF EXISTS "Prompt tool options admin delete" ON public.prompt_tool_options;

CREATE POLICY "Prompt tool options anon read published parent tool"
ON public.prompt_tool_options
FOR SELECT
TO anon
USING (
  EXISTS (
    SELECT 1
    FROM public.prompt_tool_questions q
    JOIN public.prompt_tools t ON q.tool_id = t.id
    WHERE q.id = question_id
      AND t.status = 'published'
  )
);

CREATE POLICY "Prompt tool options authenticated read published parent tool or admin"
ON public.prompt_tool_options
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.prompt_tool_questions q
    JOIN public.prompt_tools t ON q.tool_id = t.id
    WHERE q.id = question_id
      AND (t.status = 'published' OR public.is_admin())
  )
);

CREATE POLICY "Prompt tool options admin insert"
ON public.prompt_tool_options
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin());

CREATE POLICY "Prompt tool options admin update"
ON public.prompt_tool_options
FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "Prompt tool options admin delete"
ON public.prompt_tool_options
FOR DELETE
TO authenticated
USING (public.is_admin());

GRANT SELECT ON public.prompt_tools TO anon;
GRANT SELECT ON public.prompt_tool_sections TO anon;
GRANT SELECT ON public.prompt_tool_questions TO anon;
GRANT SELECT ON public.prompt_tool_options TO anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.prompt_tools TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prompt_tool_sections TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prompt_tool_questions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prompt_tool_options TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
