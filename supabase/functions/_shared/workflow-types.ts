// Shared types for the workflow registry (Phase 2E-1).
//
// Spec: docs/plans/2026-05-07-workflow-library-foundation-spec.md
//
// Pure types only — no runtime imports beyond JSONSchema-style record
// shapes. Both Deno-runtime Edge Functions and Node-runtime tests
// import from here.

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

// Tier ordering (used for "customer.tier_ord >= workflow.tier_ord" checks).
// 'starter' is the entry tier — everyone with a paid subscription has it.
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
// These mirror the Postgres column names exactly. Use snake_case here and
// translate at the API boundary (workflow-list etc.) to camelCase output.

export type WorkflowRow = {
  id: string
  slug: string
  name_id: string
  description_id: string
  agent_slugs: string[]
  category: WorkflowCategory
  intent_phrases: string[]
  intent_embedding: number[] | null
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

// ─── Discover output ────────────────────────────────────────────────────

export type DiscoverMatch = {
  workflow_id: string
  slug: string
  name_id: string
  confidence: number  // cosine similarity, 0-1
  parameters_schema: Record<string, unknown>
  extracted_parameters: Record<string, unknown>
  missing_parameters: string[]
}

export type DiscoverOutput = {
  matches: DiscoverMatch[]
  // True iff matches[0].confidence >= 0.85 AND matches[0] - matches[1] >= 0.10.
  // Agent should auto-execute on true; ask customer to confirm on false.
  auto_execute_recommended: boolean
}

// ─── handler_ref parsing ────────────────────────────────────────────────

export type HandlerRef =
  | { kind: 'edge-fn'; name: string }
  | { kind: 'hermes-skill'; name: string }
  | { kind: 'external'; id: string }
  | { kind: 'composite'; slug: string }

/**
 * Parse a namespaced handler_ref string like "edge-fn:invoice-generator-handler".
 * Returns null on malformed input. Phase 2E-1 only invokes 'edge-fn'; the
 * other kinds round-trip through workflow-execute as routing decisions but
 * the call itself is not implemented yet.
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

// ─── Auto-execute recommendation ────────────────────────────────────────

export const AUTO_EXECUTE_CONFIDENCE_THRESHOLD = 0.85
export const AUTO_EXECUTE_GAP_THRESHOLD = 0.10

// IEEE-754 wiggle room. 0.90 - 0.80 evaluates to 0.09999999999999998 in JS,
// which would fail a strict `>= 0.10` boundary-inclusive comparison even
// though the cosine scores themselves carry far more noise than this.
// 1e-9 is well below any meaningful difference in embedding similarity.
const FLOAT_EPS = 1e-9

/**
 * Given a sorted-descending matches array, decide whether the agent should
 * auto-execute the top match or ask the customer to confirm.
 *
 * Returns true iff:
 *   - top-1 confidence >= 0.85
 *   - top-1 minus top-2 >= 0.10 (clear winner)
 *
 * Empty array → false. Single-element array → true iff it clears the
 * threshold (no top-2 to subtract from).
 *
 * Both comparisons use floating-point epsilon — see FLOAT_EPS comment.
 */
export function shouldAutoExecute(matches: DiscoverMatch[]): boolean {
  if (matches.length === 0) return false
  const top = matches[0].confidence
  if (top + FLOAT_EPS < AUTO_EXECUTE_CONFIDENCE_THRESHOLD) return false
  if (matches.length === 1) return true
  const gap = top - matches[1].confidence
  return gap + FLOAT_EPS >= AUTO_EXECUTE_GAP_THRESHOLD
}
