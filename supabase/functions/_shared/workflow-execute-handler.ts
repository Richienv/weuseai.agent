// workflow-execute handler.
//
// Spec: docs/plans/2026-05-07-workflow-library-foundation-spec.md
//
// Pipeline:
//   1. Validate input (customer_id, workflow_id, parameters)
//   2. Lookup customer + workflow
//   3. Tier check: customer.tier_ord >= workflow.tier_ord
//   4. Validate parameters against workflow.parameters_schema
//   5. Insert workflow_runs row with status='running'
//   6. Route by execution_type → call handler (or return skill ref)
//   7. Update workflow_runs row with output/error/duration
//   8. Return run_id + status + output (or error)
//
// Failsafe: ANY exception during routing → workflow_runs row updated
// with status='failed' + error text. We never silently drop a run.
//
// All I/O is dependency-injected (lookups, insert, update, handler call).

import {
  parseHandlerRef,
  TIER_ORDINAL,
  type WorkflowRow,
  type WorkflowRunStatus,
  type WorkflowTier,
} from './workflow-types.ts'
import { validateAgainstSchema } from './parameter-validator.ts'

// ─── input + output shapes ──────────────────────────────────────────────

export type ExecuteInput = {
  customer_id: string
  workflow_id: string
  parameters: Record<string, unknown>
}

export type ExecuteOk = {
  ok: true
  status: 200
  body: {
    run_id: string
    status: WorkflowRunStatus
    output: Record<string, unknown> | null
    duration_ms: number
  }
}

export type ExecuteErr = {
  ok: false
  status: 400 | 403 | 404 | 500
  error: string
  detail?: string
  run_id?: string  // present when we recorded a failed run
}

export type ExecuteResult = ExecuteOk | ExecuteErr

// ─── injected dependencies ──────────────────────────────────────────────

export type CustomerInfo = { id: string; tier: WorkflowTier }

export type CallHandlerResult =
  | { ok: true; output: Record<string, unknown> }
  | { ok: false; error: string }

export type ExecuteDeps = {
  customerLookup: (customerId: string) => Promise<CustomerInfo | null>
  workflowLookup: (workflowId: string) => Promise<WorkflowRow | null>
  /** Insert a workflow_runs row in 'running' status; return the new id. */
  insertRun: (params: {
    workflowId: string
    customerId: string
    agentSlug: string
    parameters: Record<string, unknown>
  }) => Promise<string>
  /** Update an existing workflow_runs row to its final state. */
  updateRun: (params: {
    runId: string
    status: WorkflowRunStatus
    output: Record<string, unknown> | null
    error: string | null
    durationMs: number
  }) => Promise<void>
  /**
   * Route the actual work for an edge-fn handler. Other execution_types
   * (hermes-skill, composite, external-api) return a routing-only payload
   * for the caller to handle locally — those don't go through this fn.
   */
  callEdgeFnHandler: (params: {
    handlerName: string
    parameters: Record<string, unknown>
    customerId: string
  }) => Promise<CallHandlerResult>
  /** For tests + observability: get current high-resolution timestamp ms. */
  now: () => number
}

// ─── handler ────────────────────────────────────────────────────────────

