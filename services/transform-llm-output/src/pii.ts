// PII detection + redaction.
//
// Patterns:
//   NPWP — XX.XXX.XXX.X-XXX.XXX (Indonesian tax ID, 15 digits with
//          punctuation). Also accepts the bare 15-digit form.
//   KTP — 16 consecutive digits (Nomor Induk Kependudukan). Strict
//          16; 17+ falls into bank_account_id territory.
//   phone_id — Indonesian phone:
//          +628xxxx... (E.164) or 628xxxx (no plus) or 08xxxxx
//          Total digits 10-13 (post-prefix-strip).
//   email — RFC-5321-ish: word chars, '.', '+', '_', '-' before '@';
//          word chars + '.' after; 2-24 char TLD.
//   bank_account_id — 10-16 consecutive digits (BCA 10, Mandiri 13,
//          BRI 15, BNI 10, etc.). Avoid overlap with KTP (16 strict).
//   credit_card — 13-19 digits with Luhn check (verify so we don't
//          flag arbitrary phone-like patterns).
//
// Order of detection matters: longer / more specific patterns run
// first so a 16-digit credit card doesn't get tagged as KTP.

import type { PiiMatch, PiiKind } from './types.ts'

/** Regex per kind. Order in REDACTORS list = match priority. */
type Pattern = {
  kind: PiiKind
  regex: RegExp
  /** Optional post-match validator (e.g. Luhn for credit cards). */
  validate?: (matched: string) => boolean
}

const NPWP_RE = /\b\d{2}\.\d{3}\.\d{3}\.\d-\d{3}\.\d{3}\b/g
const NPWP_BARE_RE = /\b\d{15}\b/g
const KTP_RE = /\b\d{16}\b/g
const PHONE_RE =
  /(?:\+62|62|0)[-\s]?8\d{1,2}[-\s]?\d{3,4}[-\s]?\d{3,4}\b/g
const EMAIL_RE =
  /\b[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,24}\b/g
const BANK_RE = /\b\d{10,15}\b/g
const CC_RE = /\b\d{13,19}\b/g

const PATTERNS: Pattern[] = [
  // 1. Email first (never overlaps with digit patterns; cheapest).
  { kind: 'email', regex: EMAIL_RE },
  // 2. Credit cards (Luhn-validated; very specific 13-19 digits).
  { kind: 'credit_card', regex: CC_RE, validate: luhnValid },
  // 3. NPWP punctuated form (has its own non-digit separators).
  { kind: 'npwp', regex: NPWP_RE },
  // 4. Phone BEFORE bank/KTP/NPWP-bare — prefix-discriminator means
  //    the phone regex matches "081234567890" or "+6281234567890"
  //    while bank/KTP/NPWP-bare are pure-digit and would otherwise
  //    win the byte-range race.
  { kind: 'phone_id', regex: PHONE_RE },
  // 5. KTP (16 digits exact).
  { kind: 'ktp', regex: KTP_RE },
  // 6. NPWP bare (15 digits — not also 16).
  { kind: 'npwp', regex: NPWP_BARE_RE },
  // 7. Bank account (10-15 digits) — last digit-only pattern; catches
  //    everything not already claimed.
  { kind: 'bank_account_id', regex: BANK_RE },
]

/** Replacement template per kind. */
const REPLACEMENT: Record<PiiKind, string> = {
  npwp: '[NPWP_REDACTED]',
  ktp: '[KTP_REDACTED]',
  phone_id: '[PHONE_REDACTED]',
  email: '[EMAIL_REDACTED]',
  bank_account_id: '[BANK_ACCOUNT_REDACTED]',
  credit_card: '[CREDIT_CARD_REDACTED]',
}

/** Detect all PII matches in `text`. Non-overlapping; later patterns
 *  skip ranges already claimed by earlier ones. */
export function detectPii(text: string): PiiMatch[] {
  const claimed: { start: number; end: number }[] = []
  const matches: PiiMatch[] = []

  for (const pat of PATTERNS) {
    // Reset regex state — we use /g.
    pat.regex.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = pat.regex.exec(text)) !== null) {
      const start = m.index
      const end = m.index + m[0].length
      if (overlapsClaimed(claimed, start, end)) continue
      if (pat.validate && !pat.validate(m[0])) continue
      // Phone disambiguation: when KTP/CC/bank already claimed a 13-19
      // digit block, the phone regex shouldn't fire INSIDE that block.
      // Above overlap check handles it.
      claimed.push({ start, end })
      matches.push({
        kind: pat.kind,
        matched: m[0],
        replacement: REPLACEMENT[pat.kind],
        offset: start,
      })
    }
  }

  // Return matches sorted by offset for stable replacement.
  return matches.sort((a, b) => a.offset - b.offset)
}

/** Apply redaction: replace each match with its replacement marker.
 *  Allowlisted kinds are passed through unchanged but still reported
 *  in the matches array so the audit log captures them. */
export function redactPii(
  text: string,
  matches: PiiMatch[],
  allowedKinds: readonly PiiKind[],
): string {
  if (matches.length === 0) return text
  const allow = new Set(allowedKinds)
  let out = ''
  let cursor = 0
  for (const m of matches) {
    out += text.slice(cursor, m.offset)
    if (allow.has(m.kind)) {
      out += m.matched
    } else {
      out += m.replacement
    }
    cursor = m.offset + m.matched.length
  }
  out += text.slice(cursor)
  return out
}

function overlapsClaimed(
  claimed: { start: number; end: number }[],
  start: number,
  end: number,
): boolean {
  for (const c of claimed) {
    if (start < c.end && end > c.start) return true
  }
  return false
}

/** Luhn checksum — for credit-card validation.
 *  Returns true iff the digit sum modulo 10 is zero. */
export function luhnValid(s: string): boolean {
  const digits = s.replace(/\D/g, '')
  if (digits.length < 13 || digits.length > 19) return false
  let sum = 0
  let alt = false
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = digits.charCodeAt(i) - 48
    if (alt) {
      n *= 2
      if (n > 9) n -= 9
    }
    sum += n
    alt = !alt
  }
  return sum % 10 === 0
}
