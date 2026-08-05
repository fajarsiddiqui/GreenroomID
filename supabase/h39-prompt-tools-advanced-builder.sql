BEGIN;

-- =====================================================
-- GreenroomID H39 - Prompt Tools Advanced Builder Schema
-- Menambah kemampuan ranking, batas pilihan, opsi eksklusif,
-- kelompok opsi, kondisi majemuk AND/OR, dan mode tampilan tool.
-- Migration ini tidak menyimpan jawaban pengguna dan tidak menghapus
-- kolom conditional legacy agar frontend existing tetap kompatibel.
-- =====================================================

-- -----------------------------------------------------
-- 1. Pengaturan tampilan tool
-- -----------------------------------------------------
ALTER TABLE public.prompt_tools
  ADD COLUMN IF NOT EXISTS display_mode text NOT NULL DEFAULT 'single_page',
  ADD COLUMN IF NOT EXISTS show_progress boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS previous_button_label text NOT NULL DEFAULT 'Sebelumnya',
  ADD COLUMN IF NOT EXISTS next_button_label text NOT NULL DEFAULT 'Berikutnya';

ALTER TABLE public.prompt_tools
  DROP CONSTRAINT IF EXISTS prompt_tools_display_mode_check,
  DROP CONSTRAINT IF EXISTS prompt_tools_previous_button_label_not_blank,
  DROP CONSTRAINT IF EXISTS prompt_tools_next_button_label_not_blank;

ALTER TABLE public.prompt_tools
  ADD CONSTRAINT prompt_tools_display_mode_check CHECK (
    display_mode IN ('single_page', 'section_steps')
  ),
  ADD CONSTRAINT prompt_tools_previous_button_label_not_blank CHECK (
    length(trim(previous_button_label)) > 0
  ),
  ADD CONSTRAINT prompt_tools_next_button_label_not_blank CHECK (
    length(trim(next_button_label)) > 0
  );

COMMENT ON COLUMN public.prompt_tools.display_mode IS
  'Mode tampilan form publik: single_page atau section_steps.';
COMMENT ON COLUMN public.prompt_tools.show_progress IS
  'Menentukan apakah indikator progres ditampilkan pada mode section_steps.';

-- -----------------------------------------------------
-- 2. Perluasan tipe pertanyaan dan batas pilihan
-- -----------------------------------------------------
ALTER TABLE public.prompt_tool_questions
  ADD COLUMN IF NOT EXISTS min_selections integer,
  ADD COLUMN IF NOT EXISTS max_selections integer,
  ADD COLUMN IF NOT EXISTS conditional_mode text NOT NULL DEFAULT 'all';

ALTER TABLE public.prompt_tool_questions
  DROP CONSTRAINT IF EXISTS prompt_tool_questions_type_check,
  DROP CONSTRAINT IF EXISTS prompt_tool_questions_min_selections_check,
  DROP CONSTRAINT IF EXISTS prompt_tool_questions_max_selections_check,
  DROP CONSTRAINT IF EXISTS prompt_tool_questions_selection_range_check,
  DROP CONSTRAINT IF EXISTS prompt_tool_questions_conditional_mode_check;

ALTER TABLE public.prompt_tool_questions
  ADD CONSTRAINT prompt_tool_questions_type_check CHECK (
    question_type IN (
      'short_text',
      'paragraph',
      'number',
      'email',
      'phone',
      'date',
      'single_choice',
      'dropdown',
      'checkbox',
      'ranking'
    )
  ),
  ADD CONSTRAINT prompt_tool_questions_min_selections_check CHECK (
    min_selections IS NULL OR min_selections >= 0
  ),
  ADD CONSTRAINT prompt_tool_questions_max_selections_check CHECK (
    max_selections IS NULL OR max_selections >= 0
  ),
  ADD CONSTRAINT prompt_tool_questions_selection_range_check CHECK (
    min_selections IS NULL
    OR max_selections IS NULL
    OR min_selections <= max_selections
  ),
  ADD CONSTRAINT prompt_tool_questions_conditional_mode_check CHECK (
    conditional_mode IN ('all', 'any')
  );

