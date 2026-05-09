// Shared types for the transform_llm_output plugin.
//
// Spec: docs/plans/2026-05-09-phase-4-spec.md (Phase 4-4 + Q4=A
// locked: hard-replace by default with Business Director allowlist;
// per-context detection deferred to Phase 4.5).
//
// Pure types. The plugin is invoked by Hermes after every LLM
// completion and before the result reaches the customer; we wrap
// the LLM output, apply transforms, return the cleaned text.

/** Categories of PII the redactor knows how to find. */
export type PiiKind =
  | 'npwp'              // Indonesian tax ID (XX.XXX.XXX.X-XXX.XXX format)
  | 'ktp'               // Indonesian national ID (16 digits)
  | 'phone_id'          // Indonesian phone (+62 / 0 prefix, 10-13 digits)
  | 'email'             // standard email pattern
  | 'bank_account_id'   // 10-16 digit Indonesian bank account
  | 'credit_card'       // 13-19 digit card number with Luhn check

export type PiiMatch = {
  kind: PiiKind
  /** Original matched text. */
  matched: string
  /** Replacement marker (e.g. '[NPWP_REDACTED]'). */
  replacement: string
  /** Character offset in the original input. */
  offset: number
}

/** Brand-voice violations the linter detects. */
export type VoiceFinding =
  | { kind: 'banned_word'; word: string; offset: number }
  | { kind: 'exclamation'; offset: number }
  | { kind: 'address_form'; matched: string; offset: number; suggestion: string }
  | { kind: 'banned_register'; phrase: string; offset: number; suggestion?: string }

/** Skill ID that bypasses the default redactor. Per Q4=A:
 *  Business Director's incorporation-advisor + compliance-checker
 *  legitimately surface NPWP/KTP examples in OSS / SPT explanations.
 *  Other skills get hard-replace behavior. */
export type AllowlistEntry = {
  /** Persona slug — e.g. 'business-director'. */
  personaSlug: string
  /** Skill id — e.g. 'incorporation-advisor'. */
  skillId: string
  /** Which PII kinds this skill is allowed to emit unredacted. */
  allowedPii: readonly PiiKind[]
}

/** Plugin invocation context. */
export type TransformContext = {
  /** Raw LLM output to clean. */
  text: string
  /** Persona slug — used for allowlist lookup. */
  personaSlug: string
  /** Skill id — used for allowlist lookup. */
  skillId: string
  /** Optional: context kind. Phase 4.5+ uses this for per-context
   *  detection (external surfaces vs internal chat). Phase 4-4 v0
   *  ignores it but plumbs through so the dataset of (context, pii_count)
   *  is logged for the Phase 4.5 design. */
  emissionContext?: 'chat-reply' | 'draft-preview' | 'email-send' | 'social-post' | 'telegram-outbound' | 'unknown'
}

/** Plugin output — both the cleaned text + a structured report so
 *  Hermes can log the transformations. */
export type TransformResult = {
  /** Output text, post-redaction + post-voice-enforcement. */
  text: string
  /** PII that was redacted (or kept, when allowlisted). */
  piiMatches: PiiMatch[]
  /** Voice rule violations found + auto-corrected. */
  voiceFindings: VoiceFinding[]
  /** Whether the text was modified at all. */
  modified: boolean
  /** Total transform time in ms (perf monitoring per Q5=A: no cap). */
  durationMs: number
}
