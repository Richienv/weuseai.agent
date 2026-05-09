// Phase 5-3.b: approval-queue-handler tests.
//
// Pure handler at supabase/functions/_shared/approval-queue-handler.ts.
// Backs the approval_requests schema (Phase 5-1.a). Q4=C per-action expiry
// rules computed at insert time.

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  approvalQueueHandler,
  computeExpiry,
  ACTION_EXPIRY_HOURS,
  ACTION_KINDS,
  type ApprovalAction,
  type ApprovalRow,
  type ApprovalRowReader,
  type ApprovalRowWriter,
  type ApprovalRowMutator,
} from '../supabase/functions/_shared/approval-queue-handler.ts'

const NOW = '2026-05-09T13:00:00.000Z'
const NOW_MS = Date.parse(NOW)

// ─── Q4=C expiry policy ─────────────────────────────────────────────

test('ACTION_KINDS lists exactly the 4 Q4=C action_kinds', () => {
  assert.deepEqual([...ACTION_KINDS].sort(), [
    'contract_sign',
    'incorporate',
    'public_emission',
    'regulatory_filing',
  ])
})

test('computeExpiry returns the Q4=C per-action defaults', () => {
  // incorporate = 14d, contract_sign = 14d, public_emission = 24h, regulatory_filing = 48h
  assert.equal(ACTION_EXPIRY_HOURS.incorporate, 14 * 24)
  assert.equal(ACTION_EXPIRY_HOURS.contract_sign, 14 * 24)
  assert.equal(ACTION_EXPIRY_HOURS.public_emission, 24)
  assert.equal(ACTION_EXPIRY_HOURS.regulatory_filing, 48)

  const inc = computeExpiry('incorporate', NOW)
  assert.equal(Date.parse(inc) - NOW_MS, 14 * 24 * 60 * 60 * 1000)

  const pe = computeExpiry('public_emission', NOW)
  assert.equal(Date.parse(pe) - NOW_MS, 24 * 60 * 60 * 1000)

  const rf = computeExpiry('regulatory_filing', NOW)
  assert.equal(Date.parse(rf) - NOW_MS, 48 * 60 * 60 * 1000)
})

test('computeExpiry throws on unknown action_kind', () => {
  assert.throws(
    () => computeExpiry('made_up_action' as ApprovalAction, NOW),
    /unknown action_kind/,
  )
})

// ─── Action: create ─────────────────────────────────────────────────

const CUST_ID = '11111111-1111-1111-1111-111111111111'
const APPR_ID = '22222222-2222-2222-2222-222222222222'

function makeWriter(): { writer: ApprovalRowWriter; rows: ApprovalRow[] } {
  const rows: ApprovalRow[] = []
  const writer: ApprovalRowWriter = async (input) => {
    const row: ApprovalRow = {
      id: APPR_ID,
      customer_id: input.customer_id,
      action_kind: input.action_kind,
      action_summary: input.action_summary,
      action_payload: input.action_payload,
      proposed_by_agent: input.proposed_by_agent,
      status: 'pending',
      approved_by: null,
      approved_at: null,
      expires_at: input.expires_at,
      created_at: NOW,
    }
    rows.push(row)
    return { ok: true, row }
  }
  return { writer, rows }
}

const noopReader: ApprovalRowReader = async () => []
const noopMutator: ApprovalRowMutator = async () => ({ ok: false, error: 'noop' })

test('create: rejects null/undefined input', async () => {
  const { writer } = makeWriter()
  const result = await approvalQueueHandler(
    { method: 'POST', mode: 'create', body: null as unknown as Record<string, unknown> },
    { reader: noopReader, writer, mutator: noopMutator, now: () => NOW },
  )
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.status, 400)
    assert.equal(result.error, 'invalid_input')
  }
})

test('create: rejects bad action_kind', async () => {
  const { writer } = makeWriter()
  const result = await approvalQueueHandler(
    {
      method: 'POST',
      mode: 'create',
      body: {
        customer_id: CUST_ID,
        action_kind: 'made_up',
        action_summary: 'x',
        action_payload: {},
        proposed_by_agent: 'business-director',
      },
    },
    { reader: noopReader, writer, mutator: noopMutator, now: () => NOW },
  )
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.status, 400)
    assert.equal(result.error, 'invalid_action_kind')
  }
})

