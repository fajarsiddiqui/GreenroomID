import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { createHandler } from './handler.js'
import { disabledProvider } from './provider.js'
import { mockProvider } from './mock-provider.js'
import { localPostgres, asRole } from '../../gambarin/tests/local-postgres.js'

const rpcArgs = {
  gambarin_enqueue_job: ['p_auth_user_id', 'p_idempotency_key', 'p_prompt'],
  gambarin_acquire_dispatcher: ['p_worker_id'],
  gambarin_claim_next_job: ['p_worker_id', 'p_lease_id'],
  gambarin_begin_provider_request: ['p_worker_id', 'p_lease_id', 'p_purpose', 'p_job_id'],
  gambarin_extend_submit_lease: ['p_worker_id', 'p_lease_id', 'p_request_id'],
  gambarin_finish_provider_request: ['p_worker_id', 'p_lease_id', 'p_request_id', 'p_outcome', 'p_provider_job_id', 'p_retry_after_seconds'],
  gambarin_finalize_job: ['p_job_id', 'p_provider_job_id', 'p_status', 'p_error_code', 'p_provider_asset_id'],
  gambarin_release_dispatcher: ['p_worker_id', 'p_lease_id'],
  gambarin_mark_asset_unresolved: ['p_job_id', 'p_provider_job_id'],
}

