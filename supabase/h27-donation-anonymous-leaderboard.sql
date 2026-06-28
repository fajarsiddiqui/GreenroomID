-- =====================================================
-- GreenroomID H27 - Donation Anonymous Identity + Top Donatur Redirect Support
-- Jalankan setelah H26 donation SQL sudah berhasil.
--
-- Tujuan:
-- - Donatur anonim tetap masuk Top Donatur sebagai Anonim 1, Anonim 2, dst.
-- - User login yang anonim akan mendapat alias anonim permanen yang terikat ke akun.
-- - Donasi publik dan donasi anonim dari user yang sama dihitung sebagai 2 identitas leaderboard berbeda.
-- - Guest anonim stabil selama guest_id localStorage masih sama.
-- =====================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SEQUENCE IF NOT EXISTS public.donor_anonymous_number_seq START 1;

CREATE TABLE IF NOT EXISTS public.donor_anonymous_identities (
  identity_key text PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  guest_id text,
  anonymous_number integer NOT NULL UNIQUE DEFAULT nextval('public.donor_anonymous_number_seq'),
  anonymous_alias text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT donor_anonymous_identity_source_check CHECK (user_id IS NOT NULL OR guest_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS donor_anonymous_user_idx ON public.donor_anonymous_identities(user_id);
CREATE INDEX IF NOT EXISTS donor_anonymous_guest_idx ON public.donor_anonymous_identities(guest_id);
CREATE INDEX IF NOT EXISTS donor_anonymous_number_idx ON public.donor_anonymous_identities(anonymous_number);

ALTER TABLE public.donor_anonymous_identities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anonymous donor identities admin read" ON public.donor_anonymous_identities;
CREATE POLICY "Anonymous donor identities admin read"
ON public.donor_anonymous_identities
FOR SELECT
TO authenticated
USING (public.is_admin());

ALTER TABLE public.donations
  ADD COLUMN IF NOT EXISTS guest_id text,
  ADD COLUMN IF NOT EXISTS display_mode text NOT NULL DEFAULT 'public',
  ADD COLUMN IF NOT EXISTS donor_identity_key text,
  ADD COLUMN IF NOT EXISTS anonymous_alias text,
  ADD COLUMN IF NOT EXISTS leaderboard_key text,
  ADD COLUMN IF NOT EXISTS leaderboard_name text;

ALTER TABLE public.donations
  DROP CONSTRAINT IF EXISTS donations_display_mode_check;

ALTER TABLE public.donations
  ADD CONSTRAINT donations_display_mode_check CHECK (display_mode IN ('public', 'anonymous'));

CREATE INDEX IF NOT EXISTS donations_display_mode_idx ON public.donations(display_mode);
CREATE INDEX IF NOT EXISTS donations_leaderboard_key_idx ON public.donations(leaderboard_key);
CREATE INDEX IF NOT EXISTS donations_guest_id_idx ON public.donations(guest_id);
CREATE INDEX IF NOT EXISTS donations_identity_key_idx ON public.donations(donor_identity_key);

-- Backfill agar data lama tetap terbaca rapi.
UPDATE public.donations
SET
  display_mode = CASE WHEN show_public THEN 'public' ELSE 'anonymous' END,
  donor_identity_key = COALESCE(
    donor_identity_key,
    CASE
      WHEN user_id IS NOT NULL THEN 'user:' || user_id::text
      ELSE 'legacy:' || order_id
    END
  ),
  leaderboard_key = COALESCE(
    leaderboard_key,
    CASE
      WHEN show_public THEN
        CASE
          WHEN user_id IS NOT NULL THEN 'public:user:' || user_id::text
          ELSE 'public:legacy:' || order_id
        END
      ELSE
        CASE
          WHEN user_id IS NOT NULL THEN 'anonymous:user:' || user_id::text
          ELSE 'anonymous:legacy:' || order_id
        END
    END
  ),
  leaderboard_name = COALESCE(
    leaderboard_name,
    CASE
      WHEN show_public THEN COALESCE(NULLIF(TRIM(donor_name), ''), 'Anonim')
      ELSE 'Anonim'
    END
  )
WHERE leaderboard_key IS NULL OR leaderboard_name IS NULL OR donor_identity_key IS NULL;

CREATE OR REPLACE FUNCTION public.ensure_donor_anonymous_identity(
  p_user_id uuid DEFAULT NULL,
  p_guest_id text DEFAULT NULL
)
RETURNS TABLE (
  identity_key text,
  anonymous_alias text,
  anonymous_number integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_identity_key text;
  v_guest_id text;
  v_next_number integer;
BEGIN
  v_guest_id := NULLIF(TRIM(COALESCE(p_guest_id, '')), '');

  IF p_user_id IS NULL AND v_guest_id IS NULL THEN
    RAISE EXCEPTION 'Identitas donatur anonim tidak valid';
  END IF;

  v_identity_key := CASE
    WHEN p_user_id IS NOT NULL THEN 'user:' || p_user_id::text
    ELSE 'guest:' || v_guest_id
  END;

  SELECT dai.identity_key, dai.anonymous_alias, dai.anonymous_number
  INTO identity_key, anonymous_alias, anonymous_number
  FROM public.donor_anonymous_identities dai
  WHERE dai.identity_key = v_identity_key
  LIMIT 1;

  IF identity_key IS NOT NULL THEN
    RETURN NEXT;
    RETURN;
  END IF;

  v_next_number := nextval('public.donor_anonymous_number_seq')::integer;

  INSERT INTO public.donor_anonymous_identities (
    identity_key,
    user_id,
    guest_id,
    anonymous_number,
    anonymous_alias
  )
  VALUES (
    v_identity_key,
    p_user_id,
    v_guest_id,
    v_next_number,
    'Anonim ' || v_next_number::text
  )
  ON CONFLICT (identity_key) DO NOTHING;

  SELECT dai.identity_key, dai.anonymous_alias, dai.anonymous_number
  INTO identity_key, anonymous_alias, anonymous_number
  FROM public.donor_anonymous_identities dai
  WHERE dai.identity_key = v_identity_key
  LIMIT 1;

  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_donor_anonymous_identity(uuid, text) TO anon, authenticated;

-- Backfill alias anonim untuk donasi anonim lama yang masih bisa dikenali dari user_id/guest_id.
WITH anonymous_sources AS (
  SELECT DISTINCT
    CASE
      WHEN user_id IS NOT NULL THEN 'user:' || user_id::text
      WHEN guest_id IS NOT NULL THEN 'guest:' || guest_id
      ELSE NULL
    END AS identity_key,
    user_id,
    guest_id
  FROM public.donations
  WHERE COALESCE(display_mode, CASE WHEN show_public THEN 'public' ELSE 'anonymous' END) = 'anonymous'
    AND (user_id IS NOT NULL OR guest_id IS NOT NULL)
), numbered AS (
  SELECT
    src.identity_key,
    src.user_id,
    src.guest_id,
    nextval('public.donor_anonymous_number_seq')::integer AS next_number
  FROM anonymous_sources src
  WHERE src.identity_key IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.donor_anonymous_identities dai
      WHERE dai.identity_key = src.identity_key
    )
)
INSERT INTO public.donor_anonymous_identities (
  identity_key,
  user_id,
  guest_id,
  anonymous_number,
  anonymous_alias
)
SELECT
  numbered.identity_key,
  numbered.user_id,
  numbered.guest_id,
  numbered.next_number,
  'Anonim ' || numbered.next_number::text
FROM numbered
ON CONFLICT (identity_key) DO NOTHING;

UPDATE public.donations d
SET
  anonymous_alias = dai.anonymous_alias,
  leaderboard_name = dai.anonymous_alias,
  leaderboard_key = 'anonymous:' || dai.identity_key,
  donor_identity_key = dai.identity_key,
  donor_name = dai.anonymous_alias
FROM public.donor_anonymous_identities dai
WHERE COALESCE(d.display_mode, CASE WHEN d.show_public THEN 'public' ELSE 'anonymous' END) = 'anonymous'
  AND dai.identity_key = CASE
    WHEN d.user_id IS NOT NULL THEN 'user:' || d.user_id::text
    WHEN d.guest_id IS NOT NULL THEN 'guest:' || d.guest_id
    ELSE d.donor_identity_key
  END;

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
    COALESCE(SUM(amount), 0)::bigint AS total_amount,
    COUNT(*)::bigint AS paid_count,
    COUNT(DISTINCT COALESCE(leaderboard_key, order_id))::bigint AS public_donor_count,
    MAX(paid_at) AS latest_paid_at
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
      COALESCE(
        leaderboard_key,
        CASE
          WHEN show_public THEN 'public:legacy:' || COALESCE(user_id::text, order_id)
          ELSE 'anonymous:legacy:' || COALESCE(user_id::text, order_id)
        END
      ) AS display_key,
      COALESCE(
        leaderboard_name,
        CASE WHEN show_public THEN COALESCE(NULLIF(TRIM(donor_name), ''), 'Anonim') ELSE 'Anonim' END
      ) AS display_name,
      amount,
      paid_at,
      created_at
    FROM public.donations
    WHERE status = 'paid'
      AND (
        p_period = 'all'
        OR (p_period = 'month' AND paid_at >= date_trunc('month', now()))
      )
  ), ranked AS (
    SELECT
      display_key,
      (ARRAY_AGG(display_name ORDER BY paid_at DESC NULLS LAST, created_at DESC))[1] AS donor_name,
      SUM(amount)::bigint AS total_amount,
      COUNT(*)::bigint AS donation_count,
      MAX(paid_at) AS latest_paid_at
    FROM filtered
    GROUP BY display_key
  )
  SELECT
    ranked.donor_name,
    ranked.total_amount,
    ranked.donation_count,
    ranked.latest_paid_at
  FROM ranked
  ORDER BY ranked.total_amount DESC, ranked.latest_paid_at DESC NULLS LAST
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
    COALESCE(
      d.leaderboard_name,
      CASE WHEN d.show_public THEN COALESCE(NULLIF(TRIM(d.donor_name), ''), 'Anonim') ELSE 'Anonim' END
    ) AS donor_name,
    d.amount,
    CASE WHEN COALESCE(d.display_mode, 'public') = 'public' THEN d.donor_message ELSE NULL END AS donor_message,
    d.paid_at
  FROM public.donations d
  WHERE d.status = 'paid'
  ORDER BY d.paid_at DESC NULLS LAST, d.created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 10), 30));
$$;

GRANT EXECUTE ON FUNCTION public.get_public_recent_donations(integer) TO anon, authenticated;

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
  updated_at timestamptz,
  display_mode text,
  leaderboard_name text,
  anonymous_alias text
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
    d.updated_at,
    d.display_mode,
    d.leaderboard_name,
    d.anonymous_alias
  FROM public.donations d
  WHERE public.is_admin()
  ORDER BY d.created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 200));
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_donations(integer) TO authenticated;

NOTIFY pgrst, 'reload schema';