test('create: requires customer_id, action_summary, proposed_by_agent', async () => {
  const { writer } = makeWriter()
  const baseBody = {
    customer_id: CUST_ID,
    action_kind: 'incorporate',
    action_summary: 'sign akta notaris X',
    action_payload: { kind: 'pt' },
    proposed_by_agent: 'business-director',
  }
  for (const missing of ['customer_id', 'action_summary', 'proposed_by_agent']) {
    const body = { ...baseBody }
    delete (body as Record<string, unknown>)[missing]
    const result = await approvalQueueHandler(
      { method: 'POST', mode: 'create', body },
      { reader: noopReader, writer, mutator: noopMutator, now: () => NOW },
    )
    assert.equal(result.ok, false, `expected rejection when ${missing} missing`)
    if (!result.ok) {
      assert.equal(result.status, 400)
    }
  }
})

test('create: happy path inserts row with computed Q4=C expiry', async () => {
  const { writer, rows } = makeWriter()
  const result = await approvalQueueHandler(
    {
      method: 'POST',
      mode: 'create',
      body: {
        customer_id: CUST_ID,
        action_kind: 'public_emission',
        action_summary: 'IG launch ad',
        action_payload: { campaign_id: 'q3-launch' },
        proposed_by_agent: 'marketing-dispatch',
      },
    },
    { reader: noopReader, writer, mutator: noopMutator, now: () => NOW },
  )
  assert.equal(result.ok, true)
  if (result.ok) {
    assert.equal(result.status, 201)
    assert.equal(result.body.row.status, 'pending')
    assert.equal(result.body.row.action_kind, 'public_emission')
    assert.equal(result.body.row.expires_at, computeExpiry('public_emission', NOW))
  }
  assert.equal(rows.length, 1)
})

test('create: explicit expires_at in body overrides computed default', async () => {
  const { writer, rows } = makeWriter()
  const customExpiry = '2026-12-31T23:59:59.000Z'
  await approvalQueueHandler(
    {
      method: 'POST',
      mode: 'create',
      body: {
        customer_id: CUST_ID,
        action_kind: 'incorporate',
        action_summary: 'sign akta',
        action_payload: {},
        proposed_by_agent: 'business-director',
        expires_at: customExpiry,
      },
    },
    { reader: noopReader, writer, mutator: noopMutator, now: () => NOW },
  )
  assert.equal(rows[0].expires_at, customExpiry)
})

// ─── Action: list ───────────────────────────────────────────────────

test('list: rejects missing customer_id', async () => {
  const result = await approvalQueueHandler(
    { method: 'GET', mode: 'list', query: {} },
    { reader: noopReader, writer: makeWriter().writer, mutator: noopMutator, now: () => NOW },
  )
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.status, 400)
    assert.equal(result.error, 'missing_customer_id')
  }
})

test('list: returns reader output (default pending only)', async () => {
  const fakeRow: ApprovalRow = {
    id: APPR_ID,
    customer_id: CUST_ID,
    action_kind: 'contract_sign',
    action_summary: 'NDA freelancer designer',
    action_payload: {},
    proposed_by_agent: 'legal-dispatch',
    status: 'pending',
    approved_by: null,
    approved_at: null,
    expires_at: '2026-05-23T13:00:00.000Z',
    created_at: NOW,
  }
  const reader: ApprovalRowReader = async (params) => {
    assert.equal(params.customer_id, CUST_ID)
    assert.equal(params.status, 'pending')
    return [fakeRow]
  }
  const result = await approvalQueueHandler(
    { method: 'GET', mode: 'list', query: { customer_id: CUST_ID } },
    { reader, writer: makeWriter().writer, mutator: noopMutator, now: () => NOW },
  )
  assert.equal(result.ok, true)
  if (result.ok && 'approvals' in result.body) {
    assert.equal(result.status, 200)
    assert.deepEqual(result.body.approvals, [fakeRow])
  } else {
    assert.fail('expected list result with approvals[]')
  }
})

// ─── Action: decide (approve/reject) ────────────────────────────────

test('decide: rejects missing id', async () => {
  const result = await approvalQueueHandler(
    { method: 'POST', mode: 'decide', query: { decision: 'approve' }, body: {} },
    { reader: noopReader, writer: makeWriter().writer, mutator: noopMutator, now: () => NOW },
  )
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.status, 400)
    assert.equal(result.error, 'missing_id')
  }
})

