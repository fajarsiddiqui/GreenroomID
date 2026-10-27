import assert from 'node:assert/strict'
import test from 'node:test'
import { gambarinDownloadFilename, getGambarinImageNumber } from './downloadNaming.js'

const owner = 'account-1'
const jobs = [
  { id: '00000000-0000-4000-8000-000000000001', created_at: '2026-10-28T01:00:00.123456+00:00', status: 'succeeded', account: owner },
  { id: '00000000-0000-4000-8000-000000000002', created_at: '2026-10-28T02:00:00.123456+00:00', status: 'failed', account: owner },
  { id: '00000000-0000-4000-8000-000000000003', created_at: '2026-10-28T03:00:00.123456+00:00', status: 'succeeded', account: 'account-2' },
  { id: '00000000-0000-4000-8000-000000000004', created_at: '2026-10-28T04:00:00.123456+00:00', status: 'succeeded', account: owner },
]

function clientFor(account) {
  return { from: table => {
    assert.equal(table, 'gambarin_jobs')
    let targetId
    let status
    let cursor
    const query = {
      select: () => query,
      eq: (column, value) => {
        if (column === 'id') targetId = value
        if (column === 'status') status = value
        return query
      },
      or: filter => { cursor = filter; return query },
      maybeSingle: async () => ({ data: jobs.find(job => job.account === account && job.id === targetId) || null,
        error: null }),
      then: resolve => {
        assert.match(cursor, /id\.lte\.00000000-0000-4000-8000-000000000004/)
        const target = jobs.find(job => job.id === targetId) || jobs.at(-1)
        resolve({ count: jobs.filter(job => job.account === account && job.status === status
          && (job.created_at < target.created_at || (job.created_at === target.created_at
            && job.id <= target.id))).length, error: null })
      },
    }
    return query
  } }
}

test('download number counts only succeeded images owned by the current account', async () => {
  const number = await getGambarinImageNumber(clientFor(owner), jobs[3].id)
  assert.equal(number, 2)
  assert.equal(gambarinDownloadFilename('gambarin_smoke_01', number, 'image/png'),
    'Gambarin_gambarin_smoke_01_02.png')
  assert.equal(gambarinDownloadFilename('gambarin_smoke_01', 1, 'image/jpeg'),
    'Gambarin_gambarin_smoke_01_01.jpg')
  await assert.rejects(getGambarinImageNumber(clientFor('account-2'), jobs[3].id), /belum tersedia/)
})
