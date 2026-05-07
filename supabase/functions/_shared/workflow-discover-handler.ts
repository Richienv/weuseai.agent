// workflow-discover handler.
//
// Spec: docs/plans/2026-05-07-workflow-library-foundation-spec.md
//
// Pipeline:
//   1. Validate input + customer_id exists + lookup customer's tier
//   2. Embed customer message via OpenAI text-embedding-3-small
//   3. Vector search workflows table — filter by agent_slug + tier order
//   4. For each top-3 match: call small LLM to extract structured params
//      from the customer message against the workflow's parameters_schema
//   5. Compute missing_parameters = required - extracted
//   6. Return DiscoverOutput with auto_execute_recommended boolean
//
// Dependency injection: customerLookup, embedFn, vectorSearchFn, llmFn
// are all injected so handler tests can mock them. The deno-serve
// entrypoint wires real implementations.

import {
  type DiscoverMatch,
  type DiscoverOutput,
  shouldAutoExecute,
  TIER_ORDINAL,
  type WorkflowRow,
  type WorkflowTier,
} from './workflow-types.ts'
import { requiredFieldsOf } from './parameter-validator.ts'

// ─── input + result shapes ──────────────────────────────────────────────

export type DiscoverInput = {
  customer_id: string
  agent_slug: string
  message_text: string
}

export type DiscoverOk = { ok: true; status: 200; body: DiscoverOutput }
export type DiscoverErr = {
  ok: false
  status: 400 | 404 | 500
  error: string
  detail?: string
}
export type DiscoverResult = DiscoverOk | DiscoverErr

// ─── injected dependencies ──────────────────────────────────────────────

export type CustomerInfo = { id: string; tier: WorkflowTier }

export type DiscoverDeps = {
  /** Look up customer by id; resolves null on missing. */
  customerLookup: (customerId: string) => Promise<CustomerInfo | null>
  /** Embed message_text → 1536-dim vector. Returns null on embed failure. */
  embedFn: (messageText: string) => Promise<number[] | null>
  /**
   * Vector search the workflows table. Returns rows with computed cosine
   * confidence in DESCENDING order. Caller decides limit (we ask for 3).
   */
  vectorSearchFn: (params: {
    embedding: number[]
    agentSlug: string
    customerTierOrd: number
    limit: number
  }) => Promise<Array<{ row: WorkflowRow; confidence: number }>>
  /**
   * Extract structured params from message_text against parameters_schema.
   * Returns the partial extraction (object). LLM is allowed to omit fields
   * it can't infer; caller computes missing via schema.required diff.
   */
  llmExtractFn: (params: {
    messageText: string
    parametersSchema: Record<string, unknown>
    workflowSlug: string
  }) => Promise<Record<string, unknown>>
}

// ─── handler ────────────────────────────────────────────────────────────

const TOP_K = 3

export async function workflowDiscoverHandler(
  input: DiscoverInput,
  deps: DiscoverDeps,
): Promise<DiscoverResult> {
  // Input validation
  if (!input.customer_id || typeof input.customer_id !== 'string') {
    return { ok: false, status: 400, error: 'invalid_customer_id' }
  }
  if (!input.agent_slug || typeof input.agent_slug !== 'string') {
    return { ok: false, status: 400, error: 'invalid_agent_slug' }
  }
  const trimmedMessage = (input.message_text ?? '').trim()
  if (trimmedMessage.length === 0) {
    return { ok: false, status: 400, error: 'empty_message_text' }
  }
  if (trimmedMessage.length > 2000) {
    // Defensive cap. Real customer messages rarely exceed a few hundred chars.
    return {
      ok: false,
      status: 400,
      error: 'message_too_long',
      detail: 'max 2000 chars',
    }
  }

  // Customer lookup
  const customer = await deps.customerLookup(input.customer_id)
  if (!customer) {
    return { ok: false, status: 404, error: 'customer_not_found' }
  }

  // Embed
  const embedding = await deps.embedFn(trimmedMessage)
  if (!embedding) {
    return {
      ok: false,
      status: 500,
      error: 'embed_failed',
      detail: 'see edge-function logs',
    }
  }

  // Vector search (already filters by tier ordinal + agent_slug)
  const customerTierOrd = TIER_ORDINAL[customer.tier]
  let topMatches: Array<{ row: WorkflowRow; confidence: number }>
  try {
    topMatches = await deps.vectorSearchFn({
      embedding,
      agentSlug: input.agent_slug,
      customerTierOrd,
      limit: TOP_K,
    })
  } catch (e) {
    return {
      ok: false,
      status: 500,
      error: 'vector_search_failed',
      detail: e instanceof Error ? e.message : String(e),
    }
  }

  // Parameter extraction per match. Done in parallel — independent calls.
  const matches: DiscoverMatch[] = await Promise.all(
    topMatches.map(async ({ row, confidence }) => {
      let extracted: Record<string, unknown> = {}
      try {
        extracted = await deps.llmExtractFn({
          messageText: trimmedMessage,
          parametersSchema: row.parameters_schema,
          workflowSlug: row.slug,
        })
      } catch {
        // Extraction failure is non-fatal — return empty extracted_parameters
        // and let the caller (or customer) supply them. Don't fail the
        // whole discovery just because the LLM couldn't infer fields.
        extracted = {}
      }
      const required = requiredFieldsOf(row.parameters_schema as Record<string, unknown>)
      const missing = required.filter((k) => extracted[k] === undefined)
      return {
        workflow_id: row.id,
        slug: row.slug,
        name_id: row.name_id,
        confidence,
        parameters_schema: row.parameters_schema,
        extracted_parameters: extracted,
        missing_parameters: missing,
      }
    }),
  )

  return {
    ok: true,
    status: 200,
    body: {
      matches,
      auto_execute_recommended: shouldAutoExecute(matches),
    },
  }
}

// ─── prompt builder for parameter extraction ────────────────────────────
//
// Exported separately so:
//   1. The deno-serve entrypoint can use it when constructing the real
//      llmExtractFn.
//   2. Tests can assert prompt contents (the exact words matter — the
//      LLM is sensitive to instruction phrasing).

export function buildExtractionPrompt(params: {
  messageText: string
  parametersSchema: Record<string, unknown>
  workflowSlug: string
}): { system: string; user: string } {
  const schemaJson = JSON.stringify(params.parametersSchema, null, 2)

  const system =
    `Kamu adalah parameter extractor untuk workflow registry.\n` +
    `Workflow: "${params.workflowSlug}".\n\n` +
    `Tugas: dari pesan customer, ekstrak field yang sesuai dengan JSON Schema di bawah. ` +
    `Hanya isi field yang BENAR-BENAR ada di pesan customer. Jangan tebak. ` +
    `Field yang tidak ada di pesan, JANGAN dimasukkan ke output.\n\n` +
    `Output: JSON object SAJA, tanpa markdown atau prosa.\n\n` +
    `JSON Schema:\n${schemaJson}`

  const user = `Pesan customer: "${params.messageText}"\n\nEkstrak parameter:`

  return { system, user }
}
