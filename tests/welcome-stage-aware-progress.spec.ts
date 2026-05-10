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

test('applyStageProgressToB updates label, progress bar, and ETA from probe', () => {
  const src = fs.readFileSync(WELCOME, 'utf8')
  // Look for the function definition + the three DOM nodes it must
  // update. If a future refactor renames a node, this test surfaces
  // the drift.
  assert.match(src, /function applyStageProgressToB/)
  assert.match(src, /document\.getElementById\(['"]b-label['"]\)/)
  assert.match(src, /document\.getElementById\(['"]b-progress-fill['"]\)/)
  assert.match(src, /document\.getElementById\(['"]b-eta-line['"]\)/)
})

test('B-state DOM contains soft + hard escalation hint nodes', () => {
  const src = fs.readFileSync(WELCOME, 'utf8')
  // 1.5x expected duration → soft hint (yellow). 3x → hard hint (red,
  // with WhatsApp deeplink). Both initially hidden, revealed by
  // applyStageProgressToB based on per-stage elapsed.
  assert.match(src, /id="b-soft-hint"[^>]*hidden/)
  assert.match(src, /id="b-hard-hint"[^>]*hidden/)
  assert.match(src, /id="b-hard-wa"/, 'hard hint must include WA escalation link')
})

test('escalation thresholds: 1.5x and 3x of expected_current_stage_duration_seconds', () => {
  const src = fs.readFileSync(WELCOME, 'utf8')
  // The thresholds are the contract welcome.html and the founder
  // agreed on — too-eager escalation creates panic on healthy slow
  // builds, too-late escalation makes "stuck looks like working"
  // (the original bug). Source-level pinning keeps a future tweak
  // visible in PR review.
  assert.match(
    src,
    /elapsed\s*>\s*1\.5\s*\*\s*expected/,
    'soft escalation must trigger at >1.5x expected stage duration',
  )
  assert.match(
    src,
    /elapsed\s*>\s*3\s*\*\s*expected/,
    'hard escalation must trigger at >3x expected stage duration',
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
