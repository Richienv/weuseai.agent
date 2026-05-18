// flow-state handler — the state-machine-between-invocations engine.
//
// Phase 1 Week 2 (2026-05-18 consult). A *playbook* is a sequence of
// atomic skill invocations rather than one long-running skill. This
// handler persists the cursor (`current_step`) + the accumulated step
// outputs (`state_data`) between invocations, so a playbook survives
// message gaps, customer think-time, and VPS restarts.
//
// Lifecycle: the persona's playbook skill calls this on every customer
// message — `get` to read where the run stands, `advance` to record a
// step's output and move the cursor, `start` to (re)begin, and
// `complete` / `abort` to terminate. Escalation gates park the run at
// `awaiting_customer` (waiting for the customer to reply) or `escalated`
// (a hard gate that needs explicit customer approval); the next
// `advance` resumes it.
//
// Pure module — all persistence is dependency-injected via FlowStateStore
// so the logic is unit-tested without a database. Auth (X-CID must equal
// customer_id) is enforced here; the Edge Function entry just forwards
// the header.

// ─── types ─────────────────────────────────────────────────────────────────

export type FlowStatus =
  | 'in_progress'
  | 'awaiting_customer'
  | 'escalated'
  | 'completed'
  | 'aborted'

/** A persisted playbook run. */
export type FlowStateRow = {
  id: string
  customer_id: string
  playbook_id: string
  current_step: number
  total_steps: number
  status: FlowStatus
  /** Accumulated per-step outputs, merged shallowly on each advance. */
  state_data: Record<string, unknown>
  created_at: string
  updated_at: string
}

export type FlowStateOperation =
  | 'start'
  | 'get'
  | 'advance'
  | 'complete'
  | 'abort'

/** Status a playbook step may park the run at via `advance`. */
export type SettableStatus = 'in_progress' | 'awaiting_customer' | 'escalated'

export type FlowStateInput = {
  customer_id: string
  /** Value of the request's X-CID header — must equal customer_id. */
  x_cid: string | null
  playbook_id: string
  operation: FlowStateOperation
  /** Required for `start`: the playbook's step count. */
  total_steps?: number
  /** For `advance`: shallow-merged into state_data. */
  step_output?: Record<string, unknown>
  /** For `advance`: park the run (e.g. at an escalation gate). Defaults to in_progress. */
  set_status?: SettableStatus
}

export type FlowStateOk = { ok: true; status: 200; body: FlowStateRow }
export type FlowStateErr = {
  ok: false
  status: 400 | 403 | 404 | 409
  error: string
  detail?: string
}
export type FlowStateResult = FlowStateOk | FlowStateErr

/** Persistence contract — backed by the customer_flow_state table. */
export interface FlowStateStore {
  get(customerId: string, playbookId: string): Promise<FlowStateRow | null>
  /** Create-or-reset the run for (customer, playbook) at step 1. */
  start(input: {
    customer_id: string
    playbook_id: string
    total_steps: number
  }): Promise<FlowStateRow>
  update(id: string, patch: Partial<FlowStateRow>): Promise<FlowStateRow>
}

// ─── handler ───────────────────────────────────────────────────────────────

const VALID_OPS: ReadonlySet<string> = new Set([
  'start',
  'get',
  'advance',
  'complete',
  'abort',
])

const ADVANCEABLE: ReadonlySet<FlowStatus> = new Set([
  'in_progress',
  'awaiting_customer',
  'escalated',
])

export async function handleFlowState(
  input: FlowStateInput,
  store: FlowStateStore,
): Promise<FlowStateResult> {
  // ── Validation ──────────────────────────────────────────────────
  if (!input.customer_id) {
    return { ok: false, status: 400, error: 'missing_customer_id' }
  }
  if (!input.playbook_id) {
    return { ok: false, status: 400, error: 'missing_playbook_id' }
  }
  if (!VALID_OPS.has(input.operation)) {
    return {
      ok: false,
      status: 400,
      error: 'bad_operation',
      detail: `operation must be one of: ${[...VALID_OPS].join(', ')}`,
    }
  }

  // ── Auth: X-CID must equal customer_id ──────────────────────────
  // Same cross-customer-leak gate as customer-progress-proxy (Sesi D
  // pass-3): a missing or mismatched X-CID is a hard 403.
  if (!input.x_cid || input.x_cid !== input.customer_id) {
    return {
      ok: false,
      status: 403,
      error: 'x_cid_mismatch',
      detail: 'X-CID header must equal customer_id',
    }
  }

  // ── start ───────────────────────────────────────────────────────
  if (input.operation === 'start') {
    const total = input.total_steps
    if (typeof total !== 'number' || !Number.isInteger(total) || total < 1) {
      return {
        ok: false,
        status: 400,
        error: 'bad_total_steps',
        detail: 'start requires an integer total_steps >= 1',
      }
    }
    const row = await store.start({
      customer_id: input.customer_id,
      playbook_id: input.playbook_id,
      total_steps: total,
    })
    return { ok: true, status: 200, body: row }
  }

  // Every remaining operation needs an existing run.
  const row = await store.get(input.customer_id, input.playbook_id)
  if (!row) {
    return {
      ok: false,
      status: 404,
      error: 'no_active_run',
      detail: `no ${input.playbook_id} run for this customer — call start first`,
    }
  }

  // ── get ─────────────────────────────────────────────────────────
  if (input.operation === 'get') {
    return { ok: true, status: 200, body: row }
  }

  // ── complete / abort ────────────────────────────────────────────
  if (input.operation === 'complete' || input.operation === 'abort') {
    const updated = await store.update(row.id, {
      status: input.operation === 'complete' ? 'completed' : 'aborted',
    })
    return { ok: true, status: 200, body: updated }
  }

  // ── advance ─────────────────────────────────────────────────────
  // input.operation === 'advance'
  if (!ADVANCEABLE.has(row.status)) {
    return {
      ok: false,
      status: 409,
      error: 'run_not_advanceable',
      detail: `run is ${row.status} — cannot advance a terminated run`,
    }
  }
  if (row.current_step >= row.total_steps) {
    return {
      ok: false,
      status: 409,
      error: 'already_at_final_step',
      detail: `run is at the final step (${row.total_steps}) — call complete instead`,
    }
  }

  const updated = await store.update(row.id, {
    current_step: row.current_step + 1,
    status: input.set_status ?? 'in_progress',
    state_data: { ...row.state_data, ...(input.step_output ?? {}) },
  })
  return { ok: true, status: 200, body: updated }
}
