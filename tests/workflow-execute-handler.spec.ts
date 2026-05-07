/**
 * Tests for workflow-execute-handler.
 *
 * Focus areas:
 *   - Input validation (400)
 *   - Customer / workflow not found (404)
 *   - Tier gating (403)
 *   - Parameter validation (400 with detail)
 *   - Happy path: run inserted → handler called → run updated to success
 *   - Failsafe: handler throws → run updated to failed + 500 returned
 *   - Failsafe: handler returns error → run updated to failed
 *   - Routing: hermes-skill / external-api / composite returned as
 *     "not implemented" with run row recorded
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  workflowExecuteHandler,
  type ExecuteDeps,
  type CallHandlerResult,
} from '../supabase/functions/_shared/workflow-execute-handler.ts'
import type {
  WorkflowRow,
  WorkflowRunStatus,
} from '../supabase/functions/_shared/workflow-types.ts'

const PARAM_SCHEMA = {
  type: 'object',
  required: ['client_name', 'amount'],
  properties: {
    client_name: { type: 'string', minLength: 1 },
    amount: { type: 'number', minimum: 0 },
    note: { type: 'string', default: 'pembayaran rutin' },
  },
}

function row(overrides: Partial<WorkflowRow> = {}): WorkflowRow {
  return {
    id: 'wf_invoice',
    slug: 'invoice-generator',
    name_id: 'Generator Invoice',
    description_id: '',
    agent_slugs: ['doc-expert'],
    category: 'template',
    parameters_schema: PARAM_SCHEMA,
    execution_type: 'edge-function',
    handler_ref: 'edge-fn:invoice-generator-handler',
    output_type: 'file',
    tier: 'starter',
    version: 1,
    success_rate: 0,
    avg_duration_ms: 0,
    usage_count: 0,
    created_at: '2026-05-07T00:00:00Z',
    updated_at: '2026-05-07T00:00:00Z',
    ...overrides,
  }
}

type Recorded = {
  inserted: Array<{
    workflowId: string
    customerId: string
    agentSlug: string
    parameters: Record<string, unknown>
  }>
  updated: Array<{
    runId: string
    status: WorkflowRunStatus
    output: Record<string, unknown> | null
    error: string | null
    durationMs: number
  }>
  handlerCalls: number
}

function setup(opts: {
  customer?: { id: string; tier: 'starter' | 'pro' | 'studio' } | null
  workflow?: WorkflowRow | null
  handlerResult?: CallHandlerResult
  handlerThrows?: Error
  updateThrows?: boolean
  /** Drive a synthetic clock for deterministic durations. */
  durationMs?: number
} = {}): { deps: ExecuteDeps; rec: Recorded } {
  const rec: Recorded = { inserted: [], updated: [], handlerCalls: 0 }
  let nextRunId = 1
  let now = 1000
  return {
    rec,
    deps: {
      customerLookup: async () =>
        opts.customer === undefined
          ? { id: 'cust_1', tier: 'pro' }
          : opts.customer,
      workflowLookup: async () =>
        opts.workflow === undefined ? row() : opts.workflow,
      insertRun: async (params) => {
        const id = 'run_' + nextRunId++
        rec.inserted.push(params)
        return id
      },
      updateRun: async (params) => {
        if (opts.updateThrows) throw new Error('db down')
        rec.updated.push(params)
      },
      callEdgeFnHandler: async () => {
        rec.handlerCalls++
        if (opts.handlerThrows) throw opts.handlerThrows
        // Advance synthetic clock so durationMs is observable.
        now += opts.durationMs ?? 50
        return opts.handlerResult ?? {
          ok: true,
          output: { file_url: 'https://example.com/x.html' },
        }
      },
      now: () => now,
    },
  }
}

const baseInput = {
  customer_id: 'cust_1',
  workflow_id: 'wf_invoice',
  parameters: { client_name: 'PT Acme', amount: 5_000_000 },
}

// ─── input validation ──────────────────────────────────────────────────

test('execute: rejects missing customer_id', async () => {
  const { deps } = setup()
  const r = await workflowExecuteHandler({ ...baseInput, customer_id: '' }, deps)
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.status, 400)
})

