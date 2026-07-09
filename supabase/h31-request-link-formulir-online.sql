-- =====================================================
-- GreenroomID H31 - Request Link Formulir Online
-- Jalankan di Supabase SQL Editor sebelum menjalankan patch kode H31.
-- Konsep: 1 request = 1 form. Client mengelola form dari Request Saya setelah pembayaran diverifikasi admin.
-- =====================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =====================================================
-- 1. KOLOM REQUEST UNTUK MEMBEDAKAN REQUEST BIASA DAN REQUEST LINK FORMULIR
-- =====================================================

ALTER TABLE public.requests
ADD COLUMN IF NOT EXISTS request_type text NOT NULL DEFAULT 'service_request',
ADD COLUMN IF NOT EXISTS form_request_snapshot jsonb;

CREATE INDEX IF NOT EXISTS requests_request_type_idx
ON public.requests (request_type);

-- =====================================================
-- 2. TABEL FORM BUILDER
-- =====================================================

CREATE TABLE IF NOT EXISTS public.forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id text NOT NULL UNIQUE,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  slug text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'draft',
  theme_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_by uuid,
  delete_reason text,
  CONSTRAINT forms_status_check CHECK (status IN ('draft', 'active', 'disabled', 'deleted_by_owner'))
);

CREATE INDEX IF NOT EXISTS forms_owner_id_idx ON public.forms(owner_id);
CREATE INDEX IF NOT EXISTS forms_request_id_idx ON public.forms(request_id);
CREATE INDEX IF NOT EXISTS forms_slug_idx ON public.forms(slug);
CREATE INDEX IF NOT EXISTS forms_status_idx ON public.forms(status);
CREATE INDEX IF NOT EXISTS forms_deleted_at_idx ON public.forms(deleted_at);

CREATE TABLE IF NOT EXISTS public.form_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id uuid NOT NULL REFERENCES public.forms(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  sort_order integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS form_sections_form_id_idx ON public.form_sections(form_id);
CREATE INDEX IF NOT EXISTS form_sections_order_idx ON public.form_sections(form_id, sort_order);

CREATE TABLE IF NOT EXISTS public.form_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id uuid NOT NULL REFERENCES public.forms(id) ON DELETE CASCADE,
  section_id uuid NOT NULL REFERENCES public.form_sections(id) ON DELETE CASCADE,
  label text NOT NULL,
  question_type text NOT NULL DEFAULT 'short_text',
  helper_text text,
  placeholder text,
  is_required boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 1,
  validation_type text,
  validation_min numeric,
  validation_max numeric,
  conditional_parent_question_id uuid REFERENCES public.form_questions(id) ON DELETE SET NULL,
  conditional_operator text,
  conditional_value text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT form_questions_type_check CHECK (question_type IN ('short_text', 'paragraph', 'number', 'email', 'phone', 'date', 'single_choice', 'dropdown', 'checkbox')),
  CONSTRAINT form_questions_operator_check CHECK (conditional_operator IS NULL OR conditional_operator IN ('equals', 'not_equals', 'contains', 'not_empty'))
);

CREATE INDEX IF NOT EXISTS form_questions_form_id_idx ON public.form_questions(form_id);
CREATE INDEX IF NOT EXISTS form_questions_section_id_idx ON public.form_questions(section_id);
CREATE INDEX IF NOT EXISTS form_questions_order_idx ON public.form_questions(section_id, sort_order);

CREATE TABLE IF NOT EXISTS public.form_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id uuid NOT NULL REFERENCES public.forms(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.form_questions(id) ON DELETE CASCADE,
  option_label text NOT NULL,
  option_value text NOT NULL,
  sort_order integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS form_options_form_id_idx ON public.form_options(form_id);
CREATE INDEX IF NOT EXISTS form_options_question_id_idx ON public.form_options(question_id);
CREATE INDEX IF NOT EXISTS form_options_order_idx ON public.form_options(question_id, sort_order);

CREATE TABLE IF NOT EXISTS public.form_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id uuid NOT NULL REFERENCES public.forms(id) ON DELETE CASCADE,
  request_id text,
  owner_id uuid,
  answers_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  respondent_meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_by uuid,
  delete_reason text
);

CREATE INDEX IF NOT EXISTS form_responses_form_id_idx ON public.form_responses(form_id);
CREATE INDEX IF NOT EXISTS form_responses_owner_id_idx ON public.form_responses(owner_id);
CREATE INDEX IF NOT EXISTS form_responses_deleted_at_idx ON public.form_responses(deleted_at);
CREATE INDEX IF NOT EXISTS form_responses_created_at_idx ON public.form_responses(created_at);

