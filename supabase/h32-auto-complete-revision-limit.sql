-- =====================================================
-- GreenroomID H32 - Selesaikan Request Saat Kuota Revisi Habis
-- Jalankan di Supabase SQL Editor setelah H31.
-- =====================================================

-- Request aktif otomatis selesai ketika jumlah revisi telah mencapai kuota.
-- Berlaku juga untuk request lama yang kuotanya sudah habis.
UPDATE public.requests
SET status = 'DONE'
WHERE deleted_at IS NULL
  AND revision_started_at IS NOT NULL
  AND COALESCE(revision_limit, 0) > 0
  AND COALESCE(revision_used_count, 0) >= COALESCE(revision_limit, 0)
  AND status <> 'DONE';

-- Proteksi client dari H31 diperbarui agar revisi terakhir tetap dapat
-- tercatat, kemudian statusnya dinormalisasi menjadi DONE dalam transaksi
-- yang sama. Admin yang mengubah jumlah revisi ke angka kuota juga akan
-- menghasilkan status DONE.
CREATE OR REPLACE FUNCTION public.protect_request_admin_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  revision_submit boolean;
BEGIN
  IF NEW.deleted_at IS NULL
     AND NEW.revision_started_at IS NOT NULL
     AND COALESCE(NEW.revision_limit, 0) > 0
     AND COALESCE(NEW.revision_used_count, 0) >= COALESCE(NEW.revision_limit, 0) THEN
    NEW.status := 'DONE';
  END IF;

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
    AND NEW.status IN ('REVIEW', 'DONE')
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
    OR NEW.invoice_status IS NOT DISTINCT FROM OLD.invoice_status
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
    RAISE EXCEPTION 'Client hanya boleh mengubah status pembayaran selain UPLOADED';
  END IF;

  IF NEW.payment_proof_url IS DISTINCT FROM OLD.payment_proof_url
    AND NEW.payment_proof_url IS NULL
  THEN
    RAISE EXCEPTION 'Bukti pembayaran tidak boleh dikosongkan';
  END IF;

  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
