// Isolated PostgreSQL WASM; cron/net/Vault are mocked, never real HTTP.
// Set GAMBARIN_TEST_PGLITE to the external @electric-sql/pglite/dist/index.js.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { randomUUID } from 'node:crypto'
import process from 'node:process'

test('activity scheduler and paused asset gate on isolated PostgreSQL', async t => {
  assert.ok(process.env.GAMBARIN_TEST_PGLITE, 'Set GAMBARIN_TEST_PGLITE to external test runtime')
  const { PGlite } = await import(pathToFileURL(process.env.GAMBARIN_TEST_PGLITE).href)
  const db = new PGlite()
  t.after(() => db.close())
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;
    create function auth.role() returns text language sql stable as $$
      select nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role' $$;
    grant usage on schema auth,public to anon,authenticated,service_role;
    create schema cron; create table cron.job(jobid bigserial primary key,jobname text unique,schedule text,command text);
    create function cron.schedule(text,text,text) returns bigint language sql as $$
      insert into cron.job(jobname,schedule,command) values($1,$2,$3) returning jobid $$;
    create function cron.unschedule(bigint) returns boolean language plpgsql as $$
      begin delete from cron.job where jobid=$1; return found; end $$;
    create schema vault; create table vault.decrypted_secrets(name text,decrypted_secret text);
    insert into vault.decrypted_secrets values('gambarin_worker_trigger_jwt',repeat('fixture',10));
    create schema net; create table net.calls(id bigserial,url text,headers jsonb,body jsonb);
    create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer)
      returns bigint language sql as $$ insert into net.calls(url,headers,body) values($1,$2,$3) returning id $$;`)
  for (const file of ['001_accounts_packages.sql','002_admin_account_create.sql','003_admin_account_management.sql',
    '004_generation_queue_ledger.sql','005_job_status_asset_resolution.sql','007_paused_asset_access.sql','008_activity_worker.sql']) {
    const source = await readFile(new URL('../migrations/'+file, import.meta.url),'utf8')
    // Only extension installers are substituted. All actual functions/triggers run unchanged.
    await db.exec(source.replace(/^create extension[^;]+;/gm,''))
  }
  const query = async (sql, args=[]) => (await db.query(sql,args)).rows
  const value = async (sql,args=[]) => (await query(sql,args))[0]?.v
  const rpc = async (name,args=[]) => value(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as v`,args)
  const alice=randomUUID(),bob=randomUUID(),worker=randomUUID()
  await query('insert into auth.users values($1),($2)',[alice,bob])
  await db.exec(`insert into public.gambarin_accounts(auth_user_id,username,package_id,status,activated_at,expires_at,quota_granted)
    select id,id::text,(select id from public.gambarin_packages where duration_days=7),'active',
    now()-interval '1 day',now()+interval '7 days',100 from auth.users;
    select set_config('request.jwt.claims','{"role":"service_role"}',false);`)
  const enqueue = user => rpc('gambarin_enqueue_job',[user,randomUUID(),'unchanged prompt'])
  const count = table => value(`select count(*)::int as v from ${table}`)
  const reset = async () => db.exec(`truncate public.gambarin_dispatcher,public.gambarin_provider_requests,
    public.gambarin_quota_ledger,public.gambarin_jobs; truncate cron.job,net.calls;
    insert into public.gambarin_dispatcher(id) values(1);
    update public.gambarin_accounts set quota_used=0,quota_reserved=0;`)
  const scenario = (name,run) => t.test(name,async()=>{await reset();await run()})
  await scenario('PAUSED keeps reservation and never wakes a worker',async()=>{
    await enqueue(alice)
    assert.equal(await count('cron.job'),0)
    assert.equal(await count('net.calls'),0)
    assert.equal((await rpc('gambarin_acquire_dispatcher',[worker])).state,'paused')
    assert.equal(await value('select quota_reserved as v from gambarin_accounts where auth_user_id=$1',[alice]),1)
  })
  await scenario('enqueue wakes after transaction, coalesces scheduler, leases fence duplicate workers',async()=>{
    await db.exec('update gambarin_dispatcher set dispatch_paused=false')
    const first=await enqueue(alice);await enqueue(bob)
    assert.equal(await count('cron.job'),1)
    assert.equal(await count('net.calls'),2)
    const lease=await rpc('gambarin_acquire_dispatcher',[worker])
    assert.equal((await rpc('gambarin_acquire_dispatcher',[randomUUID()])).state,'busy')
    assert.equal((await rpc('gambarin_claim_next_job',[worker,lease.lease_id])).id,first.id)
    // HTTP failure/worker crash does not remove durable cron or FIFO job.
    await db.exec('select public._gambarin_worker_tick()')
    assert.equal(await count('cron.job'),1)
    assert.equal(await count('gambarin_jobs'),2)
  })
  await scenario('empty queue stops watchdog; next enqueue restarts it',async()=>{
    await db.exec('update gambarin_dispatcher set dispatch_paused=false')
    const j=await enqueue(alice)
    await rpc('gambarin_cancel_queued_job',[alice,j.id])
    const before=await count('net.calls')
    await db.exec('select public._gambarin_worker_tick()')
    assert.equal(await count('cron.job'),0)
    assert.equal(await count('net.calls'),before)
    await enqueue(bob)
    assert.equal(await count('cron.job'),1)
  })
  await scenario('rolled back enqueue cannot leave wake-up or quota reservation',async()=>{
    await db.exec('update gambarin_dispatcher set dispatch_paused=false; begin')
    await enqueue(alice)
    await db.exec('rollback')
    assert.equal(await count('cron.job'),0)
    assert.equal(await count('net.calls'),0)
    assert.equal(await count('gambarin_quota_ledger'),0)
  })
  await scenario('crash with open submit freezes recovery and never resubmits',async()=>{
    await db.exec('update gambarin_dispatcher set dispatch_paused=false')
    const j=await enqueue(alice)
    const l=await rpc('gambarin_acquire_dispatcher',[worker])
    await rpc('gambarin_claim_next_job',[worker,l.lease_id])
    await rpc('gambarin_begin_provider_request',[worker,l.lease_id,'submit',j.id])
    await db.exec("update gambarin_dispatcher set lease_expires_at=clock_timestamp()-interval '1 second'")
    assert.equal((await rpc('gambarin_acquire_dispatcher',[randomUUID()])).state,'recovery_required')
    await db.exec('select public._gambarin_worker_tick()')
    assert.equal(await count('cron.job'),0)
    assert.equal(await count('gambarin_provider_requests'),1)
    assert.equal(await count('gambarin_quota_ledger'),1)
  })
  await scenario('ambiguous submit stops automatic processing without consuming or releasing',async()=>{
    await db.exec('update gambarin_dispatcher set dispatch_paused=false')
    const j=await enqueue(alice)
    const l=await rpc('gambarin_acquire_dispatcher',[worker])
    await rpc('gambarin_claim_next_job',[worker,l.lease_id])
    const r=await rpc('gambarin_begin_provider_request',[worker,l.lease_id,'submit',j.id])
    await rpc('gambarin_finish_provider_request',[worker,l.lease_id,r.request_id,'unknown',null,30])
    await db.exec('select public._gambarin_worker_tick()')
    assert.equal(await count('cron.job'),0)
    assert.equal(await value('select status as v from gambarin_jobs where id=$1',[j.id]),'submission_unknown')
    assert.equal(await count('gambarin_quota_ledger'),1)
    await db.exec("update gambarin_dispatcher set last_request_finished_at=clock_timestamp()-interval '10 seconds',next_allowed_at=clock_timestamp()-interval '5 seconds'")
    await assert.rejects(rpc('gambarin_begin_provider_request',[worker,l.lease_id,'submit',j.id]),/submit_not_allowed/)
  })
  await scenario('read gate works PAUSED but forbids submit and shares cooldown',async()=>{
    const j=await enqueue(alice)
    // Fixture completion only; no provider request or live quota mutation.
    await query("update gambarin_jobs set status='succeeded',provider_job_id='provider-fixture',provider_asset_id='media-fixture',finished_at=clock_timestamp() where id=$1",[j.id])
    const l=await rpc('gambarin_acquire_asset_dispatcher',[worker])
    await assert.rejects(rpc('gambarin_begin_asset_request',[worker,l.lease_id,'submit',j.id]),/invalid_purpose/)
    const r=await rpc('gambarin_begin_asset_request',[worker,l.lease_id,'resolve',j.id])
    await rpc('gambarin_finish_provider_request',[worker,l.lease_id,r.request_id,'observed',null,30])
    await assert.rejects(rpc('gambarin_begin_asset_request',[worker,l.lease_id,'resolve',j.id]),/global_cooldown/)
    await rpc('gambarin_release_asset_dispatcher',[worker,l.lease_id])
    assert.equal(await value('select dispatch_paused as v from gambarin_dispatcher'),true)
  })
  await scenario('missing wake secret rolls enqueue back atomically',async()=>{
    await db.exec('update gambarin_dispatcher set dispatch_paused=false; delete from vault.decrypted_secrets')
    await assert.rejects(enqueue(alice),/worker_wakeup_secret_missing/)
    assert.equal(await count('gambarin_jobs'),0)
    assert.equal(await count('gambarin_quota_ledger'),0)
  })
})