test('decide: rejects bad decision value', async () => {
  const result = await approvalQueueHandler(
    {
      method: 'POST',
      mode: 'decide',
      query: { id: APPR_ID, decision: 'maybe' },
      body: {},
    },
    { reader: noopReader, writer: makeWriter().writer, mutator: noopMutator, now: () => NOW },
  )
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.status, 400)
    assert.equal(result.error, 'invalid_decision')
  }
})

test('decide: approve flips status to approved with approved_by + approved_at', async () => {
  let captured: { id: string; updates: Partial<ApprovalRow> } | null = null
  const mutator: ApprovalRowMutator = async (id, updates) => {
    captured = { id, updates }
    return {
      ok: true,
      row: {
        id,
        customer_id: CUST_ID,
        action_kind: 'incorporate',
        action_summary: 's',
        action_payload: {},
        proposed_by_agent: 'business-director',
        status: 'approved',
        approved_by: updates.approved_by ?? null,
        approved_at: updates.approved_at ?? null,
        expires_at: '2026-05-23T13:00:00.000Z',
        created_at: NOW,
      },
    }
  }
  const result = await approvalQueueHandler(
    {
      method: 'POST',
      mode: 'decide',
      query: { id: APPR_ID, decision: 'approve' },
      body: { approved_by: 'customer' },
    },
    { reader: noopReader, writer: makeWriter().writer, mutator, now: () => NOW },
  )
  assert.equal(result.ok, true)
  if (result.ok && 'row' in result.body) {
    assert.equal(result.status, 200)
    assert.equal(result.body.row.status, 'approved')
  } else {
    assert.fail('expected decide result with row')
  }
  assert.deepEqual(captured!.updates, {
    status: 'approved',
    approved_by: 'customer',
    approved_at: NOW,
  })
})

test('decide: reject flips status to rejected', async () => {
  let captured: { id: string; updates: Partial<ApprovalRow> } | null = null
  const mutator: ApprovalRowMutator = async (id, updates) => {
    captured = { id, updates }
    return {
      ok: true,
      row: {
        id,
        customer_id: CUST_ID,
        action_kind: 'incorporate',
        action_summary: 's',
        action_payload: {},
        proposed_by_agent: 'business-director',
        status: 'rejected',
        approved_by: updates.approved_by ?? null,
        approved_at: updates.approved_at ?? null,
        expires_at: '2026-05-23T13:00:00.000Z',
        created_at: NOW,
      },
    }
  }
  await approvalQueueHandler(
    {
      method: 'POST',
      mode: 'decide',
      query: { id: APPR_ID, decision: 'reject' },
      body: { approved_by: 'customer' },
    },
    { reader: noopReader, writer: makeWriter().writer, mutator, now: () => NOW },
  )
  assert.equal(captured!.updates.status, 'rejected')
})

test('decide: mutator failure surfaces as 500', async () => {
  const mutator: ApprovalRowMutator = async () => ({
    ok: false,
    error: 'pg constraint violation',
  })
  const result = await approvalQueueHandler(
    {
      method: 'POST',
      mode: 'decide',
      query: { id: APPR_ID, decision: 'approve' },
      body: { approved_by: 'customer' },
    },
    { reader: noopReader, writer: makeWriter().writer, mutator, now: () => NOW },
  )
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.status, 500)
    assert.equal(result.error, 'mutator_failed')
    assert.equal(result.detail, 'pg constraint violation')
  }
})

// ─── Schema enum drift defense ────────────────────────────────────

test('ACTION_KINDS matches the action_kind CHECK enum in the live schema', async () => {
  const fs = await import('node:fs')
  const path = await import('node:path')
  const sql = fs.readFileSync(
    path.resolve(
      process.cwd(),
      'supabase/migrations/20260510100000_phase_5_master_agent_state.sql',
    ),
    'utf8',
  )
  // Match across newlines — the CHECK constraint spans multiple lines
  // and the `(action_kind in (...))` has nested parens. Use the [\s\S]+?
  // pattern to walk to the first `))` (closing of inner IN + outer CHECK).
  const m = sql.match(/action_kind\s+text\s+not\s+null\s+check\s+\(action_kind\s+in\s+\(([\s\S]+?)\)\s*\)/)
  assert.ok(m, 'expected action_kind CHECK constraint in 5-1.a migration')
  const enumMembers = m![1]
    .split(',')
    .map((s) => s.replace(/'/g, '').trim())
    .filter(Boolean)
  assert.deepEqual([...ACTION_KINDS].sort(), [...enumMembers].sort())
})
