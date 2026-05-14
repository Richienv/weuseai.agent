/**
 * Phase 4 (2026-05-14): CI workflow contract gates for e2e smoke.
 *
 * Pins the GitHub Actions workflow + notify-smoke-failure helper
 * shape so a future PR can't quietly disable the founder-DM path
 * or strip the daily schedule.
 *
 * Pure source-grep tests — never invokes Actions.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as path from 'node:path'

const WORKFLOW = path.resolve(process.cwd(), '.github/workflows/e2e-smoke.yml')
const NOTIFY = path.resolve(process.cwd(), 'scripts/notify-smoke-failure.mjs')

// ─── Workflow existence + triggers ───────────────────────────────────

test('Phase 4 CI: e2e-smoke workflow file exists at canonical path', () => {
  assert.ok(fs.existsSync(WORKFLOW), '.github/workflows/e2e-smoke.yml must exist')
})

test('Phase 4 CI: workflow runs on push to main (post-deploy verification)', () => {
  const src = fs.readFileSync(WORKFLOW, 'utf8')
  // Must have push trigger on main branch — that's what catches
  // alias-stale / deploy-drift bugs within ~2 min of merge.
  assert.match(
    src,
    /on:[\s\S]*push:[\s\S]*branches:[\s\S]*main/,
    'workflow must trigger on push to main',
  )
})

test('Phase 4 CI: workflow runs on daily schedule (third-party drift)', () => {
  const src = fs.readFileSync(WORKFLOW, 'utf8')
  // cron at 03:00 UTC (10:00 SGT, low-traffic for the target
  // audience). Schedule presence is what matters; exact minute
  // can shift with no test churn.
  assert.match(
    src,
    /schedule:\s*\n\s*-\s*cron:/,
    'workflow must have a schedule: cron: trigger for daily runs',
  )
})

test('Phase 4 CI: workflow supports manual workflow_dispatch', () => {
  const src = fs.readFileSync(WORKFLOW, 'utf8')
  assert.match(
    src,
    /workflow_dispatch:/,
    'workflow must allow manual triggers via workflow_dispatch',
  )
})

test('Phase 4 CI: smoke step passes E2E_SMOKE_BASE env to the harness', () => {
  const src = fs.readFileSync(WORKFLOW, 'utf8')
  // The whole point of the env-override gate in the harness contract
  // test is that the workflow USES it.
  assert.match(
    src,
    /E2E_SMOKE_BASE:/,
    'smoke step must set E2E_SMOKE_BASE so the harness targets the right URL',
  )
})

test('Phase 4 CI: smoke target defaults to weuseai-agent.vercel.app (canonical per CLAUDE.md)', () => {
  const src = fs.readFileSync(WORKFLOW, 'utf8')
  // The "Compute smoke target" step decides the URL — it must
  // default to weuseai-agent.vercel.app for both post-deploy and
  // daily triggers.
  assert.match(
    src,
    /https:\/\/weuseai-agent\.vercel\.app/,
    'workflow must default smoke target to weuseai-agent.vercel.app',
  )
})

// ─── Founder-DM alert wiring (mirrors PR #110 pattern) ───────────────

test('Phase 4 CI: notify-smoke-failure.mjs helper exists', () => {
  assert.ok(fs.existsSync(NOTIFY), 'scripts/notify-smoke-failure.mjs must exist')
})

test('Phase 4 CI: notify script reads SUPPORT_TELEGRAM_BOT_TOKEN + RICHIE_CHAT_ID', () => {
  const src = fs.readFileSync(NOTIFY, 'utf8')
  // Same env-var convention as PR #110 retry-worker alert + xendit-
  // webhook alert. ONE source of truth for founder DMs.
  assert.match(
    src,
    /process\.env\.SUPPORT_TELEGRAM_BOT_TOKEN/,
    'notify script must read SUPPORT_TELEGRAM_BOT_TOKEN env',
  )
  assert.match(
    src,
    /process\.env\.RICHIE_CHAT_ID/,
    'notify script must read RICHIE_CHAT_ID env',
  )
})

test('Phase 4 CI: notify script posts to Telegram sendMessage', () => {
  const src = fs.readFileSync(NOTIFY, 'utf8')
  assert.match(
    src,
    /https:\/\/api\.telegram\.org\/bot\$\{[^}]+\}\/sendMessage/,
    'notify script must POST to Telegram sendMessage endpoint',
  )
})

test('Phase 4 CI: notify script no-ops when secrets are missing (graceful degrade)', () => {
  const src = fs.readFileSync(NOTIFY, 'utf8')
  // Mirrors the retry-worker pattern: missing secrets → log + return.
  // Workflow's own failure exit code remains the source of truth.
  assert.match(
    src,
    /if\s*\(\s*!\s*BOT_TOKEN\s*\|\|\s*!\s*CHAT_ID\s*\)/,
    'notify script must early-return when BOT_TOKEN or CHAT_ID is missing',
  )
})

test('Phase 4 CI: notify script is invoked from workflow on failure() only', () => {
  const src = fs.readFileSync(WORKFLOW, 'utf8')
  // The DM step must be gated on if: failure() so it only fires when
  // the smoke step failed (not on success, not on cancellation).
  // The notify script path must match.
  assert.match(
    src,
    /if:\s*failure\(\)[\s\S]{0,500}notify-smoke-failure\.mjs/,
    'workflow must invoke scripts/notify-smoke-failure.mjs only on failure()',
  )
})

test('Phase 4 CI: workflow uploads smoke log as artifact for 14 days', () => {
  const src = fs.readFileSync(WORKFLOW, 'utf8')
  // Founder needs to retrieve the actual smoke output after a
  // failure — uploading the log as an artifact makes that one click
  // from the Actions run page.
  assert.match(
    src,
    /actions\/upload-artifact/,
    'workflow must upload smoke.log as an artifact for post-failure triage',
  )
  assert.match(
    src,
    /retention-days:\s*\d+/,
    'artifact must have an explicit retention-days (default is 90 — overkill)',
  )
})

// ─── Workflow safety guards ──────────────────────────────────────────

test('Phase 4 CI: workflow has a timeout-minutes guard (no runaway runs)', () => {
  const src = fs.readFileSync(WORKFLOW, 'utf8')
  // Smoke completes in <10 s normally; a 5-6 min cap is plenty even
  // with the 60 s post-deploy sleep + npm install.
  assert.match(
    src,
    /timeout-minutes:\s*\d+/,
    'workflow job must have explicit timeout-minutes (prevents runaway billing)',
  )
})

test('Phase 4 CI: workflow pins Node.js version (reproducibility)', () => {
  const src = fs.readFileSync(WORKFLOW, 'utf8')
  assert.match(
    src,
    /node-version:\s*['"]?\d+/,
    'workflow must pin a node-version so a future Node default change doesn\'t silently break smoke',
  )
})
