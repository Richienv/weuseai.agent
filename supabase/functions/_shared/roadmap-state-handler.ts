// Phase 5-3.b: roadmap-state-handler pure handler.
//
// Spec: docs/plans/2026-05-10-phase-5-spec.md (Q1=A locked).
// Schema: supabase/migrations/20260510100000_phase_5_master_agent_state.sql
//          (business_roadmap_state table)
//
// Wraps the Phase 5-1.b state machine
// (services/business-roadmap/src/state-machine.ts) with a thin HTTP-shaped
// handler that:
//   - GET / mode=get  → returns current state + missing deliverables + can_advance
//   - POST / mode=init → creates fresh state at "idea" if none exists
//   - PATCH / mode=mark_deliverable → updates a single deliverable
//   - POST / mode=advance → moves to next stage if all current done

// NOTE: services/business-roadmap exports use .ts extensions (Deno- and
// tsx-compatible). This package is NOT consumed by Vercel @vercel/node;
// only by Deno (Supabase Edge Functions) and Node test runner via tsx
// (with allowImportingTsExtensions). Both accept .ts.
import {
  advance as smAdvance,
  canAdvance as smCanAdvance,
  initialRoadmapState,
  listMissingDeliverables,
  markDeliverable as smMarkDeliverable,
} from '../../../services/business-roadmap/src/index.ts'
import type {
  AdvanceResult,
  RoadmapState,
} from '../../../services/business-roadmap/src/index.ts'

// ─── Handler input envelope ───────────────────────────────────────

export type HandlerInput =
  | {
      method: 'GET'
      mode: 'get'
      query: Record<string, string | undefined>
    }
  | {
      method: 'POST'
      mode: 'init'
      body: Record<string, unknown>
    }
  | {
      method: 'PATCH'
      mode: 'mark_deliverable'
      body: Record<string, unknown>
    }
  | {
      method: 'POST'
      mode: 'advance'
      body: Record<string, unknown>
    }

// ─── Result envelope ───────────────────────────────────────────────

export type HandlerOk =
  | {
      ok: true
      status: 200
      body: {
        state: RoadmapState
        missing_deliverables: string[]
        can_advance: boolean
      }
    }
  | {
      ok: true
      status: 201
      body: { state: RoadmapState }
    }

export type HandlerErr = {
  ok: false
  status: 400 | 404 | 409 | 500
  error: string
  detail?: string | string[]
}

export type HandlerResult = HandlerOk | HandlerErr

// ─── Injected dependencies ─────────────────────────────────────────

export type RoadmapStateReader = (
  customer_id: string,
) => Promise<RoadmapState | null>

export type RoadmapStateWriter = (
  state: RoadmapState,
) => Promise<{ ok: true; state: RoadmapState } | { ok: false; error: string }>

export type Deps = {
  reader: RoadmapStateReader
  writer: RoadmapStateWriter
  now: () => string
}

// ─── Handler ───────────────────────────────────────────────────────

export async function roadmapStateHandler(
  input: HandlerInput,
  deps: Deps,
): Promise<HandlerResult> {
  if (input.mode === 'get') {
    const customer_id = input.query.customer_id
    if (!customer_id) {
      return { ok: false, status: 400, error: 'missing_customer_id' }
    }
    const state = await deps.reader(customer_id)
    if (!state) {
      return { ok: false, status: 404, error: 'state_not_found' }
    }
    return {
      ok: true,
      status: 200,
      body: {
        state,
        missing_deliverables: listMissingDeliverables(state),
        can_advance: smCanAdvance(state),
      },
    }
  }

  if (input.mode === 'init') {
    const customer_id = input.body.customer_id
    if (typeof customer_id !== 'string' || !customer_id) {
      return { ok: false, status: 400, error: 'invalid_customer_id' }
    }
    const existing = await deps.reader(customer_id)
    if (existing) {
      return { ok: false, status: 409, error: 'already_exists' }
    }
    const fresh = initialRoadmapState(customer_id, deps.now)
    const written = await deps.writer(fresh)
    if (!written.ok) {
      return {
        ok: false,
        status: 500,
        error: 'writer_failed',
        detail: written.error,
      }
    }
    return { ok: true, status: 201, body: { state: written.state } }
  }

  if (input.mode === 'mark_deliverable') {
    const customer_id = input.body.customer_id
    const deliverable_id = input.body.deliverable_id
    const complete = input.body.complete
    if (typeof customer_id !== 'string' || !customer_id) {
      return { ok: false, status: 400, error: 'invalid_customer_id' }
    }
    if (typeof deliverable_id !== 'string' || !deliverable_id) {
      return { ok: false, status: 400, error: 'invalid_deliverable_id' }
    }
    if (typeof complete !== 'boolean') {
      return { ok: false, status: 400, error: 'invalid_complete' }
    }
    const state = await deps.reader(customer_id)
    if (!state) {
      return { ok: false, status: 404, error: 'state_not_found' }
    }
    let nextState: RoadmapState
    try {
      nextState = smMarkDeliverable(state, deliverable_id, complete, deps.now)
    } catch (e) {
      return {
        ok: false,
        status: 400,
        error: 'invalid_deliverable',
        detail: e instanceof Error ? e.message : String(e),
      }
    }
    const written = await deps.writer(nextState)
    if (!written.ok) {
      return {
        ok: false,
        status: 500,
        error: 'writer_failed',
        detail: written.error,
      }
    }
    return {
      ok: true,
      status: 200,
      body: {
        state: written.state,
        missing_deliverables: listMissingDeliverables(written.state),
        can_advance: smCanAdvance(written.state),
      },
    }
  }

  if (input.mode === 'advance') {
    const customer_id = input.body.customer_id
    if (typeof customer_id !== 'string' || !customer_id) {
      return { ok: false, status: 400, error: 'invalid_customer_id' }
    }
    const state = await deps.reader(customer_id)
    if (!state) {
      return { ok: false, status: 404, error: 'state_not_found' }
    }
    const result: AdvanceResult = smAdvance(state, deps.now)
    if (!result.ok) {
      return {
        ok: false,
        status: 409,
        error: result.reason,
        detail: result.reason === 'missing_deliverables' ? result.missing : undefined,
      }
    }
    const written = await deps.writer(result.state)
    if (!written.ok) {
      return {
        ok: false,
        status: 500,
        error: 'writer_failed',
        detail: written.error,
      }
    }
    return {
      ok: true,
      status: 200,
      body: {
        state: written.state,
        missing_deliverables: listMissingDeliverables(written.state),
        can_advance: smCanAdvance(written.state),
      },
    }
  }

  return { ok: false, status: 400, error: 'invalid_mode' }
}
