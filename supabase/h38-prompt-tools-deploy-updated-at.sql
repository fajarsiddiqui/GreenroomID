BEGIN;

CREATE OR REPLACE FUNCTION public.set_prompt_tools_content_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF (
    to_jsonb(NEW)
      - 'updated_at'
      - 'last_deploy_status'
      - 'last_deploy_triggered_at'
  ) IS DISTINCT FROM (
    to_jsonb(OLD)
      - 'updated_at'
      - 'last_deploy_status'
      - 'last_deploy_triggered_at'
  ) THEN
    NEW.updated_at = now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_prompt_tools_updated_at ON public.prompt_tools;

CREATE TRIGGER set_prompt_tools_updated_at
BEFORE UPDATE ON public.prompt_tools
FOR EACH ROW
EXECUTE FUNCTION public.set_prompt_tools_content_updated_at();

NOTIFY pgrst, 'reload schema';

COMMIT;
