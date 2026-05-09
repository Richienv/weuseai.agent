// Per-persona PII-redaction allowlist.
//
// Per Q4=A locked: Business Director's incorporation-advisor +
// compliance-checker legitimately surface NPWP / tax-ID examples in
// OSS / SPT explanation context. Other skills get hard-replace.
//
// Lookup is exact (personaSlug + skillId) match. Add to ALLOWLIST
// entries when a future skill needs PII passthrough.
//
// Phase 4.5+ migrates to per-context detection (chat-reply vs
// social-post emission classifier) — see TransformContext.emissionContext
// for the plumbing already in place.

import type { AllowlistEntry, PiiKind, TransformContext } from './types.ts'

export const ALLOWLIST: readonly AllowlistEntry[] = [
  {
    personaSlug: 'business-director',
    skillId: 'incorporation-advisor',
    // PT/CV setup explanations cite NPWP examples from official docs.
    allowedPii: ['npwp'],
  },
  {
    personaSlug: 'business-director',
    skillId: 'compliance-checker',
    // SPT/PPh explanations cite both NPWP + KTP placeholder samples.
    allowedPii: ['npwp', 'ktp'],
  },
] as const

/** Resolve which PII kinds are allowed for the given context.
 *  Returns empty array (= hard-replace everything) if no match. */
export function resolveAllowedPii(ctx: TransformContext): readonly PiiKind[] {
  for (const entry of ALLOWLIST) {
    if (entry.personaSlug === ctx.personaSlug && entry.skillId === ctx.skillId) {
      return entry.allowedPii
    }
  }
  return []
}
