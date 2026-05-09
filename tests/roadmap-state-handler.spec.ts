// Phase 5-3.b: roadmap-state-handler tests.
//
// Pure handler at supabase/functions/_shared/roadmap-state-handler.ts.
// Backs the business_roadmap_state schema (Phase 5-1.a). Uses the state
// machine from services/business-roadmap (Phase 5-1.b) for transition
// logic.

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  roadmapStateHandler,
  type HandlerInput as RsInput,
  type RoadmapStateReader,
  type RoadmapStateWriter,
} from '../supabase/functions/_shared/roadmap-state-handler.ts'

import {
  STAGE_DELIVERABLES,
  initialRoadmapState,
  type RoadmapState,
} from '../services/business-roadmap/src/index.ts'

const NOW = '2026-05-09T13:00:00.000Z'
const CUST_ID = '11111111-1111-1111-1111-111111111111'

function makeFreshState(): RoadmapState {
  return initialRoadmapState(CUST_ID, () => NOW)
}

function makeReader(state: RoadmapState | null): RoadmapStateReader {
  return async (id) => {
    if (id !== CUST_ID) return null
    return state
  }
}

function makeWriter(): { writer: RoadmapStateWriter; saved: RoadmapState[] } {
  const saved: RoadmapState[] = []
  const writer: RoadmapStateWriter = async (state) => {
    saved.push(state)
    return { ok: true, state }
  }
  return { writer, saved }
}

// ─── Action: get ──────────────────────────────────────────────────

test('get: rejects missing customer_id', async () => {
  const result = await roadmapStateHandler(
    { method: 'GET', mode: 'get', query: {} },
    {
      reader: async () => null,
      writer: makeWriter().writer,
      now: () => NOW,
    },
  )
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.status, 400)
    assert.equal(result.error, 'missing_customer_id')
  }
})

test('get: returns 404 when no state row exists', async () => {
  const result = await roadmapStateHandler(
    { method: 'GET', mode: 'get', query: { customer_id: CUST_ID } },
    {
      reader: makeReader(null),
      writer: makeWriter().writer,
      now: () => NOW,
    },
  )
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.status, 404)
    assert.equal(result.error, 'state_not_found')
  }
})

test('get: returns 200 with the full RoadmapState row', async () => {
  const state = makeFreshState()
  const result = await roadmapStateHandler(
    { method: 'GET', mode: 'get', query: { customer_id: CUST_ID } },
    {
      reader: makeReader(state),
      writer: makeWriter().writer,
      now: () => NOW,
    },
  )
  assert.equal(result.ok, true)
  if (result.ok) {
    assert.equal(result.status, 200)
    assert.deepEqual(result.body.state, state)
    assert.equal(result.body.missing_deliverables.length, STAGE_DELIVERABLES.idea.length)
    assert.equal(result.body.can_advance, false)
  }
})

// ─── Action: init ─────────────────────────────────────────────────

test('init: creates a fresh state at "idea" if none exists', async () => {
  const { writer, saved } = makeWriter()
  const result = await roadmapStateHandler(
    {
      method: 'POST',
      mode: 'init',
      body: { customer_id: CUST_ID },
    },
    {
      reader: makeReader(null),
      writer,
      now: () => NOW,
    },
  )
  assert.equal(result.ok, true)
  if (result.ok) {
    assert.equal(result.status, 201)
    assert.equal(result.body.state.current_stage, 'idea')
    assert.equal(result.body.state.customer_id, CUST_ID)
  }
  assert.equal(saved.length, 1)
})

test('init: returns 409 conflict if state already exists', async () => {
  const existing = makeFreshState()
  const { writer } = makeWriter()
  const result = await roadmapStateHandler(
    {
      method: 'POST',
      mode: 'init',
      body: { customer_id: CUST_ID },
    },
    {
      reader: makeReader(existing),
      writer,
      now: () => NOW,
    },
  )
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.status, 409)
    assert.equal(result.error, 'already_exists')
  }
})

// ─── Action: mark deliverable ──────────────────────────────────────

test('mark_deliverable: rejects missing customer_id', async () => {
  const result = await roadmapStateHandler(
    {
      method: 'PATCH',
      mode: 'mark_deliverable',
      body: { deliverable_id: STAGE_DELIVERABLES.idea[0], complete: true },
    },
    {
      reader: makeReader(null),
      writer: makeWriter().writer,
      now: () => NOW,
    },
  )
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.status, 400)
    assert.equal(result.error, 'invalid_customer_id')
  }
})