CREATE TABLE IF NOT EXISTS public.form_response_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id uuid NOT NULL REFERENCES public.forms(id) ON DELETE CASCADE,
  response_id uuid REFERENCES public.form_responses(id) ON DELETE CASCADE,
  actor_id uuid,
  actor_email text,
  actor_role text,
  action text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS form_response_logs_form_id_idx ON public.form_response_logs(form_id);
CREATE INDEX IF NOT EXISTS form_response_logs_response_id_idx ON public.form_response_logs(response_id);

-- Tabel ini disiapkan untuk pengembangan berikutnya. Patch H31 memakai conditional_* langsung di form_questions.
CREATE TABLE IF NOT EXISTS public.form_logic_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id uuid NOT NULL REFERENCES public.forms(id) ON DELETE CASCADE,
  source_question_id uuid REFERENCES public.form_questions(id) ON DELETE CASCADE,
  operator text NOT NULL DEFAULT 'equals',
  compare_value text,
  action text NOT NULL DEFAULT 'show_question',
  target_question_id uuid REFERENCES public.form_questions(id) ON DELETE CASCADE,
  target_section_id uuid REFERENCES public.form_sections(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- =====================================================
-- 3. TRIGGER UPDATED_AT DAN RESPONSE OWNER
-- =====================================================

CREATE OR REPLACE FUNCTION public.set_dynamic_form_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_forms_updated_at_trigger ON public.forms;
CREATE TRIGGER set_forms_updated_at_trigger
BEFORE UPDATE ON public.forms
FOR EACH ROW
EXECUTE FUNCTION public.set_dynamic_form_updated_at();

DROP TRIGGER IF EXISTS set_form_sections_updated_at_trigger ON public.form_sections;
CREATE TRIGGER set_form_sections_updated_at_trigger
BEFORE UPDATE ON public.form_sections
FOR EACH ROW
EXECUTE FUNCTION public.set_dynamic_form_updated_at();

DROP TRIGGER IF EXISTS set_form_questions_updated_at_trigger ON public.form_questions;
CREATE TRIGGER set_form_questions_updated_at_trigger
BEFORE UPDATE ON public.form_questions
FOR EACH ROW
EXECUTE FUNCTION public.set_dynamic_form_updated_at();

DROP TRIGGER IF EXISTS set_form_responses_updated_at_trigger ON public.form_responses;
CREATE TRIGGER set_form_responses_updated_at_trigger
BEFORE UPDATE ON public.form_responses
FOR EACH ROW
EXECUTE FUNCTION public.set_dynamic_form_updated_at();

CREATE OR REPLACE FUNCTION public.set_form_response_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_form public.forms;
BEGIN
  SELECT * INTO target_form
  FROM public.forms
  WHERE id = NEW.form_id;

  IF target_form.id IS NULL THEN
    RAISE EXCEPTION 'Form tidak ditemukan';
  END IF;

  NEW.request_id := target_form.request_id;
  NEW.owner_id := target_form.owner_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_form_response_owner_trigger ON public.form_responses;
CREATE TRIGGER set_form_response_owner_trigger
BEFORE INSERT OR UPDATE ON public.form_responses
FOR EACH ROW
EXECUTE FUNCTION public.set_form_response_owner();

-- =====================================================
-- 4. AKTIFKAN FORM OTOMATIS SETELAH PAYMENT VERIFIED
-- =====================================================

CREATE OR REPLACE FUNCTION public.activate_form_after_payment_verified()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.request_type = 'form_link_request'
     AND NEW.deleted_at IS NULL
     AND (NEW.payment_status = 'VERIFIED' OR NEW.invoice_status = 'PAID') THEN
    UPDATE public.forms
    SET status = 'active', deleted_at = NULL, deleted_by = NULL, delete_reason = NULL
    WHERE request_id = NEW.id::text
      AND status IN ('draft', 'disabled')
      AND deleted_at IS NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS activate_form_after_payment_verified_trigger ON public.requests;
CREATE TRIGGER activate_form_after_payment_verified_trigger
AFTER INSERT OR UPDATE OF payment_status, invoice_status, request_type, deleted_at ON public.requests
FOR EACH ROW
EXECUTE FUNCTION public.activate_form_after_payment_verified();

-- =====================================================
-- 5. PROTEKSI KOLOM ADMIN REQUEST SETELAH PENAMBAHAN request_type
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
    AND NEW.request_type IS NOT DISTINCT FROM OLD.request_type
    AND NEW.form_request_snapshot IS NOT DISTINCT FROM OLD.form_request_snapshot
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
    OR NEW.request_type IS DISTINCT FROM OLD.request_type
    OR NEW.form_request_snapshot IS DISTINCT FROM OLD.form_request_snapshot
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

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_request_admin_fields_trigger ON public.requests;
CREATE TRIGGER protect_request_admin_fields_trigger
BEFORE UPDATE ON public.requests
FOR EACH ROW
EXECUTE FUNCTION public.protect_request_admin_fields();

-- =====================================================
-- 6. RLS
-- =====================================================

ALTER TABLE public.forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.form_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.form_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.form_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.form_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.form_response_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.form_logic_rules ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_public_active_form(target_form_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.forms f
    JOIN public.requests r ON r.id::text = f.request_id
    WHERE f.id = target_form_id
      AND f.status = 'active'
      AND f.deleted_at IS NULL
      AND r.deleted_at IS NULL
      AND r.request_type = 'form_link_request'
      AND (r.payment_status = 'VERIFIED' OR r.invoice_status = 'PAID')
  );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_form(target_form_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.forms f
      WHERE f.id = target_form_id
        AND f.owner_id = auth.uid()
    );
$$;

GRANT EXECUTE ON FUNCTION public.is_public_active_form(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_form(uuid) TO authenticated;

DROP POLICY IF EXISTS "Forms public select active" ON public.forms;
DROP POLICY IF EXISTS "Forms owner admin select" ON public.forms;
DROP POLICY IF EXISTS "Forms owner insert" ON public.forms;
DROP POLICY IF EXISTS "Forms owner admin update" ON public.forms;
DROP POLICY IF EXISTS "Forms admin delete" ON public.forms;

CREATE POLICY "Forms public select active"
ON public.forms
FOR SELECT
TO anon, authenticated
USING (public.is_public_active_form(id));

CREATE POLICY "Forms owner admin select"
ON public.forms
FOR SELECT
TO authenticated
USING (public.is_admin() OR owner_id = auth.uid());

CREATE POLICY "Forms owner insert"
ON public.forms
FOR INSERT
TO authenticated
WITH CHECK (
  owner_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.requests r
    WHERE r.id::text = request_id
      AND r.client_id = auth.uid()
      AND r.request_type = 'form_link_request'
      AND r.deleted_at IS NULL
  )
);

CREATE POLICY "Forms owner admin update"
ON public.forms
FOR UPDATE
TO authenticated
USING (public.is_admin() OR owner_id = auth.uid())
WITH CHECK (public.is_admin() OR owner_id = auth.uid());

CREATE POLICY "Forms admin delete"
ON public.forms
FOR DELETE
TO authenticated
USING (public.is_admin());

-- Sections
DROP POLICY IF EXISTS "Form sections select public owner admin" ON public.form_sections;
DROP POLICY IF EXISTS "Form sections manage owner admin" ON public.form_sections;
DROP POLICY IF EXISTS "Form sections update owner admin" ON public.form_sections;
DROP POLICY IF EXISTS "Form sections delete owner admin" ON public.form_sections;

CREATE POLICY "Form sections select public owner admin"
ON public.form_sections
FOR SELECT
TO anon, authenticated
USING (public.is_public_active_form(form_id) OR public.can_manage_form(form_id));

CREATE POLICY "Form sections manage owner admin"
ON public.form_sections
FOR INSERT
TO authenticated
WITH CHECK (public.can_manage_form(form_id));

CREATE POLICY "Form sections update owner admin"
ON public.form_sections
FOR UPDATE
TO authenticated
USING (public.can_manage_form(form_id))
WITH CHECK (public.can_manage_form(form_id));

CREATE POLICY "Form sections delete owner admin"
ON public.form_sections
FOR DELETE
TO authenticated
USING (public.can_manage_form(form_id));

-- Questions
DROP POLICY IF EXISTS "Form questions select public owner admin" ON public.form_questions;
DROP POLICY IF EXISTS "Form questions insert owner admin" ON public.form_questions;
DROP POLICY IF EXISTS "Form questions update owner admin" ON public.form_questions;
DROP POLICY IF EXISTS "Form questions delete owner admin" ON public.form_questions;

CREATE POLICY "Form questions select public owner admin"
ON public.form_questions
FOR SELECT
TO anon, authenticated
USING (public.is_public_active_form(form_id) OR public.can_manage_form(form_id));

CREATE POLICY "Form questions insert owner admin"
ON public.form_questions
FOR INSERT
TO authenticated
WITH CHECK (public.can_manage_form(form_id));

CREATE POLICY "Form questions update owner admin"
ON public.form_questions
FOR UPDATE
TO authenticated
USING (public.can_manage_form(form_id))
WITH CHECK (public.can_manage_form(form_id));

CREATE POLICY "Form questions delete owner admin"
ON public.form_questions
FOR DELETE
TO authenticated
USING (public.can_manage_form(form_id));

-- Options
DROP POLICY IF EXISTS "Form options select public owner admin" ON public.form_options;
DROP POLICY IF EXISTS "Form options insert owner admin" ON public.form_options;
DROP POLICY IF EXISTS "Form options update owner admin" ON public.form_options;
DROP POLICY IF EXISTS "Form options delete owner admin" ON public.form_options;

CREATE POLICY "Form options select public owner admin"
ON public.form_options
FOR SELECT
TO anon, authenticated
USING (public.is_public_active_form(form_id) OR public.can_manage_form(form_id));

CREATE POLICY "Form options insert owner admin"
ON public.form_options
FOR INSERT
TO authenticated
WITH CHECK (public.can_manage_form(form_id));

CREATE POLICY "Form options update owner admin"
ON public.form_options
FOR UPDATE
TO authenticated
USING (public.can_manage_form(form_id))
WITH CHECK (public.can_manage_form(form_id));

CREATE POLICY "Form options delete owner admin"
ON public.form_options
FOR DELETE
TO authenticated
USING (public.can_manage_form(form_id));

-- Responses
DROP POLICY IF EXISTS "Form responses public insert" ON public.form_responses;
DROP POLICY IF EXISTS "Form responses owner admin select" ON public.form_responses;
DROP POLICY IF EXISTS "Form responses owner admin update" ON public.form_responses;
DROP POLICY IF EXISTS "Form responses admin delete" ON public.form_responses;

CREATE POLICY "Form responses public insert"
ON public.form_responses
FOR INSERT
TO anon, authenticated
WITH CHECK (public.is_public_active_form(form_id));

CREATE POLICY "Form responses owner admin select"
ON public.form_responses
FOR SELECT
TO authenticated
USING (public.is_admin() OR owner_id = auth.uid());

CREATE POLICY "Form responses owner admin update"
ON public.form_responses
FOR UPDATE
TO authenticated
USING (public.is_admin() OR owner_id = auth.uid())
WITH CHECK (public.is_admin() OR owner_id = auth.uid());

CREATE POLICY "Form responses admin delete"
ON public.form_responses
FOR DELETE
TO authenticated
USING (public.is_admin());

-- Response logs
DROP POLICY IF EXISTS "Form response logs owner admin select" ON public.form_response_logs;
DROP POLICY IF EXISTS "Form response logs owner admin insert" ON public.form_response_logs;
DROP POLICY IF EXISTS "Form response logs admin delete" ON public.form_response_logs;

CREATE POLICY "Form response logs owner admin select"
ON public.form_response_logs
FOR SELECT
TO authenticated
USING (public.is_admin() OR public.can_manage_form(form_id));

CREATE POLICY "Form response logs owner admin insert"
ON public.form_response_logs
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin() OR public.can_manage_form(form_id));

