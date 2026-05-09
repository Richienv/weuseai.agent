// Phase 5-1.b: pure state-machine functions over RoadmapState.
//
// All functions are pure — no IO, no Date.now() side effect (we accept
// `now: () => string` injection so tests can pin time). Default uses
// system time.

import { ALL_DELIVERABLES, STAGES, STAGE_DELIVERABLES, type StageKind } from './stages.js'
import type { AdvanceResult, RoadmapState } from './types.js'

const ALL_DELIVERABLE_SET = new Set<string>(ALL_DELIVERABLES)
const STAGE_SET = new Set<string>(STAGES)

const defaultNow = (): string => new Date().toISOString()

// ─── Type guards ────────────────────────────────────────────────────

export function isStage(value: unknown): value is StageKind {
  return typeof value === 'string' && STAGE_SET.has(value)
}

export function isDeliverableId(value: unknown): value is string {
  return typeof value === 'string' && ALL_DELIVERABLE_SET.has(value)
}

// ─── Constructors ──────────────────────────────────────────────────

export function initialRoadmapState(
  customer_id: string,
  now: () => string = defaultNow,
): RoadmapState {
  const ts = now()
  return {
    customer_id,
    current_stage: 'idea',
    stage_entered_at: ts,
    deliverables_completed: {},
    notes_md: null,
    updated_at: ts,
  }
}

// ─── Queries ───────────────────────────────────────────────────────

export function listMissingDeliverables(state: RoadmapState): string[] {
  const stageIds = STAGE_DELIVERABLES[state.current_stage]
  return stageIds.filter((id) => state.deliverables_completed[id] !== true)
}

export function canAdvance(state: RoadmapState): boolean {
  if (state.current_stage === 'sell') return false
  return listMissingDeliverables(state).length === 0
}

// ─── Mutations (immutable — return new state) ──────────────────────

export function markDeliverable(
  state: RoadmapState,
  deliverableId: string,
  done: boolean,
  now: () => string = defaultNow,
): RoadmapState {
  if (!isDeliverableId(deliverableId)) {
    throw new Error(`unknown deliverable: ${deliverableId}`)
  }
  const stageIds: readonly string[] = STAGE_DELIVERABLES[state.current_stage]
  if (!stageIds.includes(deliverableId)) {
    throw new Error(
      `deliverable ${deliverableId} is not in current stage ${state.current_stage}`,
    )
  }
  return {
    ...state,
    deliverables_completed: {
      ...state.deliverables_completed,
      [deliverableId]: done,
    },
    updated_at: now(),
  }
}

export function advance(
  state: RoadmapState,
  now: () => string = defaultNow,
): AdvanceResult {
  if (state.current_stage === 'sell') {
    return { ok: false, reason: 'already_at_final' }
  }
  const missing = listMissingDeliverables(state)
  if (missing.length > 0) {
    return { ok: false, reason: 'missing_deliverables', missing }
  }
  const idx = STAGES.indexOf(state.current_stage)
  const next = STAGES[idx + 1]!
  const ts = now()
  return {
    ok: true,
    state: {
      ...state,
      current_stage: next,
      stage_entered_at: ts,
      updated_at: ts,
    },
    from: state.current_stage,
    to: next,
  }
}