COMMENT ON COLUMN public.prompt_tool_questions.min_selections IS
  'Batas minimum pilihan untuk tipe yang mendukung banyak pilihan, terutama checkbox dan ranking.';
COMMENT ON COLUMN public.prompt_tool_questions.max_selections IS
  'Batas maksimum pilihan untuk tipe yang mendukung banyak pilihan, terutama checkbox dan ranking.';
COMMENT ON COLUMN public.prompt_tool_questions.conditional_mode IS
  'Mode evaluasi kondisi majemuk: all berarti seluruh kondisi benar, any berarti minimal satu kondisi benar.';

-- -----------------------------------------------------
-- 3. Opsi eksklusif dan kelompok opsi
-- -----------------------------------------------------
ALTER TABLE public.prompt_tool_options
  ADD COLUMN IF NOT EXISTS is_exclusive boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS group_label text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS group_sort_order integer NOT NULL DEFAULT 0;

ALTER TABLE public.prompt_tool_options
  DROP CONSTRAINT IF EXISTS prompt_tool_options_group_sort_order_check;

ALTER TABLE public.prompt_tool_options
  ADD CONSTRAINT prompt_tool_options_group_sort_order_check CHECK (
    group_sort_order >= 0
  );

COMMENT ON COLUMN public.prompt_tool_options.is_exclusive IS
  'Konfigurasi opsi yang harus berdiri sendiri saat dipilih. Perilaku UI diterapkan pada tahap frontend berikutnya.';
COMMENT ON COLUMN public.prompt_tool_options.group_label IS
  'Label kelompok opsi. String kosong berarti opsi tidak dikelompokkan.';
COMMENT ON COLUMN public.prompt_tool_options.group_sort_order IS
  'Urutan kelompok opsi dalam satu pertanyaan.';

-- Field "Lainnya" tidak memakai kolom khusus pada option.
-- Gunakan option_value = 'lainnya' dan pertanyaan teks terpisah yang
-- ditampilkan melalui kondisi parent equals 'lainnya'. Pendekatan ini
-- mempertahankan variable_name yang terpisah dan kompatibel dengan template.

-- -----------------------------------------------------
-- 4. Tabel kondisi majemuk
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.prompt_tool_question_conditions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL,
  parent_question_id uuid NOT NULL,
  operator text NOT NULL,
  comparison_value text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.prompt_tool_question_conditions
  DROP CONSTRAINT IF EXISTS prompt_tool_question_conditions_question_id_fkey,
  DROP CONSTRAINT IF EXISTS prompt_tool_question_conditions_parent_question_id_fkey,
  DROP CONSTRAINT IF EXISTS prompt_tool_question_conditions_operator_check,
  DROP CONSTRAINT IF EXISTS prompt_tool_question_conditions_sort_order_check,
  DROP CONSTRAINT IF EXISTS prompt_tool_question_conditions_distinct_questions_check,
  DROP CONSTRAINT IF EXISTS prompt_tool_question_conditions_value_check;

ALTER TABLE public.prompt_tool_question_conditions
  ADD CONSTRAINT prompt_tool_question_conditions_question_id_fkey
    FOREIGN KEY (question_id)
    REFERENCES public.prompt_tool_questions(id)
    ON DELETE CASCADE,
  ADD CONSTRAINT prompt_tool_question_conditions_parent_question_id_fkey
    FOREIGN KEY (parent_question_id)
    REFERENCES public.prompt_tool_questions(id)
    ON DELETE CASCADE,
  ADD CONSTRAINT prompt_tool_question_conditions_operator_check CHECK (
    operator IN ('equals', 'not_equals', 'contains', 'not_empty')
  ),
  ADD CONSTRAINT prompt_tool_question_conditions_sort_order_check CHECK (
    sort_order >= 0
  ),
  ADD CONSTRAINT prompt_tool_question_conditions_distinct_questions_check CHECK (
    question_id <> parent_question_id
  ),
  ADD CONSTRAINT prompt_tool_question_conditions_value_check CHECK (
    (
      operator = 'not_empty'
      AND comparison_value IS NULL
    )
    OR
    (
      operator IN ('equals', 'not_equals', 'contains')
      AND comparison_value IS NOT NULL
      AND length(trim(comparison_value)) > 0
    )
  );