CREATE POLICY "Form response logs admin delete"
ON public.form_response_logs
FOR DELETE
TO authenticated
USING (public.is_admin());

-- Logic rules placeholder
DROP POLICY IF EXISTS "Form logic rules select public owner admin" ON public.form_logic_rules;
DROP POLICY IF EXISTS "Form logic rules manage owner admin" ON public.form_logic_rules;
DROP POLICY IF EXISTS "Form logic rules update owner admin" ON public.form_logic_rules;
DROP POLICY IF EXISTS "Form logic rules delete owner admin" ON public.form_logic_rules;

CREATE POLICY "Form logic rules select public owner admin"
ON public.form_logic_rules
FOR SELECT
TO anon, authenticated
USING (public.is_public_active_form(form_id) OR public.can_manage_form(form_id));

CREATE POLICY "Form logic rules manage owner admin"
ON public.form_logic_rules
FOR INSERT
TO authenticated
WITH CHECK (public.can_manage_form(form_id));

CREATE POLICY "Form logic rules update owner admin"
ON public.form_logic_rules
FOR UPDATE
TO authenticated
USING (public.can_manage_form(form_id))
WITH CHECK (public.can_manage_form(form_id));

CREATE POLICY "Form logic rules delete owner admin"
ON public.form_logic_rules
FOR DELETE
TO authenticated
USING (public.can_manage_form(form_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.forms TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.form_sections TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.form_questions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.form_options TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.form_responses TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.form_response_logs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.form_logic_rules TO authenticated;

GRANT SELECT ON public.forms TO anon;
GRANT SELECT ON public.form_sections TO anon;
GRANT SELECT ON public.form_questions TO anon;
GRANT SELECT ON public.form_options TO anon;
GRANT INSERT ON public.form_responses TO anon;

-- =====================================================
-- SELESAI
-- =====================================================
