// Phase 5-1.b: business-roadmap type contract.
//
// Mirrors the database row shape from
// supabase/migrations/20260510100000_phase_5_master_agent_state.sql
// (table business_roadmap_state). Drift is asserted in tests.

import { STAGES } from './stages.ts'

export type StageKind = (typeof STAGES)[number]

/** Map of deliverable id → completion flag. Keys are namespaced
 *  `<stage>_<short_name>`; see stages.ts for the locked set. */
export type DeliverablesCompleted = Record<string, boolean>

export type RoadmapState = {
  customer_id: string
  current_stage: StageKind
  stage_entered_at: string  // ISO 8601
  deliverables_completed: DeliverablesCompleted
  notes_md: string | null
  updated_at: string  // ISO 8601
}

export type AdvanceOk = {
  ok: true
  state: RoadmapState
  from: StageKind
  to: StageKind
}

export type AdvanceErr =
  | { ok: false; reason: 'missing_deliverables'; missing: string[] }
  | { ok: false; reason: 'already_at_final' }

export type AdvanceResult = AdvanceOk | AdvanceErr
