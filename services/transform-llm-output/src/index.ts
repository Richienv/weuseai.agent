// transform_llm_output entrypoint.
//
// Spec: docs/plans/2026-05-09-phase-4-spec.md (Phase 4-4, Q4=A
// hard-replace + Business Director allowlist; Q5=A no perf cap).
//
// Pure-logic plugin — call with the raw LLM output, persona+skill
// context, and get back a cleaned string + audit report.

import { detectPii, redactPii } from './pii.ts'
import { detectVoiceFindings, rewriteVoice } from './voice.ts'
import { resolveAllowedPii } from './allowlist.ts'
import type { TransformContext, TransformResult } from './types.ts'

export function transformLlmOutput(ctx: TransformContext): TransformResult {
  const start = performance.now()

  // 1. PII detect + redact (with allowlist).
  const piiMatches = detectPii(ctx.text)
  const allowed = resolveAllowedPii(ctx)
  const afterPii = redactPii(ctx.text, piiMatches, allowed)

  // 2. Voice detect + rewrite. Run on the post-PII text so banned-word
  //    matches don't accidentally fire on PII content (e.g. an email
  //    that happens to contain 'just' before redaction).
  const voiceFindings = detectVoiceFindings(afterPii)
  const finalText = rewriteVoice(afterPii)

  const durationMs = performance.now() - start
  const modified = finalText !== ctx.text

  return {
    text: finalText,
    piiMatches,
    voiceFindings,
    modified,
    durationMs,
  }
}

// Re-export types + utilities so consumers can import from the
// package root.
export type {
  PiiKind,
  PiiMatch,
  VoiceFinding,
  AllowlistEntry,
  TransformContext,
  TransformResult,
} from './types.ts'
export { detectPii, redactPii, luhnValid } from './pii.ts'
export { detectVoiceFindings, rewriteVoice } from './voice.ts'
export { resolveAllowedPii, ALLOWLIST } from './allowlist.ts'
