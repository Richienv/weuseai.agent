// Phase 5-1.b: business-roadmap barrel.
//
// Single import surface for the state machine. Used by:
//   - supabase/functions/_shared/roadmap-state-handler.ts (5-3.b)
//   - agent-packs/all-in-one-business-agent/skills/roadmap-tracker/ (5-2.a)
//
// Runtime exports use .js extension (NodeNext-style) — same convention
// as packages/observability/src/index.ts to support Vercel's @vercel/node
// per-file compilation pattern. Type-only exports keep .ts.

export type {
  AdvanceErr,
  AdvanceOk,
  AdvanceResult,
  DeliverablesCompleted,
  RoadmapState,
  StageKind,
} from './types.ts'

export {
  ALL_DELIVERABLES,
  STAGES,
  STAGE_DELIVERABLES,
} from './stages.ts'

export {
  advance,
  canAdvance,
  initialRoadmapState,
  isDeliverableId,
  isStage,
  listMissingDeliverables,
  markDeliverable,
} from './state-machine.ts'
