BEGIN;

-- =====================================================
-- GreenroomID H40 - Prompt Tools Structured Output
-- Konfigurasi structured output pada level tool dan pemetaan pertanyaan.
-- Migration ini tidak mengubah status tool, deployment, atau data jawaban.
-- =====================================================

ALTER TABLE public.prompt_tools
  ADD COLUMN IF NOT EXISTS structured_output_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS structured_schema_version text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS structured_prompt_version text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS structured_validation_rules_version text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS structured_pipeline_version text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS structured_deidentification_policy_version text NOT NULL DEFAULT '';

ALTER TABLE public.prompt_tool_questions
  ADD COLUMN IF NOT EXISTS structured_scope text NOT NULL DEFAULT 'form_data',
  ADD COLUMN IF NOT EXISTS structured_path text,
  ADD COLUMN IF NOT EXISTS structured_pass_value text;

-- -----------------------------------------------------
-- Normalisasi versi structured output pada prompt_tools.
-- Whitespace di awal/akhir dibuang, whitespace berulang menjadi satu spasi,
-- dan input kosong disimpan sebagai string kosong.
-- -----------------------------------------------------

CREATE OR REPLACE FUNCTION public.normalize_prompt_tool_structured_settings()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.structured_schema_version := regexp_replace(
    btrim(coalesce(NEW.structured_schema_version, '')),
    '[[:space:]]+',
    ' ',
    'g'
  );

  NEW.structured_prompt_version := regexp_replace(
    btrim(coalesce(NEW.structured_prompt_version, '')),
    '[[:space:]]+',
    ' ',
    'g'
  );

  NEW.structured_validation_rules_version := regexp_replace(
    btrim(coalesce(NEW.structured_validation_rules_version, '')),
    '[[:space:]]+',
    ' ',
    'g'
  );

  NEW.structured_pipeline_version := regexp_replace(
    btrim(coalesce(NEW.structured_pipeline_version, '')),
    '[[:space:]]+',
    ' ',
    'g'
  );

  NEW.structured_deidentification_policy_version := regexp_replace(
    btrim(coalesce(NEW.structured_deidentification_policy_version, '')),
    '[[:space:]]+',
    ' ',
    'g'
  );

  IF char_length(NEW.structured_schema_version) > 50 THEN
    RAISE EXCEPTION 'Versi schema output terstruktur maksimal 50 karakter.';
  END IF;

  IF char_length(NEW.structured_prompt_version) > 50 THEN
    RAISE EXCEPTION 'Versi prompt output terstruktur maksimal 50 karakter.';
  END IF;

  IF char_length(NEW.structured_validation_rules_version) > 50 THEN
    RAISE EXCEPTION 'Versi aturan validasi output terstruktur maksimal 50 karakter.';
  END IF;

  IF char_length(NEW.structured_pipeline_version) > 50 THEN
    RAISE EXCEPTION 'Versi pipeline output terstruktur maksimal 50 karakter.';
  END IF;

  IF char_length(
    NEW.structured_deidentification_policy_version
  ) > 50 THEN
    RAISE EXCEPTION 'Versi kebijakan deidentifikasi maksimal 50 karakter.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS normalize_prompt_tool_structured_settings_trigger
ON public.prompt_tools;
CREATE TRIGGER normalize_prompt_tool_structured_settings_trigger
BEFORE INSERT OR UPDATE OF
  structured_schema_version,
  structured_prompt_version,
  structured_validation_rules_version,
  structured_pipeline_version,
  structured_deidentification_policy_version
ON public.prompt_tools
FOR EACH ROW
EXECUTE FUNCTION public.normalize_prompt_tool_structured_settings();

-- -----------------------------------------------------
-- Normalisasi dan validasi mapping structured output pada pertanyaan.
-- Trigger ini tidak memeriksa keberadaan option, sehingga pertanyaan dapat
-- dibuat terlebih dahulu sebelum option-optionnya selesai disimpan.
-- -----------------------------------------------------