COMMENT ON TABLE public.prompt_tool_question_conditions IS
  'Daftar kondisi majemuk untuk menentukan visibilitas pertanyaan Prompt Tools.';

-- -----------------------------------------------------
-- 5. Normalisasi dan validasi kondisi lintas tabel
-- -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_prompt_tool_question_condition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  child_tool_id uuid;
  parent_tool_id uuid;
BEGIN
  IF NEW.question_id = NEW.parent_question_id THEN
    RAISE EXCEPTION 'Pertanyaan kondisi tidak boleh menunjuk dirinya sendiri.';
  END IF;

  SELECT tool_id
  INTO child_tool_id
  FROM public.prompt_tool_questions
  WHERE id = NEW.question_id;

  IF child_tool_id IS NULL THEN
    RAISE EXCEPTION 'Pertanyaan tujuan kondisi tidak ditemukan.';
  END IF;

  SELECT tool_id
  INTO parent_tool_id
  FROM public.prompt_tool_questions
  WHERE id = NEW.parent_question_id;

  IF parent_tool_id IS NULL THEN
    RAISE EXCEPTION 'Pertanyaan sumber kondisi tidak ditemukan.';
  END IF;

  IF child_tool_id <> parent_tool_id THEN
    RAISE EXCEPTION 'Pertanyaan kondisi harus berasal dari tool yang sama.';
  END IF;

  NEW.operator := lower(trim(coalesce(NEW.operator, '')));

  IF NEW.operator NOT IN ('equals', 'not_equals', 'contains', 'not_empty') THEN
    RAISE EXCEPTION 'Operator kondisi tidak valid.';
  END IF;

  IF NEW.operator = 'not_empty' THEN
    NEW.comparison_value := NULL;
  ELSE
    NEW.comparison_value := trim(coalesce(NEW.comparison_value, ''));

    IF length(NEW.comparison_value) = 0 THEN
      RAISE EXCEPTION 'Nilai pembanding wajib diisi untuk operator kondisi ini.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_prompt_tool_question_condition_trigger
ON public.prompt_tool_question_conditions;

CREATE TRIGGER validate_prompt_tool_question_condition_trigger
BEFORE INSERT OR UPDATE
ON public.prompt_tool_question_conditions
FOR EACH ROW
EXECUTE FUNCTION public.validate_prompt_tool_question_condition();

DROP TRIGGER IF EXISTS set_prompt_tool_question_conditions_updated_at
ON public.prompt_tool_question_conditions;

CREATE TRIGGER set_prompt_tool_question_conditions_updated_at
BEFORE UPDATE
ON public.prompt_tool_question_conditions
FOR EACH ROW
EXECUTE FUNCTION public.set_learning_updated_at();

-- -----------------------------------------------------
-- 6. Validasi dan backfill kondisi legacy
-- -----------------------------------------------------
DO $$
DECLARE
  invalid_legacy_condition_count bigint;
BEGIN
  SELECT count(*)
  INTO invalid_legacy_condition_count
  FROM public.prompt_tool_questions child
  LEFT JOIN public.prompt_tool_questions parent
    ON parent.id = child.conditional_parent_question_id
  WHERE child.conditional_parent_question_id IS NOT NULL
    AND (
      parent.id IS NULL
      OR child.id = child.conditional_parent_question_id
      OR parent.tool_id IS DISTINCT FROM child.tool_id
      OR child.conditional_operator IS NULL
      OR child.conditional_operator NOT IN (
        'equals',
        'not_equals',
        'contains',
        'not_empty'
      )
      OR (
        child.conditional_operator IN ('equals', 'not_equals', 'contains')
        AND length(trim(coalesce(child.conditional_value, ''))) = 0
      )
    );

  IF invalid_legacy_condition_count > 0 THEN
    RAISE EXCEPTION
      'Backfill kondisi legacy dibatalkan: ditemukan % kondisi lama yang tidak valid. Perbaiki data tersebut sebelum menjalankan migration.',
      invalid_legacy_condition_count;
  END IF;
