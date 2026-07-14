/**
 * Batch A4 (2026-05-13): pair-code expiry reassurance copy.
 *
 * Audit doc: docs/audit/2026-05-13-customer-flow-hardening.md §P1-CF-7.
 *
 * Pre-fix: when the 30-min pair-code expires, onboarding.html shows
 *   "Kode kadaluarsa." + button "Mulai ulang"
 * — terse, with no explanation that:
 *   (a) expiry is by design (security), not a customer mistake
 *   (b) the next code is fast to regenerate (~5 sec)
 *
 * Audit-locked copy:
 *   "Kode pasangan kadaluarsa otomatis setelah 30 menit untuk
 *    keamanan. Mulai ulang untuk dapat kode baru — cepat, sekitar
 *    5 detik."
 *
 * The "Mulai ulang" button stays — same recovery action, just
 * better-framed status text above it.
 *
 * Source-grep only — onboarding.html is vanilla JS.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as path from 'node:path'

const ONBOARDING = path.resolve(process.cwd(), 'onboarding.html')

// ─── 1. Audit-locked expiry copy ──────────────────────────────────────

test('A4: pair-code expired copy explains 30-min security policy', () => {
  const src = fs.readFileSync(ONBOARDING, 'utf8')
  // Customer needs to know expiry is BY DESIGN, not a mistake.
  assert.match(
    src,
    /kadaluarsa otomatis setelah 30 menit/i,
    'expired copy must say "kadaluarsa otomatis setelah 30 menit"',
  )
  assert.match(
    src,
    /untuk keamanan/i,
    'expired copy must include "untuk keamanan" reassurance',
  )
})

test('A4: pair-code expired copy promises 5-second regeneration', () => {
  const src = fs.readFileSync(ONBOARDING, 'utf8')
  // The "cepat, sekitar 5 detik" framing removes hesitation: customer
  // knows clicking "Mulai ulang" is a quick recovery, not a long ordeal.
  assert.match(
    src,
    /sekitar\s+5\s+detik/i,
    'expired copy must promise ~5 second regeneration',
  )
})

test('A4: bare "Kode kadaluarsa." string is replaced (drift gate)', () => {
  const src = fs.readFileSync(ONBOARDING, 'utf8')
  // The pre-A4 terse string ("Kode kadaluarsa.") was at
  // onboarding.html:1642 inside renderExpired(). The new copy starts
  // with "Kode pasangan kadaluarsa otomatis..." so a literal regex on
  // the old string + a period at the end is what we ban.
  //
  // Note: this is the renderExpired() inline string only. The label
  // ABOVE the countdown ("Kode kadaluarsa dalam: …") is a different
  // surface (active-countdown label, not the expired state) and stays.
  // We scope the check to the renderExpired function body.
  const fnMatch = src.match(/function renderExpired\(\)\s*\{[\s\S]+?\n\s{4}\}/)
  assert.ok(fnMatch, 'must find renderExpired() function body')
  if (fnMatch) {
    // Inside renderExpired the OLD terse string must no longer appear.
    assert.equal(
      />Kode kadaluarsa\.</.test(fnMatch[0]),
      false,
      'renderExpired() must not show bare ">Kode kadaluarsa.<" anymore',
    )
    // The new copy lead-in must appear in renderExpired specifically.
    assert.match(
      fnMatch[0],
      /Kode pasangan kadaluarsa otomatis/i,
      'renderExpired() must use the new "Kode pasangan kadaluarsa otomatis" copy',
    )
  }
})

// ─── 2. "Mulai ulang" button preserved ────────────────────────────────

test('A4: "Mulai ulang" button preserved (recovery action unchanged)', () => {
  const src = fs.readFileSync(ONBOARDING, 'utf8')
  const fnMatch = src.match(/function renderExpired\(\)\s*\{[\s\S]+?\n\s{4}\}/)
  assert.ok(fnMatch, 'renderExpired() body findable')
  if (fnMatch) {
    assert.match(
      fnMatch[0],
      /id=["']rotate-now["']/,
      'rotate-now button id must remain',
    )
    assert.match(
      fnMatch[0],
      /Mulai ulang/,
      'Mulai ulang button label must remain',
    )
  }
})

test('A4: rotate-now click handler still wired (no behaviour regression)', () => {
  const src = fs.readFileSync(ONBOARDING, 'utf8')
  // The click handler that rotates the code must remain. This is a
  // structural test pinning the integration point so future copy
  // tweaks don't accidentally break the button.
  assert.match(
    src,
    /getElementById\(['"]rotate-now['"]\)\??\.addEventListener\(\s*['"]click['"]/,
    'rotate-now button must have a click listener',
  )
})

// ─── 3. Brand-voice gates on new copy ─────────────────────────────────

test('A4: new expired copy passes brand-voice rules', () => {
  const src = fs.readFileSync(ONBOARDING, 'utf8')
  const fnMatch = src.match(/function renderExpired\(\)\s*\{[\s\S]+?\n\s{4}\}/)
  assert.ok(fnMatch, 'renderExpired() body findable for voice check')
  if (fnMatch) {
    // No banned marketing words inside the function body.
    for (const word of ['basically', 'literally', 'honestly', '10x', 'revolutionary', 'game-changer', 'next-level']) {
      assert.equal(
        fnMatch[0].toLowerCase().includes(word),
        false,
        `expired copy must not contain banned word: ${word}`,
      )
    }
    // No exclamation marks in the visible HTML — extract text content
    // candidates (string literals + textContent assignments).
    const strings = fnMatch[0].match(/['"][^'"]{5,}['"]/g) ?? []
    for (const s of strings) {
      assert.equal(
        s.includes('!'),
        false,
        `string in renderExpired contains "!": ${s.slice(0, 80)}`,
      )
    }
  }
})

// ─── 4. Scope guard ──────────────────────────────────────────────────

test('A4: scope guard — countdown-label surface ("Kode kadaluarsa dalam:") unchanged', () => {
  const src = fs.readFileSync(ONBOARDING, 'utf8')
  // The label ABOVE the live countdown is a different surface and
  // stays. If a future PR accidentally removes/changes it under
  // pretense of "A4", this gate fires.
  assert.match(
    src,
    /Kode kadaluarsa dalam:\s*<span data-mmss>/,
    'countdown label "Kode kadaluarsa dalam: <mmss>" must remain unchanged',
  )
})
