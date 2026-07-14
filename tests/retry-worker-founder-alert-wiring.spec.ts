/**
 * Phase 4 (audit §Telemetry, 2026-05-13): retry-worker founder-DM
 * alert — Deno-entry wiring contract.
 *
 * The handler-unit tests in retry-pending-provisions-handler.spec.ts
 * prove the notifyFounder hook fires on the exhausted branch and that
 * throws are swallowed. THIS file pins the Deno entry's wiring so a
 * future PR can't quietly drop the alert path:
 *
 *   - Reads SUPPORT_TELEGRAM_BOT_TOKEN + RICHIE_CHAT_ID env vars
 *     (same convention as xendit-webhook so there's ONE source of
 *     truth for founder DMs).
 *   - Defines notifyFounder() function calling Telegram sendMessage.
 *   - Returns early when either env var is missing — never throws,
 *     so the worker tick survives even when secrets aren't set.
 *   - notifyFounder is passed into the handler's deps object.
 *
 * Drift-gate: matches xendit-webhook's alertSend signature so the
 * two paths stay in lockstep.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ENTRY_PATH = resolve(__dirname, '..', 'supabase', 'functions', 'retry-pending-provisions', 'index.ts')
const HANDLER_PATH = resolve(__dirname, '..', 'supabase', 'functions', '_shared', 'retry-pending-provisions-handler.ts')

const entry = readFileSync(ENTRY_PATH, 'utf-8')
const handler = readFileSync(HANDLER_PATH, 'utf-8')

test('Phase 4 wiring: Deno entry reads SUPPORT_TELEGRAM_BOT_TOKEN env var', () => {
  assert.ok(
    /Deno\.env\.get\(\s*['"]SUPPORT_TELEGRAM_BOT_TOKEN['"]\s*\)/.test(entry),
    'must read SUPPORT_TELEGRAM_BOT_TOKEN (same convention as xendit-webhook)',
  )
})

test('Phase 4 wiring: Deno entry reads RICHIE_CHAT_ID env var', () => {
  assert.ok(
    /Deno\.env\.get\(\s*['"]RICHIE_CHAT_ID['"]\s*\)/.test(entry),
    'must read RICHIE_CHAT_ID (matches xendit-webhook ALERT_CHAT_ID convention)',
  )
})

test('Phase 4 wiring: Deno entry defines notifyFounder posting to Telegram sendMessage', () => {
  // function notifyFounder ... fetch(`https://api.telegram.org/bot${...}/sendMessage`, ...)
  assert.ok(
    /async function notifyFounder\b/.test(entry),
    'must define an async notifyFounder function',
  )
  assert.ok(
    /https:\/\/api\.telegram\.org\/bot\$\{[^}]+\}\/sendMessage/.test(entry),
    'must POST to Telegram sendMessage endpoint',
  )
  assert.ok(
    /method:\s*['"]POST['"]/.test(entry),
    'must use POST method',
  )
})

test('Phase 4 wiring: notifyFounder no-ops when env vars are missing (graceful degrade)', () => {
  // Looks for the early-return guard: if (!FOUNDER_BOT_TOKEN || !FOUNDER_CHAT_ID) return
  // Accept either variable name as long as both are guarded together.
  const re =
    /if\s*\(\s*!\s*FOUNDER_BOT_TOKEN\s*\|\|\s*!\s*FOUNDER_CHAT_ID\s*\)\s*return\b/
  assert.ok(
    re.test(entry),
    'notifyFounder must early-return when EITHER env var is empty so missing secrets never throw',
  )
})

test('Phase 4 wiring: notifyFounder is passed into the handler deps', () => {
  // The deps object literal must include notifyFounder. Accept both
  // shorthand `notifyFounder,` and explicit `notifyFounder:` forms.
  const re = /notifyFounder\s*[,:}]/
  assert.ok(
    re.test(entry),
    'deps object must wire notifyFounder so handler can call it',
  )
})

test('Phase 4 contract: handler exposes optional notifyFounder dep', () => {
  // The pure handler must accept notifyFounder as an optional dep so
  // tests + local-stub deploys can omit it and still get the audit
  // row written.
  assert.ok(
    /notifyFounder\?:\s*\(text:\s*string\)\s*=>\s*Promise<void>/.test(handler),
    'RetryHandlerDeps must declare notifyFounder as `(text: string) => Promise<void>` optional',
  )
})

test('Phase 4 contract: handler calls notifyFounder inside the exhausted branch', () => {
  // The call site must be inside the same block that writes outcome='exhausted'
  // to the audit log. Easiest proof: there's an `await deps.notifyFounder(`
  // call AND it's preceded (in source order) by 'exhausted' + insertAttempt.
  assert.ok(
    /await\s+deps\.notifyFounder\s*\(/.test(handler),
    'handler must invoke deps.notifyFounder (awaited so throws can be caught)',
  )
  // Find positions to verify ordering: 'exhausted' insertAttempt then notifyFounder.
  const exhaustedIdx = handler.indexOf("outcome: 'exhausted'")
  const notifyIdx = handler.indexOf('deps.notifyFounder(')
  assert.ok(exhaustedIdx > -1, 'handler must have exhausted insertAttempt')
  assert.ok(notifyIdx > -1, 'handler must call notifyFounder')
  assert.ok(
    notifyIdx > exhaustedIdx,
    'notifyFounder must be called AFTER the audit row is written ' +
      '(audit log is source of truth; DM is best-effort on top)',
  )
})

test('Phase 4 contract: handler wraps notifyFounder in try/catch (swallow throws)', () => {
  // The try/catch must be around the notifyFounder call so a Telegram
  // outage or rate-limit does NOT abort the worker tick.
  // Look for the pattern `try { await deps.notifyFounder(...) } catch`
  const re =
    /try\s*\{[^{}]*await\s+deps\.notifyFounder\s*\([^)]*\)[^{}]*\}\s*catch\b/s
  assert.ok(
    re.test(handler),
    'notifyFounder call must be wrapped in try/catch so worker tick survives Telegram failures',
  )
})

test('Phase 4 contract: founder alert text carries cid + sub_id + retry-worker tag', () => {
  // Pin the message format so DM filtering + grep stays predictable.
  // Looks for retry-worker tag + customer + subscription references.
  // The text construction is the only place these tokens appear together.
  assert.ok(
    /\[retry-worker\]/.test(handler),
    "founder DM text must include [retry-worker] tag for DM filtering",
  )
  assert.ok(
    /row\.customer_id/.test(handler),
    'founder DM text must include customer_id (cid)',
  )
  assert.ok(
    /subId|subscription_id/.test(handler),
    'founder DM text must include subscription_id (sub_id)',
  )
})
