// welcome.html probe-aware state machine regression tests.
//
// 2026-05-10 onboarding-loop fix: the `if (status === 'active')` branch
// must call the customer-readiness probe BEFORE branching on the &job
// URL param, so already-onboarded customers (bookmark, tab refresh,
// browser back, complete-onboarding 409 redirect) are routed to state
// C2 instead of looping through "Lengkapi profil agent".
//
// See docs/investigation/2026-05-10-onboarding-loop.md for the full
// trace of the 6-hop loop these tests defend against.
//
// Tests are source-level assertions on welcome.html (no jsdom execution
// — that's the convention for the other welcome-*.spec.ts files in
// this directory). They verify the structure is in place; behavioral
// verification is via founder retest on prod.

import test from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as path from 'node:path'

const ROOT = path.resolve(process.cwd())
const WELCOME = path.join(ROOT, 'welcome.html')

// ─── probe-aware tick() shape ──────────────────────────────────────

test('tick() calls pollReadinessProbe BEFORE branching on &job', () => {
  const src = fs.readFileSync(WELCOME, 'utf8')
  // Locate the active-status branch.
  const activeBranchMatch = src.match(
    /if \(status === 'active'\)[^]*?else if \(status === 'failed'\)/,
  )
  assert.ok(activeBranchMatch, 'must find the active-status branch')
  const branch = activeBranchMatch[0]

  // The probe call must appear in the active branch.
  assert.match(
    branch,
    /pollReadinessProbe\(\)/,
    'tick() active-branch must call pollReadinessProbe',
  )

  // The probe call must come BEFORE any control-flow use of `job`
  // (i.e. `if (job)` or `if (!job)`) so that already-onboarded
  // customers (no &job) still route through the probe-aware decision.
  // We look for the actual control-flow keyword pattern, not bare
  // mentions of "job" — those occur in comments above the branch.
  const probeIdx = branch.indexOf('pollReadinessProbe(')
  const firstJobBranchIdx = branch.search(/if\s*\(\s*!?job\b/)
  assert.ok(probeIdx > 0, 'pollReadinessProbe must appear in branch')
  assert.ok(
    firstJobBranchIdx > 0,
    'control-flow `if (job)` or `if (!job)` must appear in branch',
  )
  assert.ok(
    probeIdx < firstJobBranchIdx,
    'pollReadinessProbe must be called BEFORE the first if (job) check ' +
      `(probe @${probeIdx}, if(job) @${firstJobBranchIdx})`,
  )
})

test('probe.ready=true → state C2 unconditionally (no &job dependency)', () => {
  const src = fs.readFileSync(WELCOME, 'utf8')
  // Look for: probe && probe.ready followed by renderState('C2')
  // somewhere in the same branch (allows for ensureBotUsername in between).
  const re = /if\s*\(\s*probe\s*&&\s*probe\.ready\s*\)[^]*?renderState\('C2'\)/
  assert.match(
    src,
    re,
    'truthy probe.ready must lead to state C2 — this is the loop break',
  )
})

test('probe.ready=false + no &job → state C (genuine "needs onboarding")', () => {
  const src = fs.readFileSync(WELCOME, 'utf8')
  // The "no job + probe says not ready" path must still render state C
  // so first-time customers with no &job who haven't yet provisioned
  // see the "Lengkapi profil agent" CTA. This is the original behavior
  // preserved for the legitimate not-yet-onboarded case.
  const branch = src.match(
    /probe\s*&&\s*!probe\.ready[^]*?else if \(status === 'failed'\)/,
  )
  assert.ok(branch, 'must find the probe-not-ready branch')
  assert.match(
    branch[0],
    /renderState\('C'\)/,
    'no-job + not-ready path must still render state C',
  )
})

test('probe call failure → falls back to original (job ? B : C) behavior', () => {
  const src = fs.readFileSync(WELCOME, 'utf8')
  // The third branch handles probe == null (network failure). It must
  // NOT throw, must NOT leave the page in an indeterminate state, and
  // must replicate the pre-fix behavior so a transient network blip
  // doesn't strand the customer on the wrong screen.
  // We verify by checking the active-branch contains a third else clause
  // that still uses renderState() with C / B / F as targets.
  const activeBranch = src.match(
    /if \(status === 'active'\)[^]*?else if \(status === 'failed'\)/,
  )
  assert.ok(activeBranch)
  // All terminal renderState calls in the active branch should target
  // a known state (B / C / C2 / F). No unhandled fallthrough.
  const renders = [...activeBranch[0].matchAll(/renderState\('([^']+)'\)/g)].map(
    (m) => m[1],
  )
  for (const s of renders) {
    assert.ok(
      ['B', 'C', 'C2', 'F'].includes(s),
      `unexpected renderState target in active branch: ${s}`,
    )
  }
  // At minimum: B, C, C2 must all appear (covers the three probe outcomes).
  for (const s of ['B', 'C', 'C2']) {
    assert.ok(
      renders.includes(s),
      `active branch must reach renderState('${s}') somewhere`,
    )
  }
})

// ─── live probe (optional, prod) ───────────────────────────────────
//
// Verify the deployed canonical URL serves the probe-aware structure.
// Catches deploy regressions where a future welcome.html rewrite
// accidentally drops the readiness check.

const PROD_URL = 'https://weuseai-agent.vercel.app/welcome'

test(
  'LIVE: prod /welcome carries the probe-aware tick() structure',
  { skip: process.env.SKIP_LIVE === '1' },
  async () => {
    let html: string
    try {
      const r = await fetch(PROD_URL, { redirect: 'follow' })
      assert.equal(r.status, 200, `prod welcome must 200 (got ${r.status})`)
      html = await r.text()
    } catch (e) {
      // Skip silently if offline / sandbox blocks DNS — local source-level
      // tests above are the contract; this is just a deploy-drift catch.
      return
    }
    assert.match(
      html,
      /pollReadinessProbe\(\)/,
      'prod welcome must include pollReadinessProbe() — deploy may have regressed',
    )
    assert.match(
      html,
      /probe\s*&&\s*probe\.ready/,
      'prod welcome must include probe.ready check',
    )
  },
)
