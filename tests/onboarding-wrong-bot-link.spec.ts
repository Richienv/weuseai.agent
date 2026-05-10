// Track 1 (P0): the "Buka Telegram" link on /onboarding step 3 was opening
// @welcomeuseaibot — a real Telegram bot now hosting NSFW content. Customer
// row e282ce25-… had `telegram_bot_username='welcomeuseaibot'` in prod
// because someone (early dev / founder) pasted that bot's token via
// validate-bot-token, which faithfully stored whatever `getMe()` returned.
//
// There is NO source-side hardcoded reference to fix — the link is built
// dynamically from the customer's stored username. The bug surface is:
//   1. Test fixtures used the literal `welcomeuseaibot`, an actual hostile
//      bot handle. A future dev pasting fixture data to prod would
//      re-introduce the same trap.
//   2. The "Buka Telegram" UX showed the bot username next to the link but
//      had no explicit "this is wrong, ganti bot" recovery path. A
//      customer who pastes the wrong token has no obvious way back.
//
// These tests pin both surfaces shut.

import test from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as path from 'node:path'

const ROOT = path.resolve(process.cwd())

// ─── Layer 1: blacklist the literal hostile bot handle ────────────

/**
 * Walk a directory tree, returning files that match an extension whitelist.
 * Skips node_modules, .git, .vercel, .worktrees.
 */
function walkSourceFiles(dir: string, exts: string[]): string[] {
  const out: string[] = []
  const skip = new Set(['node_modules', '.git', '.vercel', '.worktrees', 'dist', 'build'])
  function recurse(d: string) {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      if (skip.has(entry.name)) continue
      const full = path.join(d, entry.name)
      if (entry.isDirectory()) recurse(full)
      else if (exts.some((e) => entry.name.endsWith(e))) out.push(full)
    }
  }
  recurse(dir)
  return out
}

// Bot handles known to be hostile / squatted. If a future audit identifies
// more, append here. The literal string is what gets matched against source.
const HOSTILE_BOT_HANDLES = ['welcomeuseaibot'] as const

test('no source / test / config file references known-hostile bot handles', () => {
  const files = walkSourceFiles(ROOT, [
    '.html',
    '.ts',
    '.tsx',
    '.js',
    '.json',
    '.md',
    '.sql',
  ])
  const offenders: { file: string; handle: string; line: number }[] = []
  for (const file of files) {
    // Don't match this very file (it has to mention the handle to blacklist it).
    if (file.endsWith('onboarding-wrong-bot-link.spec.ts')) continue
    const lines = fs.readFileSync(file, 'utf8').split('\n')
    for (let i = 0; i < lines.length; i++) {
      for (const handle of HOSTILE_BOT_HANDLES) {
        if (lines[i].includes(handle)) {
          offenders.push({ file: path.relative(ROOT, file), handle, line: i + 1 })
        }
      }
    }
  }
  assert.equal(
    offenders.length,
    0,
    `hostile bot handle(s) leaked into the codebase:\n${offenders
      .map((o) => `  ${o.file}:${o.line} → ${o.handle}`)
      .join('\n')}`,
  )
})

// ─── Layer 2: onboarding step 3 UX safeguards ──────────────────────

const ONBOARDING = path.join(ROOT, 'onboarding.html')

test('onboarding.html step 3 renders bot username next to "Buka Telegram"', () => {
  const src = fs.readFileSync(ONBOARDING, 'utf8')
  // The data-bot-username-display element is what JS populates with the
  // customer's stored bot username. It MUST live near the "Buka Telegram"
  // CTA so the customer can verify before clicking.
  assert.ok(
    /data-bot-username-display/.test(src),
    'onboarding.html must carry a [data-bot-username-display] element so customers can see the bot they will open',
  )
})

test('onboarding.html step 3 carries a "wrong bot" recovery link', () => {
  const src = fs.readFileSync(ONBOARDING, 'utf8')
  // The recovery link lets a customer who realises the bot is wrong reset
  // bot fields and redo step 2. Without it a customer who pasted a wrong
  // token has no obvious escape hatch.
  assert.ok(
    /data-reset-bot-link/.test(src),
    'onboarding.html must carry a [data-reset-bot-link] element so a customer who pasted the wrong bot can reset it',
  )
  // Recovery link copy must be Bahasa Indonesia + neutral (no Anda).
  assert.ok(
    /Bukan bot kamu\??\s*[—–-]?\s*Ganti/i.test(src),
    'recovery link copy must say something like "Bukan bot kamu — Ganti" so customer recognises it',
  )
})

test('onboarding.html resetBotPairing handler clears stored bot fields + returns to step 2', () => {
  const src = fs.readFileSync(ONBOARDING, 'utf8')
  // Reset must clear in-memory state AND call the server (otherwise the
  // bad row persists and the next page-load re-hydrates it).
  assert.ok(
    /function\s+resetBotPairing\b/.test(src) ||
      /resetBotPairing\s*=\s*async/.test(src),
    'onboarding.html must declare a resetBotPairing handler',
  )
  // Server-side reset goes through reset-bot-pairing edge function (or
  // an equivalent service-role endpoint we trust). Anon UPDATE on
  // customers is intentionally locked down (Sesi D P0-2 + the prior
  // pairing-anon-update lock-out).
  assert.ok(
    /reset-bot-pairing|\/functions\/v1\/reset-bot-pairing/.test(src),
    'resetBotPairing must POST to the reset-bot-pairing edge function',
  )
})

// ─── Layer 3: test fixture safety ──────────────────────────────────

test('test fixtures use clearly-fixture bot usernames (no real-bot-shape names)', () => {
  // Telegram bot handles must end in "bot" and be 5–32 chars, alphanumeric
  // + underscores, must start with a letter. A fixture name like
  // `welcomeuseaibot` is a legal handle and could be (and was) registered
  // by a third party. Defensive convention: fixture names must include a
  // marker substring `_fixture_` or `_e2e_` so they cannot be casually
  // registered by drive-by squatters.
  const FIXTURE_FILES = [
    'tests/_helpers/fake-onboarding-store.ts',
    'tests/complete-onboarding-handler.spec.ts',
    'tests/validate-bot-token-handler.spec.ts',
    'tests/pair-customer-bot-webhook-handler.spec.ts',
  ]
  const offenders: { file: string; line: number; snippet: string }[] = []
  for (const rel of FIXTURE_FILES) {
    const file = path.join(ROOT, rel)
    if (!fs.existsSync(file)) continue
    const lines = fs.readFileSync(file, 'utf8').split('\n')
    for (let i = 0; i < lines.length; i++) {
      // Look for bot-username-shaped string literals.
      const m = lines[i].match(/['"]([a-z][a-z0-9_]{3,30}bot)['"]/i)
      if (!m) continue
      const handle = m[1]
      // Skip if it carries a fixture marker.
      if (/(_fixture_|_e2e_|_test_)/i.test(handle)) continue
      offenders.push({ file: rel, line: i + 1, snippet: handle })
    }
  }
  assert.equal(
    offenders.length,
    0,
    `test files use bot-handle-shaped usernames without fixture markers (could be registered by squatters):\n${offenders
      .map((o) => `  ${o.file}:${o.line} → "${o.snippet}"`)
      .join('\n')}\nUse names like "weuseai_e2e_fixture_bot" instead.`,
  )
})