test('serial worker uses real isolated PostgreSQL and mock provider', async t => {
  const local = await localPostgres()
  t.after(() => local.close())
  const { sql } = local
  const alice = randomUUID(), bob = randomUUID()
  await sql`insert into auth.users(id) values (${alice}),(${bob})`
  await sql`insert into public.gambarin_accounts(auth_user_id,username,package_id,status,activated_at,expires_at,quota_granted)
    select id, 'worker_' || id::text, (select id from public.gambarin_packages where duration_days=7),
      'active',clock_timestamp()-interval '1 day',clock_timestamp()+interval '7 days',100 from auth.users`
  const key = `eyJhbGciOiJub25lIn0.${btoa(JSON.stringify({ role: 'service_role' })).replace(/=+$/, '')}.fixture`
  let rpcCalls = []
  const client = {
    async rpc(name, args) {
      rpcCalls.push(name)
      try {
        const names = rpcArgs[name]
        assert.ok(names, `Unexpected RPC: ${name}`)
        const values = names.map(item => args[item] ?? null)
        const data = await asRole(sql, 'service_role', undefined, async tx =>
          (await tx.unsafe(`select public.${name}(${values.map((_, i) => '$' + (i + 1)).join(',')}) as value`, values))[0].value)
        return { data, error: null }
      } catch (error) { return { data: null, error: { code: error.code, message: error.message } } }
    },
    from(name) {
      assert.equal(name, 'gambarin_jobs')
      return { select(columns) {
        assert.equal(columns, 'id,status,prompt,provider_job_id,next_poll_at')
        return { eq(column, id) {
          assert.equal(column, 'id')
          return { async maybeSingle() {
            const rows = await asRole(sql, 'service_role', undefined, tx => tx`
              select id,status,prompt,provider_job_id,next_poll_at from public.gambarin_jobs where id=${id}`)
            return { data: rows[0] ?? null, error: null }
          } }
        } }
      } }
    },
  }
  async function reset() {
    await sql.unsafe(`truncate public.gambarin_manual_gallery_audit,
      public.gambarin_dispatcher,public.gambarin_provider_requests,
      public.gambarin_quota_ledger,public.gambarin_jobs;
      insert into public.gambarin_dispatcher(id,dispatch_paused) values(1,false);
      update public.gambarin_accounts set status='active',quota_granted=100,quota_used=0,quota_reserved=0,
        activated_at=clock_timestamp()-interval '1 day',expires_at=clock_timestamp()+interval '7 days';`)
    rpcCalls = []
  }
  const enqueue = (id = alice, prompt = 'portrait') => asRole(sql, 'service_role', undefined,
    async tx => (await tx`select public.gambarin_enqueue_job(${id},${randomUUID()},${prompt}) as job`)[0].job)
  const counters = async (id = alice) => (await sql`select quota_used,quota_reserved from public.gambarin_accounts where auth_user_id=${id}`)[0]
  function provider(options = {}) {
    const calls = []
    return { ready: true, calls,
      async submitImage(input) { calls.push({ purpose: 'submit', prompt: input.prompt }); return options.submit?.(input) ?? { kind: 'accepted', providerJobId: `remote-${calls.filter(c => c.purpose === 'submit').length}` } },
      async getJobStatus(input) { calls.push({ purpose: 'status', id: input.providerJobId }); return options.status?.(input) ?? { kind: 'running' } },
      async syncJob(input) { calls.push({ purpose: 'sync', id: input.providerJobId }); return { kind: 'running' } },
      async resolveAsset(input) { calls.push({ purpose: 'resolve', id: input.assetId }); return null },
    }
  }
  const make = (p, timeout, options = {}) => createHandler({ createClient: () => client,
    env: name => ({ SUPABASE_SERVICE_ROLE_KEY: key, GAMBARIN_WORKER_TRIGGER_KEY: key,
      SUPABASE_URL: 'http://127.0.0.1:54321' })[name],
    provider: p, providerTimeoutMs: timeout ?? 25_000, ...options })
  async function tick(handle, token = key, extraHeaders = {}) {
    const headers = { Authorization: `Bearer ${token}`, ...extraHeaders }
    const response = await handle(new Request('https://edge.test/functions/v1/gambarin-worker', { method: 'POST', headers }))
    return { status: response.status, ...await response.json() }
  }
  async function advance() {
    // Fixture clock only: avoids a real 5/10-second wait while testing DB guards.
    await sql`update public.gambarin_dispatcher set last_request_finished_at=clock_timestamp()-interval '11 seconds',
      next_allowed_at=clock_timestamp()-interval '6 seconds'`
    await sql`update public.gambarin_jobs set next_poll_at=clock_timestamp()-interval '1 second',
      next_attempt_at=clock_timestamp()-interval '1 second'`
  }
  const scenario = (name, work) => t.test(name, async () => { await reset(); await work() })

  await scenario('paused dispatcher leaves queued job and mock untouched', async () => {
    const p = provider(), handle = make(p)
    await enqueue()
    await sql`update public.gambarin_dispatcher set dispatch_paused=true`
    assert.equal((await tick(handle)).state, 'paused')
    assert.equal(p.calls.length, 0)
    assert.equal((await sql`select status from public.gambarin_jobs`)[0].status, 'queued')
  })
  await scenario('FIFO across users holds second job while first is processing', async () => {
    const first = await enqueue(alice, 'first'), second = await enqueue(bob, 'second')
    const p = provider({ status: () => ({ kind: 'succeeded', definitive: true, assetId: 'opaque-asset' }) }), handle = make(p)
    assert.equal((await tick(handle)).state, 'processing')
    assert.equal((await tick(handle)).state, 'waiting')
    assert.deepEqual(p.calls.map(c => c.purpose), ['submit'])
    await advance()
    assert.equal((await tick(handle)).state, 'succeeded')
    await advance()
    const afterFirst = await tick(handle)
    assert.equal(afterFirst.state, 'processing', JSON.stringify(afterFirst))
    assert.deepEqual(p.calls.filter(c => c.purpose === 'submit').map(c => c.prompt), ['first', 'second'])
    assert.deepEqual((await sql`select id from public.gambarin_jobs order by sequence_no`).map(j => j.id), [first.id, second.id])
  })
  await scenario('two simultaneous ticks cannot send two provider jobs', async () => {
    await enqueue(); await enqueue(bob, 'second')
    const p = provider({ submit: async () => { await delay(120); return { kind: 'accepted', providerJobId: 'remote-1' } } }), handle = make(p)
    const replies = await Promise.all([tick(handle), tick(handle)])
    assert.equal(replies.filter(r => r.state === 'processing').length, 1)
    assert.equal(p.calls.filter(c => c.purpose === 'submit').length, 1)
    assert.equal((await sql`select count(*)::int as n from public.gambarin_jobs where status in ('claimed','submitting','processing','submission_unknown')`)[0].n, 1)
  })
  await scenario('background submit persists a late JobResponse after HTTP 202', async () => {
    const job = await enqueue()
    const tasks = []
    let complete
    const pending = new Promise(resolve => { complete = resolve })
    const p = provider({ submit: () => pending,
      status: () => ({ kind: 'succeeded', definitive: true, assetId: 'media-1' }) })
    const handle = make(p, undefined, { background: task => tasks.push(task), submitTimeoutMs: 1_000 })
    const first = await tick(handle)
    assert.equal(first.status, 202)
    assert.equal(first.state, 'submitting')
    assert.equal((await sql`select lease_expires_at>clock_timestamp()+interval '100 seconds' as extended
      from public.gambarin_dispatcher`)[0].extended, true)
    assert.equal((await sql`select status from public.gambarin_jobs where id=${job.id}`)[0].status, 'submitting')
    assert.equal((await tick(handle)).state, 'request_in_flight')
    complete({ kind: 'accepted', providerJobId: 'late-provider-job', recoveredFromList: true })
    await tasks[0]
    const done = (await sql`select status,provider_job_id from public.gambarin_jobs where id=${job.id}`)[0]
    assert.deepEqual(done, { status: 'processing', provider_job_id: 'late-provider-job' })
    assert.equal((await sql`select count(*)::int as n from public.gambarin_provider_requests where purpose='submit'`)[0].n, 1)
    assert.deepEqual(await counters(), { quota_used: 0, quota_reserved: 1 })
    await advance()
    assert.equal((await tick(handle)).state, 'succeeded')
    assert.deepEqual(await counters(), { quota_used: 1, quota_reserved: 0 })
    assert.equal((await sql`select count(*)::int as n from public.gambarin_quota_ledger
      where job_id=${job.id} and event='consume'`)[0].n, 1)
  })
  await scenario('background submit timeout keeps the attempt locked without resend', async () => {
    const job = await enqueue()
    const tasks = []
    const p = provider({ submit: () => new Promise(() => {}) })
    const handle = make(p, undefined, { background: task => tasks.push(task), submitTimeoutMs: 15 })
    assert.equal((await tick(handle)).status, 202)
    await tasks[0]
    assert.equal((await tick(handle)).state, 'request_in_flight')
    assert.equal((await sql`select status from public.gambarin_jobs where id=${job.id}`)[0].status, 'submitting')
    assert.equal(p.calls.filter(call => call.purpose === 'submit').length, 1)
    assert.deepEqual(await counters(), { quota_used: 0, quota_reserved: 1 })
  })
  await scenario('background DB acknowledgement failure preserves one accepted attempt', async () => {
    const job = await enqueue()
    const tasks = []
    const p = provider()
    const originalRpc = client.rpc
    const handle = make(p, undefined, { background: task => tasks.push(task) })
    client.rpc = async function blockedFinish(name, args) {
      if (name === 'gambarin_finish_provider_request') return { data: null, error: { message: 'network_lost' } }
      return originalRpc.call(this, name, args)
    }
    try {
      assert.equal((await tick(handle)).status, 202)
      await tasks[0]
    } finally { client.rpc = originalRpc }
    assert.equal((await tick(handle)).state, 'request_in_flight')
    assert.equal((await sql`select status from public.gambarin_jobs where id=${job.id}`)[0].status, 'submitting')
    assert.equal(p.calls.filter(call => call.purpose === 'submit').length, 1)
    assert.deepEqual(await counters(), { quota_used: 0, quota_reserved: 1 })
  })
  await scenario('five-second cooldown is durable across new ticks', async () => {
    await enqueue()
    const p = provider({ submit: () => ({ kind: 'rejected', definitive: true, retryable: true }) }), handle = make(p)
    assert.equal((await tick(handle)).state, 'queued')
    const gate = (await sql`select extract(epoch from next_allowed_at-last_request_finished_at)::float8 as wait from public.gambarin_dispatcher`)[0]
    assert.ok(gate.wait >= 5)
    assert.equal((await tick(handle)).state, 'idle')
    assert.equal(p.calls.length, 1)
    await advance()
    assert.equal((await tick(handle)).state, 'queued')
    assert.equal(p.calls.length, 2)
    assert.deepEqual(await counters(), { quota_used: 0, quota_reserved: 1 })
  })
  await scenario('restart preserves FIFO after definitive slot rejection', async () => {
    const first = await enqueue(), second = await enqueue(bob, 'second')
    const p = provider({ submit: () => ({ kind: 'rejected', definitive: true, retryable: true }) })
    await tick(make(p))
    await advance()
    await tick(make(p))
    assert.deepEqual(p.calls.map(c => c.prompt), ['portrait', 'portrait'])
    assert.equal((await sql`select id from public.gambarin_jobs order by sequence_no limit 1`)[0].id, first.id)
    assert.equal((await sql`select status from public.gambarin_jobs where id=${second.id}`)[0].status, 'queued')
  })
  await scenario('success consumes reserved quota once, then terminal job is idle', async () => {
    const job = await enqueue()
    const p = provider({ status: () => ({ kind: 'succeeded', definitive: true, assetId: 'opaque-asset' }) }), handle = make(p)
    await tick(handle); await advance()
    assert.equal((await tick(handle)).state, 'succeeded')
    assert.equal((await tick(handle)).state, 'idle')
    assert.deepEqual(await counters(), { quota_used: 1, quota_reserved: 0 })
    assert.equal((await sql`select count(*)::int as n from public.gambarin_quota_ledger where job_id=${job.id} and event='consume'`)[0].n, 1)
  })
  await scenario('backend mock completes one queued job and settles quota exactly once', async () => {
    const job = await enqueue()
    const handle = make(mockProvider())
    assert.deepEqual(await counters(), { quota_used: 0, quota_reserved: 1 })
    assert.equal((await tick(handle)).state, 'processing')
    const processing = (await sql`select status,provider_job_id from public.gambarin_jobs where id=${job.id}`)[0]
    assert.equal(processing.status, 'processing')
    assert.match(processing.provider_job_id, /^mock-job-/)
    await advance()
    assert.equal((await tick(handle)).state, 'succeeded')
    const finished = (await sql`select status,provider_asset_id from public.gambarin_jobs where id=${job.id}`)[0]
    assert.equal(finished.status, 'succeeded')
    assert.equal(finished.provider_asset_id, processing.provider_job_id.replace(/^mock-job-/, 'mock-asset-'))
    assert.deepEqual(await counters(), { quota_used: 1, quota_reserved: 0 })
    assert.equal((await sql`select count(*)::int as n from public.gambarin_quota_ledger where job_id=${job.id} and event='consume'`)[0].n, 1)
    const own = await asRole(sql, 'authenticated', alice, async tx =>
      (await tx`select public.gambarin_my_job_status(${job.id}) as value`)[0].value)
    const other = await asRole(sql, 'authenticated', bob, async tx =>
      (await tx`select public.gambarin_my_job_status(${job.id}) as value`)[0].value)
    assert.equal(own.status, 'succeeded')
    assert.equal(other, null)
  })
  await scenario('provider success without a verifiable asset handle stays reserved', async () => {
    await enqueue()
    const p = provider({ status: () => ({ kind: 'succeeded', definitive: true }) }), handle = make(p)
    await tick(handle); await advance()
    assert.equal((await tick(handle)).state, 'processing')
    assert.equal((await sql`select status from public.gambarin_jobs`)[0].status, 'processing')
    assert.equal((await sql`select asset_unresolved_at is not null as unresolved from public.gambarin_jobs`)[0].unresolved, true)
    assert.deepEqual(await counters(), { quota_used: 0, quota_reserved: 1 })
  })
  await scenario('confirmed final failure releases once', async () => {
    await enqueue()
    const p = provider({ status: () => ({ kind: 'failed', definitive: true }) }), handle = make(p)
    await tick(handle); await advance()
    assert.equal((await tick(handle)).state, 'failed')
    assert.deepEqual(await counters(), { quota_used: 0, quota_reserved: 0 })
    assert.equal((await sql`select count(*)::int as n from public.gambarin_quota_ledger where event='release'`)[0].n, 1)
  })
  await scenario('ambiguous submit keeps slot/reservation and never resends', async () => {
    const job = await enqueue()
    const p = provider({ submit: () => { throw new Error('transport timeout') } }), handle = make(p)
    assert.equal((await tick(handle)).state, 'reconciliation_required')
    await advance()
    assert.equal((await tick(handle)).state, 'reconciliation_required')
    assert.equal(p.calls.length, 1)
    assert.deepEqual(await counters(), { quota_used: 0, quota_reserved: 1 })
    assert.equal((await sql`select status from public.gambarin_jobs where id=${job.id}`)[0].status, 'submission_unknown')
  })
  await scenario('permanent rejection is frozen instead of retried', async () => {
    await enqueue()
    const p = provider({ submit: () => ({ kind: 'rejected', definitive: true, retryable: false }) }), handle = make(p)
    assert.equal((await tick(handle)).state, 'reconciliation_required')
    await advance()
    assert.equal((await tick(handle)).state, 'reconciliation_required')
    assert.equal(p.calls.length, 1)
    assert.deepEqual(await counters(), { quota_used: 0, quota_reserved: 1 })
  })
  await scenario('polling waits for database backoff after cooldown', async () => {
    await enqueue()
    const p = provider(), handle = make(p)
    await tick(handle)
    await advance()
    assert.equal((await tick(handle)).state, 'processing')
    await sql`update public.gambarin_dispatcher set last_request_finished_at=clock_timestamp()-interval '11 seconds',next_allowed_at=clock_timestamp()-interval '6 seconds'`
    assert.equal((await tick(handle)).state, 'waiting')
    assert.equal(p.calls.filter(c => c.purpose === 'status').length, 1)
  })
  await scenario('expired in-flight lease cannot start duplicate generate', async () => {
    await enqueue(); await enqueue(bob, 'second')
    let resume
    const pending = new Promise(resolve => { resume = resolve })
    const p = provider({ submit: () => pending }), handle = make(p)
    const first = tick(handle)
    for (let i = 0; i < 100 && p.calls.length === 0; i++) await delay(10)
    assert.equal(p.calls.length, 1)
    await sql`update public.gambarin_dispatcher set lease_expires_at=clock_timestamp()-interval '1 second'`
    assert.equal((await tick(handle)).state, 'recovery_required')
    assert.equal(p.calls.length, 1)
    resume({ kind: 'accepted', providerJobId: 'remote-1' })
    assert.equal((await first).state, 'processing')
    assert.deepEqual(await counters(), { quota_used: 0, quota_reserved: 1 })
    assert.equal(p.calls.length, 1)
  })
  await scenario('lost database finish response freezes submit for operator recovery', async () => {
    await enqueue()
    const p = provider(), handle = make(p)
    const originalRpc = client.rpc
    client.rpc = async function blockedFinish(name, args) {
      if (name === 'gambarin_finish_provider_request') return { data: null, error: { message: 'network_lost' } }
      return originalRpc.call(this, name, args)
    }
    try { assert.equal((await tick(handle)).status, 503) }
    finally { client.rpc = originalRpc }
    assert.equal((await tick(handle)).state, 'request_in_flight')
    assert.equal(p.calls.length, 1)
    assert.equal((await sql`select status from public.gambarin_jobs`)[0].status, 'submitting')
    assert.deepEqual(await counters(), { quota_used: 0, quota_reserved: 1 })
  })
  await scenario('unsettled provider promise times out with the request still locked', async () => {
    await enqueue()
    let aborted = false
    const p = provider({ submit: ({ signal }) => {
      signal.addEventListener('abort', () => { aborted = true })
      return new Promise(() => {})
    } }), handle = make(p, 20)
    assert.equal((await tick(handle)).state, 'recovery_required')
    assert.equal(aborted, true)
    assert.equal((await tick(handle)).state, 'request_in_flight')
    assert.equal((await sql`select status from public.gambarin_jobs`)[0].status, 'submitting')
    assert.equal(p.calls.length, 1)
    assert.deepEqual(await counters(), { quota_used: 0, quota_reserved: 1 })
  })
  await scenario('idle tick never calls provider or starts a request', async () => {
    const p = provider()
    assert.equal((await tick(make(p))).state, 'idle')
    assert.equal(p.calls.length, 0)
    assert.equal((await sql`select count(*)::int as n from public.gambarin_provider_requests`)[0].n, 0)
  })
  await scenario('account expiring after enqueue is settled without provider request', async () => {
    await enqueue()
    await sql`update public.gambarin_accounts set expires_at=clock_timestamp()-interval '1 second' where auth_user_id=${alice}`
    const p = provider()
    assert.equal((await tick(make(p))).state, 'idle')
    assert.equal(p.calls.length, 0)
    assert.deepEqual(await counters(), { quota_used: 0, quota_reserved: 0 })
    assert.equal((await sql`select status from public.gambarin_jobs`)[0].status, 'failed')
  })
  await scenario('trigger rejects anonymous, wrong key and browser origin before any RPC', async () => {
    const p = provider(), handle = make(p)
    const noAuth = await handle(new Request('https://edge.test/functions/v1/gambarin-worker', { method: 'POST' }))
    assert.equal(noAuth.status, 401)
    assert.equal((await tick(handle, 'wrong-key')).status, 403)
    assert.equal((await tick(handle, key, { Origin: 'https://evil.example' })).status, 403)
    assert.equal(rpcCalls.length, 0)
    assert.equal(p.calls.length, 0)
  })
  await scenario('deployed adapter stays disabled if dispatcher is unpaused by mistake', async () => {
    await enqueue()
    const result = await tick(make(disabledProvider()))
    assert.equal(result.status, 503)
    assert.equal(result.state, 'provider_not_configured')
    assert.equal((await sql`select count(*)::int as n from public.gambarin_provider_requests`)[0].n, 0)
    assert.equal((await sql`select status from public.gambarin_jobs`)[0].status, 'queued')
  })
})
