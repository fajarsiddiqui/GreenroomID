-- =====================================================
-- GreenroomID H26 - Midtrans Donation Gateway
-- Jalankan setelah:
-- 1) supabase/account-management-update.sql
-- 2) supabase/h25-client-profile-lite.sql
--
-- Catatan:
-- - File client/donatur tidak disimpan di database.
-- - Status paid hanya diubah oleh Supabase Edge Function midtrans-webhook.
-- - Frontend hanya membuat invoice pending dan membuka redirect_url Midtrans Snap.
-- =====================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.donation_settings (
  id text PRIMARY KEY DEFAULT 'default',
  is_enabled boolean NOT NULL DEFAULT true,
  title text NOT NULL DEFAULT 'Dukung GreenroomID',
  description text NOT NULL DEFAULT 'Donasi Anda membantu menjaga layanan gratis GreenroomID tetap aktif, ringan, dan terus dikembangkan.',
  min_amount integer NOT NULL DEFAULT 5000,
  preset_amounts integer[] NOT NULL DEFAULT ARRAY[5000, 10000, 25000, 50000, 100000],
  note text DEFAULT 'Pembayaran diproses otomatis melalui Midtrans. Nama hanya tampil di Top Donatur jika donatur mengizinkan.',
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT donation_settings_min_amount_check CHECK (min_amount >= 1000)
);

INSERT INTO public.donation_settings (id)
VALUES ('default')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.donations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id text NOT NULL UNIQUE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  donor_name text NOT NULL DEFAULT 'Anonim',
  donor_email text,
  donor_phone text,
  donor_message text,
  show_public boolean NOT NULL DEFAULT true,
  amount integer NOT NULL,
  currency text NOT NULL DEFAULT 'IDR',
  status text NOT NULL DEFAULT 'pending',
  payment_method text,
  midtrans_token text,
  midtrans_redirect_url text,
  midtrans_transaction_id text,
  midtrans_transaction_status text,
  midtrans_fraud_status text,
  midtrans_status_code text,
  midtrans_gross_amount text,
  raw_notification jsonb,
  paid_at timestamptz,
  expired_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT donations_amount_check CHECK (amount >= 1000),
  CONSTRAINT donations_status_check CHECK (status IN ('pending', 'paid', 'failed', 'expired', 'cancelled', 'refunded'))
);

CREATE INDEX IF NOT EXISTS donations_status_idx ON public.donations(status);
CREATE INDEX IF NOT EXISTS donations_user_id_idx ON public.donations(user_id);
CREATE INDEX IF NOT EXISTS donations_paid_at_idx ON public.donations(paid_at DESC);
CREATE INDEX IF NOT EXISTS donations_created_at_idx ON public.donations(created_at DESC);
CREATE INDEX IF NOT EXISTS donations_show_public_idx ON public.donations(show_public);

ALTER TABLE public.donation_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.donations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Donation settings public read" ON public.donation_settings;
CREATE POLICY "Donation settings public read"
ON public.donation_settings
FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "Donation settings admin update" ON public.donation_settings;
CREATE POLICY "Donation settings admin update"
ON public.donation_settings
FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Donations select own or admin" ON public.donations;
CREATE POLICY "Donations select own or admin"
ON public.donations
FOR SELECT
TO authenticated
USING (auth.uid() = user_id OR public.is_admin());

-- Insert/update dilakukan oleh Edge Function memakai service role.
-- Public Top Donatur memakai SECURITY DEFINER RPC di bawah, bukan direct SELECT.

GRANT SELECT ON public.donation_settings TO anon, authenticated;
GRANT SELECT ON public.donations TO authenticated;

