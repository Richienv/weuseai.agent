// Parameter extraction for workflow-discover.
//
// Spec: docs/plans/2026-05-07-workflow-library-foundation-spec.md (Q3a)
//
// Given a customer message + parameters_schema, calls the orchestration
// LLM (claude-3.5-haiku via OpenRouter) and returns a partial extraction.
// Retry-once on malformed JSON, fall back to empty on second failure or
// HTTP error. Always returns an ExtractionResult — never throws — so
// callers can route the result without try/catch.
//
// Cost-bounded: maxTokens capped at ORCHESTRATION_MAX_OUTPUT_TOKENS (200).
// Single-call cost ~$0.0002 at claude-3.5-haiku rates. ~$6/month at 1000
// customers × 30 extraction calls/customer-month.
//
// Telemetry: caller passes onFailure(reason, rawExcerpt?) hook. The
// workflow-discover Edge Function entrypoint wires this to the
// extraction_failures table.

import {
  llmJsonCompletion,
  type ChatMessage,
  ORCHESTRATION_MAX_OUTPUT_TOKENS,
  PARAM_EXTRACTION_MODEL,
} from './llm-client.ts'

// ─── prompt builder ────────────────────────────────────────────────────
//
// System prompt instructs the LLM to:
//   1. Extract only fields actually mentioned (no guessing)
//   2. Parse Indonesian + English currency variants (3jt, Rp 5,5jt, dst.)
//   3. Output strict JSON, no prose, no markdown
//
// User message contains the customer text + parameters_schema.

export function buildExtractionPrompt(params: {
  messageText: string
  parametersSchema: Record<string, unknown>
  workflowSlug: string
}): { system: string; user: string } {
  const schemaJson = JSON.stringify(params.parametersSchema, null, 2)

  const system =
    `You are a parameter extraction tool for a workflow registry.\n` +
    `Workflow: "${params.workflowSlug}".\n\n` +
    `Given a customer message in Bahasa Indonesia or English and a JSON Schema, extract values for parameters MENTIONED IN THE MESSAGE. Do not guess fields that are not stated.\n\n` +
    `Rupiah parsing rules — ALWAYS convert to integer rupiah:\n` +
    `  "3jt" → 3000000\n` +
    `  "5,5jt" or "5.5jt" → 5500000\n` +
    `  "Rp 3.000.000" or "Rp 3,000,000" → 3000000\n` +
    `  "tiga juta" → 3000000\n` +
    `  "500rb" or "500 ribu" → 500000\n\n` +
    `Date parsing — convert relative dates (e.g. "tanggal 15") to YYYY-MM-DD using today's date as reference.\n\n` +
    `Output format: ONE JSON object. Only include fields you actually found in the message. Omit fields you did not find. No markdown, no code fences, no prose. Start with \`{\` and end with \`}\`.\n\n` +
    `JSON Schema for reference:\n${schemaJson}`

  const user = `Customer message: "${params.messageText}"\n\nExtract:`

  return { system, user }
}

// ─── stricter retry prompt ─────────────────────────────────────────────

function buildRetrySystemPrompt(originalSystem: string): string {
  return (
    originalSystem +
    `\n\nIMPORTANT — RETRY ATTEMPT: Your previous response was not valid JSON. ` +
    `Output MUST be a single JSON object. Start with the character \`{\`. End with the character \`}\`. ` +
    `No prose before or after. No markdown code fences. No triple-backticks. Plain JSON only.`
  )
}

// ─── result + dependency types ─────────────────────────────────────────

export type ExtractionFailureReason =
  | 'malformed_json_twice'
  | 'http_error'
  | 'no_api_key'
  | 'empty_response'
  | 'bad_response'

export type ExtractionResult = {
  /** Possibly-empty record of parameters the LLM returned. Caller validates. */
  extracted: Record<string, unknown>
  /** True iff the fallback empty path was taken. */
  fallback: boolean
  /** Set when fallback=true; describes why. */
  reason?: ExtractionFailureReason
  /** First 500 chars of the LLM response when reason='malformed_json_twice'. */
  rawExcerpt?: string
}

export type ExtractParametersOpts = {
  apiKey: string
  messageText: string
  parametersSchema: Record<string, unknown>
  workflowSlug: string
  /** Inject for tests. Defaults to the real llmJsonCompletion. */
  llmCallFn?: typeof llmJsonCompletion
  /** Telemetry hook; called when fallback fires. */
  onFailure?: (reason: ExtractionFailureReason, rawExcerpt?: string) => void
}

// ─── core extraction function ──────────────────────────────────────────

