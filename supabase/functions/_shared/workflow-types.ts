// Shared types for the workflow registry (Phase 2E-1.5, Hermes-native).
//
// Spec: docs/plans/2026-05-08-workflow-library-pivot-to-hermes-native.md
//
// Architecture pivot 2026-05-08: dropped platform-side workflow-discover
// (Hermes does intent matching + parameter extraction natively using
// the customer's BYOK LLM). The types here cover the surviving surface:
// workflow registry rows + workflow_runs telemetry.
//
// Pure types only — no runtime imports. Both Deno (Edge Functions) and
// Node (tests) import from here.

export const WORKFLOW_CATEGORIES = [
  'booking',
  'scraping',
  'generation',
  'analysis',
  'automation',
  'template',
] as const

export type WorkflowCategory = typeof WORKFLOW_CATEGORIES[number]

export const WORKFLOW_EXECUTION_TYPES = [
  'edge-function',
  'hermes-skill',
  'composite',
  'external-api',
] as const

export type WorkflowExecutionType = typeof WORKFLOW_EXECUTION_TYPES[number]

export const WORKFLOW_OUTPUT_TYPES = [
  'file',
  'text',
  'json',
  'side-effect',
] as const

export type WorkflowOutputType = typeof WORKFLOW_OUTPUT_TYPES[number]

export const WORKFLOW_TIERS = ['starter', 'pro', 'studio'] as const
export type WorkflowTier = typeof WORKFLOW_TIERS[number]

// Tier ordering for the customer-tier ≥ workflow-tier check inside
// workflow-execute. 'starter' is the entry tier — every paid customer
// has it.
export const TIER_ORDINAL: Record<WorkflowTier, number> = {
  starter: 1,
  pro: 2,
  studio: 3,
}

export const WORKFLOW_RUN_STATUSES = [
  'pending',
  'running',
  'success',
  'failed',
] as const

export type WorkflowRunStatus = typeof WORKFLOW_RUN_STATUSES[number]

// ─── Database row shapes ────────────────────────────────────────────────

export type WorkflowRow = {
  id: string
  slug: string
  name_id: string
  description_id: string
  agent_slugs: string[]
  category: WorkflowCategory
  parameters_schema: Record<string, unknown>
  execution_type: WorkflowExecutionType
  handler_ref: string
  output_type: WorkflowOutputType
  tier: WorkflowTier
  version: number
  success_rate: number
  avg_duration_ms: number
  usage_count: number
  created_at: string
  updated_at: string
}

export type WorkflowRunRow = {
  id: string
  workflow_id: string
  customer_id: string
  agent_slug: string
  parameters: Record<string, unknown> | null
  status: WorkflowRunStatus
  output: Record<string, unknown> | null
  error: string | null
  duration_ms: number | null
  started_at: string
  completed_at: string | null
}

// ─── handler_ref parsing ────────────────────────────────────────────────

export type HandlerRef =
  | { kind: 'edge-fn'; name: string }
  | { kind: 'hermes-skill'; name: string }
  | { kind: 'external'; id: string }
  | { kind: 'composite'; slug: string }

/**
 * Parse a namespaced handler_ref string like "edge-fn:invoice-generator-handler".
 * Returns null on malformed input. Phase 2E-1.5 pilot only invokes 'edge-fn';
 * other kinds round-trip through workflow-execute as routing decisions but
 * are not yet implemented.
 */
export function parseHandlerRef(ref: string): HandlerRef | null {
  const colonIdx = ref.indexOf(':')
  if (colonIdx < 1 || colonIdx === ref.length - 1) return null

  const kind = ref.slice(0, colonIdx)
  const value = ref.slice(colonIdx + 1)

  switch (kind) {
    case 'edge-fn':
      return { kind: 'edge-fn', name: value }
    case 'hermes-skill':
      return { kind: 'hermes-skill', name: value }
    case 'external':
      return { kind: 'external', id: value }
    case 'composite':
      return { kind: 'composite', slug: value }
    default:
      return null
  }
}
