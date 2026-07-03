-- =====================================================
-- GreenroomID RB-02 — Kirim Hasil Pembelajaran Artikel
--
-- Tujuan:
-- - Client dapat menyimpan draft dan mengirim hasil pembelajaran.
-- - Admin dapat menandai sedang direview, meminta revisi, menerima,
--   atau menolak.
-- - Tidak ada pembayaran pada RB-02. Status accepted_pending_payment
--   disiapkan untuk RB-03.
-- - Tidak menyimpan file Word, PDF jurnal, gambar, screenshot, atau data
--   penelitian. File Word hanya dibaca lokal di browser saat import.
--
-- Prasyarat:
-- - supabase/rb01-ruang-belajar.sql sudah berhasil dijalankan.
-- - account-management-update.sql / public.is_admin() tersedia.
-- =====================================================

-- 1. Tambah status dan metadata review ke hasil pembelajaran.
ALTER TABLE public.learning_entries
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS review_note text;

ALTER TABLE public.learning_entries
  DROP CONSTRAINT IF EXISTS learning_entries_status_check;

ALTER TABLE public.learning_entries
  ADD CONSTRAINT learning_entries_status_check
  CHECK (status IN (
    'draft',
    'submitted',
    'under_review',
    'revision_requested',
    'rejected',
    'accepted_pending_payment',
    'published',
    'withdrawn',
    'archived'
  ));

ALTER TABLE public.learning_entries
  DROP CONSTRAINT IF EXISTS learning_entries_published_timestamp_check;

ALTER TABLE public.learning_entries
  ADD CONSTRAINT learning_entries_published_timestamp_check
  CHECK (
    (status = 'published' AND published_at IS NOT NULL)
    OR (status <> 'published' AND published_at IS NULL)
  );

CREATE INDEX IF NOT EXISTS learning_entries_author_status_idx
ON public.learning_entries(author_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS learning_entries_review_queue_idx
ON public.learning_entries(status, submitted_at ASC NULLS LAST);

-- 2. Catatan review admin. Catatan ini bukan komentar publik.
CREATE TABLE IF NOT EXISTS public.learning_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid NOT NULL REFERENCES public.learning_entries(id) ON DELETE CASCADE,
  admin_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decision text NOT NULL CHECK (decision IN (
    'under_review',
    'revision_requested',
    'accepted_pending_payment',
    'rejected'
  )),
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS learning_reviews_entry_idx
ON public.learning_reviews(entry_id, created_at DESC);

COMMENT ON TABLE public.learning_reviews IS 'Riwayat review editorial untuk Hasil Pembelajaran Artikel. Tidak tampil sebagai komentar publik.';
COMMENT ON COLUMN public.learning_entries.review_note IS 'Catatan review terbaru dari admin untuk pemilik hasil pembelajaran.';

-- 3. RLS sumber artikel: publik dapat melihat sumber pada artikel terbit,
-- admin melihat semua, client melihat sumber milik sendiri atau sumber publik.
ALTER TABLE public.learning_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Learning sources authenticated read published or admin" ON public.learning_sources;
DROP POLICY IF EXISTS "Learning sources owner read or published or admin" ON public.learning_sources;

CREATE POLICY "Learning sources owner read or published or admin"
ON public.learning_sources
FOR SELECT
TO authenticated
USING (
  public.is_admin()
  OR created_by = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.learning_entries le
    WHERE le.source_id = learning_sources.id
      AND le.status = 'published'
  )
);

DROP POLICY IF EXISTS "Learning sources owner insert" ON public.learning_sources;
CREATE POLICY "Learning sources owner insert"
ON public.learning_sources
FOR INSERT
TO authenticated
WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "Learning sources owner update while private" ON public.learning_sources;
CREATE POLICY "Learning sources owner update while private"
ON public.learning_sources
FOR UPDATE
TO authenticated
USING (
  created_by = auth.uid()
  AND NOT EXISTS (
    SELECT 1 FROM public.learning_entries le
    WHERE le.source_id = learning_sources.id
      AND le.status = 'published'
  )
)
WITH CHECK (created_by = auth.uid());

-- 4. RLS hasil pembelajaran: publik hanya membaca published;
-- client hanya melihat miliknya sendiri; admin melihat seluruh antrean.
DROP POLICY IF EXISTS "Learning entries authenticated read published or admin" ON public.learning_entries;
DROP POLICY IF EXISTS "Learning entries owner read or published or admin" ON public.learning_entries;

CREATE POLICY "Learning entries owner read or published or admin"
ON public.learning_entries
FOR SELECT
TO authenticated
USING (
  status = 'published'
  OR public.is_admin()
  OR author_id = auth.uid()
);

DROP POLICY IF EXISTS "Learning entries owner insert draft" ON public.learning_entries;
CREATE POLICY "Learning entries owner insert draft"
ON public.learning_entries
FOR INSERT
TO authenticated
WITH CHECK (
  author_id = auth.uid()
  AND status = 'draft'
  AND published_at IS NULL
);

DROP POLICY IF EXISTS "Learning entries owner update draft or revision" ON public.learning_entries;
CREATE POLICY "Learning entries owner update draft or revision"
ON public.learning_entries
FOR UPDATE
TO authenticated
USING (
  author_id = auth.uid()
  AND status IN ('draft', 'revision_requested')
)
WITH CHECK (
  author_id = auth.uid()
  AND status IN ('draft', 'submitted')
  AND published_at IS NULL
);

DROP POLICY IF EXISTS "Learning entries owner delete draft" ON public.learning_entries;
CREATE POLICY "Learning entries owner delete draft"
ON public.learning_entries
FOR DELETE
TO authenticated
USING (
  author_id = auth.uid()
  AND status = 'draft'
);

-- 5. RLS riwayat review: admin dapat menulis, pemilik dapat membaca miliknya.
DROP POLICY IF EXISTS "Learning reviews admin select" ON public.learning_reviews;
DROP POLICY IF EXISTS "Learning reviews owner or admin read" ON public.learning_reviews;
DROP POLICY IF EXISTS "Learning reviews admin insert" ON public.learning_reviews;

CREATE POLICY "Learning reviews owner or admin read"
ON public.learning_reviews
FOR SELECT
TO authenticated
USING (
  public.is_admin()
  OR EXISTS (
    SELECT 1 FROM public.learning_entries le
    WHERE le.id = learning_reviews.entry_id
      AND le.author_id = auth.uid()
  )
);

CREATE POLICY "Learning reviews admin insert"
ON public.learning_reviews
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin() AND admin_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.learning_sources TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.learning_entries TO authenticated;
GRANT SELECT, INSERT ON public.learning_reviews TO authenticated;

NOTIFY pgrst, 'reload schema';

-- 6. Cek hasil singkat.
SELECT
  tablename,
  rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('learning_sources', 'learning_entries', 'learning_reviews')
ORDER BY tablename;
