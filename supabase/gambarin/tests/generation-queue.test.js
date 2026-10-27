// Run: node --test supabase/gambarin/tests/generation-queue.test.js
// Needs external local tools described in local-postgres.js; no application dependency.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { localPostgres, asRole } from './local-postgres.js';

test('004 queue/ledger on isolated PostgreSQL (never Supabase)', async t => {
  const db = await localPostgres();
  t.after(() => db.close());
  const { sql } = db;
  assert.equal((await sql`select dispatch_paused from public.gambarin_dispatcher`)[0].dispatch_paused, true);
  const a = randomUUID();
  const b = randomUUID();
  await sql`insert into auth.users(id) values (${a}),(${b})`;
  await sql`insert into public.gambarin_accounts(auth_user_id,username,package_id,status,activated_at,expires_at,quota_granted)
    select id, 'test_' || id::text, (select id from public.gambarin_packages where duration_days=7),
      'active',clock_timestamp()-interval '1 day',clock_timestamp()+interval '7 days',100 from auth.users`;
  const backend = (work, connection = sql) => asRole(connection, 'service_role', undefined, work);
  async function rpc(name, args = [], connection = sql) {
    assert.match(name, /^gambarin_[a-z_]+$/);
    return backend(async tx => (await tx.unsafe(`select public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) as value`, args))[0].value, connection);
  }
  const enqueue = (user = a, key = randomUUID(), prompt = 'local test', connection = sql) =>
    rpc('gambarin_enqueue_job', [user, key, prompt], connection);
  async function reset() {
    // Superuser fixture cleanup is LOCAL only, never granted to application roles.
    await sql.unsafe(`truncate public.gambarin_dispatcher,public.gambarin_provider_requests,
      public.gambarin_quota_ledger,public.gambarin_jobs;
      insert into public.gambarin_dispatcher(id,dispatch_paused) values(1,false);
      update public.gambarin_accounts set status='active',quota_granted=100,quota_used=0,quota_reserved=0,
      activated_at=clock_timestamp()-interval '1 day', expires_at=clock_timestamp()+interval '7 days';`);
  }
  async function lease(worker = randomUUID(), connection = sql) {
    return { worker, ...await rpc('gambarin_acquire_dispatcher', [worker], connection) };
  }
  const claim = l => rpc('gambarin_claim_next_job', [l.worker, l.lease_id]);
  const begin = (l, purpose, job = null) => rpc('gambarin_begin_provider_request', [l.worker, l.lease_id, purpose, job]);
  const finish = (l, r, outcome, remote = null) => rpc('gambarin_finish_provider_request', [l.worker, l.lease_id, r.request_id, outcome, remote, 10]);
  const finalize = (j, status, error = null, asset = null) => rpc('gambarin_finalize_job', [j.id, 'remote-job', status, error, asset]);
  async function processing() {
    const j = await enqueue();
    const l = await lease();
    assert.equal((await claim(l)).id, j.id);
    const r = await begin(l, 'submit', j.id);
    await finish(l, r, 'accepted', 'remote-job');
    return { j, l, r };
  }
  async function counters(user = a) {
    return (await sql`select quota_used,quota_reserved from public.gambarin_accounts where auth_user_id=${user}`)[0];
  }
  async function scenario(name, run) {
    await t.test(name, async () => { await reset(); await run(); });
  }

  await scenario('two concurrent users get unique ordered FIFO positions', async () => {
    const c = db.connect();
    const jobs = await Promise.all([enqueue(a), enqueue(b, randomUUID(), 'other', c)]);
    assert.notEqual(jobs[0].sequence_no, jobs[1].sequence_no);
    const ordered = await sql`select id from public.gambarin_jobs order by sequence_no`;
    const l = await lease();
    assert.equal((await claim(l)).id, ordered[0].id);
    assert.equal((await claim(l)), null);
    assert.equal((await counters()).quota_reserved, 1);
    assert.equal((await counters(b)).quota_reserved, 1);
  });
  await scenario('competing workers: only one lease and claim, stale fence rejected', async () => {
    await enqueue();
    const pair = await Promise.all([lease(), lease(randomUUID(), db.connect())]);
    assert.deepEqual(pair.map(l => l.state).sort(), ['acquired', 'busy']);
    const winner = pair.find(l => l.state === 'acquired');
    const claimed = await Promise.all([claim(winner), rpc('gambarin_claim_next_job', [winner.worker, winner.lease_id], db.connect())]);
    assert.equal(claimed.filter(j => j?.status === 'claimed').length, 1);
    assert.equal(claimed.filter(j => j === null).length, 1);
    await assert.rejects(begin({ worker: randomUUID(), lease_id: randomUUID() }, 'metadata'), /stale_lease/);
  });
  await scenario('active provider blocks next job and unique index forbids second active', async () => {
    const { j, l } = await processing();
    const next = await enqueue(b);
    assert.equal(await claim(l), null);
    await assert.rejects(sql`update public.gambarin_jobs set status='claimed' where id=${next.id}`, /gambarin_jobs_one_active_idx/);
    assert.equal((await sql`select active_job_id from public.gambarin_dispatcher`)[0].active_job_id, j.id);
  });
  await scenario('cooldown measured after completion survives new worker; all purposes share gate', async () => {
    let l = await lease();
    const r = await begin(l, 'metadata');
    await assert.rejects(begin(l, 'metadata'), /request_not_finished/);
    await delay(80);
    await finish(l, r, 'observed');
    const gate = (await sql`select extract(epoch from next_allowed_at-last_request_finished_at)::float8 as seconds from public.gambarin_dispatcher`)[0];
    assert.ok(gate.seconds >= 5);
    await rpc('gambarin_release_dispatcher', [l.worker, l.lease_id]);
    l = await lease();
    for (const purpose of ['submit','status','sync','resolve','metadata']) {
      await assert.rejects(begin(l, purpose), /global_cooldown/);
    }
    await delay(5100);
    const after = await begin(l, 'metadata');
    await finish(l, after, 'transport_error');
    await assert.rejects(begin(l, 'metadata'), /global_cooldown/);
    await assert.rejects(sql`update public.gambarin_dispatcher set cooldown_seconds=4`, /check constraint/);
  });
  await scenario('expired, disabled and exhausted accounts cannot enqueue', async () => {
    await sql`update public.gambarin_accounts set expires_at=clock_timestamp()-interval '1 hour' where auth_user_id=${a}`;
    await assert.rejects(enqueue(), /account_expired/);
    await sql`update public.gambarin_accounts set status='disabled' where auth_user_id=${a}`;
    await assert.rejects(enqueue(), /account_inactive/);
    await sql`update public.gambarin_accounts set status='active',expires_at=clock_timestamp()+interval '1 day',quota_granted=0 where auth_user_id=${a}`;
    await assert.rejects(enqueue(), /quota_unavailable/);
    assert.equal((await sql`select count(*)::int as n from public.gambarin_jobs`)[0].n, 0);
  });
  await scenario('concurrent reservations cannot exceed quota', async () => {
    await sql`update public.gambarin_accounts set quota_granted=1 where auth_user_id=${a}`;
    const results = await Promise.allSettled([enqueue(), enqueue(a, randomUUID(), 'other', db.connect())]);
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    assert.match(results.find(r => r.status === 'rejected').reason.message, /quota_unavailable/);
    assert.deepEqual(await counters(), { quota_used: 0, quota_reserved: 1 });
  });
  await scenario('idempotency is account scoped, concurrent safe and rejects changed payload', async () => {
    const key = randomUUID();
    const [one, two] = await Promise.all([enqueue(a, key), enqueue(a, key, 'local test', db.connect())]);
    assert.equal(one.id, two.id);
    assert.notEqual((await enqueue(b, key)).id, one.id);
    await assert.rejects(enqueue(a, key, 'changed'), /idempotency_conflict/);
    assert.deepEqual(await counters(), { quota_used: 0, quota_reserved: 1 });
    assert.equal((await sql`select count(*)::int as n from public.gambarin_quota_ledger where job_id=${one.id}`)[0].n, 1);
  });
  await scenario('successful finalization consumes once even on concurrent retry', async () => {
    const { j } = await processing();
    const args = [j.id, 'remote-job', 'succeeded', null, 'opaque-asset-id'];
    await Promise.all([rpc('gambarin_finalize_job', args), rpc('gambarin_finalize_job', args, db.connect())]);
    assert.deepEqual(await counters(), { quota_used: 1, quota_reserved: 0 });
    assert.equal((await sql`select count(*)::int as n from public.gambarin_quota_ledger where job_id=${j.id}`)[0].n, 2);
    await assert.rejects(finalize(j, 'failed', 'provider_failed'), /finalization_conflict/);
  });
  await scenario('confirmed final failure releases exactly once; timeout is not terminal evidence', async () => {
    const { j } = await processing();
    await assert.rejects(finalize(j, 'failed', 'timeout'), /terminal_evidence_required/);
    await finalize(j, 'failed', 'provider_failed');
    await finalize(j, 'failed', 'provider_failed');
    assert.deepEqual(await counters(), { quota_used: 0, quota_reserved: 0 });
    assert.equal((await sql`select count(*)::int as n from public.gambarin_quota_ledger where job_id=${j.id} and event='release'`)[0].n, 1);
  });
  await scenario('unknown submit preserves quota and slot; only evidenced reconciliation releases', async () => {
    const j = await enqueue();
    const l = await lease();
    await claim(l);
    const r = await begin(l, 'submit', j.id);
    await finish(l, r, 'unknown');
    await enqueue(b);
    assert.equal(await claim(l), null);
    assert.equal((await counters()).quota_reserved, 1);
    await rpc('gambarin_release_dispatcher', [l.worker, l.lease_id]);
    const restarted = await lease();
    assert.equal(restarted.active_job_id, j.id);
    await assert.rejects(rpc('gambarin_reconcile_submission', [j.id, 'not_accepted', '']), /reconciliation_evidence_required/);
    await rpc('gambarin_reconcile_submission', [j.id, 'not_accepted', 'incident-1']);
    await rpc('gambarin_reconcile_submission', [j.id, 'not_accepted', 'incident-1']);
    assert.equal((await counters()).quota_reserved, 0);
  });
  await scenario('expired in-flight lease locks global gate, requires transport evidence and fences old worker', async () => {
    const j = await enqueue();
    const l = await lease();
    await claim(l);
    const r = await begin(l, 'submit', j.id);
    await sql`update public.gambarin_dispatcher set lease_expires_at=clock_timestamp()-interval '1 second'`;
    assert.equal((await lease()).state, 'recovery_required');
    assert.equal((await counters()).quota_reserved, 1);
    await assert.rejects(rpc('gambarin_recover_provider_request', [r.request_id, false, 'incident-2']), /recovery_evidence_required/);
    await rpc('gambarin_recover_provider_request', [r.request_id, true, 'incident-2']);
    await assert.rejects(finish(l, r, 'accepted', 'remote-job'), /request_result_conflict|stale_request/);
    const newer = await lease();
    assert.equal(newer.active_job_id, j.id);
    await assert.rejects(begin(newer, 'metadata'), /global_cooldown/);
    await rpc('gambarin_reconcile_submission', [j.id, 'accepted', 'incident-2', 'remote-job']);
    assert.equal((await counters()).quota_reserved, 1);
    await finalize(j, 'succeeded');
    assert.equal((await counters()).quota_used, 1);
  });
  await scenario('cancel queued only, own job only and idempotent release', async () => {
    const own = await enqueue();
    const other = await enqueue(b);
    await assert.rejects(rpc('gambarin_cancel_queued_job', [a, other.id]), /job_not_found/);
    await rpc('gambarin_cancel_queued_job', [a, own.id]);
    await rpc('gambarin_cancel_queued_job', [a, own.id]);
    assert.equal((await counters()).quota_reserved, 0);
    assert.equal((await counters(b)).quota_reserved, 1);
    const l = await lease();
    assert.equal((await claim(l)).id, other.id);
    await assert.rejects(rpc('gambarin_cancel_queued_job', [b, other.id]), /job_not_cancellable/);
  });
  await scenario('two authenticated identities RLS and restricted mutations/RPCs', async () => {
    const own = await enqueue();
    const other = await enqueue(b);
    for (const [user, expected] of [[a, own.id], [b, other.id]]) {
      const rows = await asRole(sql, 'authenticated', user, tx => tx`select id from public.gambarin_jobs`);
      assert.deepEqual(rows.map(r => r.id), [expected]);
      await assert.rejects(asRole(sql, 'authenticated', user, tx => tx`update public.gambarin_jobs set provider_job_id='forged'`), /permission denied/);
      await assert.rejects(asRole(sql, 'authenticated', user, tx => tx`select public.gambarin_enqueue_job(${a},${randomUUID()},'forged')`), /permission denied/);
    }
    await assert.rejects(asRole(sql, 'anon', undefined, tx => tx`select * from public.gambarin_jobs`), /permission denied/);
    const all = await sql`select c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname in ('gambarin_jobs','gambarin_quota_ledger','gambarin_dispatcher','gambarin_provider_requests')`;
    assert.equal(all.length, 4);
    assert.ok(all.every(r => r.relrowsecurity));
    const permissions = await sql`select r,t,has_table_privilege(r,t,'TRUNCATE') as allowed
      from unnest(array['anon','authenticated','service_role']) r
      cross join unnest(array['public.gambarin_jobs','public.gambarin_quota_ledger','public.gambarin_dispatcher','public.gambarin_provider_requests']) t`;
    assert.ok(permissions.every(p => !p.allowed));
  });
  await scenario('ledger immutable and private helpers inaccessible even to backend', async () => {
    await enqueue();
    for (const role of ['anon','authenticated','service_role']) {
      await assert.rejects(asRole(sql, role, a, tx => tx`delete from public.gambarin_quota_ledger`), /permission denied/);
      await assert.rejects(asRole(sql, role, a, tx => tx`update public.gambarin_quota_ledger set used_after=0`), /permission denied/);
    }
    await assert.rejects(sql`update public.gambarin_quota_ledger set used_after=0`, /immutable_quota_ledger/);
    await assert.rejects(sql`delete from public.gambarin_quota_ledger`, /immutable_quota_ledger/);
    await assert.rejects(backend(tx => tx`select public._gambarin_queue_settle(${randomUUID()},'failed','provider_failed')`), /permission denied/);
  });
  await scenario('ledger insert failure rolls back enqueue and finalization completely', async () => {
    await sql.unsafe(`create function public.test_fail_ledger() returns trigger language plpgsql as $$
      begin raise exception 'injected_ledger_failure'; end $$;
      create trigger test_fail before insert on public.gambarin_quota_ledger for each row execute function public.test_fail_ledger();`);
    try {
      await assert.rejects(enqueue(), /injected_ledger_failure/);
      assert.equal((await sql`select count(*)::int as n from public.gambarin_jobs`)[0].n, 0);
      assert.deepEqual(await counters(), { quota_used: 0, quota_reserved: 0 });
      await sql.unsafe('alter table public.gambarin_quota_ledger disable trigger test_fail');
      const { j } = await processing();
      await sql.unsafe('alter table public.gambarin_quota_ledger enable trigger test_fail');
      await assert.rejects(finalize(j, 'succeeded'), /injected_ledger_failure/);
      assert.deepEqual(await counters(), { quota_used: 0, quota_reserved: 1 });
      assert.equal((await sql`select status from public.gambarin_jobs where id=${j.id}`)[0].status, 'processing');
      assert.equal((await sql`select active_job_id from public.gambarin_dispatcher`)[0].active_job_id, j.id);
    } finally {
      await sql.unsafe('drop trigger test_fail on public.gambarin_quota_ledger; drop function public.test_fail_ledger()');
    }
  });
  await scenario('busy rejection waits at same FIFO position, no reserve/debit again', async () => {
    const j = await enqueue();
    await enqueue(b);
    const l = await lease();
    await claim(l);
    const r = await begin(l, 'submit', j.id);
    await finish(l, r, 'rejected');
    assert.equal((await counters()).quota_reserved, 1);
    assert.equal(await claim(l), null);
    await sql`update public.gambarin_dispatcher set last_request_finished_at=clock_timestamp()-interval '10 seconds',next_allowed_at=clock_timestamp()-interval '5 seconds'`;
    assert.equal(await claim(l), null); // Head backoff still blocks the second user's job.
    const rows = await sql`select id,status from public.gambarin_jobs order by sequence_no`;
    assert.equal(rows[0].id, j.id);
    assert.equal(rows[0].status, 'queued');
  });
  await scenario('queue cap 20 includes active and unknown; duplicate remains idempotent', async () => {
    const key = randomUUID();
    const first = await enqueue(a, key);
    const l = await lease();
    await claim(l);
    const r = await begin(l, 'submit', first.id);
    await finish(l, r, 'unknown');
    for (let i = 1; i < 20; i++) await enqueue();
    await assert.rejects(enqueue(b), /queue_full/);
    assert.equal((await enqueue(a, key)).id, first.id);
  });
  await scenario('poll backoff and request completion retry preserve shared cooldown', async () => {
    const { j, l, r } = await processing();
    const before = (await sql`select next_allowed_at from public.gambarin_dispatcher`)[0].next_allowed_at;
    await finish(l, r, 'accepted', 'remote-job');
    assert.deepEqual((await sql`select next_allowed_at from public.gambarin_dispatcher`)[0].next_allowed_at, before);
    // Local clock fixture: backdate only the gate, leaving the per-job backoff intact.
    await sql`update public.gambarin_dispatcher set last_request_finished_at=clock_timestamp()-interval '10 seconds',next_allowed_at=clock_timestamp()-interval '5 seconds'`;
    for (const purpose of ['status', 'sync']) await assert.rejects(begin(l, purpose, j.id), /poll_backoff/);
    await sql`update public.gambarin_jobs set next_poll_at=clock_timestamp()-interval '1 second' where id=${j.id}`;
    const poll = await begin(l, 'status', j.id);
    await assert.rejects(finalize(j, 'succeeded'), /job_not_finalizable/);
    await finish(l, poll, 'observed');
    await assert.rejects(begin(l, 'sync', j.id), /global_cooldown/);
  });
  await scenario('entitlement rechecked at claim; disabled head releases without dispatch', async () => {
    const first = await enqueue();
    const second = await enqueue(b);
    await sql`update public.gambarin_accounts set status='disabled' where auth_user_id=${a}`;
    const l = await lease();
    const rejected = await claim(l);
    assert.equal(rejected.id, first.id);
    assert.equal(rejected.status, 'failed');
    assert.equal((await counters()).quota_reserved, 0);
    assert.equal((await claim(l)).id, second.id);
    assert.equal((await sql`select count(*)::int as n from public.gambarin_provider_requests`)[0].n, 0);
  });
  await scenario('paused by default and abandoned pre-submit claim can safely be reclaimed', async () => {
    await sql`update public.gambarin_dispatcher set dispatch_paused=true`;
    assert.equal((await lease()).state, 'paused');
    await sql`update public.gambarin_dispatcher set dispatch_paused=false`;
    const j = await enqueue();
    const old = await lease();
    await claim(old);
    await sql`update public.gambarin_dispatcher set lease_expires_at=clock_timestamp()-interval '1 second'`;
    const newer = await lease();
    assert.equal((await claim(newer)).id, j.id);
    await assert.rejects(begin(old, 'submit', j.id), /stale_lease/);
    assert.equal((await counters()).quota_reserved, 1);
  });
});
