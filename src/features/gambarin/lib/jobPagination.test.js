import assert from 'node:assert/strict'
import test from 'node:test'
import { fetchJobPage } from './jobPagination.js'

test('keyset pagination traverses 137 jobs with equal timestamps exactly once', async () => {
  const rows = Array.from({ length: 137 }, (_, index) => ({
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    created_at: `2026-10-${String(1 + Math.floor(index / 30)).padStart(2, '0')}T12:00:00.123456+00:00`,
    status: 'succeeded',
  }))
  const client = { from: name => {
    assert.equal(name, 'gambarin_jobs')
    let cursor = null
    const query = {
      select: () => query, order: () => query, limit: () => query,
      or: filter => {
        const match = filter.match(/^created_at\.lt\."(.+)",and\(created_at\.eq\."(.+)",id\.lt\.(.+)\)$/)
        assert.ok(match)
        assert.equal(match[1], match[2])
        cursor = { created_at: match[1], id: match[3] }
        return query
      },
      then: resolve => resolve({ data: rows.filter(row => !cursor ||
        row.created_at < cursor.created_at || (row.created_at === cursor.created_at && row.id < cursor.id))
        .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id))
        .slice(0, 13), error: null }),
    }
    return query
  } }
  const seen = []
  let cursor = null
  for (;;) {
    const page = await fetchJobPage(client, cursor)
    assert.ok(page.items.length <= 12)
    seen.push(...page.items.map(item => item.id))
    if (!page.hasMore) break
    cursor = page.items.at(-1)
  }
  assert.equal(seen.length, 137)
  assert.equal(new Set(seen).size, 137)
  await assert.rejects(fetchJobPage(client, { created_at: 'bad', id: rows[0].id }), /Cursor/)
})
