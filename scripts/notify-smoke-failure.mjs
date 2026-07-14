#!/usr/bin/env node
/**
 * Phase 4 (2026-05-14): Telegram founder-DM helper for the e2e smoke
 * CI workflow.
 *
 * Reuses the EXACT pattern from PR #110's retry-worker alert:
 *   SUPPORT_TELEGRAM_BOT_TOKEN (bot to send from)
 *   RICHIE_CHAT_ID (founder DM chat_id)
 * Both expected as env vars (GitHub Actions secrets).
 *
 * Usage in workflow:
 *   - run: npx tsx --test tests/e2e/smoke-production.spec.ts | tee smoke.log
 *   - if: failure()
 *     run: node scripts/notify-smoke-failure.mjs smoke.log || true
 *
 * Failure-tolerant: any error here (DNS, Telegram outage, missing
 * secrets) is swallowed so the workflow's own failure signal is the
 * source of truth. The DM is a nicety, not a gate.
 *
 * Reads:
 *   process.argv[2]  — path to smoke output log (e.g. "smoke.log")
 *   env SUPPORT_TELEGRAM_BOT_TOKEN
 *   env RICHIE_CHAT_ID
 *   env GITHUB_RUN_ID (auto-set by Actions)
 *   env GITHUB_REPOSITORY (auto-set by Actions)
 *   env GITHUB_SHA (auto-set by Actions)
 *   env E2E_SMOKE_BASE (the URL the smoke was hitting)
 *   env SMOKE_TRIGGER ("post-deploy" / "daily" / "workflow_dispatch" / "pull_request")
 */

import { readFileSync } from 'node:fs'

const LOG_PATH = process.argv[2] ?? 'smoke.log'
const BOT_TOKEN = process.env.SUPPORT_TELEGRAM_BOT_TOKEN ?? ''
const CHAT_ID = process.env.RICHIE_CHAT_ID ?? ''
const RUN_ID = process.env.GITHUB_RUN_ID ?? ''
const REPO = process.env.GITHUB_REPOSITORY ?? ''
const SHA = (process.env.GITHUB_SHA ?? '').slice(0, 7)
const SMOKE_BASE = process.env.E2E_SMOKE_BASE ?? 'https://weuseai-agent.vercel.app'
const TRIGGER = process.env.SMOKE_TRIGGER ?? 'unknown'

async function main() {
  if (!BOT_TOKEN || !CHAT_ID) {
    console.log('[notify-smoke-failure] secrets missing — skipping DM')
    return
  }

  let logTail = ''
  try {
    const log = readFileSync(LOG_PATH, 'utf-8')
    // Last ~40 lines is typically enough to see which step failed
    // and the structured detail blocks the smoke prints.
    const lines = log.split('\n')
    logTail = lines.slice(-40).join('\n')
  } catch (e) {
    logTail = '(could not read smoke log: ' + (e instanceof Error ? e.message : String(e)) + ')'
  }

  const runUrl = RUN_ID && REPO ? `https://github.com/${REPO}/actions/runs/${RUN_ID}` : '(local)'

  const text =
    `[e2e-smoke] FAILED — ${TRIGGER}\n` +
    `target: ${SMOKE_BASE}\n` +
    `commit: ${SHA || '(unknown)'}\n` +
    `run:    ${runUrl}\n` +
    `\n` +
    `--- last 40 lines of smoke output ---\n` +
    truncate(logTail, 3000)

  try {
    const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: CHAT_ID, text, disable_web_page_preview: true }),
    })
    if (!r.ok) {
      const body = await r.text()
      console.log('[notify-smoke-failure] Telegram returned', r.status, body.slice(0, 200))
    } else {
      console.log('[notify-smoke-failure] founder DM sent')
    }
  } catch (e) {
    console.log('[notify-smoke-failure] fetch threw:', e instanceof Error ? e.message : String(e))
  }
}

function truncate(s, n) {
  if (s.length <= n) return s
  return s.slice(0, n) + '\n…[truncated]'
}

// Best-effort: never crash the workflow because of a DM hiccup.
main().catch((e) => {
  console.log('[notify-smoke-failure] uncaught:', e instanceof Error ? e.message : String(e))
})
