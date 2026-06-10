/**
 * Cost-guard helpers for the LLM proxy.
 *
 * Audit: docs/audits/2026-06-07-fable5-systemwide-audit.md (Cost P1 #4).
 *
 * The proxy fronts our own DeepSeek key for starter-tier credits, so an
 * unbounded request — no max_tokens, a runaway retry loop, or a huge body —
 * burns OUR money. These pure helpers cap output, validate request size, and
 * decide when a call is actually billable. Kept separate from index.ts so
 * they unit-test without Cloudflare Worker globals.
 */

/** Default output cap when the caller omits max_tokens. */
export const DEFAULT_MAX_OUTPUT_TOKENS = 2048
/** Hard ceiling — a caller can ask for less, never more. */
export const MAX_OUTPUT_TOKENS_CAP = 4096
/** Reject requests with more than this many messages (loop/abuse guard). */
export const MAX_REQUEST_MESSAGES = 200
/** Reject requests whose serialized messages exceed this many chars. */
export const MAX_REQUEST_CHARS = 200_000

export type ChatBody = {
  model?: string
  messages?: unknown
  max_tokens?: number
  [k: string]: unknown
}

/**
 * Force a bounded max_tokens onto the request. Absent / non-positive →
 * DEFAULT; anything above the hard cap is clamped. This is THE control that
 * stops a single call generating 50k+ tokens on our key.
 */
export function capMaxTokens(body: ChatBody): ChatBody {
  const requested =
    typeof body.max_tokens === 'number' && body.max_tokens > 0
      ? body.max_tokens
      : DEFAULT_MAX_OUTPUT_TOKENS
  return { ...body, max_tokens: Math.min(requested, MAX_OUTPUT_TOKENS_CAP) }
}

export type ChatValidation = { ok: true } | { ok: false; error: string }

/** Reject malformed / oversized requests before they reach the provider. */
export function validateChatRequest(body: ChatBody): ChatValidation {
  if (!Array.isArray(body.messages)) return { ok: false, error: 'messages_required' }
  if (body.messages.length === 0) return { ok: false, error: 'messages_empty' }
  if (body.messages.length > MAX_REQUEST_MESSAGES) {
    return { ok: false, error: 'too_many_messages' }
  }
  let size: number
  try {
    size = JSON.stringify(body.messages).length
  } catch {
    return { ok: false, error: 'unserializable_messages' }
  }
  if (size > MAX_REQUEST_CHARS) return { ok: false, error: 'request_too_large' }
  return { ok: true }
}

/**
 * Charge ONLY when the upstream call succeeded AND reported usage. Before
 * this, a 5xx (or any non-2xx) that still carried a `usage` field would debit
 * the customer for a failed call. No success → no charge.
 */
export function shouldChargeUsage(upstreamOk: boolean, usage: unknown): boolean {
  return upstreamOk && !!usage && typeof usage === 'object'
}
