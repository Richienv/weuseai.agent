/**
 * Batch A3 (2026-05-13): pending_provision / capacity-exhausted copy.
 *
 * Audit doc: docs/audit/2026-05-13-customer-flow-hardening.md §P1-CF-6.
 *
 * Pre-fix: when provisioning returns 503 vps_capacity_exhausted (Vultr +
 * DO both exhausted), onboarding.html surfaced:
 *   "Server VPS lagi penuh. Ini bukan kesalahan kamu — coba refresh
 *    halaman ini dalam 5–10 menit, atau hubungi tim di WhatsApp."
 * Two problems:
 *   1. "Server VPS" leaks a backend tech name to the customer (P2-CF-8
 *      flagged this in the same audit).
 *   2. No acknowledgment that retry IS automatic — the audit-recommended
 *      Phase 1 framing tells customers they're queued, gives a 3-min
 *      retry cadence, and promises email contact after 30 min.
 *
 * D1 (retry worker, P1-CF-6 Phase 2) is queued separately. Until D1
 * lands, the 30-min email promise is honored by founder-manual
 * intervention (audit explicitly notes this Phase 1 → Phase 2 path).
 *
 * Source-grep only — onboarding.html is vanilla JS.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as path from 'node:path'

const ONBOARDING = path.resolve(process.cwd(), 'onboarding.html')

// ─── 1. Backend jargon removed (P2-CF-8 sub-fix) ─────────────────────

test('A3: capacity-exhausted message must not contain "Server VPS" (P2-CF-8 jargon leak)', () => {
  const src = fs.readFileSync(ONBOARDING, 'utf8')
  // Locate the vps_capacity_exhausted branch and inspect its showSubmitError
  // call. The leak we're killing is the literal "Server VPS" phrase.
  const branch = src.match(/vps_capacity_exhausted[\s\S]{0,500}showSubmitError\(\s*['"][^'"]+['"]/i)
  assert.ok(branch, 'must find vps_capacity_exhausted → showSubmitError call site')
  if (branch) {
    assert.equal(
      /Server\s+VPS/i.test(branch[0]),
      false,
      'capacity message must not contain "Server VPS" — backend tech name leak',
    )
  }
})

// ─── 2. New audit-locked copy lands ─────────────────────────────────

test('A3: capacity-exhausted message starts with "Sistem infrastruktur sedang ramai"', () => {
  const src = fs.readFileSync(ONBOARDING, 'utf8')
  // Audit §P2-CF-8 corrected lead-in. Calm-premium framing that
  // signals "not your fault" without naming infrastructure layer.
  assert.match(
    src,
    /Sistem infrastruktur sedang ramai/i,
    'capacity message must use the P2-CF-8 corrected lead-in',
  )
})

test('A3: capacity-exhausted message acknowledges automatic retry cadence', () => {
  const src = fs.readFileSync(ONBOARDING, 'utf8')
  // Audit §P1-CF-6 Phase 1: customer needs to know retry IS automatic
  // and the cadence (every 3 min). Pre-fix had no retry framing.
  assert.match(
    src,
    /dijadwalkan ulang otomatis/i,
    'capacity message must say "dijadwalkan ulang otomatis"',
  )
  assert.match(
    src,
    /(?:coba lagi setiap|setiap)\s+3\s+menit/i,
    'capacity message must specify the 3-minute retry cadence',
  )
})

test('A3: capacity-exhausted message names the 30-minute email fallback', () => {
  const src = fs.readFileSync(ONBOARDING, 'utf8')
  // Audit §P1-CF-6 Phase 1: 30-min window before founder/D1-worker emails
  // the customer. This is the trust signal that says "you won't sit
  // forever." Phase-1 honors this manually; D1 will automate.
  assert.match(
    src,
    /30\s+menit/i,
    'capacity message must mention the 30-minute fallback window',
  )
  assert.match(
    src,
    /email/i,
    'capacity message must reference email as the fallback contact',
  )
})

test('A3: capacity-exhausted message invites staying on page or checking email', () => {
  const src = fs.readFileSync(ONBOARDING, 'utf8')
  // Audit closing line: "Stay di halaman ini atau cek email untuk update."
  assert.match(
    src,
    /Stay di halaman ini|cek email/i,
    'capacity message must invite stay-on-page or check-email behavior',
  )
})

// ─── 3. WA CTA preserved (existing $submitErrorCta surface) ─────────

test('A3: showSubmitError still invoked with withCta=true (WA fallback preserved)', () => {
  const src = fs.readFileSync(ONBOARDING, 'utf8')
  // The audit Phase 1 framing keeps WA as the escape valve. Pre-fix
  // already passed withCta=true in this branch; this test pins it
  // against a future refactor that strips the CTA. Match the new
  // audit-locked first three words through to the closing `, true)`
  // of the showSubmitError call.
  assert.match(
    src,
    /Sistem infrastruktur sedang ramai[\s\S]{0,400},\s*true\s*\)/,
    'showSubmitError(...Sistem infrastruktur...) must still pass withCta=true',
  )
})

// ─── 4. Brand-voice gates ───────────────────────────────────────────

test('A3: new copy passes brand-voice rules (no banned words, no exclamation marks)', () => {
  const src = fs.readFileSync(ONBOARDING, 'utf8')
  // Scope to the vps_capacity_exhausted branch (~400 char window
  // around the new message string).
  const branch = src.match(/vps_capacity_exhausted[\s\S]{0,500}showSubmitError\(\s*['"][\s\S]+?['"]\s*,/i)
  assert.ok(branch, 'capacity-exhausted branch findable for voice check')
  if (branch) {
    for (const word of ['basically', 'literally', 'honestly', '10x', 'revolutionary', 'game-changer', 'next-level']) {
      assert.equal(
        branch[0].toLowerCase().includes(word),
        false,
        `capacity message must not contain banned word: ${word}`,
      )
    }
    // No exclamation marks INSIDE the string literal (the surrounding
    // JS may have `!` operators which are fine).
    const stringLiteral = branch[0].match(/showSubmitError\(\s*(['"][\s\S]+?['"])\s*,/)
    if (stringLiteral) {
      assert.equal(
        stringLiteral[1].includes('!'),
        false,
        'capacity message string literal must not contain exclamation marks',
      )
    }
  }
})

// ─── 5. Scope guard ─────────────────────────────────────────────────

test('A3: scope guard — vps_capacity_exhausted branch still triggered by 503 + matching error code', () => {
  const src = fs.readFileSync(ONBOARDING, 'utf8')
  // The branch condition itself stays — A3 only changes the message,
  // not the trigger. If someone deletes or weakens the 503 check, this
  // gate fires.
  assert.match(
    src,
    /r\.status\s*===\s*503\s*&&\s*data\??\.error\s*===\s*['"]vps_capacity_exhausted['"]/,
    'branch must still trigger on r.status === 503 && error === vps_capacity_exhausted',
  )
})
