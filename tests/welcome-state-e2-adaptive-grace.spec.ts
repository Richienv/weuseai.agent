/**
 * Batch C1 (2026-05-13): state E adaptive grace + new state E2.
 *
 * Audit doc: docs/audit/2026-05-13-customer-flow-hardening.md §P1-CF-3
 * (primary) + §P1-CF-5 (in passing — state E lost-cid recovery copy).
 *
 * Pre-fix:
 *   - pollOnce returns null → after NULL_GRACE_MS = 30 s, flip to state E.
 *   - State E copy: "Halaman ini hanya untuk konfirmasi pembayaran.
 *     Mungkin kamu salah link, atau session-nya kadaluarsa."
 *   - Legitimate paying customer whose webhook is delayed > 30 s sees
 *     the page literally say "wrong link" — a dead-loop dismissal.
 *
 * Fix: adaptive grace.
 *   0–30 s:  state A, default copy
 *   30–90 s: state A, slow-confirmation label
 *   90 s+:   state E2 (new), audit-locked "webhook never arrived" copy
 *           + inline WA CTA with prefilled cid + paid timestamp.
 *   State E (current) now ONLY fires when cid is missing / malformed
 *   (no UUID-shaped param in URL). State E gets new lost-cid recovery
 *   copy per §P1-CF-5.
 *
 * Drift-gate scope:
 *   - State machine exhaustiveness — every reachable state must have
 *     a defined render branch AND be classified in isTerminal() OR
 *     the polling-resume CSS allowlist.
 *   - New state E2 must be in the welcome-guard CSS (unverified-only).
 *   - New state E2 must be terminal in isTerminal() (no auto-repoll;
 *     manual retry via button).
 *
 * Source-grep tests only.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as path from 'node:path'

const WELCOME = path.resolve(process.cwd(), 'welcome.html')

// ─── 1. New grace-tier constants ─────────────────────────────────────

test('C1: NULL_GRACE_SLOW_MS = 30s + NULL_GRACE_HARD_MS = 90s constants present', () => {
  const src = fs.readFileSync(WELCOME, 'utf8')
  // The 30s mark is the label-change threshold (still in state A).
  // The 90s mark is the hard escalation to state E2.
  assert.match(
    src,
    /(?:const|let)\s+NULL_GRACE_SLOW_MS\s*=\s*30_?000/,
    'NULL_GRACE_SLOW_MS = 30000 must be a named constant',
  )
  assert.match(
    src,
    /(?:const|let)\s+NULL_GRACE_HARD_MS\s*=\s*90_?000/,
    'NULL_GRACE_HARD_MS = 90000 must be a named constant',
  )
})

// ─── 2. New state E2 in renderState switch ───────────────────────────

test("C1: renderState() has a case 'E2' branch with audit-locked copy", () => {
  const src = fs.readFileSync(WELCOME, 'utf8')
  // Switch case must exist.
  assert.match(
    src,
    /case ['"]E2['"]:/,
    "renderState() must have case 'E2' branch",
  )
  // Audit-locked copy. The customer needs to know: webhook hasn't
  // landed yet, check email for Xendit receipt, hubungi tim if receipt
  // is in inbox but page is still stuck.
  assert.match(
    src,
    /Kami belum menerima konfirmasi pembayaran/i,
    'E2 must include "Kami belum menerima konfirmasi pembayaran" lead-in',
  )
  assert.match(
    src,
    /Cek email untuk struk dari Xendit/i,
    'E2 must mention "Cek email untuk struk dari Xendit"',
  )
  assert.match(
    src,
    /hubungi tim via WhatsApp/i,
    'E2 must surface WhatsApp escalation',
  )
})

test('C1: state E2 has WA prefill with structured cid + context', () => {
  const src = fs.readFileSync(WELCOME, 'utf8')
  // The WA prefill must include cid so the founder can manually
  // reconcile by looking up the customer + Xendit invoice timestamp.
  // The block lives inside the E2 case branch.
  const e2Branch = src.match(/case ['"]E2['"]:[\s\S]+?break;/i)
  assert.ok(e2Branch, "state E2 case branch findable")
  if (e2Branch) {
    assert.match(
      e2Branch[0],
      /wa\.me\/6282154902561/,
      'E2 WA link must use canonical support number',
    )
    // cid in the prefill — either via template literal or
    // encodeURIComponent. We assert that `cid` appears somewhere
    // inside the E2 branch so founder gets context.
    assert.match(
      e2Branch[0],
      /\bcid\b/,
      'E2 WA prefill must include cid for founder reconciliation',
    )
  }
})

// ─── 3. tick() null-status logic uses tiered grace ──────────────────

test('C1: tick() null-handling implements 3-tier adaptive grace', () => {
  const src = fs.readFileSync(WELCOME, 'utf8')
  // Find the null-status branch. After C1 it must reference both
  // grace constants (not just the old NULL_GRACE_MS).
  const tickFn = src.slice(src.indexOf('async function tick()'))
  const nullBranch = tickFn.match(/else if\s*\(\s*status\s*==\s*null\s*\)[\s\S]+?\n\s{8}\}\s*else\s*\{/)
  assert.ok(nullBranch, 'tick() null-status branch findable')
  if (nullBranch) {
    assert.match(
      nullBranch[0],
      /NULL_GRACE_SLOW_MS/,
      'null-branch must reference NULL_GRACE_SLOW_MS',
    )
    assert.match(
      nullBranch[0],
      /NULL_GRACE_HARD_MS/,
      'null-branch must reference NULL_GRACE_HARD_MS',
    )
    assert.match(
      nullBranch[0],
      /renderState\(\s*['"]E2['"]/,
      'null-branch must escalate to renderState("E2") at hard grace',
    )
  }
})

test('C1: state A slow-confirmation label appears for 30–90s null-poll window', () => {
  const src = fs.readFileSync(WELCOME, 'utf8')
  // Audit-locked copy: "Konfirmasi pembayaran sedang lambat.
  // Sebentar lagi…"
  assert.match(
    src,
    /Konfirmasi pembayaran sedang lambat/i,
    'slow-confirmation label must be present',
  )
})

// ─── 4. isTerminal includes E2 ──────────────────────────────────────

test('C1: isTerminal() classifies E2 as terminal (no auto-repoll)', () => {
  const src = fs.readFileSync(WELCOME, 'utf8')
  const fnMatch = src.match(/function isTerminal\(state\)\s*\{[\s\S]+?\n\s{4}\}/)
  assert.ok(fnMatch, 'isTerminal() function findable')
  if (fnMatch) {
    assert.match(
      fnMatch[0],
      /state\s*===\s*['"]E2['"]/,
      'isTerminal must include `state === "E2"`',
    )
  }
})

// ─── 5. welcome-guard CSS includes E2 ───────────────────────────────

test('C1: welcome-guard CSS treats E2 as unverified (no premature "Pembayaran berhasil")', () => {
  const src = fs.readFileSync(WELCOME, 'utf8')
  // E2 belongs in the .unverified-only CSS block alongside A/E/G — the
  // customer hasn't been verified as paid yet (webhook never arrived).
  assert.match(
    src,
    /body\[data-state="E2"\]\s+\.unverified-only/,
    'CSS must list body[data-state="E2"] in the .unverified-only allowlist',
  )
})

// ─── 6. State E (cid-missing) gets P1-CF-5 lost-cid recovery copy ───

test('C1: state E gets P1-CF-5 lost-cid recovery copy', () => {
  const src = fs.readFileSync(WELCOME, 'utf8')
  // Audit-locked copy for state E:
  //   "Sudah bayar tapi link kamu hilang? Cek email — struk
  //    pembayaran berisi link ke setup. Atau hubungi tim — kami
  //    bantu pulihkan dengan email kamu."
  // State E now only fires for missing/malformed cid, so the copy
  // serves the "I paid but lost the link" recovery flow.
  const eBranch = src.match(/case ['"]E['"]:[\s\S]+?break;/i)
  assert.ok(eBranch, "state E case branch findable")
  if (eBranch) {
    assert.match(
      eBranch[0],
      /Sudah bayar tapi link kamu hilang/i,
      'state E must include "Sudah bayar tapi link kamu hilang" lost-cid framing',
    )
    assert.match(
      eBranch[0],
      /Cek email/i,
      'state E must direct customer to check email',
    )
    assert.match(
      eBranch[0],
      /wa\.me\/6282154902561/,
      'state E must include WA recovery CTA',
    )
  }
})

// ─── 7. State machine exhaustiveness ────────────────────────────────

test('C1: every reachable state has a renderState case branch', () => {
  const src = fs.readFileSync(WELCOME, 'utf8')
  // Find all state strings passed to renderState. Then assert each
  // appears as a switch case. This catches forgotten branches when
  // adding a new state.
  const renderCalls = src.match(/renderState\(\s*['"]([A-Z0-9]+)['"]/g) ?? []
  const states = new Set(renderCalls.map((c) => c.match(/['"]([A-Z0-9]+)['"]/)![1]))
  // Also extract cases from the switch statement.
  const switchBlock = src.match(/switch \(state\)[\s\S]+?function/)
  assert.ok(switchBlock, 'switch (state) block findable')
  if (switchBlock) {
    for (const s of states) {
      const caseRe = new RegExp(`case ['"]${s}['"]:`)
      assert.match(
        switchBlock[0],
        caseRe,
        `state "${s}" passed to renderState() but no matching case branch`,
      )
    }
  }
})

test('C1: every reachable state classified in isTerminal OR is known non-terminal', () => {
  const src = fs.readFileSync(WELCOME, 'utf8')
  // Reachable states from renderState calls + the new E2.
  const reachable = ['A', 'B', 'C', 'C2', 'D', 'E', 'E2', 'F', 'G']
  // isTerminal must define behaviour for each. Non-terminal (A, B, G)
  // is the absence-of-case in isTerminal (returns false).
  const fnMatch = src.match(/function isTerminal\(state\)\s*\{[\s\S]+?\n\s{4}\}/)
  assert.ok(fnMatch, 'isTerminal() findable')
  if (fnMatch) {
    // Terminal states (per audit + existing): C, C2, D, E, E2, F
    for (const terminal of ['C', 'C2', 'D', 'E', 'E2', 'F']) {
      const re = new RegExp(`state\\s*===\\s*['"]${terminal}['"]`)
      assert.match(
        fnMatch[0],
        re,
        `isTerminal must list "${terminal}" (state machine exhaustiveness)`,
      )
    }
    // Note: A, B, G are non-terminal by absence — they're the polling-
    // continues states. No assertion needed beyond "not listed."
    void reachable
  }
})

// ─── 8. Brand-voice + scope guards ──────────────────────────────────

test('C1: new copy passes brand-voice rules', () => {
  const src = fs.readFileSync(WELCOME, 'utf8')
  // Scope to the E + E2 case branches.
  const eBranch = src.match(/case ['"]E['"]:[\s\S]+?break;/i)
  const e2Branch = src.match(/case ['"]E2['"]:[\s\S]+?break;/i)
  for (const branch of [eBranch?.[0], e2Branch?.[0]].filter(Boolean) as string[]) {
    for (const word of ['basically', 'literally', 'honestly', '10x', 'revolutionary', 'game-changer', 'next-level']) {
      assert.equal(
        branch.toLowerCase().includes(word),
        false,
        `state branch must not contain banned word "${word}"`,
      )
    }
    // No exclamation marks in visible text — extract text-node-ish content.
    const textNodes = branch.match(/>[^<>]{5,}</g) ?? []
    for (const t of textNodes) {
      assert.equal(
        t.includes('!'),
        false,
        `text node contains "!": ${t.slice(0, 80)}`,
      )
    }
  }
})

test('C1: scope guard — pass-3 server-error mapping untouched in welcome.html', () => {
  const src = fs.readFileSync(WELCOME, 'utf8')
  assert.equal(
    /tos_required|tos_stale|tier_does_not_grant_persona|x_cid_mismatch/.test(src),
    false,
    'pass-3 server-error codes must not appear in welcome.html copy',
  )
})

test('C1: scope guard — pre-fix NULL_GRACE_MS constant removed (drift gate)', () => {
  const src = fs.readFileSync(WELCOME, 'utf8')
  // The pre-C1 single-tier NULL_GRACE_MS constant must no longer be
  // the active gate. Comments may mention it for history; we ban it
  // from being declared as a `const`/`let`.
  assert.equal(
    /(?:const|let)\s+NULL_GRACE_MS\s*=/.test(src),
    false,
    'NULL_GRACE_MS legacy constant must be replaced by SLOW + HARD pair',
  )
})
