// Isolated local PostgreSQL only. No production connection or Jennabot requests.
import assert from 'node:assert/strict'
import test from 'node:test'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { localPostgres, asRole } from './local-postgres.js'

test('014 global FIFO snapshot and owner isolation', async t => {
  const db = await localPostgres()
  t.after(() => db.close())
  const { sql } = db
  await sql.unsafe(await readFile(new URL('../migrations/014_global_queue_snapshot.sql', import.meta.url), 'utf8'))
  const users = [randomUUID(), randomUUID(), randomUUID(), randomUUID()]
  const accounts = []
  for (const [index, user] of users.entries()) {
    await sql`insert into auth.users(id) values (${user})`
    const rows = await sql`insert into public.gambarin_accounts
      (auth_user_id,username,package_id,status,activated_at,expires_at,quota_granted)
      values (${user},${`queue_${index}`},
        (select id from public.gambarin_packages limit 1),'active',
        clock_timestamp()-interval '1 day',clock_timestamp()+interval '7 days',10)
      returning id`
    accounts.push(rows[0].id)
  }
  const snapshot = user => asRole(sql, 'authenticated', user, async tx =>
    (await tx`select public.gambarin_global_queue_snapshot() as value`)[0].value)
  const empty = await snapshot(users[0])
  assert.deepEqual([empty.total, empty.active_count, empty.waiting_count,
    empty.reconciliation_count, empty.own_position, empty.own_status],
  [0, 0, 0, 0, null, null])
  assert.ok(Date.parse(empty.snapshot_at))
  await assert.rejects(asRole(sql, 'anon', undefined, tx =>
    tx`select public.gambarin_global_queue_snapshot()`))

  const jobs = []
  for (const [index, accountId] of accounts.slice(0, 3).entries()) {
    const rows = await sql`insert into public.gambarin_jobs(account_id,idempotency_key,prompt)
      values (${accountId},${randomUUID()},${`fixture ${index}`}) returning id`
    jobs.push(rows[0].id)
  }
  await sql`update public.gambarin_dispatcher set dispatch_paused=false where id=1`
  const views = await Promise.all(users.map(snapshot))
  assert.deepEqual(views.map(view => view.total), [3, 3, 3, 3])
  assert.deepEqual(views.map(view => view.own_position), [1, 2, 3, null])
  assert.equal(views[3].waiting_count, 3)
  assert.equal(JSON.stringify(views).includes(jobs[1]), false)
  const others = await asRole(sql, 'authenticated', users[0], tx =>
    tx`select id from public.gambarin_jobs where id=${jobs[1]}`)
  assert.equal(others.length, 0)

  await sql`update public.gambarin_jobs set status='processing',provider_job_id='fixture-provider-1'
    where id=${jobs[0]}`
  await sql`update public.gambarin_dispatcher set active_job_id=${jobs[0]} where id=1`
  const processing = await snapshot(users[1])
  assert.deepEqual([processing.total, processing.active_count, processing.waiting_count,
    processing.own_position], [3, 1, 2, 2])
  await sql`update public.gambarin_jobs set status='submission_unknown' where id=${jobs[0]}`
  const reconciling = await snapshot(users[1])
  assert.deepEqual([reconciling.active_count, reconciling.reconciliation_count,
    reconciling.own_position], [0, 1, 2])

  await sql`update public.gambarin_jobs set status='succeeded',finished_at=clock_timestamp()
    where id=${jobs[0]}`
  await sql`update public.gambarin_dispatcher set active_job_id=null where id=1`
  assert.deepEqual((await Promise.all(users.slice(1, 3).map(snapshot)))
    .map(view => [view.total, view.own_position]), [[2, 1], [2, 2]])
  await sql`update public.gambarin_jobs set status='cancelled',finished_at=clock_timestamp()
    where id=${jobs[1]}`
  await sql`update public.gambarin_jobs set status='failed',finished_at=clock_timestamp()
    where id=${jobs[2]}`
  assert.equal((await snapshot(users[3])).total, 0)

  // Two queued jobs for one account choose the earliest actual FIFO position.
  await sql`insert into public.gambarin_jobs(account_id,idempotency_key,prompt)
    values (${accounts[0]},${randomUUID()},'first'),
      (${accounts[1]},${randomUUID()},'other'),
      (${accounts[0]},${randomUUID()},'second')`
  const repeated = await snapshot(users[0])
  assert.deepEqual([repeated.total, repeated.own_position, repeated.own_status],
    [3, 1, 'queued'])
})
