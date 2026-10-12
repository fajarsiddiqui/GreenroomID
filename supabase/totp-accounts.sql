CREATE TABLE IF NOT EXISTS public.totp_accounts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL CHECK (length(name) BETWEEN 1 AND 120), secret_ciphertext text NOT NULL, secret_iv text NOT NULL, secret_tag text NOT NULL, is_active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS public.totp_access_tokens (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), account_id uuid NOT NULL REFERENCES public.totp_accounts(id) ON DELETE CASCADE, token_hash text NOT NULL UNIQUE CHECK (length(token_hash)=64), expires_at timestamptz, revoked_at timestamptz, used_at timestamptz, created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.totp_accounts ENABLE ROW LEVEL SECURITY; ALTER TABLE public.totp_access_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.totp_accounts FROM anon, authenticated; REVOKE ALL ON public.totp_access_tokens FROM anon, authenticated;
CREATE INDEX IF NOT EXISTS totp_access_tokens_hash_idx ON public.totp_access_tokens(token_hash);
CREATE INDEX IF NOT EXISTS totp_access_tokens_account_idx ON public.totp_access_tokens(account_id);
CREATE OR REPLACE FUNCTION public.consume_totp_access_token(p_token_hash text)
RETURNS TABLE(status text, token_id uuid, account_id uuid)
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
      AND (token.expires_at IS NULL OR token.expires_at > now())
      AND account.is_active = true
    RETURNING token.id, token.account_id
  )
  SELECT 'consumed'::text, consumed.id, consumed.account_id
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
      ) THEN 'used'::text
      ELSE 'invalid'::text
    END,
    NULL::uuid,
    NULL::uuid;
END;
$$;
REVOKE ALL ON FUNCTION public.consume_totp_access_token(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_totp_access_token(text) TO service_role;
NOTIFY pgrst, 'reload schema';
