// welcome.html "Buka Telegram" button must point at the customer's
// per-bot t.me URL, not telegram.org generic.
//
// Pre-fix bug: state-C2 hardcoded `href="https://t.me/"` (no
// interpolation), so customers clicking it landed on telegram.org
// instead of their own bot. Founder e2e on customer e282ce25 hit this.
//
// The button must read `customer.telegram_bot_username` (set by
// validate-bot-token) and build `https://t.me/${username}` at render
// time. Same X-CID-scoped fetch pattern used by pollOnce + Sesi D
// P0-2 / P0-3 RLS.

import test from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as path from 'node:path'

const ROOT = path.resolve(process.cwd())
const WELCOME = path.join(ROOT, 'welcome.html')
const ONBOARDING = path.join(ROOT, 'onboarding.html')

// ─── welcome.html drift ────────────────────────────────────────────

test('welcome.html state C2 does NOT hardcode https://t.me/ as the CTA', () => {
  const src = fs.readFileSync(WELCOME, 'utf8')
  // Find the case 'C2' render block. It must NOT contain a literal
  // bare `https://t.me/"` (with closing quote) — that's the broken
  // hardcoded link. Interpolated forms (https://t.me/${...}) are fine.
  const m = src.match(/case 'C2':[\s\S]*?break;/)
  assert.ok(m, 'state C2 case block must exist')
  const block = m[0]
  assert.ok(
    !/href="https:\/\/t\.me\/"/.test(block),
    'state C2 must NOT hardcode href="https://t.me/" — must interpolate the customer bot username',
  )
})

test('welcome.html fetches telegram_bot_username via X-CID-scoped REST', () => {
  const src = fs.readFileSync(WELCOME, 'utf8')
  // The fetch must include telegram_bot_username in the SELECT and
  // send the X-CID header (Sesi D P0-2 RLS requirement).
  assert.ok(
    /select=[^"'`]*telegram_bot_username/.test(src),
    'welcome.html must SELECT telegram_bot_username from /rest/v1/customers',
  )
  // Confirm there's an X-CID header somewhere in the welcome.html
  // fetch path (already true on prod for pollOnce — this asserts the
  // pattern continues for the new fetch).
  assert.ok(
    /['"]X-CID['"]\s*:\s*cid/.test(src),
    'welcome.html must send the X-CID header on the customers fetch',
  )
})

test('welcome.html state C2 builds href from customer.telegram_bot_username', () => {
  const src = fs.readFileSync(WELCOME, 'utf8')
  const m = src.match(/case 'C2':[\s\S]*?break;/)
  assert.ok(m, 'state C2 case block must exist')
  const block = m[0]
  // The C2 block must reference a bot-username variable / template
  // expression in the href. Accept either `${customer.telegram_bot_username}`
  // or `${botUsername}` style.
  assert.ok(
    /https:\/\/t\.me\/\$\{[^}]+\}/.test(block),
    'state C2 href must use template interpolation: https://t.me/${...}',
  )
})

// ─── onboarding.html sanity check ──────────────────────────────────

test('onboarding.html step 3 still uses bot-username interpolation (no regression)', () => {
  const src = fs.readFileSync(ONBOARDING, 'utf8')
  // applyBotUsername (Sesi D P1-6 era) must continue to set the
  // [data-pair-bot-link] href dynamically. This test guards against
  // a future redesign accidentally hardcoding t.me/ on onboarding.
  assert.ok(
    /\$pairBotLink\.href\s*=\s*[`'"]https:\/\/t\.me\/\$\{/.test(src),
    'onboarding.html applyBotUsername must build href via template interpolation',
  )
})
