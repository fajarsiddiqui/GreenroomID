CREATE TABLE IF NOT EXISTS public.totp_accounts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL CHECK (length(name) BETWEEN 1 AND 120), secret_ciphertext text NOT NULL, secret_iv text NOT NULL, secret_tag text NOT NULL, is_active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS public.totp_access_tokens (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), account_id uuid NOT NULL REFERENCES public.totp_accounts(id) ON DELETE CASCADE, token_hash text NOT NULL UNIQUE CHECK (length(token_hash)=64), expires_at timestamptz, revoked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.totp_accounts ENABLE ROW LEVEL SECURITY; ALTER TABLE public.totp_access_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.totp_accounts FROM anon, authenticated; REVOKE ALL ON public.totp_access_tokens FROM anon, authenticated;
CREATE INDEX IF NOT EXISTS totp_access_tokens_hash_idx ON public.totp_access_tokens(token_hash);
CREATE INDEX IF NOT EXISTS totp_access_tokens_account_idx ON public.totp_access_tokens(account_id);
NOTIFY pgrst, 'reload schema';
