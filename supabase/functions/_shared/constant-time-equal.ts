// Sesi D P1-1 fix (2026-05-10).
//
// Source: docs/audits/2026-05-10-security-audit-sesi-d.md
//   "Sesi D P1-1 — Telegram webhook secret-token comparison is timing-unsafe"
//
// Single source of truth for constant-time string equality across all
// Edge Functions. Prior to this module, three near-identical copies
// existed:
//   - hermes-instance-auth.ts: `function constantTimeEqual` (private)
//   - xendit-webhook-handler.ts: `function safeEqual` (private)
//   - telegram-bot-webhook-handler.ts: plain `!==` (timing-unsafe)
//   - pair-customer-bot-webhook-handler.ts: plain `!==` (timing-unsafe)
//
// All four now import this helper. Web Platform APIs only — no Deno or
// Node-specific imports — so the same module works in Edge Function
// runtime and in node:test unit tests via tsx.
//
// Constant-time guarantee: returns false on length mismatch (which is
// inherently observable — the caller MUST length-validate first if the
// length itself is sensitive). For equal-length inputs, runs through
// every byte regardless of where the first mismatch is.

/**
 * Constant-time string equality. Returns true iff strings are equal.
 *
 * - Length mismatch returns false immediately (length is not secret).
 * - Equal-length inputs are compared byte-by-byte with a bitwise OR
 *   accumulator, so the function takes the same number of iterations
 *   regardless of where the first mismatch is.
 *
 * Callers that need to keep the length itself secret must pad inputs
 * to a fixed length before calling.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}