END;
$$;

UPDATE public.prompt_tool_questions
SET conditional_mode = 'all'
WHERE conditional_parent_question_id IS NOT NULL
  AND conditional_mode IS DISTINCT FROM 'all';

INSERT INTO public.prompt_tool_question_conditions (
  question_id,
  parent_question_id,
  operator,
  comparison_value,
  sort_order
)
SELECT
  child.id,
  child.conditional_parent_question_id,
  child.conditional_operator,
  CASE
    WHEN child.conditional_operator = 'not_empty' THEN NULL
    ELSE trim(child.conditional_value)
  END,
  0
FROM public.prompt_tool_questions child
WHERE child.conditional_parent_question_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.prompt_tool_question_conditions existing_condition
    WHERE existing_condition.question_id = child.id
      AND existing_condition.parent_question_id = child.conditional_parent_question_id
      AND existing_condition.operator = child.conditional_operator
      AND existing_condition.comparison_value IS NOT DISTINCT FROM (
        CASE
          WHEN child.conditional_operator = 'not_empty' THEN NULL
          ELSE trim(child.conditional_value)
        END
      )
  );

-- -----------------------------------------------------
-- 7. Index
-- -----------------------------------------------------
CREATE INDEX IF NOT EXISTS prompt_tool_question_conditions_question_order_idx
ON public.prompt_tool_question_conditions(question_id, sort_order);

CREATE INDEX IF NOT EXISTS prompt_tool_question_conditions_parent_idx
ON public.prompt_tool_question_conditions(parent_question_id);

CREATE INDEX IF NOT EXISTS prompt_tool_options_question_group_order_idx
ON public.prompt_tool_options(question_id, group_sort_order, sort_order);

-- -----------------------------------------------------
-- 8. RLS dan grant
-- -----------------------------------------------------
ALTER TABLE public.prompt_tool_question_conditions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Prompt tool conditions anon read published child tool"
ON public.prompt_tool_question_conditions;
DROP POLICY IF EXISTS "Prompt tool conditions authenticated read published child tool or admin"
ON public.prompt_tool_question_conditions;
DROP POLICY IF EXISTS "Prompt tool conditions admin insert"
ON public.prompt_tool_question_conditions;
DROP POLICY IF EXISTS "Prompt tool conditions admin update"
ON public.prompt_tool_question_conditions;
DROP POLICY IF EXISTS "Prompt tool conditions admin delete"
ON public.prompt_tool_question_conditions;

CREATE POLICY "Prompt tool conditions anon read published child tool"
ON public.prompt_tool_question_conditions
FOR SELECT
TO anon
USING (
  EXISTS (
    SELECT 1
    FROM public.prompt_tool_questions question
    JOIN public.prompt_tools tool
      ON tool.id = question.tool_id
    WHERE question.id = question_id
      AND tool.status = 'published'
  )
);

CREATE POLICY "Prompt tool conditions authenticated read published child tool or admin"
ON public.prompt_tool_question_conditions
FOR SELECT
TO authenticated
USING (
  public.is_admin()
  OR EXISTS (
    SELECT 1
    FROM public.prompt_tool_questions question
    JOIN public.prompt_tools tool
      ON tool.id = question.tool_id
    WHERE question.id = question_id
      AND tool.status = 'published'
  )
);

CREATE POLICY "Prompt tool conditions admin insert"
ON public.prompt_tool_question_conditions
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin());

CREATE POLICY "Prompt tool conditions admin update"
ON public.prompt_tool_question_conditions
FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "Prompt tool conditions admin delete"
ON public.prompt_tool_question_conditions
FOR DELETE
TO authenticated
USING (public.is_admin());

REVOKE ALL PRIVILEGES ON TABLE public.prompt_tool_question_conditions
FROM anon, authenticated;

GRANT SELECT ON public.prompt_tool_question_conditions TO anon;

GRANT SELECT, INSERT, UPDATE, DELETE
ON public.prompt_tool_question_conditions TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
