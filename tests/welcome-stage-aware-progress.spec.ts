// welcome.html stage-aware B-state regression tests.
//
// 2026-05-10 Track 2 observability: B_LABELS animation cycle replaced
// with probe-driven stage label + per-stage elapsed escalation.
// See docs/investigation/2026-05-10-stuck-tuning-observability.md
//
// Source-level assertions only (no jsdom — established convention for
// the other welcome-*.spec.ts files in this directory). Behavioral
// verification is via founder retest on prod.

import test from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as path from 'node:path'

const ROOT = path.resolve(process.cwd())
const WELCOME = path.join(ROOT, 'welcome.html')

test('cosmetic B_LABELS array is removed', () => {
  const src = fs.readFileSync(WELCOME, 'utf8')
  // Pre-fix the cycling array contained these three strings together.
  // After Track 2 the strings live in STAGE_LABEL keyed by stage id —
  // a B_LABELS cycle is no longer the source of truth for the wait UX.
  assert.equal(
    /const B_LABELS\s*=\s*\[/.test(src),
    false,
    'B_LABELS array must be removed (cosmetic cycle replaced by stage-driven label)',
  )
})

test('STAGE_LABEL has an entry for every stage in the probe progression', () => {
  const src = fs.readFileSync(WELCOME, 'utf8')
  // STAGE_LABEL must cover all 6 stages emitted by deriveStage in the
  // probe handler. Drift between server stages and client labels would
  // strand the customer on a fallback "Sedang menyiapkan agent…".
  for (const stage of [
    'vps_provisioning',
    'vps_booting',
    'hermes_starting',
    'persona_writing',
    'pairing_approval',
    'ready',
  ]) {
    const re = new RegExp(`${stage}:\\s*['"]`)
    assert.match(src, re, `STAGE_LABEL missing entry for ${stage}`)
  }
})

test('applyStageProgressToB updates label, timeline bar, and % readout from probe', () => {
  const src = fs.readFileSync(WELCOME, 'utf8')
  // Look for the function definition + the DOM nodes it must update.
  // Terminal redesign (2026-05-16): the standalone ETA line (b-eta-line)
  // was folded into the timeline %; the function now drives b-label,
  // b-progress-fill (timeline bar fill), and b-pct (big % readout).
  assert.match(src, /function applyStageProgressToB/)
  assert.match(src, /document\.getElementById\(['"]b-label['"]\)/)
  assert.match(src, /document\.getElementById\(['"]b-progress-fill['"]\)/)
  assert.match(src, /document\.getElementById\(['"]b-pct['"]\)/)
})

test('B-state DOM contains the soft escalation hint node', () => {
  const src = fs.readFileSync(WELCOME, 'utf8')
  // 1.5x expected duration → soft hint (calm "lebih lama dari biasanya").
  // Terminal redesign (2026-05-16) REMOVED the 3x hard "Hubungi tim via
  // WhatsApp" escalation card: the wait page is calm + self-resolving
  // now (the race fix means it no longer gets stuck). The soft hint is
  // kept; it carries no support CTA.
  assert.match(src, /id="b-soft-hint"[^>]*hidden/)
  assert.equal(
    /id="b-hard-hint"/.test(src),
    false,
    'hard escalation card was removed in the terminal redesign — must not return',
  )
})

test('soft escalation threshold: 1.5x of expected_current_stage_duration_seconds', () => {
  const src = fs.readFileSync(WELCOME, 'utf8')
  // The threshold is the contract welcome.html and the founder agreed
  // on — too-eager escalation creates panic on healthy slow builds.
  // Source-level pinning keeps a future tweak visible in PR review.
  // (The 3x hard threshold was removed with the hard-hint card.)
  assert.match(
    src,
    /elapsed\s*>\s*1\.5\s*\*\s*expected/,
    'soft escalation must trigger at >1.5x expected stage duration',
  )
})

test('lastProbe captured by tick() so DOM updater can read without re-polling', () => {
  const src = fs.readFileSync(WELCOME, 'utf8')
  // The 5s UI keep-alive interval re-evaluates escalation on the LAST
  // probe snapshot (no extra network calls between 10s polls). Without
  // this, the soft/hard hint would only refresh every 10s — too coarse
  // for the UX perception we want.
  assert.match(src, /lastProbe\s*=\s*probe/)
  assert.match(src, /setInterval\([^]*lastProbe\?\.progress[^]*5000\)/)
})

test('renderState B no longer hardcodes width: 35% (progress is now real)', () => {
  const src = fs.readFileSync(WELCOME, 'utf8')
  // Pre-fix the progress bar shipped with `width: 35%;` regardless of
  // actual progress. Post-fix it starts at `width: 0%;` and updates
  // via applyStageProgressToB. Hardcoded mid-progress ranges are now
  // a UX regression smell.
  assert.equal(
    /id="b-progress-fill"[^>]*style="width:\s*35%/.test(src),
    false,
    'progress fill must not start at hardcoded 35%',
  )
})

// ─── Fresh-customer-stuck fix (2026-05-11) ────────────────────────

test('pending_provision branch calls pollReadinessProbe before deciding state', () => {
  const src = fs.readFileSync(WELCOME, 'utf8')
  // Pre-fix the `else if (status === 'pending_provision' || status ===
  // 'pending')` branch unconditionally renderState('B') without ever
  // calling the probe. So fresh customers (no VPS row, no onboarding
  // submitted) sat at the "Memeriksa status agent…" placeholder until
  // the 15-min TIMEOUT_MS cliff. The fix: probe-aware disambiguation,
  // same pattern PR #69 added to the active branch.
  // See docs/investigation/2026-05-11-fresh-customer-stuck.md.
  const branch = src.match(
    /else if \(status === 'pending_provision' \|\| status === 'pending'\)[^]*?else if \(status == null\)/,
  )
  assert.ok(branch, 'must find the pending_provision branch')
  assert.match(
    branch[0],
    /pollReadinessProbe\(\)/,
    'pending_provision branch must call pollReadinessProbe (was unconditional renderState B pre-fix)',
  )
})

test('pending_provision + no VPS + vps_provisioning stage → state C (onboarding CTA)', () => {
  const src = fs.readFileSync(WELCOME, 'utf8')
  // The disambiguation rule: when probe reports no vps_id AND the
  // current_stage is still vps_provisioning, the customer hasn't
  // started onboarding yet — render state C with the "Lengkapi profil
  // agent" CTA. Otherwise (vps_id set OR stage past vps_provisioning),
  // real provisioning is in flight → state B is correct.
  const branch = src.match(
    /else if \(status === 'pending_provision' \|\| status === 'pending'\)[^]*?else if \(status == null\)/,
  )
  assert.ok(branch)
  // Look for the no-VPS check + corresponding renderState('C').
  assert.match(
    branch[0],
    /!probe\.vps_id[^]*current_stage[^]*===\s*['"]vps_provisioning['"][^]*renderState\('C'\)/,
    'no-VPS + vps_provisioning stage must lead to renderState("C")',
  )
})

test('pending_provision branch forwards probe.progress to applyStageProgressToB', () => {
  const src = fs.readFileSync(WELCOME, 'utf8')
  // Bonus fix: when state B IS the right call (case 2 — real
  // provisioning in flight), the progress data should drive the stage
  // label + escalation tiers. Pre-fix the branch never asked the probe
  // so progress data was unavailable for in-progress customers.
  const branch = src.match(
    /else if \(status === 'pending_provision' \|\| status === 'pending'\)[^]*?else if \(status == null\)/,
  )
  assert.ok(branch)
  assert.match(
    branch[0],
    /renderState\('B'\)[^]*applyStageProgressToB\(probe\.progress\)/,
    'state B path must forward probe.progress to applyStageProgressToB',
  )
})

test('pollReadinessProbe forwards vps_id alongside ready/checks/progress', () => {
  const src = fs.readFileSync(WELCOME, 'utf8')
  // The pending_provision disambiguation needs vps_id at the helper's
  // return shape. Pre-fix the helper only forwarded ready/checks/progress.
  // Pin the literal forwarding line — anchored to the line just below
  // `progress: j.progress` so we don't match coincidental `vps_id` refs
  // elsewhere in the file.
  assert.match(
    src,
    /progress\s*:\s*j\.progress\s*\?\?\s*null\s*,\s*\n\s*vps_id\s*:\s*j\.vps_id/,
    'pollReadinessProbe return shape must forward vps_id from j.vps_id',
  )
})

test('no false email-notify promises in customer-facing copy (Resend not yet wired)', () => {
  const src = fs.readFileSync(WELCOME, 'utf8')
  // Track 2 honesty fix (post-CORS-hotfix cascade 2026-05-10).
  // Previous copy promised "kami kabari via email" / "menghubungi via
  // email dalam 30 menit" — false because Resend integration isn't
  // wired. Pulling them out keeps the page honest until transactional
  // email lands (Sesi B P0 buildlist).
  //
  // Strip code comments before searching so the docstring history
  // markers ("dropped 'kami kabari via email'") don't trigger false
  // positives. Comments are <!-- … --> and // … patterns.
  const stripHtmlComments = src.replace(/<!--[\s\S]*?-->/g, '')
  const stripJsComments = stripHtmlComments.replace(/\/\/[^\n]*\n/g, '\n')

  const banned = [
    /kami kabari via email/i,
    /menghubungi via email/i,
    /kami email saat siap/i,
  ]
  for (const re of banned) {
    assert.equal(
      re.test(stripJsComments),
      false,
      `false email promise still present in welcome.html: pattern ${re}`,
    )
  }
})
