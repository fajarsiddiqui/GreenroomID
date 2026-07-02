-- =====================================================
-- GreenroomID H30 - Fix Supabase RLS Lint Public Tables
-- Fixes:
-- 1) Policy Exists RLS Disabled: public.audit_logs
-- 2) RLS Disabled in Public: public.audit_logs
-- 3) RLS Disabled in Public: public.service_categories
-- 4) RLS Disabled in Public: public.service_items
-- =====================================================

-- Catatan:
-- Script ini memakai public.is_admin() yang sudah dipakai di file RLS project kamu.
-- Jalankan dari Supabase Dashboard > SQL Editor.

-- =====================================================
-- 1. AUDIT LOGS
-- Log hanya boleh dibaca/dihapus admin.
-- Insert boleh dilakukan user login untuk mencatat aktivitasnya sendiri,
-- dan admin boleh insert semua log admin.
-- =====================================================

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Audit logs select admin only" ON public.audit_logs;
DROP POLICY IF EXISTS "Audit logs insert authenticated own or admin" ON public.audit_logs;
DROP POLICY IF EXISTS "Audit logs delete admin only" ON public.audit_logs;

CREATE POLICY "Audit logs select admin only"
ON public.audit_logs
FOR SELECT
TO authenticated
USING (public.is_admin());

CREATE POLICY "Audit logs insert authenticated own or admin"
ON public.audit_logs
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_admin()
  OR (
    actor_id = auth.uid()
    AND lower(coalesce(actor_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
    AND coalesce(actor_role, '') <> 'admin'
  )
);

CREATE POLICY "Audit logs delete admin only"
ON public.audit_logs
FOR DELETE
TO authenticated
USING (public.is_admin());

REVOKE ALL ON public.audit_logs FROM anon;
GRANT SELECT, INSERT, DELETE ON public.audit_logs TO authenticated;

-- =====================================================
-- 2. SERVICE CATEGORIES
-- Publik hanya boleh membaca kategori aktif.
-- Admin boleh membaca semua, menambah, mengubah, dan menghapus.
-- =====================================================

ALTER TABLE public.service_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service categories public read active" ON public.service_categories;
DROP POLICY IF EXISTS "Service categories admin insert" ON public.service_categories;
DROP POLICY IF EXISTS "Service categories admin update" ON public.service_categories;
DROP POLICY IF EXISTS "Service categories admin delete" ON public.service_categories;

DROP POLICY IF EXISTS "Service categories authenticated read active or admin" ON public.service_categories;

CREATE POLICY "Service categories public read active"
ON public.service_categories
FOR SELECT
TO anon
USING (is_active = true);

CREATE POLICY "Service categories authenticated read active or admin"
ON public.service_categories
FOR SELECT
TO authenticated
USING (
  is_active = true
  OR public.is_admin()
);

CREATE POLICY "Service categories admin insert"
ON public.service_categories
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin());

CREATE POLICY "Service categories admin update"
ON public.service_categories
FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "Service categories admin delete"
ON public.service_categories
FOR DELETE
TO authenticated
USING (public.is_admin());

GRANT SELECT ON public.service_categories TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.service_categories TO authenticated;

-- =====================================================
-- 3. SERVICE ITEMS
-- Publik hanya boleh membaca layanan aktif dari kategori yang aktif.
-- Admin boleh membaca semua, menambah, mengubah, dan menghapus.
-- =====================================================

ALTER TABLE public.service_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service items public read active" ON public.service_items;
DROP POLICY IF EXISTS "Service items admin insert" ON public.service_items;
DROP POLICY IF EXISTS "Service items admin update" ON public.service_items;
DROP POLICY IF EXISTS "Service items admin delete" ON public.service_items;

DROP POLICY IF EXISTS "Service items authenticated read active or admin" ON public.service_items;

CREATE POLICY "Service items public read active"
ON public.service_items
FOR SELECT
TO anon
USING (
  is_active = true
  AND EXISTS (
    SELECT 1
    FROM public.service_categories sc
    WHERE sc.id = service_items.category_id
      AND sc.is_active = true
  )
);

CREATE POLICY "Service items authenticated read active or admin"
ON public.service_items
FOR SELECT
TO authenticated
USING (
  public.is_admin()
  OR (
    is_active = true
    AND EXISTS (
      SELECT 1
      FROM public.service_categories sc
      WHERE sc.id = service_items.category_id
        AND sc.is_active = true
    )
  )
);

CREATE POLICY "Service items admin insert"
ON public.service_items
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin());

CREATE POLICY "Service items admin update"
ON public.service_items
FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "Service items admin delete"
ON public.service_items
FOR DELETE
TO authenticated
USING (public.is_admin());

GRANT SELECT ON public.service_items TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.service_items TO authenticated;

-- =====================================================
-- 4. OPTIONAL: kalau id tabel memakai identity/serial dan insert admin error sequence permission,
-- buka comment baris berikut.
-- =====================================================
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- =====================================================
-- 5. CHECK HASIL
-- =====================================================

SELECT
  schemaname,
  tablename,
  rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('audit_logs', 'service_categories', 'service_items')
ORDER BY tablename;
