-- Reassert the live least-privilege grants for shop_images.
revoke all on table public.shop_images from anon, authenticated;
grant select on table public.shop_images to anon, authenticated;
grant insert, update, delete on table public.shop_images to authenticated;

-- Keep cron history bounded; remove any prior named job before recreating it.
do $$
declare
  existing_job record;
begin
  for existing_job in
    select jobid from cron.job where jobname = 'cron-history-cleanup'
  loop
    perform cron.unschedule(existing_job.jobid);
  end loop;

  perform cron.schedule(
    'cron-history-cleanup',
    '30 20 * * *',
    $command$delete from cron.job_run_details where end_time < now() - interval '7 days'$command$
  );
end;
$$;