CREATE OR REPLACE FUNCTION public.normalize_prompt_tool_question_structured_mapping()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.structured_scope := lower(
    btrim(coalesce(NEW.structured_scope, 'form_data'))
  );
  NEW.structured_path := NULLIF(
    btrim(coalesce(NEW.structured_path, '')),
    ''
  );
  NEW.structured_pass_value := NULLIF(
    btrim(coalesce(NEW.structured_pass_value, '')),
    ''
  );

  IF NEW.structured_scope NOT IN (
    'form_data',
    'acknowledgement',
    'consent',
    'exclude'
  ) THEN
    RAISE EXCEPTION 'Scope output terstruktur tidak valid.';
  END IF;

  IF NEW.structured_scope <> 'form_data' THEN
    NEW.structured_path := NULL;
  END IF;

  IF NEW.structured_scope IN ('form_data', 'exclude') THEN
    NEW.structured_pass_value := NULL;
  END IF;

  IF NEW.structured_path IS NOT NULL THEN
    IF char_length(NEW.structured_path) > 300 THEN
      RAISE EXCEPTION 'JSON path output terstruktur maksimal 300 karakter.';
    END IF;

    IF NEW.structured_path !~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$' THEN
      RAISE EXCEPTION 'JSON path output terstruktur tidak valid.';
    END IF;
  END IF;

  IF NEW.structured_scope IN ('acknowledgement', 'consent') THEN
    IF NEW.question_type NOT IN ('single_choice', 'dropdown', 'checkbox') THEN
      RAISE EXCEPTION 'Scope acknowledgement atau consent hanya dapat digunakan pada pertanyaan pilihan tunggal, dropdown, atau checkbox.';
    END IF;

    IF NEW.structured_pass_value IS NULL THEN
      RAISE EXCEPTION 'Nilai kelulusan wajib dipilih untuk scope acknowledgement atau consent.';
    END IF;

    IF char_length(NEW.structured_pass_value) > 300 THEN
      RAISE EXCEPTION 'Nilai kelulusan output terstruktur maksimal 300 karakter.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS normalize_prompt_tool_question_structured_mapping_trigger
ON public.prompt_tool_questions;
CREATE TRIGGER normalize_prompt_tool_question_structured_mapping_trigger
BEFORE INSERT OR UPDATE OF
  structured_scope,
  structured_path,
  structured_pass_value,
  question_type
ON public.prompt_tool_questions
FOR EACH ROW
EXECUTE FUNCTION public.normalize_prompt_tool_question_structured_mapping();