test('execute: rejects missing workflow_id', async () => {
  const { deps } = setup()
  const r = await workflowExecuteHandler({ ...baseInput, workflow_id: '' }, deps)
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.status, 400)
})

test('execute: rejects non-object parameters', async () => {
  const { deps } = setup()
  // @ts-expect-error testing malformed input
  const r = await workflowExecuteHandler({ ...baseInput, parameters: 'oops' }, deps)
  assert.equal(r.ok, false)
  if (!r.ok) {
    assert.equal(r.status, 400)
    assert.equal(r.error, 'invalid_parameters')
  }
})

test('execute: rejects array as parameters (not an object)', async () => {
  const { deps } = setup()
  // @ts-expect-error testing malformed input
  const r = await workflowExecuteHandler({ ...baseInput, parameters: [] }, deps)
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.error, 'invalid_parameters')
})

// ─── lookup misses ────────────────────────────────────────────────────

test('execute: 404 when customer not found', async () => {
  const { deps } = setup({ customer: null })
  const r = await workflowExecuteHandler(baseInput, deps)
  assert.equal(r.ok, false)
  if (!r.ok) {
    assert.equal(r.status, 404)
    assert.equal(r.error, 'customer_not_found')
  }
})

test('execute: 404 when workflow not found', async () => {
  const { deps } = setup({ workflow: null })
  const r = await workflowExecuteHandler(baseInput, deps)
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.error, 'workflow_not_found')
})

// ─── tier gating ──────────────────────────────────────────────────────

test('execute: 403 when customer tier < workflow tier', async () => {
  const { deps, rec } = setup({
    customer: { id: 'cust_1', tier: 'starter' },
    workflow: row({ tier: 'pro' }),
  })
  const r = await workflowExecuteHandler(baseInput, deps)
  assert.equal(r.ok, false)
  if (!r.ok) {
    assert.equal(r.status, 403)
    assert.equal(r.error, 'tier_insufficient')
  }
  // No run row inserted on tier reject — pre-flight check, no work done.
  assert.equal(rec.inserted.length, 0)
})

test('execute: equal tier passes', async () => {
  const { deps } = setup({
    customer: { id: 'cust_1', tier: 'pro' },
    workflow: row({ tier: 'pro' }),
  })
  const r = await workflowExecuteHandler(baseInput, deps)
  assert.equal(r.ok, true)
})

test('execute: studio customer can run starter workflows', async () => {
  const { deps } = setup({
    customer: { id: 'cust_1', tier: 'studio' },
    workflow: row({ tier: 'starter' }),
  })
  const r = await workflowExecuteHandler(baseInput, deps)
  assert.equal(r.ok, true)
})

// ─── parameter validation ─────────────────────────────────────────────

test('execute: 400 when parameters fail schema (missing required)', async () => {
  const { deps, rec } = setup()
  const r = await workflowExecuteHandler(
    { ...baseInput, parameters: { client_name: 'PT Acme' } },  // amount missing
    deps,
  )
  assert.equal(r.ok, false)
  if (!r.ok) {
    assert.equal(r.error, 'parameter_validation_failed')
    assert.match(r.detail!, /amount/)
  }
  // No run row inserted — validation fails before insert.
  assert.equal(rec.inserted.length, 0)
})

test('execute: 400 when parameters fail schema (wrong type)', async () => {
  const { deps } = setup()
  const r = await workflowExecuteHandler(
    { ...baseInput, parameters: { client_name: 'PT Acme', amount: '5000' } },
    deps,
  )
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.error, 'parameter_validation_failed')
})

test('execute: parameter defaults applied before persisted', async () => {
  const { deps, rec } = setup()
  await workflowExecuteHandler(baseInput, deps)
  // 'note' has default 'pembayaran rutin'; should be in inserted row.
  assert.equal(rec.inserted[0].parameters.note, 'pembayaran rutin')
})

// ─── happy path ────────────────────────────────────────────────────────

