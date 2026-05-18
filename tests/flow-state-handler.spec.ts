// flow-state handler — pure handler tests.
//
// The state-machine-between-invocations engine (Phase 1 Week 2,
// 2026-05-18 consult). A playbook is a sequence of atomic skill
// invocations; this handler persists the cursor + accumulated outputs
// between invocations so a playbook survives message gaps and VPS
// restarts. Each customer message → the persona reads current state,
// runs the next step, advances, returns control.
//
// Auth (X-CID == customer_id) is enforced in the handler so the Edge
// Function entry just forwards the header.

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  handleFlowState,
  type FlowStateRow,
  type FlowStateStore,
} from '../supabase/functions/_shared/flow-state-handler.ts'

const CID = '2f60325d-3c71-4c6e-9d9d-69d125ff5315'

// In-memory store keyed by `${customer_id}:${playbook_id}`.
class FakeStore implements FlowStateStore {
  rows = new Map<string, FlowStateRow>()
  private seq = 0

  async get(customerId: string, playbookId: string): Promise<FlowStateRow | null> {
    return this.rows.get(`${customerId}:${playbookId}`) ?? null
  }

  async start(input: {
    customer_id: string
    playbook_id: string
    total_steps: number
  }): Promise<FlowStateRow> {
    const now = '2026-05-18T00:00:00.000Z'
    const row: FlowStateRow = {
      id: `flow-${++this.seq}`,
      customer_id: input.customer_id,
      playbook_id: input.playbook_id,
      current_step: 1,
      total_steps: input.total_steps,
      status: 'in_progress',
      state_data: {},
      created_at: now,
      updated_at: now,
    }
    this.rows.set(`${input.customer_id}:${input.playbook_id}`, row)
    return row
  }

  async update(id: string, patch: Partial<FlowStateRow>): Promise<FlowStateRow> {
    for (const [k, row] of this.rows) {
      if (row.id === id) {
        const next = { ...row, ...patch, updated_at: '2026-05-18T01:00:00.000Z' }
        this.rows.set(k, next)
        return next
      }
    }
    throw new Error(`FakeStore.update: no row ${id}`)
  }
}

function base() {
  return { customer_id: CID, x_cid: CID, playbook_id: 'market-research' }
}

// ─── auth ────────────────────────────────────────────────────────────────

test('rejects when X-CID is missing', async () => {
  const r = await handleFlowState(
    { ...base(), x_cid: null, operation: 'get' },
    new FakeStore(),
  )
  assert.equal(r.ok, false)
  assert.equal(r.ok === false && r.status, 403)
  assert.equal(r.ok === false && r.error, 'x_cid_mismatch')
})

test('rejects when X-CID does not equal customer_id', async () => {
  const r = await handleFlowState(
    { ...base(), x_cid: 'someone-else', operation: 'get' },
    new FakeStore(),
  )
  assert.equal(r.ok === false && r.status, 403)
})

test('rejects a missing customer_id', async () => {
  const r = await handleFlowState(
    { customer_id: '', x_cid: '', playbook_id: 'market-research', operation: 'get' },
    new FakeStore(),
  )
  assert.equal(r.ok === false && r.status, 400)
})

// ─── start ─────────────────────────────────────────────────────────────────

test('start creates a fresh run at step 1, in_progress, empty state', async () => {
  const store = new FakeStore()
  const r = await handleFlowState(
    { ...base(), operation: 'start', total_steps: 6 },
    store,
  )
  assert.equal(r.ok, true)
  assert.equal(r.ok && r.body.current_step, 1)
  assert.equal(r.ok && r.body.total_steps, 6)
  assert.equal(r.ok && r.body.status, 'in_progress')
  assert.deepEqual(r.ok && r.body.state_data, {})
})

test('start requires a positive total_steps', async () => {
  const r = await handleFlowState(
    { ...base(), operation: 'start', total_steps: 0 },
    new FakeStore(),
  )
  assert.equal(r.ok === false && r.status, 400)
})

test('start on an existing run resets it to step 1', async () => {
  const store = new FakeStore()
  await handleFlowState({ ...base(), operation: 'start', total_steps: 6 }, store)
  await handleFlowState({ ...base(), operation: 'advance', step_output: { a: 1 } }, store)
  const r = await handleFlowState(
    { ...base(), operation: 'start', total_steps: 6 },
    store,
  )
  assert.equal(r.ok && r.body.current_step, 1)
  assert.deepEqual(r.ok && r.body.state_data, {})
})