-- -----------------------------------------------------
-- Check constraints sebagai pertahanan tambahan terhadap penulisan data
-- yang tidak melalui alur aplikasi normal.
-- -----------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'prompt_tools_structured_schema_version_length_check'
      AND conrelid = 'public.prompt_tools'::regclass
  ) THEN
    ALTER TABLE public.prompt_tools
      ADD CONSTRAINT prompt_tools_structured_schema_version_length_check
      CHECK (char_length(structured_schema_version) <= 50);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'prompt_tools_structured_prompt_version_length_check'
      AND conrelid = 'public.prompt_tools'::regclass
  ) THEN
    ALTER TABLE public.prompt_tools
      ADD CONSTRAINT prompt_tools_structured_prompt_version_length_check
      CHECK (char_length(structured_prompt_version) <= 50);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'prompt_tools_structured_validation_rules_version_length_check'
      AND conrelid = 'public.prompt_tools'::regclass
  ) THEN
    ALTER TABLE public.prompt_tools
      ADD CONSTRAINT prompt_tools_structured_validation_rules_version_length_check
      CHECK (
        char_length(structured_validation_rules_version) <= 50
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'prompt_tools_structured_pipeline_version_length_check'
      AND conrelid = 'public.prompt_tools'::regclass
  ) THEN
    ALTER TABLE public.prompt_tools
      ADD CONSTRAINT prompt_tools_structured_pipeline_version_length_check
      CHECK (char_length(structured_pipeline_version) <= 50);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'prompt_tools_structured_deidentification_policy_version_length_check'
      AND conrelid = 'public.prompt_tools'::regclass
  ) THEN
    ALTER TABLE public.prompt_tools
      ADD CONSTRAINT prompt_tools_structured_deidentification_policy_version_length_check
      CHECK (
        char_length(structured_deidentification_policy_version) <= 50
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'prompt_tool_questions_structured_scope_check'
      AND conrelid = 'public.prompt_tool_questions'::regclass
  ) THEN
    ALTER TABLE public.prompt_tool_questions
      ADD CONSTRAINT prompt_tool_questions_structured_scope_check
      CHECK (
        structured_scope IN (
          'form_data',
          'acknowledgement',
          'consent',
          'exclude'
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'prompt_tool_questions_structured_path_length_check'
      AND conrelid = 'public.prompt_tool_questions'::regclass
  ) THEN
    ALTER TABLE public.prompt_tool_questions
      ADD CONSTRAINT prompt_tool_questions_structured_path_length_check
      CHECK (
        structured_path IS NULL
        OR char_length(structured_path) <= 300
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'prompt_tool_questions_structured_path_format_check'
      AND conrelid = 'public.prompt_tool_questions'::regclass
  ) THEN
    ALTER TABLE public.prompt_tool_questions
      ADD CONSTRAINT prompt_tool_questions_structured_path_format_check
      CHECK (
        structured_path IS NULL
        OR structured_path ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$'
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'prompt_tool_questions_structured_path_scope_check'
      AND conrelid = 'public.prompt_tool_questions'::regclass
  ) THEN
    ALTER TABLE public.prompt_tool_questions
      ADD CONSTRAINT prompt_tool_questions_structured_path_scope_check
      CHECK (
        structured_path IS NULL
        OR structured_scope = 'form_data'
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'prompt_tool_questions_structured_pass_value_length_check'
      AND conrelid = 'public.prompt_tool_questions'::regclass
  ) THEN
    ALTER TABLE public.prompt_tool_questions
      ADD CONSTRAINT prompt_tool_questions_structured_pass_value_length_check
      CHECK (
        structured_pass_value IS NULL
        OR char_length(structured_pass_value) <= 300
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'prompt_tool_questions_structured_pass_value_scope_check'
      AND conrelid = 'public.prompt_tool_questions'::regclass
  ) THEN
    ALTER TABLE public.prompt_tool_questions
      ADD CONSTRAINT prompt_tool_questions_structured_pass_value_scope_check
      CHECK (
        (
          structured_scope IN ('form_data', 'exclude')
          AND structured_pass_value IS NULL
        )
        OR (
          structured_scope IN ('acknowledgement', 'consent')
          AND structured_pass_value IS NOT NULL
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'prompt_tool_questions_structured_choice_type_check'
      AND conrelid = 'public.prompt_tool_questions'::regclass
  ) THEN
    ALTER TABLE public.prompt_tool_questions
      ADD CONSTRAINT prompt_tool_questions_structured_choice_type_check
      CHECK (
        structured_scope NOT IN ('acknowledgement', 'consent')
        OR question_type IN ('single_choice', 'dropdown', 'checkbox')
      );
  END IF;
END;
$$;

-- Satu JSON path hanya boleh dipakai satu kali di dalam satu tool.
CREATE UNIQUE INDEX IF NOT EXISTS
  prompt_tool_questions_unique_structured_path_per_tool_idx
ON public.prompt_tool_questions(tool_id, structured_path)
WHERE structured_scope = 'form_data'
  AND structured_path IS NOT NULL;

-- Satu tool hanya boleh mempunyai maksimal satu pertanyaan consent.
CREATE UNIQUE INDEX IF NOT EXISTS
  prompt_tool_questions_one_consent_per_tool_idx
ON public.prompt_tool_questions(tool_id)
WHERE structured_scope = 'consent';

CREATE INDEX IF NOT EXISTS
  prompt_tool_questions_tool_id_structured_scope_idx
ON public.prompt_tool_questions(tool_id, structured_scope);

-- -----------------------------------------------------
-- Lindungi option yang sedang dipakai sebagai structured_pass_value.
-- Admin harus memindahkan structured_pass_value terlebih dahulu sebelum
-- option tersebut dihapus atau option_value-nya diubah.
-- -----------------------------------------------------

CREATE OR REPLACE FUNCTION public.protect_prompt_tool_structured_pass_option()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  mapped_scope text;
  mapped_pass_value text;
  mapped_question_label text;
BEGIN
  SELECT
    structured_scope,
    structured_pass_value,
    label
  INTO
    mapped_scope,
    mapped_pass_value,
    mapped_question_label
  FROM public.prompt_tool_questions
  WHERE id = OLD.question_id;

  IF mapped_scope IN ('acknowledgement', 'consent')
    AND mapped_pass_value = OLD.option_value
  THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION
        'Pilihan "%" tidak dapat dihapus karena dipakai sebagai nilai kelulusan output terstruktur pada pertanyaan "%".',
        OLD.option_label,
        coalesce(mapped_question_label, 'tanpa label');
    END IF;

    IF NEW.option_value IS DISTINCT FROM OLD.option_value THEN
      RAISE EXCEPTION
        'Nilai internal pilihan "%" tidak dapat diubah karena dipakai sebagai nilai kelulusan output terstruktur pada pertanyaan "%".',
        OLD.option_label,
        coalesce(mapped_question_label, 'tanpa label');
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_prompt_tool_structured_pass_option_delete_trigger
ON public.prompt_tool_options;
CREATE TRIGGER protect_prompt_tool_structured_pass_option_delete_trigger
BEFORE DELETE ON public.prompt_tool_options
FOR EACH ROW
EXECUTE FUNCTION public.protect_prompt_tool_structured_pass_option();

DROP TRIGGER IF EXISTS protect_prompt_tool_structured_pass_option_update_trigger
ON public.prompt_tool_options;
CREATE TRIGGER protect_prompt_tool_structured_pass_option_update_trigger
BEFORE UPDATE OF option_value ON public.prompt_tool_options
FOR EACH ROW
EXECUTE FUNCTION public.protect_prompt_tool_structured_pass_option();

COMMENT ON COLUMN public.prompt_tools.structured_output_enabled IS
  'Mengaktifkan konfigurasi output terstruktur. Runtime publik baru didukung pada JT-3B.';
COMMENT ON COLUMN public.prompt_tools.structured_schema_version IS
  'Versi schema output terstruktur, maksimal 50 karakter.';
COMMENT ON COLUMN public.prompt_tools.structured_prompt_version IS
  'Versi prompt output terstruktur, maksimal 50 karakter.';
COMMENT ON COLUMN public.prompt_tools.structured_validation_rules_version IS
  'Versi aturan validasi output terstruktur, maksimal 50 karakter.';
COMMENT ON COLUMN public.prompt_tools.structured_pipeline_version IS
  'Versi pipeline output terstruktur, maksimal 50 karakter.';
COMMENT ON COLUMN public.prompt_tools.structured_deidentification_policy_version IS
  'Versi kebijakan deidentifikasi, maksimal 50 karakter.';
COMMENT ON COLUMN public.prompt_tool_questions.structured_scope IS
  'Scope mapping: form_data, acknowledgement, consent, atau exclude.';
COMMENT ON COLUMN public.prompt_tool_questions.structured_path IS
  'JSON path untuk scope form_data. Kosong disimpan sebagai NULL.';
COMMENT ON COLUMN public.prompt_tool_questions.structured_pass_value IS
  'Option value yang dianggap lulus untuk scope acknowledgement atau consent.';

NOTIFY pgrst, 'reload schema';

COMMIT;
