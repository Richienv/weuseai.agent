/**
 * Batch B1 (2026-05-13): TIMEOUT_MS anchored to subscription.started_at.
 *
 * Audit doc: docs/audit/2026-05-13-customer-flow-hardening.md §P1-CF-4.
 *
 * Pre-fix bug:
 *   if (Date.now() - startedAt > TIMEOUT_MS) renderState('F')
 *   where `startedAt = Date.now()` at page load.
 *
 * The 15-min timeout was wall-clock from page load, not from when the
 * subscription was actually created. Two pathological cases:
 *   (a) Customer paid 10 min ago, lost the tab, reopened welcome.html
 *       via email link — they got a fresh 15 min from THIS load even
 *       though the server-side window is half gone.
 *   (b) Customer paid 20 min ago and JUST opened welcome.html — got
 *       15 fresh minutes even though the system had already given up.
 *
 * Fix: anchor the timeout to `subscription.started_at` returned by
 * pollOnce. The 5-sec page-load fallback `LONGER_THAN_USUAL_MS` panel
 * (PR #95) stays page-relative — different surface, different concern.
 *
 * Telemetry: `console.log('[welcome] state_F_reached', { cid,
 * elapsedMinutes })` fires when state F is reached, so the founder
 * can see how many customers hit the timeout cliff.
 *
 * Source-grep tests only — welcome.html is vanilla JS.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as path from 'node:path'

const WELCOME = path.resolve(process.cwd(), 'welcome.html')

// ─── 1. pollOnce returns started_at (not just status) ────────────────

test('B1: pollOnce returns { status, started_at } instead of bare status', () => {
  const src = fs.readFileSync(WELCOME, 'utf8')
  // The pollOnce function must surface started_at so tick() can anchor
  // the timeout against it. The SELECT already includes started_at — we
  // just have to return it.
  const fnMatch = src.match(/async function pollOnce\(\)[\s\S]+?\n\s{4}\}/)
  assert.ok(fnMatch, 'pollOnce function body findable')
  if (fnMatch) {
    // Old return shape: `return rows[0]?.status ?? null`. New shape
    // must include both status + started_at — assert that the function
    // returns a SHAPE (object), not a bare scalar.
    assert.match(
      fnMatch[0],
      /return\s+\{\s*[\s\S]*?started_at[\s\S]*?\}/,
      'pollOnce return value must include started_at',
    )
    assert.match(
      fnMatch[0],
      /return\s+\{\s*[\s\S]*?status[\s\S]*?\}/,
      'pollOnce return value must include status',
    )
  }
})

// ─── 2. Module-scope subscriptionStartedAtMs tracker ─────────────────

test('B1: subscriptionStartedAtMs tracker exists at module scope', () => {
  const src = fs.readFileSync(WELCOME, 'utf8')
  // Named variable so the anchor logic is greppable and so future
  // Sesi D audit work can reference it without spelunking.
  assert.match(
    src,
    /(?:let|var)\s+subscriptionStartedAtMs\s*=/,
    'subscriptionStartedAtMs must be a named module-scope variable',
  )
})

// ─── 3. Timeout check anchored to subscriptionStartedAtMs ────────────

test('B1: state-F timeout check uses subscriptionStartedAtMs (not page-load startedAt)', () => {
  const src = fs.readFileSync(WELCOME, 'utf8')
  // Three timeout checks exist in tick() for different status branches.
  // All three must now anchor to subscriptionStartedAtMs. The page-load
  // `startedAt` may still appear (LONGER_THAN_USUAL_MS panel uses it),
  // and the safer implementation uses `?? startedAt` as a first-poll
  // fallback (subscriptionStartedAtMs is null until first pollOnce
  // resolves). Either pattern counts as "anchored".
  const tickFn = src.slice(src.indexOf('async function tick()'))
  const matches = tickFn.match(
    /Date\.now\(\)\s*-\s*(?:subscriptionStartedAtMs|\(\s*subscriptionStartedAtMs\s*\?\?\s*startedAt\s*\))\s*>\s*TIMEOUT_MS/g,
  ) ?? []
  assert.ok(
    matches.length >= 3,
    `tick() must anchor TIMEOUT_MS check to subscriptionStartedAtMs in at least 3 branches (found ${matches.length})`,
  )
})

test('B1: pre-fix "Date.now() - startedAt > TIMEOUT_MS" pattern removed from tick()', () => {
  const src = fs.readFileSync(WELCOME, 'utf8')
  // Drift gate: the OLD anchor must not reappear in tick() against
  // TIMEOUT_MS. (The page-load startedAt is still legitimately used
  // for LONGER_THAN_USUAL_MS — different constant, no regression.)
  const tickFn = src.slice(
    src.indexOf('async function tick()'),
    src.indexOf('async function tick()') + 5000,
  )
  assert.equal(
    /Date\.now\(\)\s*-\s*startedAt\s*>\s*TIMEOUT_MS/.test(tickFn),
    false,
    'tick() must not use page-load startedAt against TIMEOUT_MS anymore',
  )
})

// ─── 4. F-state retry resets BOTH anchors ────────────────────────────

test('B1: F-state retry click resets subscriptionStartedAtMs (re-anchors next poll)', () => {
  const src = fs.readFileSync(WELCOME, 'utf8')
  // When user clicks "Cek lagi" on state F, we reset BOTH the page-
  // load `startedAt` (for LONGER_THAN_USUAL_MS) and the subscription
  // anchor (so the next pollOnce re-anchors). Without resetting the
  // subscription anchor, the user immediately re-hits F.
  const retryHandler = src.match(/retry-now['"][\s\S]{0,800}\}\s*\)\s*;/)
  assert.ok(retryHandler, 'retry-now click handler findable')
  if (retryHandler) {
    assert.match(
      retryHandler[0],
      /subscriptionStartedAtMs\s*=\s*null/,
      'F-state retry must reset subscriptionStartedAtMs to null',
    )
  }
})

// ─── 5. Telemetry breadcrumb on state F ─────────────────────────────

test('B1: state F reach fires console.log telemetry breadcrumb', () => {
  const src = fs.readFileSync(WELCOME, 'utf8')
  // Audit recommendation: "console.log('[welcome] state_F_reached',
  // {cid, elapsedMinutes})". So the founder can grep Vercel logs and
  // see how many customers hit the timeout cliff.
  assert.match(
    src,
    /console\.log\(\s*['"]\[welcome\]\s+state_F_reached['"]/,
    'console.log("[welcome] state_F_reached", …) breadcrumb must exist',
  )
  assert.match(
    src,
    /state_F_reached[\s\S]{0,200}elapsedMinutes/,
    'telemetry payload must include elapsedMinutes',
  )
})

// ─── 6. Page-load LONGER_THAN_USUAL_MS scope unchanged ──────────────

test('B1: page-load startedAt still used for LONGER_THAN_USUAL_MS panel (PR #95)', () => {
  const src = fs.readFileSync(WELCOME, 'utf8')
  // Scope guard: PR #95 introduced the elapsed-time "taking longer than
  // usual" fallback panel keyed on Date.now() - startedAt > 300_000.
  // That's a DIFFERENT concern (page-relative). B1 must NOT break it.
  assert.match(
    src,
    /Date\.now\(\)\s*-\s*startedAt\s*>\s*LONGER_THAN_USUAL_MS/,
    'LONGER_THAN_USUAL_MS panel must still use page-load startedAt',
  )
})

// ─── 7. Cross-load behaviour: stale subscription → immediate F ──────

test('B1: tick() handles stale subscription correctly (>15min started_at → F)', () => {
  const src = fs.readFileSync(WELCOME, 'utf8')
  // Structural test: each pending branch's timeout check must lead to
  // renderState('F') shortly after — and the check must reference the
  // subscription anchor (either bare or with the `?? startedAt`
  // first-poll fallback).
  const tickFn = src.slice(src.indexOf('async function tick()'))
  const pairs = tickFn.match(
    /Date\.now\(\)\s*-\s*(?:subscriptionStartedAtMs|\(\s*subscriptionStartedAtMs\s*\?\?\s*startedAt\s*\))\s*>\s*TIMEOUT_MS[\s\S]{0,500}renderState\(['"]F['"]\)/g,
  ) ?? []
  assert.ok(
    pairs.length >= 3,
    `each pending branch must check anchored timeout → renderState('F') (found ${pairs.length} pairs)`,
  )
})

// ─── 8. Scope guard — no pass-3 server-error mapping touched ────────

test('B1: scope guard — no pass-3 server-error mapping touched', () => {
  const src = fs.readFileSync(WELCOME, 'utf8')
  // Welcome.html does not call ToS / tier / X-CID surfaces. This is
  // a stability gate; if B1 accidentally introduces those codes here,
  // it's scope creep.
  assert.equal(
    /tos_required|tos_stale|tier_does_not_grant_persona|x_cid_mismatch/.test(src),
    false,
    'pass-3 server error codes must not appear in welcome.html copy',
  )
})