test('mark_deliverable: rejects unknown deliverable_id', async () => {
  const state = makeFreshState()
  const result = await roadmapStateHandler(
    {
      method: 'PATCH',
      mode: 'mark_deliverable',
      body: {
        customer_id: CUST_ID,
        deliverable_id: 'not_a_real_id',
        complete: true,
      },
    },
    {
      reader: makeReader(state),
      writer: makeWriter().writer,
      now: () => NOW,
    },
  )
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.status, 400)
    // state-machine throws "unknown deliverable: ..." → handler maps to invalid_deliverable
    assert.equal(result.error, 'invalid_deliverable')
  }
})

test('mark_deliverable: rejects when state row does not exist', async () => {
  const result = await roadmapStateHandler(
    {
      method: 'PATCH',
      mode: 'mark_deliverable',
      body: {
        customer_id: CUST_ID,
        deliverable_id: STAGE_DELIVERABLES.idea[0],
        complete: true,
      },
    },
    {
      reader: makeReader(null),
      writer: makeWriter().writer,
      now: () => NOW,
    },
  )
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.status, 404)
    assert.equal(result.error, 'state_not_found')
  }
})

test('mark_deliverable: happy path persists updated state', async () => {
  const state = makeFreshState()
  const { writer, saved } = makeWriter()
  const id = STAGE_DELIVERABLES.idea[0]
  const result = await roadmapStateHandler(
    {
      method: 'PATCH',
      mode: 'mark_deliverable',
      body: { customer_id: CUST_ID, deliverable_id: id, complete: true },
    },
    {
      reader: makeReader(state),
      writer,
      now: () => NOW,
    },
  )
  assert.equal(result.ok, true)
  if (result.ok) {
    assert.equal(result.status, 200)
    assert.equal(result.body.state.deliverables_completed[id], true)
  }
  assert.equal(saved[0].deliverables_completed[id], true)
})

// ─── Action: advance ──────────────────────────────────────────────

test('advance: succeeds when all current-stage deliverables done', async () => {
  let state = makeFreshState()
  for (const id of STAGE_DELIVERABLES.idea) {
    state = { ...state, deliverables_completed: { ...state.deliverables_completed, [id]: true } }
  }
  const { writer, saved } = makeWriter()
  const result = await roadmapStateHandler(
    {
      method: 'POST',
      mode: 'advance',
      body: { customer_id: CUST_ID },
    },
    {
      reader: makeReader(state),
      writer,
      now: () => NOW,
    },
  )
  assert.equal(result.ok, true)
  if (result.ok) {
    assert.equal(result.status, 200)
    assert.equal(result.body.state.current_stage, 'setup')
  }
  assert.equal(saved[0].current_stage, 'setup')
})

test('advance: 409 conflict when missing deliverables', async () => {
  const state = makeFreshState()
  const result = await roadmapStateHandler(
    {
      method: 'POST',
      mode: 'advance',
      body: { customer_id: CUST_ID },
    },
    {
      reader: makeReader(state),
      writer: makeWriter().writer,
      now: () => NOW,
    },
  )
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.status, 409)
    assert.equal(result.error, 'missing_deliverables')
    assert.ok(Array.isArray(result.detail) || typeof result.detail === 'string')
  }
})

test('advance: 409 already_at_final at sell stage', async () => {
  let state = makeFreshState()
  state = { ...state, current_stage: 'sell' }
  for (const id of [
    ...STAGE_DELIVERABLES.idea,
    ...STAGE_DELIVERABLES.setup,
    ...STAGE_DELIVERABLES.identity,
    ...STAGE_DELIVERABLES.build,
    ...STAGE_DELIVERABLES.sell,
  ]) {
    state = { ...state, deliverables_completed: { ...state.deliverables_completed, [id]: true } }
  }
  const result = await roadmapStateHandler(
    {
      method: 'POST',
      mode: 'advance',
      body: { customer_id: CUST_ID },
    },
    {
      reader: makeReader(state),
      writer: makeWriter().writer,
      now: () => NOW,
    },
  )
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.status, 409)
    assert.equal(result.error, 'already_at_final')
  }
})