export async function workflowExecuteHandler(
  input: ExecuteInput,
  deps: ExecuteDeps,
): Promise<ExecuteResult> {
  // ── 1. Input validation ──
  if (!input.customer_id || typeof input.customer_id !== 'string') {
    return { ok: false, status: 400, error: 'invalid_customer_id' }
  }
  if (!input.workflow_id || typeof input.workflow_id !== 'string') {
    return { ok: false, status: 400, error: 'invalid_workflow_id' }
  }
  if (
    !input.parameters ||
    typeof input.parameters !== 'object' ||
    Array.isArray(input.parameters)
  ) {
    return {
      ok: false,
      status: 400,
      error: 'invalid_parameters',
      detail: 'parameters must be an object',
    }
  }

  // ── 2. Customer + workflow lookup ──
  const customer = await deps.customerLookup(input.customer_id)
  if (!customer) {
    return { ok: false, status: 404, error: 'customer_not_found' }
  }
  const workflow = await deps.workflowLookup(input.workflow_id)
  if (!workflow) {
    return { ok: false, status: 404, error: 'workflow_not_found' }
  }

  // ── 3. Tier gate ──
  if (TIER_ORDINAL[customer.tier] < TIER_ORDINAL[workflow.tier]) {
    return {
      ok: false,
      status: 403,
      error: 'tier_insufficient',
      detail: `workflow requires ${workflow.tier}, customer has ${customer.tier}`,
    }
  }

  // ── 4. Parameter validation ──
  const validation = validateAgainstSchema(
    input.parameters,
    workflow.parameters_schema as Record<string, unknown>,
  )
  if (!validation.ok) {
    return {
      ok: false,
      status: 400,
      error: 'parameter_validation_failed',
      detail: validation.errors.join('; '),
    }
  }

  // ── 5. Insert workflow_runs row ──
  // We use the validated `validation.value` (which has defaults applied)
  // as the parameters of record. Helps debugging — what the handler
  // actually saw.
  const validatedParams = validation.value as Record<string, unknown>

  // Pick first agent_slug as the invoking agent. In practice the agent
  // is determined by who called us; for Phase 2E-1 (curl demo) we use
  // the workflow's primary agent.
  const agentSlug = workflow.agent_slugs[0]

  const runId = await deps.insertRun({
    workflowId: workflow.id,
    customerId: customer.id,
    agentSlug,
    parameters: validatedParams,
  })

  // ── 6 + 7. Route + execute + update ──
  const handler = parseHandlerRef(workflow.handler_ref)
  if (!handler) {
    const errMsg = `malformed handler_ref: ${workflow.handler_ref}`
    await deps.updateRun({
      runId,
      status: 'failed',
      output: null,
      error: errMsg,
      durationMs: 0,
    })
    return {
      ok: false,
      status: 500,
      error: 'malformed_handler_ref',
      detail: errMsg,
      run_id: runId,
    }
  }

  if (handler.kind !== 'edge-fn') {
    // Phase 2E-1 only implements edge-fn execution. Other kinds get
    // recorded as failed with a clear "not implemented" error so callers
    // know it's a wiring gap, not a bug.
    const errMsg = `execution_type ${workflow.execution_type} not implemented in 2E-1`
    await deps.updateRun({
      runId,
      status: 'failed',
      output: null,
      error: errMsg,
      durationMs: 0,
    })
    return {
      ok: false,
      status: 500,
      error: 'execution_type_not_implemented',
      detail: errMsg,
      run_id: runId,
    }
  }

  // ── Edge-fn execution with failsafe ──
  const startMs = deps.now()
  try {
    const result = await deps.callEdgeFnHandler({
      handlerName: handler.name,
      parameters: validatedParams,
      customerId: customer.id,
    })
    const durationMs = deps.now() - startMs

    if (!result.ok) {
      await deps.updateRun({
        runId,
        status: 'failed',
        output: null,
        error: result.error,
        durationMs,
      })
      return {
        ok: false,
        status: 500,
        error: 'handler_failed',
        detail: result.error,
        run_id: runId,
      }
    }

    await deps.updateRun({
      runId,
      status: 'success',
      output: result.output,
      error: null,
      durationMs,
    })
    return {
      ok: true,
      status: 200,
      body: {
        run_id: runId,
        status: 'success',
        output: result.output,
        duration_ms: durationMs,
      },
    }
  } catch (e) {
    // Caught exception path — handler threw. Treat as failed run.
    const durationMs = deps.now() - startMs
    const errMsg = e instanceof Error ? e.message : String(e)
    // Best-effort row update; if updateRun itself throws, we still want
    // to return an error to the caller rather than crashing the function.
    try {
      await deps.updateRun({
        runId,
        status: 'failed',
        output: null,
        error: errMsg,
        durationMs,
      })
    } catch {
      // Swallow — run row is already inserted; downstream observability
      // will catch the orphan running-state row.
    }
    return {
      ok: false,
      status: 500,
      error: 'handler_threw',
      detail: errMsg,
      run_id: runId,
    }
  }
}
