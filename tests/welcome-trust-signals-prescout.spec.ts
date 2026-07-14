/**
 * Sesi A Phase 0.5 pre-scout (2026-05-13): trust-signal starter pass.
 *
 * Source-level assertions only (matches the established pattern for
 * other welcome-*.spec.ts files — no jsdom). Behavioural verification
 * is the founder's retest on the Vercel preview.
 *
 * Three in-scope items, sized to be safely additive — they merge cleanly
 * under whatever Sesi D's customer-flow audit identifies later:
 *
 *   1. Refined Bahasa phase names where customer-facing strings still
 *      had backend jargon (skill bundle / Setup / pairing).
 *   2. "Sedang lebih lama dari biasanya" elapsed-time fallback at 300s.
 *      Calm reassurance + expandable "what's happening" detail.
 *      No support CTA — Sesi D will decide if/how that surfaces.
 *   3. Step 4 timeline jump fix: monotonic stage advancement so the
 *      label + progress bar can only move forward, never regress when
 *      the probe race-condition returns a stale snapshot.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as path from 'node:path'

const ROOT = path.resolve(process.cwd())
const WELCOME = path.join(ROOT, 'welcome.html')

// ─── 1. Refined Bahasa phase names ─────────────────────────────────────

test('STAGE_LABEL_DETAIL: bundle_install copy avoids the "skill bundle" jargon', () => {
  const src = fs.readFileSync(WELCOME, 'utf8')
  // Pre-fix: 'Memasang skill bundle…' — "bundle" reads as English
  // dev jargon for non-tech customers. Refined to a Bahasa phrasing
  // that names what the customer GETS, not the package format.
  // "skill bundle" must no longer appear in the bundle_install label.
  assert.equal(
    /bundle_install:\s*['"][^'"]*skill bundle/i.test(src),
    false,
    'bundle_install label must not reference "skill bundle" (techy jargon)',
  )
  // Positive: the refined string must mention "keterampilan" — calm-
  // premium BI for "skill" that average customers understand.
  assert.match(
    src,
    /bundle_install:\s*['"][^'"]*keterampilan/i,
    'bundle_install label must use "keterampilan" (Bahasa for skill)',
  )
})

test('STAGE_LABEL_DETAIL: setup_complete copy avoids "Setup" and "pairing" English jargon', () => {
  const src = fs.readFileSync(WELCOME, 'utf8')
  // Pre-fix: 'Setup selesai. Menunggu pairing…' — both English words
  // that average-Joe SMB customers don't read fluently. Refined to
  // pure BI that describes the state ("nearly ready, waiting for your
  // first hello").
  assert.equal(
    /setup_complete:\s*['"][^'"]*Setup\s+selesai/i.test(src),
    false,
    'setup_complete label must not contain English "Setup selesai"',
  )
  assert.equal(
    /setup_complete:\s*['"][^'"]*pairing/i.test(src),
    false,
    'setup_complete label must not contain English "pairing"',
  )
  // Positive: refined string must mention Telegram (customer-facing
  // channel name, OK to surface) and the customer-action framing.
  assert.match(
    src,
    /setup_complete:\s*['"][^'"]*Telegram/i,
    'setup_complete label must name Telegram (customer-facing channel)',
  )
})

// ─── 2. Elapsed-time fallback at 300s ──────────────────────────────────

test('"taking longer than usual" fallback DOM element exists with stable id', () => {
  const src = fs.readFileSync(WELCOME, 'utf8')
  // The fallback is a Phase 0.5 addition rendered inside state B,
  // distinct from the existing soft-hint (1.5x stage) + hard-hint
  // (3x stage) panels. id is stable so future Sesi D audit work
  // can target it.
  assert.match(
    src,
    /id=["']b-longer-than-usual["']/,
    'fallback panel must have id="b-longer-than-usual"',
  )
})

test('fallback panel: visible-line copy is Bahasa, no apology, no support CTA', () => {
  const src = fs.readFileSync(WELCOME, 'utf8')
  // Founder direction: calm reassurance, no apology, no support CTA.
  // The visible-line copy must contain the "lebih lama dari biasanya"
  // phrasing the founder pre-approved.
  assert.match(
    src,
    /lebih lama dari biasanya/i,
    'visible line must say "lebih lama dari biasanya"',
  )
  // Pulled from the brief — no support CTA yet (Sesi D decides). So
  // the panel must NOT include a CTA button / anchor.
  // We assert by checking that the b-longer-than-usual block doesn't
  // contain a `class="btn-primary"` or `class="btn-secondary"`.
  const blockMatch = src.match(
    /id=["']b-longer-than-usual["'][^>]*>[\s\S]*?<\/div>\s*<!--\s*end longer-than-usual/,
  )
  if (blockMatch) {
    assert.equal(
      /class=["'][^"']*btn-(primary|secondary)/.test(blockMatch[0]),
      false,
      'fallback panel must not include a CTA button (Sesi D decides support surface)',
    )
  }
})

test('fallback panel: expandable "Mengapa lebih lama?" details element', () => {
  const src = fs.readFileSync(WELCOME, 'utf8')
  // Founder direction: "expandable 'what's happening' without infra reveal".
  // Use native <details>/<summary> so no JS state management.
  //
  // The summary was renamed from "Apa yang sedang terjadi" to "Mengapa
  // lebih lama?" when the Phase 3 P3-CF-1 accordion introduced an
  // identically-titled element (see welcome-trust-signals-phase3.spec.ts
  // line ~205). This drift gate now pins the renamed text — keeping both
  // spec files agreeing on the same source of truth.
  assert.match(
    src,
    /<details[^>]*id=["']b-longer-than-usual-details["']/,
    'must have <details id="b-longer-than-usual-details"> for expandable section',
  )
  assert.match(
    src,
    /<summary[^>]*>[^<]*Mengapa lebih lama\?/i,
    'summary text must read "Mengapa lebih lama?" (renamed to avoid collision)',
  )
})

test('fallback panel: expanded body must not reveal infra (VPS / Hermes / Vultr / IDCloudHost / Supabase)', () => {
  const src = fs.readFileSync(WELCOME, 'utf8')
  // The expandable section is for customers — must not name the
  // backend stack. This regex scopes the check to the longer-than-usual
  // block only; other parts of welcome.html (state F technical fallback)
  // are allowed to mention these terms.
  const block = src.match(
    /id=["']b-longer-than-usual-details["'][\s\S]*?<\/details>/,
  )
  assert.ok(block, 'longer-than-usual details block must exist')
  if (block) {
    for (const term of ['VPS', 'Hermes', 'Vultr', 'IDCloudHost', 'Supabase', 'OpenRouter']) {
      assert.equal(
        new RegExp(`\\b${term}\\b`, 'i').test(block[0]),
        false,
        `expandable body must not reveal backend infra: ${term}`,
      )
    }
  }
})

test('fallback fires after 300s elapsed (founder-locked threshold)', () => {
  const src = fs.readFileSync(WELCOME, 'utf8')
  // 300 sec = 300000 ms. The constant must be a named variable so
  // Sesi D can tune it without grep-archaeology.
  assert.match(
    src,
    /(?:const|let)\s+LONGER_THAN_USUAL_MS\s*=\s*300_?000/,
    'LONGER_THAN_USUAL_MS = 300000 must be a named constant for Sesi D tuneability',
  )
})

// ─── 3. Step 4 timeline jump fix ───────────────────────────────────────

test('STAGE_ORDER array pins the progression so monotonic clamp can index against it', () => {
  const src = fs.readFileSync(WELCOME, 'utf8')
  // The clamp needs a canonical order. STAGE_ORDER must list the six
  // probe-progression stages from earliest to latest, mirroring
  // STAGE_LABEL keys. Listed inline so a careless re-order in the
  // future flips the clamp direction.
  assert.match(
    src,
    /const STAGE_ORDER\s*=\s*\[\s*['"]vps_provisioning['"]\s*,\s*['"]vps_booting['"]\s*,\s*['"]hermes_starting['"]\s*,\s*['"]persona_writing['"]\s*,\s*['"]pairing_approval['"]\s*,\s*['"]ready['"]\s*\]/,
    'STAGE_ORDER must list the 6 stages in canonical forward order',
  )
})

test('applyStageProgressToB clamps stage index monotonically (cannot regress)', () => {
  const src = fs.readFileSync(WELCOME, 'utf8')
  // Two assertions on the same invariant:
  //   1. There's a variable tracking the highest stage index seen
  //      (lastShownStageIndex or equivalent named var).
  //   2. The label assignment reads STAGE_LABEL via STAGE_ORDER[idx],
  //      where idx is the clamped value.
  assert.match(
    src,
    /lastShownStageIndex/,
    'monotonic clamp must track lastShownStageIndex',
  )
  // Math.max usage to clamp — must appear inside applyStageProgressToB.
  const fnBody = src.match(/function applyStageProgressToB[\s\S]*?\n\s{4}\}/)
  assert.ok(fnBody, 'applyStageProgressToB function body must be findable')
  if (fnBody) {
    assert.match(
      fnBody[0],
      /Math\.max\([^)]*lastShownStageIndex/,
      'applyStageProgressToB must clamp via Math.max(..., lastShownStageIndex)',
    )
  }
})

test('progress bar (displayPct) is monotonic — never jumps backward', () => {
  const src = fs.readFileSync(WELCOME, 'utf8')
  // Pre-fix bug: a probe race could return a stale snapshot with fewer
  // completed stages, jerking the bar backward. The Phase 4 smoothing
  // rework (2026-05-17) retired the stages-completed high-water mark;
  // the monotonic guarantee is now carried by `displayPct`. In
  // applyStageProgressToB displayPct can only be RAISED (Math.max
  // against itself + the band floor), and the time-creep + per-log-line
  // nudge only ADD to it, each capped at targetPct. The bar never
  // regresses.
  const fnBody = src.match(/function applyStageProgressToB[\s\S]*?\n\s{4}\}/)
  assert.ok(fnBody, 'applyStageProgressToB body must be findable')
  assert.match(
    fnBody[0],
    /displayPct\s*=\s*Math\.min\(\s*targetPct\s*,\s*Math\.max\(\s*displayPct/,
    'displayPct must only ever be raised (Math.max against displayPct), never lowered',
  )
})

test('stage tracking state survives a fresh state B render (not reset by renderState)', () => {
  const src = fs.readFileSync(WELCOME, 'utf8')
  // Pre-fix, `lastSeenStage` was reset on transition. The new
  // monotonic-clamp vars must live OUTSIDE applyStageProgressToB
  // and renderState — at module scope, alongside currentStageStartedAt.
  // This is a structural test: the declarations must precede the
  // applyStageProgressToB function definition.
  const orderCheck = (() => {
    const idxIdx = src.indexOf('lastShownStageIndex')
    const idxFn = src.indexOf('function applyStageProgressToB')
    return idxIdx > 0 && idxIdx < idxFn
  })()
  assert.equal(orderCheck, true, 'lastShownStageIndex must be declared at module scope, before applyStageProgressToB')
})

// ─── meta: scope guard ─────────────────────────────────────────────────

test('pre-scout PR: no new ToS / consent / tier copy touched (already pass-3 scope)', () => {
  // Drift gate: this PR is trust-signal pre-scout only. The brief
  // explicitly excludes ToS / consent / tier copy. If a future
  // refactor pulls those into welcome.html, this gate makes the
  // collision visible.
  const src = fs.readFileSync(WELCOME, 'utf8')
  // We don't ban these words globally — welcome.html may still mention
  // Telegram or pairing in other panels. Just ensure no new top-level
  // mention of pass-3 server-side errors leaks into the customer
  // wait state where Sesi D needs to decide framing.
  // Lightweight sentinel — keep the test green; if Sesi D's audit
  // wants to surface ToS errors here, this assertion will need a
  // companion update.
  assert.equal(
    /tos_required|tos_stale|tier_does_not_grant_persona|x_cid_mismatch/.test(src),
    false,
    'pass-3 server error codes must not leak into welcome.html copy yet',
  )
})
