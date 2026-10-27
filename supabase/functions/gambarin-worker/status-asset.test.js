import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { localPostgres, asRole } from '../../gambarin/tests/local-postgres.js'
import { createHandler } from './handler.js'
import { normalizeJobStatus, normalizeAssetResolution } from './provider.js'

test('005 status, asset and recovery on isolated PostgreSQL', async t => {
  const local = await localPostgres()
  t.after(() => local.close())
  const { sql } = local
  const alice = randomUUID(), bob = randomUUID(), worker = randomUUID()
  const key = `eyJhbGciOiJub25lIn0.${btoa(JSON.stringify({ role: 'service_role' })).replace(/=+$/, '')}.fixture`
  await sql`insert into auth.users(id) values (${alice}),(${bob})`
  await sql`insert into public.gambarin_accounts(auth_user_id,username,package_id,status,activated_at,expires_at,quota_granted)
    select id,'status_' || id::text,(select id from public.gambarin_packages where duration_days=7),
      'active',clock_timestamp()-interval '1 day',clock_timestamp()+interval '7 days',100 from auth.users`
  const args = {
    gambarin_acquire_dispatcher: ['p_worker_id'],
    gambarin_release_dispatcher: ['p_worker_id','p_lease_id'],
    gambarin_begin_provider_request: ['p_worker_id','p_lease_id','p_purpose','p_job_id'],
    gambarin_acquire_asset_dispatcher: ['p_worker_id'],
    gambarin_release_asset_dispatcher: ['p_worker_id','p_lease_id'],
    gambarin_begin_asset_request: ['p_worker_id','p_lease_id','p_purpose','p_job_id'],
    gambarin_finish_provider_request: ['p_worker_id','p_lease_id','p_request_id','p_outcome','p_provider_job_id','p_retry_after_seconds'],
  }
  async function rpc(name, values = [], role = 'service_role', sub) {
    assert.match(name, /^gambarin_[a-z_]+$/)
    return asRole(sql, role, sub, async tx =>
      (await tx.unsafe(`select public.${name}(${values.map((_, i) => '$' + (i + 1)).join(',')}) as value`, values))[0].value)
  }
  const enqueue = (user = alice, prompt = 'portrait') => rpc('gambarin_enqueue_job', [user, randomUUID(), prompt])
  const status = (id, user = alice) => rpc('gambarin_my_job_status', [id], 'authenticated', user)
  async function reset() {
    await sql.unsafe(`truncate public.gambarin_manual_gallery_audit,
      public.gambarin_dispatcher,public.gambarin_provider_requests,
      public.gambarin_quota_ledger,public.gambarin_jobs;
      insert into public.gambarin_dispatcher(id,dispatch_paused) values(1,false);
      update public.gambarin_accounts set status='active',quota_granted=100,quota_used=0,quota_reserved=0,
        activated_at=clock_timestamp()-interval '1 day',expires_at=clock_timestamp()+interval '7 days';`)
  }
  const scenario = (name, run) => t.test(name, async () => { await reset(); await run() })
  async function lease() { return (await rpc('gambarin_acquire_dispatcher', [worker])).lease_id }
  async function advance() {
    await sql`update public.gambarin_dispatcher set last_request_finished_at=clock_timestamp()-interval '11 seconds',
      next_allowed_at=clock_timestamp()-interval '6 seconds'`
    await sql`update public.gambarin_jobs set next_poll_at=clock_timestamp()-interval '1 second'`
  }
  async function begin(id, leaseId, purpose) {
    return rpc('gambarin_begin_provider_request', [worker, leaseId, purpose, id])
  }
  async function finish(request, leaseId, outcome, providerId = null) {
    return rpc('gambarin_finish_provider_request', [worker, leaseId, request.request_id, outcome, providerId, 10])
  }
  async function processing() {
    const job = await enqueue()
    const leaseId = await lease()
    await rpc('gambarin_claim_next_job', [worker, leaseId])
    const sent = await begin(job.id, leaseId, 'submit')
    await finish(sent, leaseId, 'accepted', 'provider-job-1')
    return { job, leaseId }
  }
  async function succeeded() {
    const { job, leaseId } = await processing()
    await advance()
    const poll = await begin(job.id, leaseId, 'status')
    await finish(poll, leaseId, 'observed')
    await rpc('gambarin_finalize_job', [job.id, 'provider-job-1', 'succeeded', null, 'media-generation-9'])
    await rpc('gambarin_release_dispatcher', [worker, leaseId])
    return job
  }

  await scenario('owner status returns global FIFO position and safe fields only', async () => {
    const first = await enqueue(bob, 'other'), second = await enqueue(alice, 'mine')
    assert.equal(await status(first.id), null)
    const own = await status(second.id)
    assert.equal(own.queue_position, 2)
    assert.equal(own.status, 'queued')
    assert.equal(own.asset.state, 'not_ready')
    for (const secretField of ['prompt','provider_job_id','provider_asset_id','request_fingerprint','account_id','reconciliation_reference']) {
      assert.equal(Object.hasOwn(own, secretField), false)
    }
    await rpc('gambarin_cancel_queued_job', [bob, first.id])
    assert.equal((await status(second.id)).queue_position, 1)
    await assert.rejects(rpc('gambarin_my_job_status', [second.id], 'anon'), /permission denied/)
    await assert.rejects(rpc('gambarin_mark_asset_unresolved', [second.id,'provider-job-1'], 'authenticated', alice), /permission denied/)
    await assert.rejects(asRole(sql, 'authenticated', alice, tx => tx`
      select provider_job_id from public.gambarin_jobs where id=${second.id}`), /permission denied/)
  })
  await scenario('queued, claimed, submitting, processing and succeeded are readable to owner', async () => {
    const job = await enqueue()
    assert.equal((await status(job.id)).status, 'queued')
    const leaseId = await lease()
    await rpc('gambarin_claim_next_job', [worker, leaseId])
    assert.equal((await status(job.id)).status, 'claimed')
    const sent = await begin(job.id, leaseId, 'submit')
    assert.equal((await status(job.id)).status, 'submitting')
    await finish(sent, leaseId, 'accepted', 'provider-job-1')
    assert.equal((await status(job.id)).status, 'processing')
    await advance()
    const poll = await begin(job.id, leaseId, 'status')
    await finish(poll, leaseId, 'observed')
    await rpc('gambarin_finalize_job', [job.id, 'provider-job-1', 'succeeded', null, 'media-generation-9'])
    const done = await status(job.id)
    assert.equal(done.status, 'succeeded')
    assert.equal(done.asset.state, 'resolvable')
    assert.ok(done.finished_at)
    assert.equal(done.queue_position, null)
    assert.equal(done.asset.url, null)
    assert.equal((await sql`select quota_used,quota_reserved from public.gambarin_accounts where auth_user_id=${alice}`)[0].quota_used, 1)
  })
  await scenario('failed and cancelled show safe messages with one ledger release each', async () => {
    const { job, leaseId } = await processing()
    await advance()
    const poll = await begin(job.id, leaseId, 'status')
    await finish(poll, leaseId, 'observed')
    await rpc('gambarin_finalize_job', [job.id,'provider-job-1','failed','provider_failed',null])
    await rpc('gambarin_finalize_job', [job.id,'provider-job-1','failed','provider_failed',null])
    const failed = await status(job.id)
    assert.equal(failed.error.code, 'provider_failed')
    assert.equal(failed.error.message, 'Pembuatan gambar gagal.')
    const other = await enqueue(bob)
    await rpc('gambarin_cancel_queued_job', [bob, other.id])
    assert.equal((await status(other.id, bob)).status, 'cancelled')
    assert.equal((await sql`select count(*)::int as n from public.gambarin_quota_ledger where event='release'`)[0].n, 2)
  })
  await scenario('unknown submission remains reserved and cannot be reconciled by user', async () => {
    const job = await enqueue()
    const leaseId = await lease()
    await rpc('gambarin_claim_next_job', [worker, leaseId])
    const sent = await begin(job.id, leaseId, 'submit')
    await finish(sent, leaseId, 'unknown')
    const view = await status(job.id)
    assert.equal(view.status, 'submission_unknown')
    assert.equal(view.error.message, 'Status pengiriman sedang diperiksa.')
    assert.equal((await sql`select quota_reserved from public.gambarin_accounts where auth_user_id=${alice}`)[0].quota_reserved, 1)
    await assert.rejects(rpc('gambarin_reconcile_submission', [job.id,'not_accepted','proof-1',null], 'authenticated', alice), /permission denied/)
  })
  await scenario('unresolved result is persisted without consuming quota', async () => {
    const { job, leaseId } = await processing()
    await advance()
    const poll = await begin(job.id, leaseId, 'status')
    await finish(poll, leaseId, 'observed')
    await rpc('gambarin_mark_asset_unresolved', [job.id,'provider-job-1'])
    assert.equal((await status(job.id)).asset.state, 'unresolved')
    const markedAt = (await sql`select asset_unresolved_at from public.gambarin_jobs where id=${job.id}`)[0].asset_unresolved_at
    await rpc('gambarin_mark_asset_unresolved', [job.id,'provider-job-1'])
    assert.equal((await sql`select asset_unresolved_at from public.gambarin_jobs where id=${job.id}`)[0].asset_unresolved_at.getTime(), markedAt.getTime())
    assert.equal((await sql`select quota_used,quota_reserved from public.gambarin_accounts where auth_user_id=${alice}`)[0].quota_reserved, 1)
    await rpc('gambarin_finalize_job', [job.id,'provider-job-1','succeeded',null,'media-generation-9'])
    assert.equal((await status(job.id)).asset.state, 'resolvable')
  })
  await scenario('raw provider job ID is never substituted for mediaGenerationId', async () => {
    const raw = { id: 'provider-job-1', status: 'completed', result: { media: [{ url: 'https://assets.example/temporary' }] } }
    assert.deepEqual(normalizeJobStatus(raw, 'provider-job-1'), { kind: 'succeeded', definitive: true, assetId: null })
    assert.deepEqual(normalizeJobStatus({ ...raw, result: { media: [{ ...raw.result.media[0], mediaGenerationId: 'media-generation-9' }] } }, 'provider-job-1'),
      { kind: 'succeeded', definitive: true, assetId: 'media-generation-9' })
    assert.deepEqual(normalizeJobStatus(raw, 'another-job'), { kind: 'unresolved' })
    assert.deepEqual(normalizeJobStatus({ id: 'provider-job-1', status: 'cancelled' }, 'provider-job-1'),
      { kind: 'failed', definitive: true, cancelled: true })
  })

  function resolverProvider(response) {
    const calls = []
    return { ready: true, calls,
      async resolveAsset(input) { calls.push(input.mediaGenerationId); return response },
      async submitImage() { throw new Error('unexpected submit') },
      async getJobStatus() { throw new Error('unexpected status') },
      async syncJob() { throw new Error('unexpected sync') },
    }
  }
  const dbClient = {
    async rpc(name, input) {
      assert.ok(args[name], `Unexpected RPC: ${name}`)
      try { return { data: await rpc(name, args[name].map(keyName => input[keyName] ?? null)), error: null } }
      catch (error) { return { data: null, error: { message: error.message } } }
    },
    from(name) {
      assert.equal(name, 'gambarin_jobs')
      return { select(columns) {
        assert.equal(columns, 'id,status,provider_job_id,provider_asset_id,gallery_item_id')
        return { eq(column, id) {
          assert.equal(column, 'id')
          return { async maybeSingle() {
            const rows = await asRole(sql, 'service_role', undefined, tx => tx`
              select id,status,provider_job_id,provider_asset_id,gallery_item_id from public.gambarin_jobs where id=${id}`)
            return { data: rows[0] ?? null, error: null }
          } }
        } }
      } }
    },
  }
  const handler = provider => createHandler({ createClient: () => dbClient,
    env: name => ({ SUPABASE_SERVICE_ROLE_KEY: key, GAMBARIN_WORKER_TRIGGER_KEY: key,
      SUPABASE_URL: 'http://127.0.0.1:54321' })[name], provider })
  async function resolve(handle, id) {
    const response = await handle(new Request('https://edge.test/functions/v1/gambarin-worker/resolve', {
      method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_id: id }),
    }))
    return { status: response.status, ...await response.json() }
  }
  await scenario('asset resolve uses the global gate and returns temporary URL only', async () => {
    const job = await succeeded()
    const provider = resolverProvider({ mediaGenerationId: 'media-generation-9', url: 'https://assets.example/signed?token=fixture',
      resolveDiagnostic: { status: 403, code: 'FORBIDDEN_ACTION', source: 'job_fallback' } })
    const handle = handler(provider)
    assert.equal((await resolve(handle, job.id)).state, 'waiting')
    assert.equal(provider.calls.length, 0)
    await advance()
    const result = await resolve(handle, job.id)
    assert.equal(result.asset.url, 'https://assets.example/signed?token=fixture')
    assert.equal(result.asset.expires_at, null)
    assert.equal(result.asset.temporary, true)
    assert.deepEqual(result.resolve_diagnostic,
      { status: 403, code: 'FORBIDDEN_ACTION', source: 'job_fallback' })
    assert.deepEqual(provider.calls, ['media-generation-9'])
    assert.equal((await resolve(handle, job.id)).state, 'waiting')
    const saved = await sql`select to_jsonb(j)::text as raw from public.gambarin_jobs j where id=${job.id}`
    assert.equal(saved[0].raw.includes('signed?token='), false)
  })
  await scenario('resolve rejects mismatched handle and unsafe URL after recording cooldown', async () => {
    const job = await succeeded()
    await advance()
    const provider = resolverProvider({ mediaGenerationId: 'provider-job-1', url: 'javascript:alert(1)' })
    const result = await resolve(handler(provider), job.id)
    assert.equal(result.error, 'asset_unresolved')
    assert.equal((await sql`select extract(epoch from next_allowed_at-last_request_finished_at)::float8 as seconds from public.gambarin_dispatcher`)[0].seconds >= 5, true)
    assert.equal(normalizeAssetResolution({ mediaGenerationId: 'media-generation-9', url: 'https://user:pass@assets.example/a' }, 'media-generation-9'), null)
  })
  await scenario('paused dispatcher permits asset reads but invalid trigger is rejected', async () => {
    const job = await succeeded()
    await sql`update public.gambarin_dispatcher set dispatch_paused=true`
    await advance()
    const provider = resolverProvider({ mediaGenerationId: 'media-generation-9', url: 'https://assets.example/a' })
    assert.equal((await resolve(handler(provider), job.id)).asset.url, 'https://assets.example/a')
    assert.equal(provider.calls.length, 1)
    const noAuth = await handler(provider)(new Request('https://edge.test/functions/v1/gambarin-worker/resolve', { method: 'POST' }))
    assert.equal(noAuth.status, 401)
  })
  await scenario('request recovery requires transport evidence and fences stale worker', async () => {
    const job = await enqueue()
    const leaseId = await lease()
    await rpc('gambarin_claim_next_job', [worker, leaseId])
    const sent = await begin(job.id, leaseId, 'submit')
    await sql`update public.gambarin_dispatcher set lease_expires_at=clock_timestamp()-interval '1 second'`
    assert.equal((await rpc('gambarin_acquire_dispatcher', [randomUUID()])).state, 'recovery_required')
    await assert.rejects(rpc('gambarin_recover_provider_request', [sent.request_id,false,'incident-1']), /recovery_evidence_required/)
    await assert.rejects(rpc('gambarin_recover_provider_request', [sent.request_id,true,'']), /recovery_evidence_required/)
    await assert.rejects(rpc('gambarin_recover_provider_request', [sent.request_id,true,'incident-1'], 'authenticated', alice), /permission denied/)
    await rpc('gambarin_recover_provider_request', [sent.request_id,true,'incident-1'])
    assert.equal((await status(job.id)).status, 'submission_unknown')
    await assert.rejects(finish(sent, leaseId, 'accepted', 'provider-job-1'), /request_result_conflict|stale_request/)
    await rpc('gambarin_reconcile_submission', [job.id,'accepted','incident-1','provider-job-1'])
    assert.equal((await status(job.id)).status, 'processing')
    assert.equal((await sql`select quota_reserved from public.gambarin_accounts where auth_user_id=${alice}`)[0].quota_reserved, 1)
  })
  await scenario('request already in flight can finish safely after dispatcher is paused', async () => {
    const { job, leaseId } = await processing()
    await advance()
    const poll = await begin(job.id, leaseId, 'status')
    await sql`update public.gambarin_dispatcher set dispatch_paused=true`
    await finish(poll, leaseId, 'observed')
    await rpc('gambarin_finalize_job', [job.id,'provider-job-1','succeeded',null,'media-generation-9'])
    assert.equal((await status(job.id)).status, 'succeeded')
    assert.equal((await sql`select request_state from public.gambarin_dispatcher`)[0].request_state, 'idle')
    await assert.rejects(rpc('gambarin_release_dispatcher', [worker, leaseId]), /dispatch_paused/)
    assert.equal((await rpc('gambarin_acquire_dispatcher', [randomUUID()])).state, 'paused')
  })
})