test('execute: success path inserts running row, calls handler, updates to success', async () => {
  const { deps, rec } = setup({ durationMs: 50 })
  const r = await workflowExecuteHandler(baseInput, deps)
  assert.equal(r.ok, true)
  if (!r.ok) return

  // Insert happened with right shape
  assert.equal(rec.inserted.length, 1)
  assert.equal(rec.inserted[0].workflowId, 'wf_invoice')
  assert.equal(rec.inserted[0].customerId, 'cust_1')
  assert.equal(rec.inserted[0].agentSlug, 'doc-expert')

  // Handler called once
  assert.equal(rec.handlerCalls, 1)

  // Update reflected success
  assert.equal(rec.updated.length, 1)
  assert.equal(rec.updated[0].status, 'success')
  assert.equal(rec.updated[0].error, null)
  assert.deepEqual(rec.updated[0].output, { file_url: 'https://example.com/x.html' })
  assert.equal(rec.updated[0].durationMs, 50)

  // Response shape
  assert.equal(r.body.status, 'success')
  assert.deepEqual(r.body.output, { file_url: 'https://example.com/x.html' })
  assert.equal(r.body.duration_ms, 50)
  assert.equal(r.body.run_id, 'run_1')
})

// ─── failsafe: handler returns error ───────────────────────────────────

test('execute: handler returns error → row marked failed + 500 returned', async () => {
  const { deps, rec } = setup({
    handlerResult: { ok: false, error: 'PDF service down' },
    durationMs: 30,
  })
  const r = await workflowExecuteHandler(baseInput, deps)
  assert.equal(r.ok, false)
  if (!r.ok) {
    assert.equal(r.status, 500)
    assert.equal(r.error, 'handler_failed')
    assert.equal(r.detail, 'PDF service down')
    assert.equal(r.run_id, 'run_1')
  }
  assert.equal(rec.updated.length, 1)
  assert.equal(rec.updated[0].status, 'failed')
  assert.equal(rec.updated[0].error, 'PDF service down')
  assert.equal(rec.updated[0].durationMs, 30)
})

// ─── failsafe: handler throws ──────────────────────────────────────────

test('execute: handler throws → row marked failed + 500 + run_id returned', async () => {
  const { deps, rec } = setup({
    handlerThrows: new Error('handler crashed during render'),
  })
  const r = await workflowExecuteHandler(baseInput, deps)
  assert.equal(r.ok, false)
  if (!r.ok) {
    assert.equal(r.error, 'handler_threw')
    assert.equal(r.detail, 'handler crashed during render')
    assert.equal(r.run_id, 'run_1')
  }
  assert.equal(rec.updated.length, 1)
  assert.equal(rec.updated[0].status, 'failed')
  assert.equal(rec.updated[0].error, 'handler crashed during render')
})

test('execute: handler throws + updateRun also throws → still returns error (no crash)', async () => {
  const { deps } = setup({
    handlerThrows: new Error('boom'),
    updateThrows: true,
  })
  const r = await workflowExecuteHandler(baseInput, deps)
  // Still returns an err response — orphan running row is acceptable
  // (better than function crash).
  assert.equal(r.ok, false)
  if (!r.ok) {
    assert.equal(r.error, 'handler_threw')
  }
})

// ─── routing: non-edge-fn execution_types ──────────────────────────────

test('execute: hermes-skill execution_type returns "not implemented" + records failed run', async () => {
  const { deps, rec } = setup({
    workflow: row({
      execution_type: 'hermes-skill',
      handler_ref: 'hermes-skill:daily-news',
    }),
  })
  const r = await workflowExecuteHandler(baseInput, deps)
  assert.equal(r.ok, false)
  if (!r.ok) {
    assert.equal(r.status, 500)
    assert.equal(r.error, 'execution_type_not_implemented')
    assert.match(r.detail!, /hermes-skill/)
  }
  // Run row IS recorded — caller can audit attempts.
  assert.equal(rec.updated.length, 1)
  assert.equal(rec.updated[0].status, 'failed')
})

test('execute: malformed handler_ref returns error + records failed run', async () => {
  const { deps, rec } = setup({
    workflow: row({ handler_ref: 'no-colon-bad-ref' }),
  })
  const r = await workflowExecuteHandler(baseInput, deps)
  assert.equal(r.ok, false)
  if (!r.ok) {
    assert.equal(r.error, 'malformed_handler_ref')
  }
  assert.equal(rec.updated.length, 1)
  assert.equal(rec.updated[0].status, 'failed')
})
