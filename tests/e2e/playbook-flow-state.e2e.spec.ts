/**
 * Phase F harness extension — persona playbook flow-state validation.
 *
 * Phase 1 Week 2 (2026-05-18 consult). The 3 persona playbooks
 * (deep-researcher market-research, slide-master pitch-deck, the-pro
 * customer-reply) all run on the `flow-state` state-machine engine. This
 * harness drives the DEPLOYED `flow-state` Edge Function through a full
 * playbook lifecycle against the real database — the same engine the
 * playbooks depend on at runtime.
 *
 * What it asserts (per the consult's harness spec):
 *   - a playbook run starts and walks through its first 3 steps
 *   - state_data persists + accumulates across simulated message gaps
 *     (each `advance` is a separate HTTP call, exactly as separate
 *     customer messages would arrive)
 *   - escalation gates fire: a step can park the run at
 *     `awaiting_customer` (soft checkpoint) and `escalated` (hard gate),
 *     and the next `advance` resumes it
 *   - the terminated-run + final-step guards reject illegal advances
 *   - the X-CID auth gate rejects a mismatched caller
 *
 * It uses a throwaway playbook_id (`__e2e_harness__`) bound to a real
 * customer row (FK), and deletes the row on teardown — no pollution.
 *
 * Lives under tests/e2e/ so it is NOT picked up by `npm test`
 * (`tests/*.spec.ts`). Run explicitly:
 *   npx tsx --test tests/e2e/playbook-flow-state.e2e.spec.ts
 *
 * Skips cleanly (not fails) when SUPABASE_URL / SUPABASE_SECRET_KEY are
 * absent, so a credential-less CI run is green.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// ─── env ───────────────────────────────────────────────────────────────

const ENV_LOCAL = resolve(process.cwd(), '.env.local')
if (existsSync(ENV_LOCAL)) {
  for (const line of readFileSync(ENV_LOCAL, 'utf8').split('\n')) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
  }
}

const SUPABASE_URL = (process.env.SUPABASE_URL ?? '').replace(/\/$/, '')
const SERVICE_KEY =
  process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const FLOW_STATE_URL = `${SUPABASE_URL}/functions/v1/flow-state`
const HARNESS_PLAYBOOK = '__e2e_harness__'

const HAVE_ENV = Boolean(SUPABASE_URL && SERVICE_KEY)

// ─── helpers ───────────────────────────────────────────────────────────

type FlowResult = {
  ok: boolean
  status: number
  error?: string
  body?: {
    current_step: number
    total_steps: number
    status: string
    state_data: Record<string, unknown>
  }
}

const restHeaders = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
}

/** Find any one real customer id — flow-state rows have an FK to customers. */
async function pickCustomerId(): Promise<string | null> {
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/customers?select=id&limit=1`,
    { headers: restHeaders },
  )
  if (!r.ok) return null
  const rows = (await r.json()) as { id: string }[]
  return rows[0]?.id ?? null
}

/** Call the deployed flow-state function. xCid defaults to customerId. */
async function flow(
  customerId: string,
  operation: string,
  extra: Record<string, unknown> = {},
  xCid?: string,
): Promise<FlowResult> {
  const r = await fetch(FLOW_STATE_URL, {
    method: 'POST',
    headers: {
      'x-cid': xCid ?? customerId,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      customer_id: customerId,
      playbook_id: HARNESS_PLAYBOOK,
      operation,
      ...extra,
    }),
  })
  const json = (await r.json()) as FlowResult
  return json
}

/** Remove the harness row so the run leaves no trace. */
async function cleanup(customerId: string): Promise<void> {
  await fetch(
    `${SUPABASE_URL}/rest/v1/customer_flow_state` +
      `?customer_id=eq.${customerId}&playbook_id=eq.${HARNESS_PLAYBOOK}`,
    { method: 'DELETE', headers: restHeaders },
  ).catch(() => {})
}

// ─── the harness ───────────────────────────────────────────────────────

test('Phase F: persona playbook flow-state lifecycle (deployed)', async (t) => {
  if (!HAVE_ENV) {
    t.skip('SUPABASE_URL / SUPABASE_SECRET_KEY not set — skipping deployed harness')
    return
  }

  const customerId = await pickCustomerId()
  if (!customerId) {
    t.skip('no customer rows in the database — skipping')
    return
  }

  try {
    // ── Stage 1: start a 5-step playbook run ──────────────────────
    const started = await flow(customerId, 'start', { total_steps: 5 })
    assert.equal(started.ok, true, 'start must succeed')
    assert.equal(started.body?.current_step, 1, 'fresh run begins at step 1')
    assert.equal(started.body?.status, 'in_progress')
    assert.deepEqual(started.body?.state_data, {}, 'fresh run has empty state')

    // ── Stage 2: walk the first 3 steps, each a separate HTTP call
    //    (simulating separate customer messages with gaps between) ──
    const adv1 = await flow(customerId, 'advance', { step_output: { step1: 'intake done' } })
    assert.equal(adv1.body?.current_step, 2, 'advance moves to step 2')

    // A `get` between advances simulates the agent re-reading state on
    // the next customer message — state must survive the gap.
    const mid = await flow(customerId, 'get')
    assert.equal(mid.body?.current_step, 2, 'state survives the message gap')
    assert.deepEqual(mid.body?.state_data, { step1: 'intake done' })

    const adv2 = await flow(customerId, 'advance', { step_output: { step2: 'sources gathered' } })
    assert.equal(adv2.body?.current_step, 3)
    assert.deepEqual(
      adv2.body?.state_data,
      { step1: 'intake done', step2: 'sources gathered' },
      'state_data accumulates across steps',
    )

    // ── Stage 3: escalation gate — soft checkpoint ────────────────
    // Step 3 parks the run awaiting the customer (a `checkpoint` gate).
    const parked = await flow(customerId, 'advance', {
      step_output: { step3: 'graded' },
      set_status: 'awaiting_customer',
    })
    assert.equal(parked.body?.current_step, 4)
    assert.equal(
      parked.body?.status,
      'awaiting_customer',
      'checkpoint gate parks the run awaiting the customer',
    )

    // ── Stage 4: the customer replies → the run resumes ───────────
    const resumed = await flow(customerId, 'advance', { step_output: { step4: 'approved' } })
    assert.equal(resumed.body?.current_step, 5)
    assert.equal(resumed.body?.status, 'in_progress', 'next advance resumes the parked run')

    // ── Stage 5: hard-gate escalation parks at `escalated` ────────
    // The run is at the final step (5/5); a hard gate parks it there.
    const escalated = await flow(customerId, 'advance', { set_status: 'escalated' })
    // Already at the final step → advance is rejected (use complete).
    assert.equal(escalated.ok, false, 'advance past the final step is rejected')
    assert.equal(escalated.status, 409)

    // Re-park the still-active run at `escalated` via a fresh run to
    // prove the hard-gate status is reachable + resumable.
    await flow(customerId, 'start', { total_steps: 3 })
    const hardGate = await flow(customerId, 'advance', { set_status: 'escalated' })
    assert.equal(hardGate.body?.status, 'escalated', 'hard gate parks the run at escalated')
    const past = await flow(customerId, 'advance')
    assert.equal(past.body?.status, 'in_progress', 'an escalated run resumes on advance')

    // ── Stage 6: terminated-run guard ─────────────────────────────
    await flow(customerId, 'complete')
    const afterComplete = await flow(customerId, 'advance')
    assert.equal(afterComplete.ok, false, 'cannot advance a completed run')
    assert.equal(afterComplete.status, 409)

    // ── Stage 7: X-CID auth gate ──────────────────────────────────
    const spoofed = await flow(customerId, 'get', {}, 'not-the-customer')
    assert.equal(spoofed.ok, false, 'mismatched X-CID is rejected')
    assert.equal(spoofed.status, 403)
    assert.equal(spoofed.error, 'x_cid_mismatch')
  } finally {
    await cleanup(customerId)
  }
})
