// Phase 5-3.c: hermes-kanban-proxy HMAC token integration tests.
//
// Verifies that when a verifyToken dep is provided, the proxy handler
// rejects requests with missing / invalid / cross-customer-spoofed
// tokens with 401 BEFORE running the customer existence check.

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  hermesKanbanProxyHandler,
  type BoardMirrorWriter,
  type CustomerExistsCheck,
  type CustomerTokenVerifier,
  type ProxyInput,
} from '../supabase/functions/_shared/hermes-kanban-proxy-handler.ts'
import {
  signCustomerToken,
  verifyCustomerToken,
} from '../supabase/functions/_shared/hermes-instance-auth.ts'

const HMAC_KEY = 'phase-5-3c-test-hmac-key'
const VALID_BOARD_ID = '11111111-1111-1111-1111-111111111111'
const VALID_CUSTOMER_ID = '22222222-2222-2222-2222-222222222222'
const OTHER_CUSTOMER_ID = '33333333-3333-3333-3333-333333333333'
const NOW = '2026-05-09T13:00:00.000Z'

function makeBoard(): ProxyInput['board'] {
  return {
    id: VALID_BOARD_ID,
    title: 'HMAC integration test',
    customer_id: VALID_CUSTOMER_ID,
    columns: [
      { id: 'todo', title: 'To Do', order: 0, task_ids: ['t1'] },
    ],
    tasks: {
      t1: {
        id: 't1',
        title: 'task 1',
        owner_persona: 'business-director',
        depends_on: [],
        status: 'todo',
        created_at: NOW,
        updated_at: NOW,
      },
    },
    created_at: NOW,
    updated_at: NOW,
  }
}

const customerAlwaysExists: CustomerExistsCheck = async () => true

function makeWriter(): { writer: BoardMirrorWriter; calls: number } {
  let calls = 0
  const writer: BoardMirrorWriter = async ({ board }) => {
    calls++
    return { ok: true, board_id: board.id, task_count: Object.keys(board.tasks).length }
  }
  return {
    writer,
    get calls() {
      return calls
    },
  } as { writer: BoardMirrorWriter; calls: number }
}

const verifier: CustomerTokenVerifier = (claimed_id, token) =>
  verifyCustomerToken(claimed_id, token ?? '', HMAC_KEY)

// ─── HMAC required path ──────────────────────────────────────────

test('HMAC required: missing bearer_token → 401 unauthorized', async () => {
  const { writer } = makeWriter()
  const result = await hermesKanbanProxyHandler(
    { board: makeBoard(), hermes_version: '0.13.4' },
    customerAlwaysExists,
    writer,
    verifier,
  )
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.status, 401)
    assert.equal(result.error, 'unauthorized')
  }
})

test('HMAC required: bad bearer_token → 401', async () => {
  const { writer } = makeWriter()
  const result = await hermesKanbanProxyHandler(
    { board: makeBoard(), hermes_version: '0.13.4', bearer_token: 'not-a-real-token' },
    customerAlwaysExists,
    writer,
    verifier,
  )
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.status, 401)
  }
})

test('HMAC required: token signed for OTHER customer → 401 (no cross-mint)', async () => {
  const { writer } = makeWriter()
  const otherCustomerToken = await signCustomerToken(OTHER_CUSTOMER_ID, HMAC_KEY)
  const result = await hermesKanbanProxyHandler(
    {
      board: makeBoard(), // claims VALID_CUSTOMER_ID
      hermes_version: '0.13.4',
      bearer_token: otherCustomerToken,
    },
    customerAlwaysExists,
    writer,
    verifier,
  )
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.status, 401)
  }
})

test('HMAC required: token signed with WRONG key → 401', async () => {
  const { writer } = makeWriter()
  const tokenFromWrongKey = await signCustomerToken(VALID_CUSTOMER_ID, 'attacker-key')
  const result = await hermesKanbanProxyHandler(
    {
      board: makeBoard(),
      hermes_version: '0.13.4',
      bearer_token: tokenFromWrongKey,
    },
    customerAlwaysExists,
    writer,
    verifier,
  )
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.status, 401)
  }
})

test('HMAC required: VALID token for matching customer → 200 happy path', async () => {
  const { writer } = makeWriter()
  const validToken = await signCustomerToken(VALID_CUSTOMER_ID, HMAC_KEY)
  const result = await hermesKanbanProxyHandler(
    {
      board: makeBoard(),
      hermes_version: '0.13.4',
      bearer_token: validToken,
    },
    customerAlwaysExists,
    writer,
    verifier,
  )
  assert.equal(result.ok, true)
  if (result.ok) {
    assert.equal(result.status, 200)
    assert.equal(result.body.mirrored, true)
  }
})

// ─── Auth runs BEFORE customer existence check ──────────────────

test('HMAC check fires BEFORE customer_not_found (no enumeration leak)', async () => {
  // If a caller presents a bad token + claims an unknown customer_id,
  // they should get 401, NOT 404 — otherwise they could enumerate which
  // customer_ids exist by brute-forcing tokens.
  const { writer } = makeWriter()
  const customerNeverExists: CustomerExistsCheck = async () => false
  const result = await hermesKanbanProxyHandler(
    {
      board: makeBoard(),
      hermes_version: '0.13.4',
      bearer_token: 'wrong',
    },
    customerNeverExists,
    writer,
    verifier,
  )
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.status, 401, 'should be 401 not 404 (no enumeration leak)')
  }
})

// ─── Backward compat: omitted verifier preserves MVP behavior ────

test('verifier omitted → handler skips HMAC check (backward compat)', async () => {
  const { writer } = makeWriter()
  const result = await hermesKanbanProxyHandler(
    { board: makeBoard(), hermes_version: '0.13.4' }, // no bearer_token
    customerAlwaysExists,
    writer,
    // verifier intentionally omitted
  )
  assert.equal(result.ok, true)
  if (result.ok) {
    assert.equal(result.status, 200)
  }
})

// ─── Token + body customer_id mismatch (defense in depth) ────────

test('Tampering: token for customer A but board.customer_id = B → 401', async () => {
  // Even if attacker steals customer A's token (e.g. compromises A's
  // VPS), they can't write to customer B's data because the verifier
  // re-derives the expected token from board.customer_id. Same key
  // applied to a different customer id produces a different token.
  const { writer } = makeWriter()
  const stolenToken = await signCustomerToken(OTHER_CUSTOMER_ID, HMAC_KEY)
  const board = makeBoard()
  board.customer_id = VALID_CUSTOMER_ID // attempt to write to V
  const result = await hermesKanbanProxyHandler(
    {
      board, // claims V
      hermes_version: '0.13.4',
      bearer_token: stolenToken, // signed for OTHER
    },
    customerAlwaysExists,
    writer,
    verifier,
  )
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.status, 401)
  }
})
