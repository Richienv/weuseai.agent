// Brand-voice enforcement.
//
// Rules (per CLAUDE.md):
//   - Banned words (must NOT appear): basically, just, literally,
//     honestly, kind of, pretty much, revolutionary, disrupt, 10x,
//     game-changer, next-level.
//   - Zero exclamation marks in body copy. Max 1 per caption (the
//     plugin auto-strips ALL since we can't distinguish body vs caption
//     server-side; the persona's own SOUL.md already nudges away from
//     them).
//   - Address form: kamu (banned: Anda, lo, gue). Auto-rewrite "Anda"
//     to "kamu" (case-preserving) — softer correction than refusal.
//
// Strategy: detect violations + auto-correct. Findings reported in
// VoiceFinding[] so the audit log can flag persistent offenders.

import type { VoiceFinding } from './types.ts'

const BANNED_WORDS = [
  'basically',
  'just',
  'literally',
  'honestly',
  'kind of',
  'pretty much',
  'revolutionary',
  'disrupt',
  '10x',
  'game-changer',
  'game changer',
  'next-level',
  'next level',
] as const

/** Safer banned-words list — these get FLAGGED but not stripped, so
 *  the LLM-output linter doesn't fight legitimate quoting (e.g. a
 *  customer asking the agent to summarize an article that uses
 *  "disrupt"). Currently empty; tune Phase 4.5+. */
const BANNED_WORDS_SOFT: readonly string[] = []

/** Detect voice findings without modifying. */
export function detectVoiceFindings(text: string): VoiceFinding[] {
  const findings: VoiceFinding[] = []

  // Banned words — match whole words, case-insensitive.
  for (const word of BANNED_WORDS) {
    const re = new RegExp(`\\b${escapeRegex(word)}\\b`, 'gi')
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) !== null) {
      findings.push({ kind: 'banned_word', word: m[0], offset: m.index })
    }
  }

  // Soft banned (currently no-op).
  for (const word of BANNED_WORDS_SOFT) {
    const re = new RegExp(`\\b${escapeRegex(word)}\\b`, 'gi')
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) !== null) {
      findings.push({
        kind: 'banned_register',
        phrase: m[0],
        offset: m.index,
      })
    }
  }

  // Exclamation marks in body — zero allowed.
  const exclamRe = /!/g
  let exm: RegExpExecArray | null
  while ((exm = exclamRe.exec(text)) !== null) {
    findings.push({ kind: 'exclamation', offset: exm.index })
  }

  // Address form: 'Anda', 'lo', 'gue' as standalone words.
  const formRe = /\b(Anda|anda|lo|gue)\b/g
  let fm: RegExpExecArray | null
  while ((fm = formRe.exec(text)) !== null) {
    findings.push({
      kind: 'address_form',
      matched: fm[0],
      offset: fm.index,
      suggestion: 'kamu',
    })
  }

  return findings.sort((a, b) => a.offset - b.offset)
}

/** Apply voice corrections:
 *  - Banned words: replaced with empty string + collapse double-spaces
 *    around them. Auto-strip is heavy-handed but rare-event; the LLM
 *    rarely emits these once the SOUL.md voice is locked.
 *  - Exclamations: replace with period.
 *  - Address form: replace with 'kamu' (case-preserving).
 *
 *  Returns the rewritten text. */
export function rewriteVoice(text: string): string {
  let out = text

  // Strip banned words. Whole-word, case-insensitive.
  for (const word of BANNED_WORDS) {
    const re = new RegExp(`\\b${escapeRegex(word)}\\b`, 'gi')
    out = out.replace(re, '')
  }

  // Replace exclamations with periods. Avoid creating "..":
  // ! at end of sentence → .
  out = out.replace(/!+/g, '.')

  // Collapse "..." or " . " runs that resulted from substitutions.
  out = out.replace(/\.{2,}/g, '.')
  out = out.replace(/[ \t]+\./g, '.')
  // Collapse double spaces that resulted from banned-word strip.
  out = out.replace(/[ \t]{2,}/g, ' ')
  // Strip leading whitespace on lines that lost their first word.
  out = out.replace(/(^|\n)[ \t]+/g, '$1')

  // Address form: Anda → kamu (case-preserving).
  out = out.replace(/\bAnda\b/g, 'kamu')
  out = out.replace(/\banda\b/g, 'kamu')
  out = out.replace(/\blo\b/g, 'kamu')
  out = out.replace(/\bgue\b/g, 'kamu')

  return out
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Exposed for tests + diagnostics. */
export const _BANNED_WORDS = BANNED_WORDS
