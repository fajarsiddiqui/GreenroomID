import assert from 'node:assert/strict'
import test from 'node:test'
import { randomUUID } from 'node:crypto'
import { localPostgres, asRole } from './local-postgres.js'

test('owner-attested Gallery recovery is audited, owner-scoped and idempotent', async t => {
  const local = await localPostgres()
  t.after(() => local.close())
  const { sql } = local
  const authId = randomUUID(), accountId = randomUUID(), jobId = randomUUID()
  const requestId = randomUUID(), galleryId = randomUUID()
  const leaseId = randomUUID(), workerId = randomUUID()
  const mediaId = 'user:123-image:fixture'
  const start = new Date(Date.now() - 120_000).toISOString()
  const created = new Date(Date.now() - 70_000).toISOString()
  await sql`insert into auth.users(id) values(${authId})`
  await sql`insert into public.gambarin_accounts(id,auth_user_id,username,package_id,status,
    activated_at,expires_at,quota_granted,quota_used,quota_reserved)
    values(${accountId},${authId},'gambarin_smoke_01',
      (select id from public.gambarin_packages where duration_days=3),
      'active',clock_timestamp()-interval '1 day',clock_timestamp()+interval '1 day',8,2,1)`
  await sql`insert into public.gambarin_jobs(id,account_id,idempotency_key,request_fingerprint,prompt,
    status,submission_started_at,error_code)
    values(${jobId},${accountId},${randomUUID()},'fixture','orange cat',
      'submission_unknown',${start},'lease_expired')`
  await sql`insert into public.gambarin_quota_ledger(job_id,account_id,event,reserved_delta,used_delta,
    reserved_before,reserved_after,used_before,used_after,quota_granted,reason)
    values(${jobId},${accountId},'reserve',1,0,0,1,2,2,8,'enqueue')`
  await sql`insert into public.gambarin_provider_requests(id,lease_id,worker_id,job_id,purpose)
    values(${requestId},${leaseId},${workerId},${jobId},'submit')`
  await sql`update public.gambarin_dispatcher set dispatch_paused=true,active_job_id=${jobId},
    active_request_id=${requestId},request_state='recovery_required',lease_id=${leaseId},
    worker_id=${workerId},lease_expires_at=clock_timestamp()-interval '20 seconds' where id=1`
  const probe = { job_id: jobId, gallery_item_id: galleryId,
    media_generation_id: mediaId, prompt_matches: false, has_url: true,
    submission_started_at: start, created_at: created,
    model: 'nano-banana-2', aspect_ratio: 'IMAGE_ASPECT_RATIO_SQUARE' }
  await sql`insert into net._http_response(id,status_code,content) values(10,200,${JSON.stringify(probe)})`
  const args = [jobId, requestId, galleryId, mediaId, 10, 'gambarin_smoke_01', 'owner_29d_gallery']
  const invoke = role => asRole(sql, role, undefined, async tx =>
    (await tx.unsafe(`select public.gambarin_admin_reconcile_gallery_success(
      $1::uuid,$2::uuid,$3::uuid,$4::text,$5::bigint,$6::text,$7::text) as result`, args))[0].result)
  await assert.rejects(invoke('anon'))
  await assert.rejects(invoke('service_role'), /gallery_probe_mismatch/)
  assert.equal((await sql`select quota_used from public.gambarin_accounts where id=${accountId}`)[0].quota_used, 2)
  probe.prompt_matches = true
  await sql`update net._http_response set content=${JSON.stringify(probe)} where id=10`
  assert.equal((await invoke('service_role')).status, 'succeeded')
  assert.equal((await invoke('service_role')).status, 'succeeded')
  assert.deepEqual((await sql`select quota_used,quota_reserved from public.gambarin_accounts where id=${accountId}`)[0],
    { quota_used: 3, quota_reserved: 0 })
  assert.equal((await sql`select count(*)::integer as n from public.gambarin_quota_ledger
    where job_id=${jobId} and event='consume'`)[0].n, 1)
  assert.equal((await sql`select count(*)::integer as n from public.gambarin_manual_gallery_audit
    where job_id=${jobId}`)[0].n, 1)
  const job = (await sql`select provider_job_id,provider_asset_id,gallery_item_id
    from public.gambarin_jobs where id=${jobId}`)[0]
  assert.equal(job.provider_job_id, null)
  assert.equal(job.provider_asset_id, mediaId)
  assert.equal(job.gallery_item_id, galleryId)
  const dispatcher = (await sql`select dispatch_paused,request_state,active_job_id
    from public.gambarin_dispatcher where id=1`)[0]
  assert.deepEqual(dispatcher, { dispatch_paused: true, request_state: 'idle', active_job_id: null })
  await assert.rejects(asRole(sql, 'service_role', undefined, tx => tx`
    update public.gambarin_manual_gallery_audit set owner_reference='changed' where job_id=${jobId}`),
  /permission denied/)
  await assert.rejects(sql`update public.gambarin_manual_gallery_audit
    set owner_reference='changed' where job_id=${jobId}`, /append-only/)
})
