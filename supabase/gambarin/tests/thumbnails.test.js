import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { randomUUID } from 'node:crypto'
import process from 'node:process'

test('isolated PostgreSQL thumbnail trigger, ownership, retry, budget and idle cron', async t => {
  assert.ok(process.env.GAMBARIN_TEST_PGLITE, 'Set GAMBARIN_TEST_PGLITE to isolated test runtime')
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
    create schema net; create table net.calls(id bigserial,url text);
    create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer)
      returns bigint language sql as $$ insert into net.calls(url) values($1) returning id $$;
    create schema storage; create table storage.buckets(id text primary key,name text,public boolean,
      file_size_limit bigint,allowed_mime_types text[]);`)
  for (const name of ['001_accounts_packages.sql','002_admin_account_create.sql',
    '003_admin_account_management.sql','004_generation_queue_ledger.sql',
    '005_job_status_asset_resolution.sql','012_thumbnails.sql']) {
    const source = await readFile(new URL('../migrations/'+name, import.meta.url),'utf8')
    await db.exec(source.replace(/^create extension[^;]+;/gm,''))
  }
  const query = async (sql,args=[]) => (await db.query(sql,args)).rows
  const value = async (sql,args=[]) => (await query(sql,args))[0]?.v
  const alice=randomUUID(),bob=randomUUID(),jobA=randomUUID(),jobB=randomUUID()
  await query('insert into auth.users values($1),($2)',[alice,bob])
  await db.exec(`insert into public.gambarin_accounts(auth_user_id,username,package_id,status,activated_at,expires_at,quota_granted)
    select id,id::text,(select id from public.gambarin_packages where duration_days=7),'active',
    now()-interval '1 day',now()+interval '7 days',100 from auth.users;
    select set_config('request.jwt.claims','{"role":"service_role"}',false);`)
  const account = async auth => value('select id as v from gambarin_accounts where auth_user_id=$1',[auth])
  const accountA=await account(alice),accountB=await account(bob)
  const insert = async (id,owner) => query(`insert into gambarin_jobs
    (id,account_id,idempotency_key,request_fingerprint,prompt,status)
    values($1,$2,$3,'fixture','a test image','queued')`,[id,owner,randomUUID()])
  await insert(jobA,accountA);await insert(jobB,accountB)
  assert.equal(await value('select count(*)::int as v from gambarin_thumbnails'),0)
  await query(`update gambarin_jobs set status='succeeded',finished_at=now(),provider_asset_id='media-a'
    where id=$1`,[jobA])
  await query(`update gambarin_jobs set status='succeeded',finished_at=now(),provider_asset_id='media-b'
    where id=$1`,[jobB])
  assert.equal(await value('select count(*)::int as v from gambarin_thumbnails'),2)
  assert.equal(await value("select count(*)::int as v from cron.job where jobname='gambarin-thumbnail-worker'"),1)
  await query(`update gambarin_jobs set status='succeeded' where id=$1`,[jobA])
  assert.equal(await value('select count(*)::int as v from gambarin_thumbnails'),2)
  const bucket = (await query("select public as v from storage.buckets where id='gambarin-thumbnails'"))[0]
  assert.equal(bucket.v,false)

  await db.exec(`set role authenticated; select set_config('request.jwt.claims',
    '{"role":"authenticated","sub":"${alice}"}',false);`)
  assert.equal(await value('select count(*)::int as v from gambarin_thumbnails'),1)
  assert.equal(await value('select count(*)::int as v from gambarin_thumbnails where job_id=$1',[jobB]),0)
  await db.exec(`reset role; select set_config('request.jwt.claims','{"role":"service_role"}',false);`)

  const first=await value('select gambarin_thumbnail_claim() as v')
  assert.ok(first?.job_id)
  assert.equal(await value('select gambarin_thumbnail_claim() as v'),null)
  await query("update gambarin_thumbnails set lease_until=now()-interval '1 second' where job_id=$1",[first.job_id])
  const recovered=await value('select gambarin_thumbnail_claim() as v')
  assert.equal(recovered.job_id,first.job_id)
  assert.equal(recovered.attempt,first.attempt+1)
  assert.equal(await value('select status as v from gambarin_jobs where id=$1',[first.job_id]),'succeeded')
  await query('select gambarin_thumbnail_finish($1,$2,false,null,null,null,10,$3)',
    [recovered.job_id,recovered.attempt,'conversion_failed'])
  assert.equal(await value('select status as v from gambarin_thumbnails where job_id=$1',[first.job_id]),'failed')
  assert.equal(await value('select status as v from gambarin_jobs where id=$1',[first.job_id]),'succeeded')
  const second=await value('select gambarin_thumbnail_claim() as v')
  assert.notEqual(second.job_id,first.job_id)
  await query('select gambarin_thumbnail_finish($1,$2,true,4096,480,240,20,null)',
    [second.job_id,second.attempt])
  assert.equal(await value('select gambarin_thumbnail_budget(83886080) as v'),false)
  assert.equal(await value('select gambarin_thumbnail_budget(4096) as v'),true)
  await query("update gambarin_thumbnails set next_attempt_at=now()-interval '1 second' where job_id=$1",[first.job_id])
  const retry=await value('select gambarin_thumbnail_claim() as v')
  assert.equal(retry.job_id,first.job_id)
  await query('select gambarin_thumbnail_finish($1,$2,true,4096,480,240,20,null)',
    [retry.job_id,retry.attempt])
  assert.equal(await value("select count(*)::int as v from cron.job where jobname='gambarin-thumbnail-worker'"),0)
  assert.equal(await value('select count(*)::int as v from gambarin_quota_ledger'),0)

  const oldJob=randomUUID()
  await query(`insert into gambarin_jobs
    (id,account_id,idempotency_key,request_fingerprint,prompt,status,finished_at,provider_asset_id)
    values($1,$2,$3,'fixture','old result','succeeded',now(),'old-media')`,
  [oldJob,accountA,randomUUID()])
  assert.equal(await value('select count(*)::int as v from gambarin_thumbnails where job_id=$1',[oldJob]),0)
  assert.equal(await value('select gambarin_thumbnail_backfill(1) as v'),1)
  assert.equal(await value('select gambarin_thumbnail_backfill(1) as v'),0)
  assert.equal(await value('select count(*)::int as v from gambarin_thumbnails where job_id=$1',[oldJob]),1)

  await db.exec("delete from vault.decrypted_secrets where name='gambarin_worker_trigger_jwt'")
  const withoutSecret=randomUUID()
  await insert(withoutSecret,accountA)
  await query(`update gambarin_jobs set status='succeeded',finished_at=now(),
    provider_asset_id='still-succeeded' where id=$1`,[withoutSecret])
  assert.equal(await value('select status as v from gambarin_jobs where id=$1',[withoutSecret]),'succeeded')
  assert.equal(await value('select status as v from gambarin_thumbnails where job_id=$1',[withoutSecret]),'pending')
})
