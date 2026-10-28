-- Gambarin project only. Expose retry count for the caller's own thumbnail rows.
-- Existing RLS policy still restricts rows to the authenticated account.
begin;
grant select (attempts) on public.gambarin_thumbnails to authenticated;
commit;
