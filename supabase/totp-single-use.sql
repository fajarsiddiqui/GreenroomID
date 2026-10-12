BEGIN;

ALTER TABLE public.totp_access_tokens
ADD COLUMN IF NOT EXISTS used_at timestamptz;

CREATE OR REPLACE FUNCTION public.consume_totp_access_token(
  p_token_hash text
)
RETURNS TABLE(
  status text,
  token_id uuid,
  account_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  WITH consumed AS (
    UPDATE public.totp_access_tokens AS token
    SET used_at = clock_timestamp()
    FROM public.totp_accounts AS account
    WHERE token.token_hash = p_token_hash
      AND token.account_id = account.id
      AND token.used_at IS NULL
      AND token.revoked_at IS NULL
      AND (
        token.expires_at IS NULL
        OR token.expires_at > now()
      )
      AND account.is_active = true
    RETURNING token.id, token.account_id
  )
  SELECT
    'consumed'::text,
    consumed.id,
    consumed.account_id
  FROM consumed;

  IF FOUND THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    CASE
      WHEN EXISTS (
        SELECT 1
        FROM public.totp_access_tokens AS token
        WHERE token.token_hash = p_token_hash
          AND token.used_at IS NOT NULL
      )
      THEN 'used'::text
      ELSE 'invalid'::text
    END,
    NULL::uuid,
    NULL::uuid;
END;
$$;

REVOKE ALL
ON FUNCTION public.consume_totp_access_token(text)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
ON FUNCTION public.consume_totp_access_token(text)
TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;