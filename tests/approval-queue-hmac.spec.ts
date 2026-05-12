// Phase 5-3.c: approval-queue HMAC integration tests.

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  approvalQueueHandler,
  type ApprovalRow,
  type ApprovalRowMutator,
  type ApprovalRowReader,
  type ApprovalRowWriter,
  type ApprovalTokenVerifier,
  type Deps,
} from '../supabase/functions/_shared/approval-queue-handler.ts'
import {
  signCustomerToken,
  verifyCustomerToken,
} from '../supabase/functions/_shared/hermes-instance-auth.ts'

const HMAC_KEY = 'phase-5-3c-approval-test-key'
const CUST = '11111111-1111-1111-1111-111111111111'
const OTHER = '22222222-2222-2222-2222-222222222222'
const NOW = '2026-05-09T13:00:00.000Z'

const noopReader: ApprovalRowReader = async () => []
const noopWriter: ApprovalRowWriter = async (input) => ({
  ok: true,
  row: {
    id: 'aaa',
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
  },
})
const noopMutator: ApprovalRowMutator = async () => ({
  ok: false,
  error: 'noop',
})

const verifier: ApprovalTokenVerifier = (claimed_id, token) =>
  verifyCustomerToken(claimed_id, token ?? '', HMAC_KEY)

function deps(overrides?: Partial<Deps>): Deps {
  return {
    reader: noopReader,
    writer: noopWriter,
    mutator: noopMutator,
    now: () => NOW,
    verifyToken: verifier,
    ...overrides,
  }
}

const validBody = {
  customer_id: CUST,
  action_kind: 'incorporate',
  action_summary: 'sign akta',
  action_payload: { kind: 'pt' },
  proposed_by_agent: 'all-in-one-business-agent',
}

// ─── create mode HMAC ────────────────────────────────────────────

test('create: missing bearer_token with verifier configured → 401', async () => {
  const result = await approvalQueueHandler(
    { method: 'POST', mode: 'create', body: validBody },
    deps(),
  )
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.status, 401)
    assert.equal(result.error, 'unauthorized')
  }
})

test('create: token signed for OTHER customer → 401', async () => {
  const otherToken = await signCustomerToken(OTHER, HMAC_KEY)
  const result = await approvalQueueHandler(
    {
      method: 'POST',
      mode: 'create',
      body: validBody, // claims CUST
      bearer_token: otherToken,
    },
    deps(),
  )
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.status, 401)
  }
})

test('create: VALID token → 201 (full happy path)', async () => {
  const token = await signCustomerToken(CUST, HMAC_KEY)
  const result = await approvalQueueHandler(
    {
      method: 'POST',
      mode: 'create',
      body: validBody,
      bearer_token: token,
    },
    deps(),
  )
  assert.equal(result.ok, true)
  if (result.ok) {
    assert.equal(result.status, 201)
  }
})

// ─── list mode HMAC ─────────────────────────────────────────────

test('list: missing bearer_token with verifier configured → 401', async () => {
  const result = await approvalQueueHandler(
    {
      method: 'GET',
      mode: 'list',
      query: { customer_id: CUST },
    },
    deps(),
  )
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.status, 401)
  }
})

test('list: token for OTHER customer → 401 (no enumeration)', async () => {
  const otherToken = await signCustomerToken(OTHER, HMAC_KEY)
  const result = await approvalQueueHandler(
    {
      method: 'GET',
      mode: 'list',
      query: { customer_id: CUST },
      bearer_token: otherToken,
    },
    deps(),
  )
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.status, 401)
  }
})

test('list: VALID token → 200 with approvals', async () => {
  const token = await signCustomerToken(CUST, HMAC_KEY)
  const result = await approvalQueueHandler(
    {
      method: 'GET',
      mode: 'list',
      query: { customer_id: CUST },
      bearer_token: token,
    },
    deps(),
  )
  assert.equal(result.ok, true)
  if (result.ok) {
    assert.equal(result.status, 200)
  }
})

// ─── decide mode skips HMAC (Telegram-side auth covers this) ─────

test('decide: HMAC NOT required (decide reaches via Telegram callback)', async () => {
  // decide is invoked from telegram-bot-webhook handler after the
  // x-telegram-bot-api-secret-token check passes. No HMAC required.
  const mutator: ApprovalRowMutator = async (id) => ({
    ok: true,
    row: {
      id,
      customer_id: CUST,
      action_kind: 'incorporate',
      action_summary: 'x',
      action_payload: {},
      proposed_by_agent: 'all-in-one-business-agent',
      status: 'approved',
      approved_by: 'customer',
      approved_at: NOW,
      expires_at: NOW,
      created_at: NOW,
    },
  })
  const result = await approvalQueueHandler(
    {
      method: 'POST',
      mode: 'decide',
      query: { id: 'aaa', decision: 'approve' },
      body: { approved_by: 'customer' },
    },
    deps({ mutator }),
  )
  assert.equal(result.ok, true)
})

// ─── verifier omitted preserves MVP backward compat ──────────────

test('verifier omitted → no HMAC enforced (backward compat)', async () => {
  const result = await approvalQueueHandler(
    {
      method: 'POST',
      mode: 'create',
      body: validBody,
      // no bearer_token
    },
    deps({ verifyToken: undefined }),
  )
  assert.equal(result.ok, true)
})
