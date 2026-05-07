// workflow-list handler — read-only catalog browser.
//
// Spec: docs/plans/2026-05-07-workflow-library-foundation-spec.md
//
// Returns the publicly-visible metadata for registered workflows.
// EXCLUDES sensitive fields:
//   - intent_embedding   (1536 floats, not useful to clients)
//   - handler_ref        (implementation detail; could leak attack surface)
//   - success_rate       (telemetry; revealed only to internal dashboards)
//   - avg_duration_ms    (telemetry)
//   - usage_count        (telemetry)
//   - intent_phrases     (full list — we expose a sampled subset instead)
//
// Filter parameters (all optional, all narrow the result set):
//   agent_slug   - only workflows where agent_slugs @> [agent_slug]
//   category     - only workflows in this category
//   tier         - only workflows with this exact tier (NOT "tier and below")
//
// Auth: open. The endpoint is read-only metadata; no per-customer scoping.

import type {
  WorkflowCategory,
  WorkflowRow,
  WorkflowTier,
} from './workflow-types.ts'
import {
  WORKFLOW_CATEGORIES,
  WORKFLOW_TIERS,
} from './workflow-types.ts'

// ─── public output shape ────────────────────────────────────────────────

export type WorkflowListItem = {
  slug: string
  name_id: string
  description_id: string
  agent_slugs: string[]
  category: WorkflowCategory
  tier: WorkflowTier
  intent_phrases_sample: string[]   // up to 3, for the catalog UI
  parameters_schema: Record<string, unknown>
  output_type: string
  version: number
}

export type WorkflowListInput = {
  agent_slug?: string
  category?: string
  tier?: string
}

export type WorkflowListOk = { ok: true; workflows: WorkflowListItem[] }
export type WorkflowListErr = {
  ok: false
  status: 400
  error: string
  detail?: string
}
export type WorkflowListResult = WorkflowListOk | WorkflowListErr

// ─── DB shape (caller injects this) ─────────────────────────────────────

export type ListReader = (filter: {
  agent_slug?: string
  category?: WorkflowCategory
  tier?: WorkflowTier
}) => Promise<WorkflowRow[]>

// ─── handler ────────────────────────────────────────────────────────────

const MAX_INTENT_PHRASES_SAMPLE = 3

export async function workflowListHandler(
  input: WorkflowListInput,
  reader: ListReader,
): Promise<WorkflowListResult> {
  // Validate filter values up front. Unknown enum values get a 400 with a
  // clear diagnostic — a typo in the dashboard shouldn't silently return
  // "no results, idk why".
  if (input.agent_slug !== undefined && input.agent_slug.length === 0) {
    return { ok: false, status: 400, error: 'invalid_agent_slug', detail: 'empty string' }
  }
  if (input.category !== undefined && !isCategory(input.category)) {
    return {
      ok: false,
      status: 400,
      error: 'invalid_category',
      detail: `must be one of ${WORKFLOW_CATEGORIES.join(', ')}`,
    }
  }
  if (input.tier !== undefined && !isTier(input.tier)) {
    return {
      ok: false,
      status: 400,
      error: 'invalid_tier',
      detail: `must be one of ${WORKFLOW_TIERS.join(', ')}`,
    }
  }

  const rows = await reader({
    agent_slug: input.agent_slug,
    category: input.category as WorkflowCategory | undefined,
    tier: input.tier as WorkflowTier | undefined,
  })

  return { ok: true, workflows: rows.map(toListItem) }
}

function isCategory(s: string): s is WorkflowCategory {
  return (WORKFLOW_CATEGORIES as readonly string[]).includes(s)
}

function isTier(s: string): s is WorkflowTier {
  return (WORKFLOW_TIERS as readonly string[]).includes(s)
}

function toListItem(row: WorkflowRow): WorkflowListItem {
  return {
    slug: row.slug,
    name_id: row.name_id,
    description_id: row.description_id,
    agent_slugs: row.agent_slugs,
    category: row.category,
    tier: row.tier,
    intent_phrases_sample: row.intent_phrases.slice(0, MAX_INTENT_PHRASES_SAMPLE),
    parameters_schema: row.parameters_schema,
    output_type: row.output_type,
    version: row.version,
  }
}
