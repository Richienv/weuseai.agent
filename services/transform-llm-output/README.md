# @weuseai/transform-llm-output

LLM output post-processor — detects + redacts PII (NPWP, KTP, Indonesian phone, email, bank account, credit card) and enforces brand voice (banned words, exclamation strip, kamu form).

> Plugs into Hermes' output pipeline as a `transform_llm_output` hook. Every persona's emission goes through this layer before it reaches the customer.

## Locked decisions (per Phase 4 spec Q4 + Q5)

- **Q4=A: Hard-replace by default + Business Director allowlist.** PII like `12.345.678.9-012.345` becomes `[NPWP_REDACTED]` everywhere EXCEPT in `business-director`'s `incorporation-advisor` and `compliance-checker` skills, which legitimately cite tax-ID examples in OSS / SPT explanations.
- **Q4 Phase 4.5+ evolution:** add per-context detection (chat-reply / draft-preview / email-send / social-post / telegram-outbound). The `TransformContext.emissionContext` field is already plumbed through; Phase 4-4 v0 ignores it but logs the pair (context, pii_count) for the Phase 4.5 design.
- **Q5=A: No performance cap.** 50-100ms on a 5k-token response is fine since LLM gen latency dominates (5-30s).

## What it does

```ts
import { transformLlmOutput } from '@weuseai/transform-llm-output'

const result = transformLlmOutput({
  text: 'Halo Anda, hubungi kami di +6281234567890 atau email@example.com. Honestly amazing!',
  personaSlug: 'doc-expert',
  skillId: 'invoice-generator',
  emissionContext: 'email-send',
})

console.log(result.text)
// → 'Halo kamu, hubungi kami di [PHONE_REDACTED] atau [EMAIL_REDACTED]. amazing.'

console.log(result.piiMatches)
// → [
//     { kind: 'phone_id', matched: '+6281234567890', replacement: '[PHONE_REDACTED]', offset: 28 },
//     { kind: 'email', matched: 'email@example.com', replacement: '[EMAIL_REDACTED]', offset: 49 },
//   ]

console.log(result.voiceFindings)
// → [
//     { kind: 'address_form', matched: 'Anda', offset: 5, suggestion: 'kamu' },
//     { kind: 'banned_word', word: 'Honestly', offset: 73 },
//     { kind: 'exclamation', offset: 90 },
//   ]
```

## PII detection coverage

| Kind | Pattern | Notes |
|---|---|---|
| `npwp` | `XX.XXX.XXX.X-XXX.XXX` (Indonesian tax ID, 15 digits with separators) + bare 15-digit fallback | Allowlistable |
| `ktp` | 16 consecutive digits | Allowlistable |
| `phone_id` | `+62`, `62`, or `0` prefix + Indonesian mobile/landline (10-13 digits total) | Allowlistable |
| `email` | RFC-5321-ish word chars + `@` + 2-24 char TLD | Allowlistable |
| `bank_account_id` | 10-15 consecutive digits (BCA / Mandiri / BRI / BNI ranges) | Allowlistable |
| `credit_card` | 13-19 digits with Luhn checksum | Allowlistable but rarely needed |

**Detection priority:** credit-card (Luhn-validated) > NPWP punctuated > KTP > NPWP bare > bank-account > phone > email. Non-overlapping; the matcher claims byte ranges as it walks so a 16-digit credit card never gets re-tagged as KTP.

## Brand voice enforcement (per CLAUDE.md voice rules)

- **Banned words** (auto-stripped): `basically`, `just`, `literally`, `honestly`, `kind of`, `pretty much`, `revolutionary`, `disrupt`, `10x`, `game-changer` (+ `game changer`), `next-level` (+ `next level`).
- **Exclamation marks** (auto-replaced with periods).
- **Address form** (auto-rewritten to `kamu`): `Anda`, `anda`, `lo`, `gue`.

The rewriter collapses the whitespace artifacts that result from word-strip (double spaces, leading-of-line indent) so the output reads naturally.

## Allowlist

```ts
// services/transform-llm-output/src/allowlist.ts
export const ALLOWLIST = [
  {
    personaSlug: 'business-director',
    skillId: 'incorporation-advisor',
    allowedPii: ['npwp'],
  },
  {
    personaSlug: 'business-director',
    skillId: 'compliance-checker',
    allowedPii: ['npwp', 'ktp'],
  },
]
```

Allowlisted matches are still REPORTED in `result.piiMatches` (audit trail) but pass through unredacted in `result.text`.

To add a new allowlist entry: edit `src/allowlist.ts` + add a test case asserting the bypass.

## Hermes plugin shape

The current export is a pure function. To wire as a Hermes plugin, wrap the function in whatever IO shape Hermes' `transform_llm_output` hook expects (Phase 4.5+ work — depends on which Hermes version we end up pinning). For now, a customer's VPS-side bundle entry can import + call directly:

```ts
// agent-packs/<persona>/skills/<id>/SKILL.md handler-side glue
import { transformLlmOutput } from '@weuseai/transform-llm-output'

const cleaned = transformLlmOutput({
  text: rawLlmOutput,
  personaSlug: 'doc-expert',
  skillId: 'invoice-generator',
  emissionContext: 'email-send',
})

return cleaned.text
```

## Testing

```bash
npm test
```

47 unit tests cover PII patterns, voice rules, allowlist, end-to-end transforms, and edge cases (overlapping patterns, missing context fields, perf monitoring).

## Status

- Phase 4-4 v0 ships PII + voice + allowlist with full test coverage.
- Phase 4.5+ evolves to per-context detection (chat-reply soft-flag vs external-surface hard-replace).
- Phase 5+ migrates to a Hermes plugin manifest entry once we're deploying transforms via the bundle pull mechanism rather than per-skill imports.