CREATE OR REPLACE FUNCTION public.get_public_donation_settings()
RETURNS TABLE (
  is_enabled boolean,
  title text,
  description text,
  min_amount integer,
  preset_amounts integer[],
  note text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    ds.is_enabled,
    ds.title,
    ds.description,
    ds.min_amount,
    ds.preset_amounts,
    ds.note
  FROM public.donation_settings ds
  WHERE ds.id = 'default'
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_donation_settings() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_public_donation_summary()
RETURNS TABLE (
  total_amount bigint,
  paid_count bigint,
  public_donor_count bigint,
  latest_paid_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    coalesce(sum(amount), 0)::bigint AS total_amount,
    count(*)::bigint AS paid_count,
    count(*) FILTER (WHERE show_public = true)::bigint AS public_donor_count,
    max(paid_at) AS latest_paid_at
  FROM public.donations
  WHERE status = 'paid';
$$;

GRANT EXECUTE ON FUNCTION public.get_public_donation_summary() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_public_top_donors(p_period text DEFAULT 'all')
RETURNS TABLE (
  donor_name text,
  total_amount bigint,
  donation_count bigint,
  latest_paid_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH filtered AS (
    SELECT
      CASE
        WHEN show_public THEN nullif(trim(donor_name), '')
        ELSE NULL
      END AS public_name,
      amount,
      paid_at
    FROM public.donations
    WHERE status = 'paid'
      AND show_public = true
      AND (
        p_period = 'all'
        OR (p_period = 'month' AND paid_at >= date_trunc('month', now()))
      )
  )
  SELECT
    coalesce(public_name, 'Anonim') AS donor_name,
    sum(amount)::bigint AS total_amount,
    count(*)::bigint AS donation_count,
    max(paid_at) AS latest_paid_at
  FROM filtered
  GROUP BY coalesce(public_name, 'Anonim')
  ORDER BY sum(amount) DESC, max(paid_at) DESC
  LIMIT 20;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_top_donors(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_public_recent_donations(p_limit integer DEFAULT 10)
RETURNS TABLE (
  donor_name text,
  amount integer,
  donor_message text,
  paid_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    CASE WHEN d.show_public THEN coalesce(nullif(trim(d.donor_name), ''), 'Anonim') ELSE 'Anonim' END AS donor_name,
    d.amount,
    CASE WHEN d.show_public THEN d.donor_message ELSE NULL END AS donor_message,
    d.paid_at
  FROM public.donations d
  WHERE d.status = 'paid'
  ORDER BY d.paid_at DESC NULLS LAST, d.created_at DESC
  LIMIT greatest(1, least(coalesce(p_limit, 10), 30));
$$;

GRANT EXECUTE ON FUNCTION public.get_public_recent_donations(integer) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_admin_donation_stats()
RETURNS TABLE (
  total_amount bigint,
  paid_count bigint,
  pending_count bigint,
  failed_count bigint,
  expired_count bigint,
  public_count bigint,
  latest_paid_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    coalesce(sum(amount) FILTER (WHERE status = 'paid'), 0)::bigint AS total_amount,
    count(*) FILTER (WHERE status = 'paid')::bigint AS paid_count,
    count(*) FILTER (WHERE status = 'pending')::bigint AS pending_count,
    count(*) FILTER (WHERE status = 'failed' OR status = 'cancelled')::bigint AS failed_count,
    count(*) FILTER (WHERE status = 'expired')::bigint AS expired_count,
    count(*) FILTER (WHERE status = 'paid' AND show_public = true)::bigint AS public_count,
    max(paid_at) FILTER (WHERE status = 'paid') AS latest_paid_at
  FROM public.donations
  WHERE public.is_admin();
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_donation_stats() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_admin_donations(p_limit integer DEFAULT 50)
RETURNS TABLE (
  id uuid,
  order_id text,
  donor_name text,
  donor_email text,
  donor_message text,
  show_public boolean,
  amount integer,
  status text,
  payment_method text,
  midtrans_transaction_status text,
  midtrans_fraud_status text,
  paid_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    d.id,
    d.order_id,
    d.donor_name,
    d.donor_email,
    d.donor_message,
    d.show_public,
    d.amount,
    d.status,
    d.payment_method,
    d.midtrans_transaction_status,
    d.midtrans_fraud_status,
    d.paid_at,
    d.created_at,
    d.updated_at
  FROM public.donations d
  WHERE public.is_admin()
  ORDER BY d.created_at DESC
  LIMIT greatest(1, least(coalesce(p_limit, 50), 200));
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_donations(integer) TO authenticated;

-- Statistik landing disesuaikan melalui file patch terpisah agar aman untuk struktur landing_content yang berbeda.

NOTIFY pgrst, 'reload schema';
