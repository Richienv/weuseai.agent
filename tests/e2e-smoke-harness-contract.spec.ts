/**
 * Phase 4 (2026-05-14): e2e smoke harness contract — pins the
 * configuration surface so CI can wire it without touching the
 * file's body.
 *
 * Goal of THIS file: keep the smoke harness's CONFIGURATION shape
 * stable so the GitHub Actions workflow + future CI integrations
 * can rely on:
 *
 *   1. E2E_SMOKE_BASE env var overrides PROD_BASE
 *   2. Default fallback is `https://weuseai-agent.vercel.app`
 *      (the founder-documented canonical URL per CLAUDE.md)
 *   3. The harness exports findings + ctx + PROD_BASE + SMOKE_EMAIL
 *      for downstream CI scripts
 *   4. The harness file lives at the canonical path
 *
 * Pure source-grep tests — running the actual smoke is a different
 * spec file (it hits the network).
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as path from 'node:path'

const SMOKE_PATH = path.resolve(process.cwd(), 'tests/e2e/smoke-production.spec.ts')

test('Phase 4 contract: smoke harness file lives at canonical path', () => {
  assert.ok(
    fs.existsSync(SMOKE_PATH),
    'tests/e2e/smoke-production.spec.ts must exist (CI workflow depends on this path)',
  )
})

test('Phase 4 contract: PROD_BASE reads from E2E_SMOKE_BASE env with fallback', () => {
  const src = fs.readFileSync(SMOKE_PATH, 'utf8')
  // Accepts either explicit `process.env.E2E_SMOKE_BASE` or
  // destructured form. Requires the fallback to be the canonical
  // production URL.
  const envReadRe =
    /(?:process\.env\.E2E_SMOKE_BASE|env\.E2E_SMOKE_BASE)/
  assert.ok(
    envReadRe.test(src),
    'smoke harness must read PROD_BASE from process.env.E2E_SMOKE_BASE so CI can override per-environment',
  )
  // The default fallback after `??` or `||` must be the live canonical URL.
  const fallbackRe =
    /(?:\?\?|\|\|)\s*['"]https:\/\/weuseai-agent\.vercel\.app['"]/
  assert.ok(
    fallbackRe.test(src),
    'fallback URL must be https://weuseai-agent.vercel.app (the canonical URL per CLAUDE.md)',
  )
})

test('Phase 4 contract: PROD_BASE is declared via const so a future PR cannot reassign mid-test', () => {
  const src = fs.readFileSync(SMOKE_PATH, 'utf8')
  // Belt-and-braces: prevents a refactor that turns this into a `let`
  // that gets mutated in a test block, which would make the override
  // gate unreliable.
  assert.match(
    src,
    /const\s+PROD_BASE\s*=/,
    'PROD_BASE must be `const` so override behavior is stable across all tests',
  )
})

test('Phase 4 contract: production URL is hard-pinned to weuseai-agent.vercel.app (not velorah-nu)', () => {
  const src = fs.readFileSync(SMOKE_PATH, 'utf8')
  // MEMORY.md polarity is being kept (founder picked Option B — register
  // weuseai-agent as project domain). The fallback URL MUST remain
  // weuseai-agent.vercel.app so the smoke continues testing what
  // founder considers production. If Option A is later picked
  // instead, this test gets updated in lockstep with CLAUDE.md.
  // velorah-nu is a sibling auto-tracking alias that's also live —
  // it's fine for it to APPEAR in the file (e.g. as a comment) but
  // not as the default PROD_BASE.
  const defaultLineRe =
    /(?:const\s+PROD_BASE\s*=[\s\S]{0,200}?)['"]https:\/\/weuseai-agent\.vercel\.app['"]/
  assert.ok(
    defaultLineRe.test(src),
    'default PROD_BASE must be weuseai-agent.vercel.app',
  )
})

test('Phase 4 contract: harness exports findings + ctx for CI downstream scripts', () => {
  const src = fs.readFileSync(SMOKE_PATH, 'utf8')
  // CI workflows pipe smoke output to a notify-founder script.
  // Exporting findings + ctx + PROD_BASE + SMOKE_EMAIL lets a future
  // CI script `import` the harness module directly for structured
  // failure data (vs parsing console output, which is brittle).
  assert.match(
    src,
    /export\s*\{[\s\S]{0,200}findings/,
    'harness must export `findings` array for CI consumption',
  )
  assert.match(
    src,
    /export\s*\{[\s\S]{0,200}PROD_BASE/,
    'harness must export `PROD_BASE` so CI scripts see the actual URL hit',
  )
})