export async function extractParametersFromMessage(
  opts: ExtractParametersOpts,
): Promise<ExtractionResult> {
  if (!opts.apiKey) {
    opts.onFailure?.('no_api_key')
    return { extracted: {}, fallback: true, reason: 'no_api_key' }
  }

  const llmCall = opts.llmCallFn ?? llmJsonCompletion
  const { system, user } = buildExtractionPrompt({
    messageText: opts.messageText,
    parametersSchema: opts.parametersSchema,
    workflowSlug: opts.workflowSlug,
  })
  const messages: ChatMessage[] = [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]

  // ── Attempt 1 ──
  const first = await llmCall<Record<string, unknown>>({
    apiKey: opts.apiKey,
    model: PARAM_EXTRACTION_MODEL,
    messages,
    temperature: 0,
    maxTokens: ORCHESTRATION_MAX_OUTPUT_TOKENS,
  })

  if (first.ok) {
    if (!first.result || typeof first.result !== 'object' || Array.isArray(first.result)) {
      // LLM returned something other than an object literal.
      const reason: ExtractionFailureReason = 'bad_response'
      opts.onFailure?.(reason, first.raw?.slice(0, 500))
      return {
        extracted: {},
        fallback: true,
        reason,
        rawExcerpt: first.raw?.slice(0, 500),
      }
    }
    return { extracted: first.result, fallback: false }
  }

  // Non-JSON-parse failures don't get retried (HTTP errors, missing key,
  // bad response shape). Fall through to fallback immediately.
  if (first.reason !== 'json_parse_failed') {
    const reason: ExtractionFailureReason =
      first.reason === 'no_api_key'
        ? 'no_api_key'
        : first.reason === 'http_error'
          ? 'http_error'
          : 'bad_response'
    opts.onFailure?.(reason, first.raw?.slice(0, 500))
    return { extracted: {}, fallback: true, reason, rawExcerpt: first.raw?.slice(0, 500) }
  }

  // ── Attempt 2 (stricter prompt, retry on malformed JSON only) ──
  const stricterMessages: ChatMessage[] = [
    { role: 'system', content: buildRetrySystemPrompt(system) },
    { role: 'user', content: user },
  ]
  const second = await llmCall<Record<string, unknown>>({
    apiKey: opts.apiKey,
    model: PARAM_EXTRACTION_MODEL,
    messages: stricterMessages,
    temperature: 0,
    maxTokens: ORCHESTRATION_MAX_OUTPUT_TOKENS,
  })

  if (second.ok) {
    if (!second.result || typeof second.result !== 'object' || Array.isArray(second.result)) {
      opts.onFailure?.('bad_response', second.raw?.slice(0, 500))
      return {
        extracted: {},
        fallback: true,
        reason: 'bad_response',
        rawExcerpt: second.raw?.slice(0, 500),
      }
    }
    return { extracted: second.result, fallback: false }
  }

  // Both attempts failed JSON parsing → fallback empty.
  if (second.reason === 'json_parse_failed') {
    opts.onFailure?.('malformed_json_twice', second.raw?.slice(0, 500))
    return {
      extracted: {},
      fallback: true,
      reason: 'malformed_json_twice',
      rawExcerpt: second.raw?.slice(0, 500),
    }
  }

  // Second attempt hit a non-JSON failure (HTTP error etc.) → fallback.
  const reason: ExtractionFailureReason =
    second.reason === 'http_error' ? 'http_error' : 'bad_response'
  opts.onFailure?.(reason, second.raw?.slice(0, 500))
  return { extracted: {}, fallback: true, reason, rawExcerpt: second.raw?.slice(0, 500) }
}

// ─── per-field schema validation (used by workflow-discover-handler) ───
//
// Validates each extracted field independently against its property
// schema. Fields that fail validation OR aren't in the schema get
// stripped. Returns the valid subset + the list of stripped keys.
//
// This is per-field (not whole-object) because the LLM may extract
// SOME but not all required fields — we want to keep the valid ones
// and let the caller (handler) recompute missing_parameters.

import { validateAgainstSchema } from './parameter-validator.ts'

export function validateExtractedFields(
  extracted: Record<string, unknown>,
  parametersSchema: Record<string, unknown>,
): { valid: Record<string, unknown>; invalid: string[] } {
  const properties =
    (parametersSchema.properties as Record<string, unknown> | undefined) ?? {}

  const valid: Record<string, unknown> = {}
  const invalid: string[] = []

  for (const [key, value] of Object.entries(extracted)) {
    const propSchema = properties[key]
    if (!propSchema || typeof propSchema !== 'object') {
      // Unknown property — strip silently (LLM hallucinated a field).
      invalid.push(key)
      continue
    }
    const result = validateAgainstSchema(
      value,
      propSchema as Record<string, unknown>,
    )
    if (result.ok) {
      valid[key] = result.value
    } else {
      invalid.push(key)
    }
  }

  return { valid, invalid }
}