// ─── get ───────────────────────────────────────────────────────────────────

test('get returns 404 when no run exists', async () => {
  const r = await handleFlowState({ ...base(), operation: 'get' }, new FakeStore())
  assert.equal(r.ok === false && r.status, 404)
})

test('get returns the current run', async () => {
  const store = new FakeStore()
  await handleFlowState({ ...base(), operation: 'start', total_steps: 6 }, store)
  const r = await handleFlowState({ ...base(), operation: 'get' }, store)
  assert.equal(r.ok && r.body.current_step, 1)
})

// ─── advance ───────────────────────────────────────────────────────────────

test('advance moves to the next step and merges step output', async () => {
  const store = new FakeStore()
  await handleFlowState({ ...base(), operation: 'start', total_steps: 6 }, store)
  const r = await handleFlowState(
    { ...base(), operation: 'advance', step_output: { sources: 12 } },
    store,
  )
  assert.equal(r.ok && r.body.current_step, 2)
  assert.deepEqual(r.ok && r.body.state_data, { sources: 12 })
})

test('advance accumulates state across multiple steps', async () => {
  const store = new FakeStore()
  await handleFlowState({ ...base(), operation: 'start', total_steps: 6 }, store)
  await handleFlowState({ ...base(), operation: 'advance', step_output: { step1: 'a' } }, store)
  const r = await handleFlowState(
    { ...base(), operation: 'advance', step_output: { step2: 'b' } },
    store,
  )
  assert.equal(r.ok && r.body.current_step, 3)
  assert.deepEqual(r.ok && r.body.state_data, { step1: 'a', step2: 'b' })
})

test('advance can park the run awaiting the customer (escalation gate)', async () => {
  const store = new FakeStore()
  await handleFlowState({ ...base(), operation: 'start', total_steps: 6 }, store)
  const r = await handleFlowState(
    { ...base(), operation: 'advance', set_status: 'awaiting_customer' },
    store,
  )
  assert.equal(r.ok && r.body.status, 'awaiting_customer')
})

test('advance resumes from awaiting_customer back to in_progress', async () => {
  const store = new FakeStore()
  await handleFlowState({ ...base(), operation: 'start', total_steps: 6 }, store)
  await handleFlowState({ ...base(), operation: 'advance', set_status: 'awaiting_customer' }, store)
  const r = await handleFlowState({ ...base(), operation: 'advance' }, store)
  assert.equal(r.ok && r.body.status, 'in_progress')
  assert.equal(r.ok && r.body.current_step, 3)
})

test('advance past the final step is rejected — use complete instead', async () => {
  const store = new FakeStore()
  await handleFlowState({ ...base(), operation: 'start', total_steps: 2 }, store)
  await handleFlowState({ ...base(), operation: 'advance' }, store) // now at step 2 (final)
  const r = await handleFlowState({ ...base(), operation: 'advance' }, store)
  assert.equal(r.ok === false && r.status, 409)
})

test('advance on a completed run is rejected', async () => {
  const store = new FakeStore()
  await handleFlowState({ ...base(), operation: 'start', total_steps: 6 }, store)
  await handleFlowState({ ...base(), operation: 'complete' }, store)
  const r = await handleFlowState({ ...base(), operation: 'advance' }, store)
  assert.equal(r.ok === false && r.status, 409)
})

test('advance with no run is rejected', async () => {
  const r = await handleFlowState({ ...base(), operation: 'advance' }, new FakeStore())
  assert.equal(r.ok === false && r.status, 404)
})

// ─── complete / abort ──────────────────────────────────────────────────────

test('complete marks the run completed', async () => {
  const store = new FakeStore()
  await handleFlowState({ ...base(), operation: 'start', total_steps: 6 }, store)
  const r = await handleFlowState({ ...base(), operation: 'complete' }, store)
  assert.equal(r.ok && r.body.status, 'completed')
})

test('abort marks the run aborted', async () => {
  const store = new FakeStore()
  await handleFlowState({ ...base(), operation: 'start', total_steps: 6 }, store)
  const r = await handleFlowState({ ...base(), operation: 'abort' }, store)
  assert.equal(r.ok && r.body.status, 'aborted')
})

test('an unknown operation is rejected', async () => {
  const r = await handleFlowState(
    // @ts-expect-error — deliberately invalid operation
    { ...base(), operation: 'frobnicate' },
    new FakeStore(),
  )
  assert.equal(r.ok === false && r.status, 400)
})
