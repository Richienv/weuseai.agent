// template-no-match-log handler — pure handler tests.
//
// Each time a `template_fetch_required: true` skill cannot match the
// customer's request to a library template, the agent calls this; the
// founder reviews the accumulated log monthly. P1 of the 2026-05-22
// strict template-fetch flow.

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  handleTemplateNoMatchLog,
  type TemplateNoMatchInput,
  type TemplateNoMatchRow,
  type TemplateNoMatchStore,
} from '../supabase/functions/_shared/template-no-match-log-handler.ts'

const CID = '2f60325d-3c71-4c6e-9d9d-69d125ff5315'

class FakeStore implements TemplateNoMatchStore {
  rows: TemplateNoMatchRow[] = []
  private seq = 0
  async insert(input: Parameters<TemplateNoMatchStore['insert']>[0]): Promise<TemplateNoMatchRow> {
    const row: TemplateNoMatchRow = {
      id: `nm-${++this.seq}`,
      created_at: '2026-05-22T00:00:00.000Z',
      ...input,
    }
    this.rows.push(row)
    return row
  }
}

function base(): TemplateNoMatchInput {
  return {
    customer_id: CID,
    x_cid: CID,
    persona_slug: 'doc-expert',
    skill_id: 'invoice-generator',
    requested_deliverable: 'invoice for PT XYZ — services Q2',
  }
}

// ─── happy path ────────────────────────────────────────────────────────

test('records a clean no-match event', async () => {
  const store = new FakeStore()
  const r = await handleTemplateNoMatchLog(base(), store)
  assert.equal(r.ok, true)
  assert.equal(store.rows.length, 1)
  assert.equal(store.rows[0].persona_slug, 'doc-expert')
  assert.equal(store.rows[0].skill_id, 'invoice-generator')
})

test('preserves match_context payload', async () => {
  const store = new FakeStore()
  await handleTemplateNoMatchLog(
    { ...base(), match_context: { tried: ['invoice', 'pro'], extracted: { company: 'PT XYZ' } } },
    store,
  )
  assert.deepEqual(store.rows[0].match_context, {
    tried: ['invoice', 'pro'],
    extracted: { company: 'PT XYZ' },
  })
})

test('trims whitespace on the requested_deliverable', async () => {
  const store = new FakeStore()
  await handleTemplateNoMatchLog(
    { ...base(), requested_deliverable: '   invoice for PT XYZ   ' },
    store,
  )
  assert.equal(store.rows[0].requested_deliverable, 'invoice for PT XYZ')
})

// ─── validation ────────────────────────────────────────────────────────

test('rejects a missing customer_id', async () => {
  const r = await handleTemplateNoMatchLog(
    { ...base(), customer_id: '' },
    new FakeStore(),
  )
  assert.equal(r.ok === false && r.status, 400)
  assert.equal(r.ok === false && r.error, 'missing_customer_id')
})

test('rejects a non-kebab persona_slug', async () => {
  const r = await handleTemplateNoMatchLog(
    { ...base(), persona_slug: 'BadSlug' },
    new FakeStore(),
  )
  assert.equal(r.ok === false && r.status, 400)
  assert.equal(r.ok === false && r.error, 'bad_persona_slug')
})

test('rejects a non-kebab skill_id', async () => {
  const r = await handleTemplateNoMatchLog(
    { ...base(), skill_id: 'invoice_generator' },
    new FakeStore(),
  )
  assert.equal(r.ok === false && r.status, 400)
  assert.equal(r.ok === false && r.error, 'bad_skill_id')
})

test('rejects an empty requested_deliverable', async () => {
  const r = await handleTemplateNoMatchLog(
    { ...base(), requested_deliverable: '   ' },
    new FakeStore(),
  )
  assert.equal(r.ok === false && r.status, 400)
  assert.equal(r.ok === false && r.error, 'missing_requested_deliverable')
})

test('rejects requested_deliverable over 500 chars', async () => {
  const r = await handleTemplateNoMatchLog(
    { ...base(), requested_deliverable: 'x'.repeat(501) },
    new FakeStore(),
  )
  assert.equal(r.ok === false && r.status, 400)
  assert.equal(r.ok === false && r.error, 'requested_deliverable_too_long')
})

// ─── auth ──────────────────────────────────────────────────────────────

test('rejects a missing X-CID', async () => {
  const r = await handleTemplateNoMatchLog(
    { ...base(), x_cid: null },
    new FakeStore(),
  )
  assert.equal(r.ok === false && r.status, 403)
  assert.equal(r.ok === false && r.error, 'x_cid_mismatch')
})

test('rejects a mismatched X-CID', async () => {
  const r = await handleTemplateNoMatchLog(
    { ...base(), x_cid: 'someone-else' },
    new FakeStore(),
  )
  assert.equal(r.ok === false && r.status, 403)
})
